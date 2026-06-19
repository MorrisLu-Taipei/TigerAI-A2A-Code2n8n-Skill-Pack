---
name: code2n8n-pipeline
description: End-to-end Code2n8n Path B auto-pilot. Auto-activates when the user (a) pastes a GitHub repository URL with any Code2n8n intent, OR (b) says "啟動 Path B 計劃" / "start Path B plan" / "kick off Path B" / "Path B 全自動" / "auto-pilot Path B" / "pipeline this MIT repo" / "把這個 repo 做成 n8n" / "Code2n8n 跑這個" / "Code2n8n this repo" / "make this n8n" / "上架完成報告 一條龍". Drives the full 12-stage pipeline: License gate → Inventory → Partition (Connector / Plugin / runtime Sub-agent) → Pre-Security Review → Build artefacts → Generate workflows → V&V Layer 1 + 2 → Activate to n8n → Completion report. Architecture is split: main agent executes, sub-agent (fresh context, no shared history) acts as critic with VETO power per the v0.28.1 A2A directive. CRITICAL LANGUAGE RULE: all sticky notes, prose artefacts, completion report — MUST be written in the SAME language the user used to trigger the SKILL (English request → English sticky notes; Chinese request → Chinese sticky notes; etc.).
---

# Code2n8n Pipeline — Path B Auto-Pilot Skill

> 🌐 [English](SKILL.en.md) | **繁體中文**
>
> 本 SKILL 是 Code2n8n Path B 的 end-to-end pipeline 自動化規格。當使用者丟一個 MIT GitHub 專案進來、要求自動化完成 Path B 的全套流程（從 Inventory 到上架），AI **必須**依本 SKILL 的 12 階段、main/critic 雙 agent 架構執行。

## 1. 啟動條件

**自動觸發 — 任一情境即啟動，不需使用者特地說 SKILL 名字**：

**(A) 使用者貼 GitHub repo URL**（最常見入口）：
- 訊息含 `github.com/<owner>/<repo>` 或 `https://github.com/...` 並表達「做 / 跑 / 上架 / 接到 n8n」任一意圖
- 即便沒明說「Code2n8n」三個字 — 只要 GitHub URL + n8n / workflow 同時出現，自動套用本 SKILL

**(B) 啟動命令觸發詞**（任一即觸發）：

| 中文 | English |
| --- | --- |
| 啟動 Path B 計劃 | start Path B plan |
| 啟動 Code2n8n pipeline | kick off Path B |
| Path B 全自動 | auto-pilot Path B |
| Code2n8n 跑這個 repo | Code2n8n this repo |
| 把這個 repo 做成 n8n | make this n8n |
| 一條龍上架完成報告 | pipeline this MIT repo |
| 對這個 repo 跑完整 V&V + Security | run full Code2n8n on this |

**(C) 隱式觸發**（須主動套用）：
- 使用者要求「驗證完整、做完上架、出報告」一條龍。
- 使用者引用 v0.28.0 SECURITY-REVIEW 模板 + v0.28.1 A2A directive，要求「未來案例都這樣跑」。
- 使用者使用 connector / plugin / sub-agent 三件套詞彙描述 Path B。

**反向條件**（**不**啟動）：
- 僅要求「規劃」/「估算」/「partition 建議」 — 改套 `code-to-workflow`（本 SKILL 是 pipeline，不是 plan）。
- 使用者明確要求只做部分階段 — 改用對應 SKILL：`n8n-security-governance`（只審查）、`sticky-note-to-workflow`（只生 workflow）。
- 非 MIT / 授權不明 — 立刻中止並回報 License gate failed，不啟動後續階段。

---

## 1.5 🚨 語言鎖定規則（**所有 artefact 必遵**）

**規則**：判定使用者啟動本 SKILL 時用的**主要語言**，然後**所有後續 prose artefact** 都用同一語言寫。

**判定方式**：
- 啟動該則訊息的**主要語句語言** = pipeline 語言
- 若該訊息混語（如「跑 Code2n8n 這個 repo」中英混）→ 看**主動詞**（動詞 / 命令動作）的語言為準
- 啟動訊息為英文 → pipeline 語言 = English
- 啟動訊息為中文 → pipeline 語言 = 繁體中文（除非使用者明確用簡體）
- 其他語言（ja / ko / fr / de / es / vi / th / ms / id） → pipeline 語言 = 該語言

**必須跟著語言走的 artefact**：

| Artefact | 受規則約束 |
| --- | --- |
| Workflow JSON 內 **sticky note** (`n8n-nodes-base.stickyNote` 的 `content` 欄位) | ✅ 必須完全用 pipeline 語言 |
| Code node 的 `notes` 欄位 | ✅ |
| `INVENTORY.md` / `PARTITION.md` / `SECURITY-PRE-REVIEW.md` 等 prose 文件 | ✅ |
| `COMPLETION-REPORT.md` / `REVIEW-SIGN-OFF.md` | ✅ |
| `SECURITY-REVIEW.md` SEC-### finding 的 prose 段落 | ✅ |
| Slack / Email 節點的 `text` / `subject` / `body` 範本 | ✅ |
| `BUILD-NOTES.md` 解釋段落 | ✅ |

**不受規則約束**（保持英文 / 國際標準）：

| 項目 | 為何 |
| --- | --- |
| 程式碼識別字 / 變數名 / 函數名 | 跨語言一致性、IDE 支援 |
| 工具命令 (`npm install` / `node scripts/...`) | 終端機指令必為英文 |
| evidence schema 的 `PASS` / `FAIL` / `PENDING` | downstream 機械驗證跨語言一致 |
| HTTP method / status code / API endpoint 名 | RFC 標準 |
| 檔案名 / 路徑 / commit message 標題 | 跨語系工具相容 |

**反例（禁止）**：

- ❌ 使用者用英文啟動，但 sticky note 寫中文 → 違反規則
- ❌ 使用者用中文啟動，但 sticky note 寫英文 → 違反規則
- ❌ 使用者用日文啟動，但 sticky note 寫中文「以下是說明…」 → 違反規則

**為何這條規則重要**：sticky note 是 workflow 內**給維護者讀的 prose**。若使用者用中文發起 Code2n8n、結果產出英文 sticky notes，等於把 prose 交付給錯誤的讀者群 — 後續維護的人類 / AI 都會卡在語言錯配。語言一致 = 交付一致。

**critic 把關**：Stage 5（generate workflows）與 Stage 11（completion report）critic gate **必含**「sticky-note 語言 ↔ 啟動語言」一致性檢查。不一致 → VETO。

---

## 2. 雙 agent 架構（main + critic）

```
使用者輸入：github.com/<owner>/<repo>（MIT）
                ↓
┌──────────────────────────┐         ┌──────────────────────────┐
│ Main Agent — 執行者       │         │ Sub Agent — 檢查者         │
│                          │ ──────▶ │（fresh context、無歷史）   │
│ 跑 12 階段，每個 stage    │  每階段  │                          │
│ 結束 emit artefact 給     │  過 gate │ 依 v0.28.1 A2A directive  │
│ critic                   │ ◀────── │ 跑對抗式 review            │
│                          │  veto /  │ 有 VETO 權：FAIL/PENDING  │
│                          │  approve │ → main 必須修才能 stage++ │
└──────────────────────────┘         └──────────────────────────┘
```

**Main agent 規則**：
- 依序執行 Stage 0 → Stage 11，**不可跳階段**。
- 每階段結束輸出固定 artefact（見 §3 列表）並 explicit handoff 給 critic。
- 收到 critic VETO 時必須修正並重交，**不得**自行繼續。

**Critic agent 規則**（**重要**）：
- **必須**用 fresh context 啟動 — 在 Claude Code / Antigravity 內透過 Agent / Task tool 呼叫 sub-agent（不繼承 main session）；任何相容 LLM 平台同理開新 session。
- 載入 v0.28.1 A2A directive（[`docs/code2n8n-vv-a2a.md`](../../../docs/code2n8n-vv-a2a.md) 或對應使用者語言的本土化版本，共 11 語可選）。
- 每階段只接收：(a) main 該階段的 artefact，(b) 該階段對應的 gate 規則。**不**接收 main 的 reasoning 過程。
- 輸出**結構化 finding**（SEC-### 格式，沿用 [`examples/einvoice-n8n/SECURITY-REVIEW.md`](../../../examples/einvoice-n8n/SECURITY-REVIEW.md) 結構）。
- 任何 Critical / High 嚴重度的 finding → 自動 VETO 該 stage。
- 最後 Stage 11 完工報告必過 critic：claim ↔ evidence 全部對齊才能 sign-off。

---

## 3. 12 階段規格（main 執行、critic 把關）

每階段的「Critic gate」是 critic agent 必須驗證的具體項目。任一未過 → VETO。

### Stage 0 — License gate

- **Main 動作**：clone repo（depth 1），讀 `LICENSE` / `package.json.license` / `pyproject.toml`；確認為 MIT 或 BSD / Apache 2.0 等 permissive。
- **Artefact**：`LICENSE-CHECK.md`（含原始 LICENSE 內文 + 判定）。
- **Critic gate**：授權是否真的 permissive、是否含商用限制、SPDX identifier 是否合規。
- **非 MIT 處置**：中止整條 pipeline，回報使用者，**不**進 Stage 1。

### Stage 1 — Inventory

- **Main 動作**：盤點來源、API endpoint、auth 模型、外部相依、SQL / FS / network 邊界、PII 觸碰、AI / LLM 呼叫、secrets 命名規則。
- **Artefact**：`INVENTORY.md`（套 `examples/einvoice-n8n/` 結構：trust boundary diagram + 表格化清單）。
- **Critic gate**：是否有遺漏邊界？外部呼叫表是否含 timeout / retry / 限速？secret 是否依命名規則收斂？

### Stage 2 — Partition（決定 Connector / Plugin / runtime Sub-agent）

- **Main 動作**：對每個 Inventory 條目決定：
  - 留在原始程式（heavy SQL、perf-critical 演算法、本身已 partitioned 的 SDK 抽象）
  - 升到 **Connector**（HTTP wrapper svc — 預設選項，模板見 [`examples/einvoice-n8n/svc/`](../../../examples/einvoice-n8n/svc/)）
  - 升到 **Plugin**（n8n custom community node — 當呼叫頻繁、要 n8n credential UI 時）
  - 變成 runtime **Sub-agent**（workflow 內 LangChain Agent node — 處理 classification / extraction / 生成）
- **Artefact**：`PARTITION.md`（含決策樹輸出 + 每條 Inventory 條目的 partition 判定）。
- **Critic gate**：partition 邏輯是否 SDK 重做？是否誤把可獨立完成的演算法塞進 workflow？是否該套 sub-agent 但被 hard-code 處理？

### Stage 3 — Pre-Security Review

- **Main 動作**：套 [`skills/tigerai/n8n-security-governance`](../n8n-security-governance/SKILL.md) §1-§9 的 8 個 dimension（auth / injection / webhook / secret / file / AI-agent / audit / observability），每個 dimension 輸出 finding 草稿。
- **Artefact**：`SECURITY-PRE-REVIEW.md`（SEC-### 結構化）。
- **Critic gate**：是否每個 dimension 都實際檢過、不是 placeholder？severity 是否合理？

### Stage 4 — Build artefacts

- **Main 動作**：
  - 若 Stage 2 決定 Connector：在 `<case-dir>/svc/` 寫 Hono / FastAPI / 等同 HTTP wrapper，含 `.env.example`、Dockerfile、`.gitignore`、bearer auth、body limit、CORS deny-by-default。**直接抄 [`examples/einvoice-n8n/svc/src/index.ts`](../../../examples/einvoice-n8n/svc/src/index.ts) 結構**（v0.28.0 已套完 SEC-1/2/3/4/5）。
  - 若決定 Plugin：在 `<case-dir>/n8n-node-<name>/` 寫 custom community node，含 `credentials/`, `nodes/`, `package.json`。
  - 若決定 runtime Sub-agent：列出 workflow 內需要 LangChain Agent node 的位置 + 對應 schema。
- **Artefact**：實際程式碼 + `BUILD-NOTES.md` 解釋取捨。
- **Critic gate**：是否依 partition 表執行？bearer / body limit / CORS 是否到位（v0.28.0 SEC-1/4/5）？

### Stage 5 — Generate workflows

- **Main 動作**：套 [`examples/templates/`](../../../examples/templates/) 三個模板（retry-with-backoff / human-approval-gate / handover-trace），加上案例特定 workflow（入口 webhook / scheduler / 對帳 / 月結 / failover）。
- **Artefact**：`<case-dir>/workflows/*.workflow.json`。
- **Critic gate**：是否套 v0.28.0 HTTP `fullResponse: true`、`$execution.resumeUrl`、`responseNode` 固定 schema、`Asia/Taipei` (或對應 tz)、`Convert to File`？dead-letter 是否實際接線（非 orphan node）？

### Stage 6 — V&V Layer 1

- **Main 動作**：跑 [`scripts/security-scan.mjs`](../../../scripts/security-scan.mjs) + [`scripts/live-roundtrip.mjs`](../../../scripts/live-roundtrip.mjs)。
- **Artefact**：`tests/vv-layer1.md`（scanner output + roundtrip 6/6 ok 紀錄 + tag）。
- **Critic gate**：scanner 0 error；roundtrip X/X ok；warnings 在 README + SECURITY-REVIEW 有解釋（依 v0.28.1 A2A directive Layer 1 條件）。

### Stage 7 — V&V Layer 2.A（dependency reality）

- **Main 動作**：`cd <case>/svc && npm install && npm audit --omit=dev --audit-level=high && npx tsc --noEmit`（或對應語言的 build/audit 命令）。
- **Artefact**：`tests/vv-layer2-a.md`。
- **Critic gate**：`npm install` 沒 ETARGET、沒用 `--force`；audit 0 high+；tsc 0 errors。

### Stage 8 — V&V Layer 2.B（runtime trust boundary）

- **Main 動作**：起 svc → curl `/healthz` → 未認證 `/v1/*` 期待 401 → 過大 body 期待 413 → prototype-pollution payload 期待 400 → unknown enum 期待 400。
- **Artefact**：`tests/vv-layer2-b.md`（每個 curl 的 status code + 截錄 response）。
- **Critic gate**：4 個負面測試全綠。
- **🆕 v0.30.1 — Sandbox build directive**：若包進來的 SDK / API **沒有公開 sandbox**（或 sandbox 需要綁信用卡 / 真實 credentials），main agent **必須**為它建一個**本地 vendor HTTP simulator**：
    - 落腳處：`<case-dir>/sandbox/`
    - 結構：單一 Hono / 同等輕量 service，5 個 sub-router 一家供應商一個（或對等的 API surface）
    - 必含：失敗注入機制（network-timeout / 5xx / auth-fail / quota / not-found / conflict 等）、idempotency、in-memory persistence
    - 透過 `*_BASE_URL` env var 讓 svc / SDK 完全不感知是 sandbox
    - **加進 `.git/info/exclude`**：sandbox 本身**不推上 GitHub**（操作者特定的測試 scaffolding），但 SECURITY-REVIEW.md 註明「local sandbox 可建」+ build directive 在本 SKILL 中
    - 參考實作：[`examples/einvoice-n8n/sandbox/`](../../../examples/einvoice-n8n/sandbox/)（local-only，不在 repo）— 模式記錄於 SECURITY-REVIEW §6.5
- **Critic gate（加強）**：若 SDK 無公開 sandbox 但 main 沒建本地 simulator → VETO，回到 Stage 8。

### Stage 9 — V&V Layer 2.C + 2.D（workflow runtime contract + cross-document parity）

- **Main 動作**：對每份 workflow JSON 跑 §3 Stage 5 critic gate 那張表的 6 項檢查；對 README 每條 claim 找 file:line 對應實作。
- **Artefact**：`tests/vv-layer2-cd.md`。
- **Critic gate**：6 項 contract 全綠；README ↔ implementation 100% parity。
- **🆕 v0.30.2 — n8n node version contract checks**：runtime smoke 之前必跑下列 4 項靜態檢查（v0.30.2 抓到 einvoice 案例的 19 個 Code v2 + 5 個 HTTP v4 contract drift）：
    1. **Code node v2+**：每個 `n8n-nodes-base.code` typeVersion ≥ 2 的節點 `parameters` 必須含 `mode + language + jsCode`。**不可有 `functionCode`**（那是舊 Function node 欄位、n8n 會默默丟掉、執行時拋 `Error: Unknown error`）。
    2. **HTTP node v4+**：每個 `n8n-nodes-base.httpRequest` typeVersion ≥ 4 且有 `sendBody: true` 的節點 `parameters` 必須含 `specifyBody: "json"`（或對應的 form / raw）。
    3. **HTTP node v4+ jsonBody expression**：`jsonBody` 必須是內聯物件表達式 `={{ { key: $json.x, ... } }}`，**不可**用 `={{ JSON.stringify({...}) }}` wrapper — 後者 n8n 會把字串原樣送出、不認其為 JSON object。
    4. **SDK / wrapper baseUrl env support**：若案例的 wrapper svc 提供 sandbox / proxy 模式，確認對應的 `*_BASE_URL` env 被讀取並傳進 SDK config（einvoice 案例的 v0.30.2 patch 是樣板）。
- **Critic gate（加強）**：四項任一不過 → VETO 回 Stage 5（workflow JSON）或 Stage 4（svc）。

### Stage 10 — Activate to n8n

- **Main 動作**：依 [`feedback_n8n_import_marking`](../../../) memory 規則 — import 時加 `[Claude YYYY-MM-DD]` 前綴 + `claude-import-YYYY-MM-DD` tag。若 case 是 sub-workflow 結構，自動 PATCH `executeWorkflow` 節點的 `workflowId` 串接。
- **Artefact**：`ACTIVATION-LOG.md`（每個 workflow 的 id + URL + activation 狀態）。
- **Critic gate**：所有 workflow 都成功 import；sub-workflow id 都串對；tag 正確。
- **🆕 v0.30.2 — n8n webhook registration caveat**：透過 `POST /api/v1/workflows` + `POST /api/v1/workflows/{id}/activate` 創建的 workflow，**webhook nodes 的 listener 不會自動 register**（即使 `active: true`）。`POST /webhook/{path}` 會回 404 直到操作者：(a) 開 n8n UI 點該 workflow 的 Save、(b) 重啟 n8n、或 (c) 用 `/webhook-test/{path}` + canvas 上點 "Execute workflow"。本 Stage 必含告知使用者這個步驟 — **不可宣稱「自動上架完成」如果該案例含 webhook entry**。詳見 `examples/einvoice-n8n/SECURITY-REVIEW.md` §6.4 「Documentation finding」。
- **Critic gate（加強）**：若案例含 webhook 但 ACTIVATION-LOG 未明示「需要 UI Save 或 restart」這個 caveat → VETO。

### Stage 11 — Completion report

- **Main 動作**：寫 `COMPLETION-REPORT.md`，含：
  - 案例摘要（partition 決策 + connector/plugin/sub-agent 總計）
  - V&V evidence schema（依 v0.28.1 A2A directive 格式）
  - SECURITY-REVIEW 總結 + decision（PASS / CONDITIONAL / BLOCKED）
  - 上架紀錄
  - 已知未完成項（runtime smoke、HMAC verifier 等）+ 追蹤 target version
- **Critic gate（重要）**：
  - 所有 claim 都對應到具體 evidence。
  - **無禁用詞彙**（依 v0.28.1 A2A directive 禁用詞表 — 中英共 9 種同義詞）。
  - PENDING 行明確標註原因。
- **Sign-off**：critic 簽 `REVIEW-SIGN-OFF.md`，含 critic agent 識別 + 時間戳。

---

## 4. Artefact 結構（pipeline 跑完的最終樣貌）

```
examples/<repo-name>-n8n/
├── LICENSE-CHECK.md          ← Stage 0
├── INVENTORY.md              ← Stage 1
├── PARTITION.md              ← Stage 2
├── SECURITY-PRE-REVIEW.md    ← Stage 3
├── BUILD-NOTES.md            ← Stage 4
├── svc/                      ← Stage 4 connector（若有）
├── n8n-node-<name>/          ← Stage 4 plugin（若有）
├── workflows/                ← Stage 5
├── tests/
│   ├── vv-layer1.md          ← Stage 6
│   ├── vv-layer2-a.md        ← Stage 7
│   ├── vv-layer2-b.md        ← Stage 8
│   └── vv-layer2-cd.md       ← Stage 9
├── ACTIVATION-LOG.md         ← Stage 10
├── SECURITY-REVIEW.md        ← Stage 3 + critic 補強 + Stage 11
├── COMPLETION-REPORT.md      ← Stage 11
└── REVIEW-SIGN-OFF.md        ← critic 最終 sign-off
```

---

## 5. Forbidden behaviour（main agent 禁止做的事）

1. **不可自評**：main agent 不得在沒有 critic sign-off 時宣稱 stage 完成。每個 stage 的 "DONE" 由 critic emit，不由 main 自報。
2. **不可跳階段**：絕對不允許「Stage 5 沒過就跑 Stage 6」之類順序錯亂。
3. **不可共享 context 給 critic**：critic 必須是 fresh context — 若平台不支援開 sub-agent，必須回報使用者「本 pipeline 在當前環境無法執行，請啟用支援 sub-agent 的環境」，**不得**降級成自我審查。
4. **不可使用禁用詞彙**：依 v0.28.1 A2A directive 表 — 「validated」/「驗證通過」/「production-ready」/「上線」/「可正式使用」等只能在 critic sign-off 後出現。
5. **不可在 Stage 10 之前 import**：v0.28.0 的教訓 — import 成功 ≠ runtime 對。Stage 10 在 Layer 2 全綠後才執行。

---

## 6. 使用 connector / plugin / sub-agent 三件套的對應

| 三件套 | 出現在 pipeline 哪 | Pack 內既有實例 |
| --- | --- | --- |
| **Connector** | Stage 4 主要產出 | [`examples/einvoice-n8n/svc/`](../../../examples/einvoice-n8n/svc/) 80 行 Hono wrapper |
| **Plugin** | Stage 4 替代產出（partition 升級時用） | 目前 Pack 無實例；本 SKILL 出規格，實際 plugin 案例待補 |
| **Sub-agent（runtime）** | Stage 5 workflow 內 | LangChain Agent node — 模板待補（v0.30+ 規劃） |
| **Sub-agent（design-time / critic）** | 整條 pipeline 的右側 | 本 SKILL 結構化的 main/critic 分工本身 |

---

## 7. 與其他 SKILL 的串接關係

| 其他 SKILL | 本 pipeline 用它做什麼 | 哪個 stage |
| --- | --- | --- |
| [`code-to-workflow`](../code-to-workflow/SKILL.md) | Inventory + Partition 的方法論主體 | Stage 1, 2 |
| [`n8n-security-governance`](../n8n-security-governance/SKILL.md) | 安全審查方法論 + 強制 §10 V&V gate | Stage 3, 6-9, 11 |
| [`sticky-note-to-workflow`](../sticky-note-to-workflow/SKILL.md) | Workflow JSON 生成 | Stage 5 |
| [`tigerai-enterprise-patterns`](../tigerai-enterprise-patterns/SKILL.md) | retry / approval / handover 三模板套用 | Stage 5 |
| [`n8n-api-bridge`](../n8n-api-bridge/SKILL.md) | n8n REST 操作（import / activate / tag） | Stage 6, 10 |
| [`n8n-code-to-native`](../n8n-code-to-native/SKILL.md) | 把 Code node 改寫成 native 節點（partition 收尾） | Stage 5 |
| [`tigerai-example-finder`](../tigerai-example-finder/SKILL.md) | 找相似 reference workflow 對照 | Stage 2, 5 |

本 SKILL 不重做這些 — 它是 orchestrator，呼叫它們依序執行。

---

## 8. 完工檢查清單（pipeline 結束前由 critic 簽）

- [ ] Stage 0 License gate PASS — 授權確認可商用 / 衍生
- [ ] Stage 1-11 每個 artefact 都存在且過 critic gate
- [ ] V&V Layer 1（scanner + roundtrip）PASS
- [ ] V&V Layer 2.A（npm install + tsc + audit）PASS
- [ ] V&V Layer 2.B（svc smoke + 3 負面測試）PASS
- [ ] V&V Layer 2.C/D（workflow contract + parity）PASS
- [ ] SECURITY-REVIEW.md 13+ SEC-### 結構化 finding（不少於 5 個）
- [ ] Stage 10 ACTIVATION-LOG 含所有 workflow id + tag
- [ ] COMPLETION-REPORT 無禁用詞彙、claim ↔ evidence 對齊
- [ ] REVIEW-SIGN-OFF 含 critic agent 識別與時間戳

任一未過 → critic 不簽 → pipeline 未完成。

---

## 9. 為什麼這條 SKILL 存在

v0.27.0 出包證明：**implementing AI 對自己的產出統計上盲視**（漏掉 5 個 blocking-severity bug）。v0.28.0 修了結構、v0.28.1 出 A2A directive、v0.29.0 11 種語言本土化 — 但這些都是「文件 / directive」層。

本 SKILL 把 main/critic 雙 agent 架構**寫進 Path B 的執行流程本身**，把對抗式 review 從「使用者手動發起的選用步驟」變成「pipeline 結構性必經的閘門」。未來丟 GitHub MIT 專案進來 → AI 啟動本 SKILL → 自動跑完 12 階段 + 自帶 critic → 出可信完工報告。

這就是 Code2n8n Path B 的 auto-pilot。
