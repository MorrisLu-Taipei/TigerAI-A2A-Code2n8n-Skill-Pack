# einvoice-n8n — Code2n8n case: orchestrate `@paid-tw/einvoice` from n8n

> 🌐 **English summary at bottom**

把 [`MorrisLu-Taipei/einvoice`](https://github.com/MorrisLu-Taipei/einvoice)（台灣電子發票統一 SDK，5 家供應商：Amego / ECPay / ezPay / ezPay 跨境 / ezReceipt）變成可被 n8n 編排的治理鏈。**SDK 不搬進 n8n** — SDK 已經解了「5 家 → 1 介面」這層 partition，n8n 的工作是在 SDK 之上做業務流程。

## Code2n8n Partition 決策

```
留在 SDK：     5 家供應商 ⇄ MIG 4.0 統一模型 (AES/MD5 簽章、欄位對應、Zod 驗證、Capability 偵測)
留在 svc：     HTTP wrapper（80 行 Hono），把 SDK 5 個方法 + capability/route 暴露成 7 個 endpoint
留在 n8n：    業務 orchestration — webhook 入口、retry + dead-letter、人工核可、稽核、對帳、月結
留在 PG/Sheet：訂單、發票對應、稽核紀錄
```

「直接讓 n8n 打 5 家供應商 HTTP」是反模式（把 SDK 解掉的 partition 拆回 n8n Code node 重做簽章）。本案 svc 80 行擋掉這條歪路。

## 內容

```
examples/einvoice-n8n/
├── README.md                        ← 你在這
├── svc/                             ← 80 行 Hono HTTP wrapper（單一 service holds the credentials）
│   ├── src/index.ts                 ← 7 endpoints (5 ops + capabilities + route)
│   ├── src/providers.ts             ← env-driven factory，5 家 createXxxProvider
│   ├── package.json / tsconfig.json
│   ├── .env.example                 ← 5 家 credential 範本 + EINVOICE_SVC_TOKEN
│   ├── Dockerfile / docker-compose.yml
└── workflows/                       ← 6 個 importable n8n workflow JSON
    ├── einvoice-issue-from-order.workflow.json
    ├── einvoice-void-with-approval.workflow.json
    ├── einvoice-allowance.workflow.json
    ├── einvoice-daily-reconcile.workflow.json
    ├── einvoice-provider-failover.workflow.json
    └── einvoice-monthly-audit-export.workflow.json
```

## 7 個 svc endpoints

| Method | Path | 對應 SDK 方法 |
| --- | --- | --- |
| GET  | `/healthz` | (no auth) liveness check |
| GET  | `/v1/capabilities/:provider` | `provider.capabilities` |
| POST | `/v1/issue` | `provider.issue(input)` |
| POST | `/v1/void` | `provider.void(input)` |
| POST | `/v1/allowance` | `provider.allowance(input)` |
| POST | `/v1/void-allowance` | `provider.voidAllowance(input)` |
| POST | `/v1/query` | `provider.query(input)` |
| POST | `/v1/route` | capability-aware failover — 走 `supports(p, cap)` 找到第一個能做的 provider |

`/v1/*` 都要 Bearer token (`EINVOICE_SVC_TOKEN`)。Body 規格：

```json
{ "provider": "amego", "input": { ... unified InvoiceInput ... } }
```

## 6 個 workflow

| Workflow | 角色 | 套哪個 Pack 模板 |
| --- | --- | --- |
| `einvoice-issue-from-order` | 訂單 webhook → svc/issue → 重試 → 稽核 | [`retry-with-backoff`](../templates/retry-with-backoff.workflow.json) + [`handover-trace`](../templates/handover-trace.workflow.json) |
| `einvoice-void-with-approval` | 作廢請求 → Slack 核可 → svc/void | [`human-approval-gate`](../templates/human-approval-gate.workflow.json) |
| `einvoice-allowance` | 退款 webhook → svc/allowance → 重試 | retry-with-backoff |
| `einvoice-daily-reconcile` | Schedule 02:00 → query 昨日 → diff vs 稽核表 → 不一致告警 | — |
| `einvoice-provider-failover` | sub-workflow，capability-aware 走 `/v1/route` | — |
| `einvoice-monthly-audit-export` | Schedule 月初 03:00 → 上月稽核 CSV → 寄會計 | — |

## 上線前要做的（5 個 placeholder）

每個 workflow sticky note 都列了，搜 `__REPLACE_ME__`：

| Token | 哪個 workflow | 怎麼填 |
| --- | --- | --- |
| `__REPLACE_ME__EINVOICE_SVC_URL__` | issue / void / allowance / reconcile / failover | `http://einvoice-svc:8787`（compose）或 `http://localhost:8787` |
| `__REPLACE_ME__GOOGLE_SHEET_ID__` | issue / void / allowance / reconcile / failover / monthly-export | Audit / Mismatches / Monthly Summary 三 tab 的 Sheet documentId |
| `__REPLACE_ME__SLACK_CHANNEL__` | issue / void / allowance / reconcile | `#einvoice-ops`（不要 `#general`） |
| `__REPLACE_ME__FINANCE_EMAIL__` / `__REPLACE_ME__ACCOUNTANT_EMAIL__` | reconcile / monthly-export | 收件信箱 |
| `Authorization: Bearer <EINVOICE_SVC_TOKEN>` | 所有打 svc 的 HTTP 節點 | 在 n8n Credentials → `httpHeaderAuth` 設定，**不寫進 workflow JSON** |

Google Sheet 結構：
- `Audit` tab：`correlationId | op | provider | orderId | invoiceNumber | requestedBy | approver | reason | status | result | appliedAt`
- `Mismatches` tab：`correlationId | orderId | provider | invoiceNumber | expected | actual | detectedAt`
- `Monthly Summary` tab：`correlationId | yyyymm | rowCount | counts | exportedAt`

## Security pre-review（套 `n8n-security-governance` Skill）

| 風險 | 處理 |
| --- | --- |
| 5 家 credentials 散在 n8n | **集中在 svc 的 `.env`**，n8n 只持有一個 `EINVOICE_SVC_TOKEN` |
| 進入點 webhook 沒驗簽 | 3 個 webhook (`issue/void/allowance`) 在 scanner 會跳 warning — 故意的。**生產**要在前面擋 reverse proxy + HMAC（或前面再加一層 inbound Webhook + 驗簽 Code node） |
| 作廢不可逆 | `einvoice-void-with-approval` 強制走 `human-approval-gate`；reject / timeout 也寫 Audit |
| 跨境 currency | `provider-failover` 範例：`capability: FOREIGN_CURRENCY, candidates: ['amego', 'ezpay-crossborder']` |
| PII 留存 | Audit 含 buyer email / UBN / 品項；商業會計法**至少 10 年**，Audit Sheet retention 要設好 |
| `MockProvider` 進正式 | 在 workflow 內檢查 `provider !== 'mock'` 或讓 svc 在 `EINVOICE_MODE=PRODUCTION` 時拒絕 `mock` |

## Validation 紀錄

跑 Pack 自家的兩個工具：

```bash
# 1. 確定性 security scanner
node scripts/security-scan.mjs --glob "examples/einvoice-n8n/workflows/*.workflow.json" --format markdown
# → 6 files · 0 error · 3 warning（全是上述「故意」的 webhook-no-auth）

# 2. n8n REST round-trip（import → fetch → delete）
N8N_API_URL=http://localhost:5678 N8N_API_KEY=... \
  node scripts/live-roundtrip.mjs --glob "examples/einvoice-n8n/workflows/*.workflow.json"
# → 6 files · 6 ok · 0 fail · tag=claude-import-2026-06-18
```

實際在使用者 localhost:5678 受管 n8n 跑通過。

## 跑起來

```bash
# 1) svc 起來
cd examples/einvoice-n8n/svc
cp .env.example .env       # 填好 EINVOICE_SVC_TOKEN + 你會用到的供應商 credentials
docker compose up -d --build
curl http://localhost:8787/healthz
# {"ok":true,"providers":["amego","ecpay","ezpay","ezpay-crossborder","ezreceipt"]}

# 2) Import 6 個 workflow 到你的 n8n（或用 Pack 自帶的 live-roundtrip 驗證 import 流程）
# 在 n8n UI → Import from File，或：
N8N_API_URL=http://localhost:5678 N8N_API_KEY=$YOUR_KEY \
  node ../../../scripts/live-roundtrip.mjs --glob "examples/einvoice-n8n/workflows/*.workflow.json"

# 3) 在 n8n 把 5 個 placeholder 替換成你的真實值 + 接 httpHeaderAuth credential
# 4) Activate
```

---

## English

Code2n8n case study turning [`MorrisLu-Taipei/einvoice`](https://github.com/MorrisLu-Taipei/einvoice) (Taiwan unified e-invoice SDK, five providers: Amego / ECPay / ezPay / ezPay cross-border / ezReceipt) into a governable n8n orchestration layer.

**Partition decision**: the SDK already solved the "5 providers → 1 interface" partition — don't move it into n8n. Instead, ship an 80-line Hono HTTP wrapper service (`svc/`) that holds the credentials and exposes 7 endpoints; let n8n call those endpoints to orchestrate business processes — webhook entries, retry + dead-letter, human approval, audit, daily reconcile, monthly export, capability-aware failover.

Six importable workflow JSONs compose three Pack templates (`retry-with-backoff`, `human-approval-gate`, `handover-trace`). All six pass the deterministic security scanner (0 errors, 3 expected warnings on unsigned webhooks — fronted by reverse-proxy HMAC in production) and were round-tripped against the user's local n8n at 5678 with the `[Claude 2026-06-18]` prefix + `claude-import-2026-06-18` tag.

See the table of placeholders and the security pre-review above for what to set before activating.
