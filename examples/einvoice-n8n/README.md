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
└── workflows/                       ← 12 個 importable n8n workflow JSON（v0.35.0 起 11/11 capability 完整覆蓋）
    ├── einvoice-issue-from-order.workflow.json                ← ISSUE
    ├── einvoice-void-with-approval.workflow.json              ← VOID (v1 DIY)
    ├── einvoice-void-with-approval-v2-native.workflow.json    ← VOID (v2 Slack sendAndWait)
    ├── einvoice-void-with-approval-v3-form-native.workflow.json ← VOID (v3 Form HITL, 台灣首選)
    ├── einvoice-allowance.workflow.json                       ← ALLOWANCE
    ├── einvoice-void-allowance.workflow.json                  ← VOID_ALLOWANCE  ★ v0.35.0
    ├── einvoice-daily-reconcile.workflow.json                 ← QUERY (排程對帳)
    ├── einvoice-query-by-order-id.workflow.json               ← QUERY_BY_ORDER_ID  ★ v0.35.0
    ├── einvoice-scheduled-issue.workflow.json                 ← SCHEDULED_ISSUE  ★ v0.35.0
    ├── einvoice-issue-b2b-with-modifiers.workflow.json        ← B2B + MIXED_TAX + CARRIER_VALIDATION  ★ v0.35.0
    ├── einvoice-foreign-currency.workflow.json                ← FOREIGN_CURRENCY  ★ v0.35.0
    ├── einvoice-provider-failover.workflow.json               ← multi-capability routing
    ├── einvoice-capability-aware-gate.workflow.json           ← 前置 capability 檢查 + dispatch  ★ v0.35.0
    └── einvoice-monthly-audit-export.workflow.json            ← 月度匯出
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

## 🏆 結案驗證單元（v0.41.0）

> **v0.41.0 起本案例 CLEARED** 作為 Code2n8n 案例參考實作。詳細結案報告：[`tests/v0.41-final-validation-report.md`](tests/v0.41-final-validation-report.md)。

### 重點數字

| 面向 | 數字 |
| --- | --- |
| **Amego SDK capability 對真實 Amego sandbox runtime 通過** | **10/10** |
| **n8n workflow ship 數量** | **14**（含 3 個 HITL 版本對照） |
| **Layer 1 V&V** | 30 個 workflow（含 templates）全 PASS |
| **歷史 SEC entry 收尾** | **20 ✅ FIXED + 1 mitigated（SEC-021 SDK upstream） + 1 documented meta-lesson（SEC-022）** |
| **真實 Amego sandbox 發票 trace** | 11 張 `AA265149xx` ~ `AA265150xx`（可在 Amego 後台查得） |

### Amego 10/10 capability 驗證明細

| Capability | 證據 | 驗證 commit |
| --- | --- | --- |
| ISSUE | `AA26515011` | v0.40.0 |
| VOID | `AA26515012` voided | v0.40.0 |
| ALLOWANCE | `A1781885120033` allowanceNumber | v0.40.0 |
| VOID_ALLOWANCE | A3 allowance voided | v0.40.0 |
| QUERY by invoiceNumber | status=ISSUED match | v0.40.0 |
| B2B (UBN 04595257) | `AA26515015`、raw 含 UBN | v0.40.0 |
| MIXED_TAX (TAXABLE+ZERO_RATED+MIG fields) | `AA26515016` | v0.40.0 |
| QUERY_BY_ORDER_ID | orderId roundtrip match | v0.40.0 |
| CARRIER mobile barcode (wire-path) | Amego registry-reject 證明 SDK 序列化正確 | v0.40.0 |
| FOREIGN_CURRENCY USD@32.5 | `AA26515019` | v0.40.0 |

加上：A10 DONATION 愛心碼 🟡 PARTIAL（Amego 接受但 raw 不 echo donation 欄位 — verification-method limitation）；A12 SCHEDULED_ISSUE 🔴 SDK gap（SEC-021，已 mitigated via `einvoice-capability-aware-gate` workflow）。

### 驗證方式說明

```
caller → n8n workflow → svc REST → @paid-tw/einvoice SDK → 真實 Amego sandbox
                                                            ↓
                                                          開出真實發票（可查 Amego 後台）
```

**不使用**：本地 docker vendor 模擬器（v0.41.0 起明確 deprecated — SDK 已附 `MockProvider` 完勝；真實 sandbox 才是 ground truth）。詳見 SEC-022 + 結案報告 §6。

### 其他 4 個 provider 範圍

ECPay / ezPay / ezPay 跨境 / ezReceipt **真實 sandbox runtime 未驗** — 沒有公開測試環境帳號。**結構層**通過（capability 對齊、payload shape 對齊 SDK Zod schema），但 wire-level runtime 待 caller 自行對接真實 credential 驗證。

---

## 🔒 安全、惡性程式檢查、V&V 驗證程序與能力

> Pack 對外宣稱「能補足 AI Coding 的稽核 / 安全 / 透明可控性」（詳見 [`docs/why-code2n8n-audit-security-transparency.md`](../../docs/why-code2n8n-audit-security-transparency.md)）— 本 section 把實際 ship 的驗證能力與程序一次條列，給工程主管 / 稽核 / 法遵窗口 / 客戶決策者參考。

### 1. V&V 兩層 gate（A2A directive 機器可讀）

從 v0.28.1 起 ship [V&V A2A directive](../../docs/code2n8n-vv-a2a.md)（11 國語言），對 AI Coder 明定**何時必須跑兩層 V&V、跑哪些工具、看哪些 output、哪些字眼受限**。

| Layer | 強制工具 | 通過條件 |
| --- | --- | --- |
| **Layer 1 — structural** | `JSON.parse` + `scripts/security-scan.mjs` + `scripts/live-roundtrip.mjs` | 14 workflow 全 parse OK + 0 error + 14/14 roundtrip |
| **Layer 2 — runtime** | `npm install/audit/tsc` + `/healthz 200` + auth 401 + body limit 413 + op enum reject + per-workflow runtime contract + cross-document parity + end-to-end smoke | 詳見 [`tests/v0.41-final-validation-report.md`](tests/v0.41-final-validation-report.md) §4 |

§1.6 **lexical schema-before-claim rule**：訊息含「validated / 驗證通過 / production-ready / X/X ok / 全綠 / 可上線」等受限字眼前，**同訊息更早位置必須先 emit 完整 evidence schema**。Critic gate lexical regex enforce，AI Coder 無法用「我覺得 OK」繞過。

### 2. 對外部依賴的 4-Tier 安全治理

從 v0.36-39 系列 ship 完整的 4-Tier 治理（詳見 [`docs/external-package-security-posture.md`](../../docs/external-package-security-posture.md)）：

| Tier | Release | 涵蓋 |
| --- | --- | --- |
| **Tier 1** 偵測層 | v0.36.0 | scanner 加 9 條 Code 節點惡意 jsCode pattern（reverse-shell / env-dump / dynamic-eval / require-child-process / fs-write-sensitive / net-exfil / process-spawn / base64-obfuscate / require-fs）+ npm audit 升 fail gate + svc package.json caret → exact pin + socket.dev 整合 doc |
| **Tier 2** 限縮層 | v0.37.0 | container 硬化（USER 65534 / npm ci / hash-pin base image）+ docker-compose runtime flags（read_only / cap_drop:[ALL] / tmpfs / secrets file-mount）+ SBOM (CycloneDX) CI 產出 + Trivy gate（exit 1）+ Renovate 全 PR require human review + 外部 workflow JSON ingestion gate（3 道：scanner 0 error + 雙人 review marker + audit log） |
| **Tier 3** 治理層 | v0.38.0 | 新 Skill `external-dependency-security` 9 §（npm 三層審查 / sigstore provenance / GitHub raw 鎖 commit sha / 外部 workflow ingestion SOP / Docker base image SOP / Stage 7 SCA gate integration / 跨 Skill 配合表 / 操作者 quickstart） |
| **Tier 4** 自動 enforce 層 | v0.39.0 | Skill 規則從紙面 SOP 升為**真實 gate**：CI `ext-dep-skill-enforcement` job 4 道（Gate A SEC-DEP entry 必存在 / Gate B exact-pin 強制 / Gate C GitHub raw sha-lock / Gate D Dockerfile hash-pin）+ pre-commit hook + CODEOWNERS（dep / Dockerfile / SECURITY-REVIEW / scanner / ingest gate 改動必 reviewer 簽核）+ PR template（10-checkbox dep review）+ [A2A directive 中英雙語](../../docs/external-dependency-security-a2a.md) |

**這四層解的問題**：

| 風險 | Tier | 工具 |
| --- | --- | --- |
| 別人寄 workflow JSON 一鍵 import 即 RCE | T1 + T2 | scanner jscode detector + ingest gate 3 道 |
| 惡意 npm 套件（post-install / runtime exfil） | T1 + T3 | audit fail-gate + socket.dev + L3 source review SOP |
| 套件 hijack via minor auto-bump（event-stream 案例）| T1 + T2 + T4 | exact-pin + Renovate review-required + CI Gate B |
| Container 被 RCE → escape 攻主機 | T2 | non-root + readonly + cap_drop=ALL |
| Base image latest 被入侵 | T2 + T4 | hash-pin + CI Gate D 強制 |
| AI Coder 知道規則但不照做 | T4 | 4 道 CI gate + pre-commit + CODEOWNERS — 不照做 PR 直接紅 |
| 跨 AI 換手丟失規則 | T3 + T4 | A2A directive（machine-actionable spec） |

### 3. 惡性程式檢查能力

scanner 對 workflow JSON 內 Code 節點 `jsCode` 抓 9 條 pattern，自製惡意 fixture 驗證 7 error + 4 warning 全捉、Pack 30 個正當 workflow 0 false positive。詳見 [`scripts/security-scan.mjs`](../../scripts/security-scan.mjs) `MALICIOUS_JS_PATTERNS` 與 [`scripts/__test__/malicious-fixture.workflow.json`](../../scripts/__test__/malicious-fixture.workflow.json) regression fixture。

| Severity | 抓什麼 |
| --- | --- |
| error | reverse-shell pattern / env-dump (`JSON.stringify(process.env)`) / dynamic-eval (`eval` / `new Function` / `vm.runInNewContext`) / require child-process or vm or dgram / 寫 sensitive 路徑 (`/etc/` `/root/` `/home/` `C:\Windows`) / net-exfil pattern (fetch + credential-like names) |
| warning | spawn / exec / base64 large literal decode / require fs |

外部來 workflow 要進 Pack 走 `scripts/ingest-external-workflow.mjs` 三道 gate（scanner 0 error / 雙人 review marker / node digest spot-check + JSONL audit log）。

### 4. 對「Amego 真實 sandbox」之驗證程序

本案例 v0.40.0 完整跑：

```bash
# 1) svc 啟動，環境變數指向真實 Amego sandbox
cd examples/einvoice-n8n/svc && \
  EINVOICE_MODE=SANDBOX \
  AMEGO_SELLER_TAX_ID=<your-sandbox-ubn> \
  AMEGO_APP_KEY=<your-sandbox-key> \
  EINVOICE_SVC_TOKEN=<random> \
  npm start

# 2) 跑 Amego 完整 capability runner（11 scenario × 真實 Amego sandbox）
cd examples/einvoice-n8n/sandbox && \
  SVC_URL=http://localhost:8788 \
  EINVOICE_SVC_TOKEN=<same as above> \
  node scripts/amego-full-coverage.mjs

# 3) 確認 10/10 capability PASS + 1 PARTIAL（A10 DONATION verification limit）+ 1 SDK gap（A12 SEC-021）
# 4) 11 張真實發票號可在 Amego 後台查得（AA265149xx ~ AA265150xx）
```

詳細結果與每張發票對應 capability 見 [`tests/v0.40-amego-full-coverage-report.md`](tests/v0.40-amego-full-coverage-report.md)。

### 5. 為何不用 docker 模擬器（v0.41.0 重要決定）

詳見 SEC-022。簡述：

| 用 docker vendor 模擬器 | 用真實 Amego sandbox + SDK MockProvider |
| --- | --- |
| 自蓋 Zod 驗證（跟 SDK 漂移） | 與 SDK 真實 adapter 同一份 schema |
| 狀態機沒實作 | 內建 |
| capabilities 強制沒實作 | 內建（比真實 Amego SDK adapter 還嚴）|
| 信心度：sandbox 級 | 信心度：ground truth |

**結論**：v0.41.0 起本案例 deprecate 本地 docker vendor 模擬器。SDK MockProvider 是非 Amego provider 驗結構正確性的正解；Amego 用真實 sandbox 是 ground truth。

---

## English

Code2n8n case study turning [`MorrisLu-Taipei/einvoice`](https://github.com/MorrisLu-Taipei/einvoice) (Taiwan unified e-invoice SDK, five providers: Amego / ECPay / ezPay / ezPay cross-border / ezReceipt) into a governable n8n orchestration layer.

**Partition decision**: the SDK already solved the "5 providers → 1 interface" partition — don't move it into n8n. Instead, ship an 80-line Hono HTTP wrapper service (`svc/`) that holds the credentials and exposes 7 endpoints; let n8n call those endpoints to orchestrate business processes — webhook entries, retry + dead-letter, human approval, audit, daily reconcile, monthly export, capability-aware failover.

Six importable workflow JSONs compose three Pack templates (`retry-with-backoff`, `human-approval-gate`, `handover-trace`). All six pass the deterministic security scanner (0 errors, 3 expected warnings on unsigned webhooks — fronted by reverse-proxy HMAC in production) and were round-tripped against the user's local n8n at 5678 with the `[Claude 2026-06-18]` prefix + `claude-import-2026-06-18` tag.

See the table of placeholders and the security pre-review above for what to set before activating.
