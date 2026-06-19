# Changelog

## v0.30.2 — 真實 n8n end-to-end smoke 抓到 3 個 V&V 漏網之魚（SEC-014/015/016）

實際把 einvoice-issue-from-order workflow 上架到使用者 localhost:5678 n8n、打了真的 webhook、看 svc → SDK → **Amego 公開 sandbox** 回了真實測試發票 `AA26514637`。**這是 v0.28.0 起 SECURITY-REVIEW 一直標 PENDING 的 end-to-end runtime smoke 第一次真的跑通**。

而且，這次 smoke 一路爬出 4 個前面 V&V 沒抓到的 contract drift bug — 全部修了。

### 🆕 3 個新 SEC-### finding（推上 SECURITY-REVIEW.md §6.4）

| ID | Severity | 內容 | v0.30.2 |
| --- | --- | --- | --- |
| **SEC-014** | High | 6 份 workflow 全部用 `parameters.functionCode`（舊 Function node 欄位），但 Code v2 要 `mode + language + jsCode` — n8n 默默丟掉、執行時拋 `Error: Unknown error` | ✅ 19 個 Code v2 nodes 批次 migrate |
| **SEC-015** | High | 5 個 HTTP v4 nodes 用 `={{ JSON.stringify({...}) }}` wrapper，但 n8n v4 需要 `specifyBody: "json"` + 內聯物件表達式 `={{ { ... } }}` — 結果 svc 收到空 body 回 400 | ✅ 全部改成 inline expression + 加 specifyBody |
| **SEC-016** | Medium | `svc/src/providers.ts` 沒讀 `*_BASE_URL` env，導致 v0.30.1 的本地 sandbox 完全被 bypass | ✅ 5 家 provider config 都加 `baseUrl: optionalBaseUrl(...)` |

加碼一條 **n8n 行為文件化**（不是 Pack bug 但需告知使用者）：透過 REST API 創的 workflow，webhook listener 不自動 register，必須 UI Save 或 n8n 重啟。寫進 SKILL Stage 10 警告。

### 🩹 SKILL Stage 9 + 10 加強

`code2n8n-pipeline` SKILL 加入 **4 項 n8n node version contract checks**（Stage 9）：
1. Code v2 必須 `mode + language + jsCode`
2. HTTP v4 + sendBody 必須 `specifyBody: "json"`
3. `jsonBody` 必須內聯物件表達式
4. 若 svc 有 sandbox/proxy 支援，必須讀 `*_BASE_URL` env 並傳進 SDK

Stage 10 加 webhook registration caveat：若案例含 webhook entry，**不可宣稱「自動上架完成」**，必須告知使用者「需要 UI Save 或 restart」。

### ✅ 驗證紀錄（誠實版）

**Layer 1**：scanner 6/0 err/3 warn · live-roundtrip 6/6 ok (tag claude-import-2026-06-19)
**Layer 2.A**：svc tsc 0 err · npm audit 0 CVE
**Layer 2.B**：svc /healthz 200 · /v1/* 401 · op=__proto__ → 400 · 2MB body → 413 · missing creds → "configuration error"
**Layer 2.E（end-to-end）**：
- 第 1 次 smoke（patched v0.30.1）：4 個 bug 連環暴露 → workflow 跑不完
- 第 7 次 smoke（patched 4 個 bug 後）：**全 10 節點綠 · 真實 invoice `AA26514637` 回來 · svc.log 200 / 182ms**
- 第 8 次 smoke（v0.30.2 純 repo patch 後 re-import）：webhook 404 因為等使用者點 UI Save（n8n 行為，已寫進 SKILL Stage 10）

**未驗證**（誠實揭露）：
- 其他 5 個 workflow（void / allowance / reconcile / failover / monthly-export）的 end-to-end 沒真打
- Google Sheet audit row / Slack DLQ 實際寫入沒測（節點 disable 跳過）
- Retry / DLQ 路徑沒驗（happy path only）
- ECPay / ezPay / ezPay-CB / ezReceipt via n8n 沒驗
- 本地 sandbox（v0.30.1）+ svc baseUrl env（v0.30.2）整合 — 程式碼到位但沒實打 smoke

### 為什麼這版重要

v0.28.0 是「方法論修了第一次」。v0.30.2 是 **方法論修了第二次** — 因為 v0.28.0 的 review 用 scanner + roundtrip 抓到 13 個 SEC、但 Code v2 / HTTP v4 contract drift 因為「沒實際 run」漏抓。v0.30.2 把 n8n version contract checks 寫進 SKILL Stage 9，避免下個案例再踩。

**第一次寫進 SKILL 的兩條 hard-learned 規則**：
- 「workflow JSON 結構合法 ≠ workflow 能執行」— v0.28.0 學到一次
- 「**workflow 能 import ≠ webhook 真的 register**」— v0.30.2 學到第二次

---

## v0.30.1 — Sandbox build directive 寫進 SKILL Stage 8（pattern 推上，實作本地留）

實作層：本地建好 5 家 vendor HTTP simulator（`examples/einvoice-n8n/sandbox/`）— Hono + AES + 8 種錯誤注入 + 5 sub-router，跑通 Amego 全鏈 smoke。**但 sandbox 本身不推 GitHub**（操作者特定 scaffolding，`.git/info/exclude` 鎖死）；推上的只有「pattern 怎麼用」。

### 🆕 SKILL Stage 8 加入 sandbox build directive

[`skills/tigerai/code2n8n-pipeline/SKILL.md`](skills/tigerai/code2n8n-pipeline/SKILL.md) Stage 8 增補：

> 若包進來的 SDK / API **沒有公開 sandbox**（或 sandbox 需綁信用卡 / 真實 credentials），main agent **必須**建本地 vendor HTTP simulator：
> - 落腳 `<case-dir>/sandbox/`
> - Hono / 同等輕量 service，5 sub-router 一家一個
> - 必含失敗注入、idempotency、in-memory persistence
> - 透過 `*_BASE_URL` env 讓 svc 不感知
> - 加進 `.git/info/exclude` — 不推 GitHub
>
> Critic gate 加強：SDK 無公開 sandbox 但 main 沒建 simulator → VETO 回 Stage 8。

未來所有 Code2n8n 案例遇到「沒公開 sandbox」的 SDK 都會自動套用此 pattern。

### 🩹 [`examples/einvoice-n8n/SECURITY-REVIEW.md`](examples/einvoice-n8n/SECURITY-REVIEW.md) 加 §6.5

文件化「本地 sandbox 存在 + 為何不推」+ SEC-011 / SEC-012 / SEC-013 的 status update 段落 — 說明這三條從程式碼審查層面已 ✅ FIXED，**並標出本地 sandbox 跑完整 end-to-end 該怎麼產出 evidence**。Operator 跑完本地 sandbox 的 evidence 留 local（含 operator-specific 識別字），Pack 推上的是「為何 evidence 可以這樣產」。

### 為什麼這樣分（推 pattern、不推實作）

Sandbox 實作含：
- Vendor-published 測試密鑰（雖然公開但屬於每家 vendor 的測試政策變動範圍）
- Operator 想注入的特定錯誤 / 持久化 / 測試資料形狀（人人不同）
- 跑完的 evidence log（embed operator-specific identifier）

把這些推 GitHub 會：(a) 變成所有 fork 都帶測試密鑰、(b) 把一個人的 sandbox 風格鎖死成 Pack 的「正確答案」。**推 pattern + 留實作給 operator** 是健康分界。

---

## v0.30.0 — 新 SKILL：`code2n8n-pipeline`（Path B 自動駕駛 / main-critic 雙 agent）

把 Code2n8n Path B 從「使用者帶著 AI 跑」升級為「丟 GitHub repo → AI 自己跑完 12 階段 → 出完工報告」的 auto-pilot SKILL。**不是執行案子**，是寫**規格**讓未來案子進來時 AI 自動啟動本 SKILL。

### 🆕 [`skills/tigerai/code2n8n-pipeline/SKILL.md`](skills/tigerai/code2n8n-pipeline/SKILL.md)

**啟動條件**（任一即觸發、無需指名 SKILL）：
- 使用者貼 `github.com/<owner>/<repo>` + 任何 n8n / Code2n8n 意圖
- 啟動命令（中 / 英）：「啟動 Path B 計劃」「Code2n8n 跑這個 repo」「把這個 repo 做成 n8n」「auto-pilot Path B」「pipeline this MIT repo」「make this n8n」 等

**架構**：main agent 執行、sub agent（fresh context、無歷史）做 critic 並有 VETO 權 — 就是 v0.27.0 出包時「另一個 AI 抓到 5 個 bug」的同一機制，這次**結構化進 pipeline**而非仰賴使用者手動發起。

**12 階段**：
0. License gate（非 MIT 立刻 BLOCKED）
1. Inventory
2. Partition（Connector / Plugin / runtime Sub-agent 三選一）
3. Pre-Security Review
4. Build artefacts（svc / custom node / sub-agent 設計）
5. Generate workflows
6. V&V Layer 1（scanner + roundtrip）
7. V&V Layer 2.A（npm install / tsc / audit）
8. V&V Layer 2.B（svc smoke + 3 負面測試）
9. V&V Layer 2.C/D（workflow contract + parity）
10. Activate to n8n（自動套 `[Claude YYYY-MM-DD]` 前綴）
11. Completion report

每階段 main 出 artefact → critic 過 gate → FAIL/PENDING 即 VETO → main 修了才能往下。

### 🌐 §1.5 語言鎖定規則（**所有 artefact 必遵**）

使用者用哪種語言啟動 SKILL → 所有 prose artefact（sticky notes / 報告 / Slack 文字範本）用同一語言。識別字 / 命令 / API 名保持英文（國際標準）。

| 啟動語言 | Sticky note 語言 |
| --- | --- |
| 中文 | 繁中（除非使用者用簡體） |
| English | English |
| 日本語 / 한국어 / Français / Deutsch / Español / Tiếng Việt / ภาษาไทย / Bahasa Melayu / Bahasa Indonesia | 同上 |

Stage 5 + Stage 11 critic gate 必含「sticky-note 語言 ↔ 啟動語言」一致性檢查，不一致 → VETO。

### 💾 跨 session memory

`feedback_artefact_language_matches_user.md` — 把語言鎖定規則寫入 memory，未來所有 Code2n8n 案例（即便不用 pipeline SKILL）也一體適用。MEMORY.md 索引同步更新。

### 🩹 周邊串接

- `plugin.json`：登錄 `code2n8n-pipeline` SKILL，skills 14 → **15**
- README en + zh 樹狀圖、Agentic footprint、一張圖看懂段落同步 14 → 15
- SKILL 內標示其餘 7 個既有 SKILL 在 pipeline 哪個 stage 被呼叫（`code-to-workflow`、`n8n-security-governance`、`sticky-note-to-workflow`、`tigerai-enterprise-patterns`、`n8n-api-bridge`、`n8n-code-to-native`、`tigerai-example-finder`）— 本 SKILL 是 orchestrator，不重做。

### 為什麼這版重要

v0.27.0 → v0.29.0 把 V&V gate、SECURITY-REVIEW、A2A directive、11 語本土化全堆好了 — 但這些都是「**使用者** / **AI** 要記得啟動」的選用機制。v0.30.0 把它**結構化進 SKILL 的啟動條件本身**：未來丟一個 GitHub MIT repo 進來，本 SKILL 會自動 trigger，整條 pipeline 含 critic 自動跑完，使用者不需要記得 invoke「兩層 V&V」「A2A directive」「對抗式 review」三個東西 — pipeline **自帶**這三個。

---

## v0.29.0 — A2A 指令全 9 語系本土化（11 種語言總計）

v0.28.1 出 A2A 指令但只有英文。給 AI 用的文件必須在目標 LLM 的主要語言才能可靠觸發那個語言下的 prompt pattern：「validated」/「驗證通過」/「検証済み」/「validé」是不同 token，禁用詞表必須有對應語言的字才能擋住。

### 🆕 9 個新翻譯 + 中文版

10 個新翻譯檔，加上英文原版 = **11 種語言**：

| 語言 | 檔案 |
| --- | --- |
| 中文 | [`docs/code2n8n-vv-a2a.zh.md`](docs/code2n8n-vv-a2a.zh.md) |
| 日本語 | [`docs/code2n8n-vv-a2a.ja.md`](docs/code2n8n-vv-a2a.ja.md) |
| 한국어 | [`docs/code2n8n-vv-a2a.ko.md`](docs/code2n8n-vv-a2a.ko.md) |
| Français | [`docs/code2n8n-vv-a2a.fr.md`](docs/code2n8n-vv-a2a.fr.md) |
| Deutsch | [`docs/code2n8n-vv-a2a.de.md`](docs/code2n8n-vv-a2a.de.md) |
| Español | [`docs/code2n8n-vv-a2a.es.md`](docs/code2n8n-vv-a2a.es.md) |
| Tiếng Việt | [`docs/code2n8n-vv-a2a.vi.md`](docs/code2n8n-vv-a2a.vi.md) |
| ภาษาไทย | [`docs/code2n8n-vv-a2a.th.md`](docs/code2n8n-vv-a2a.th.md) |
| Bahasa Melayu | [`docs/code2n8n-vv-a2a.ms.md`](docs/code2n8n-vv-a2a.ms.md) |
| Bahasa Indonesia | [`docs/code2n8n-vv-a2a.id.md`](docs/code2n8n-vv-a2a.id.md) |

每份翻譯保留：
- **完全相同**的工具呼叫指令（code block 不翻譯，跨語言一致）
- **完全相同**的 evidence schema（PASS/FAIL/PENDING 用英文，downstream 機械驗證可用）
- **本土化**的禁用詞表 — 含目標語言的「validated 同義詞」（如「驗證通過」「検証済み」「validé」「validiert」等）+ 各語言常見的弱化用語（「應該可以」「sollte funktionieren」「devrait marcher」「sollte sebaiknya」）
- **本土化**的禁用詞替代詞（用該語言寫的）

英文版為 source of truth，翻譯按 release 同步。

### 🩹 周邊串接

- 兩種語言 README hero callout 從「讀 a2a.md」擴成「11 種語言一覽 + 一行說明」
- 每個翻譯檔頂部都有完整語言切換器

### 為什麼這版重要

A2A directive 的核心機制是 **deterministic trigger phrase**。如果一個日文 LLM 看到的指令是英文寫「validated 是禁用詞」，它不會把「検証済み」當成同義詞攔下來。本土化版本讓**指令的攔截網跟著 LLM 的母語走**，不留語言縫隙。

---

## v0.28.1 — V&V gate 的 A2A 版本（給 AI 用，不再只是人用）

使用者指出：「整個 Pack 是給 AI 使用的，V&V SOP 寫成『給人 print 出來 tick』搞錯對象」。確實 — v0.28.0 出 `code2n8n-vv-checklist.md` 是人類版本。AI agent 讀那份會把它當參考資料、不會當強制指令。

### 🆕 [`docs/code2n8n-vv-a2a.md`](docs/code2n8n-vv-a2a.md) — A2A 機械可執行指令

寫給 AI 讀的 V&V gate：
- **觸發時機**：明確列出 9 個觸發 token（"validated" / "驗證通過" 等），不留模糊空間
- **精確工具呼叫**：`node scripts/...` 一條條列死，不寫「用 judgment」
- **強制 evidence schema**：跑完 gate 必須輸出固定格式的 PASS/FAIL/PENDING 列表
- **禁用短語表**：列出哪些字 + 對應該條什麼 evidence 才能用
- **跳過行為明文化**：環境不允許做 Layer 2 時必須 SKIPPED + reason，不能裝沒事
- **對抗式 review hook**：第一個新 SDK 案例必須請另一個獨立 AI 跑 review

### 🩹 周邊串接

- 兩種語言 README 在 hero 一句話定位下方加 callout：「🤖 AI agent 要使用本 Pack？跑任何 Code2n8n 流程之前先讀 vv-a2a.md」
- `n8n-security-governance` SKILL §10 主指引拆成 AI 走 a2a / 人走 checklist
- 連到 [`examples/einvoice-n8n/REFLECTION.md`](examples/einvoice-n8n/REFLECTION.md) 解釋為什麼有這個 gate

### 為什麼這版重要

Pack 的目標讀者本來就是 AI agent — Claude Code / Codex / Antigravity 在執行 Code2n8n 流程時讀本 Pack 的 Skills / docs。把 V&V 寫成「給人 tick 的 SOP」等於把整個防護機制朝錯誤方向交付。**A2A 版本才是這套 Pack 真正的 V&V interface**。

---

## v0.28.0 — V&V 兩層 gate + einvoice-n8n 13 個 SEC-### + 結構化檢討

**這版的主因是 v0.27.0 的失誤檢討**。第一個外部 SDK 案例 `examples/einvoice-n8n/` 上版時，我宣稱「6/6 ok 驗證通過」— 實際只跑了 workflow JSON scanner + n8n REST import roundtrip。使用者拿另一個 AI 做對抗式 review，立刻找到 5 個阻斷性 runtime bug 和 1 個 svc 完全裝不起來的 package.json 錯誤。

[`examples/einvoice-n8n/REFLECTION.md`](examples/einvoice-n8n/REFLECTION.md) 是完整檢討。重點：**我把 Layer 1（結構 / import）當成 Layer 2（compile / runtime）**。

### 🆕 SOP：`docs/code2n8n-vv-checklist.md` — V&V 兩層 gate

定義 Layer 1 vs Layer 2，列禁用詞彙，給逐項 reviewer checklist。**任何 commit / release / README 要寫「驗證」之前，兩層都要過**。

### 🆕 SKILL §10：`n8n-security-governance` 強制 §10

Skill 新增 §10「V&V 兩層 gate」，把 SOP 鎖進 marquee skill 的完成檢查清單。`code-to-workflow` 套用 marquee 流程時自動套用本 gate。

### 🆕 [`examples/einvoice-n8n/SECURITY-REVIEW.md`](examples/einvoice-n8n/SECURITY-REVIEW.md) — 13 個 SEC-### finding

| ID | Severity | v0.27.0 | v0.28.0 |
| --- | --- | --- | --- |
| SEC-001 | Critical | service fail-open when token missing | ✅ 改 exit(1) |
| SEC-002 | High | `/v1/route` allowed prototype dispatch | ✅ ALLOWED_OPS 白名單 |
| SEC-003 | Medium | error 訊息洩漏 env 名 | ✅ `"configuration error"` opaque |
| SEC-004 | Medium | 無 body size limit | ✅ 1 MiB body-limit → 413 |
| SEC-005 | Medium | 無 CORS policy | ✅ deny-by-default |
| SEC-006 | Low | logger 升 verbose 會洩 invoice body | 🟡 v0.29 redaction |
| SEC-007 | Medium | Dockerfile root + 未 pin | ✅ USER node；v0.29 補 pin |
| SEC-008 | Medium | `.env` 未進 `.gitignore` | ✅ svc/.gitignore 補上 |
| SEC-009 | Critical | void approval 無驗簽 | 🟡 文件 + `$execution.resumeUrl` 修正；HMAC verifier sub-WF 排 v0.29 |
| SEC-010 | Medium | webhook responseMode `lastNode` 洩漏 | ✅ `responseNode` 固定 schema |
| SEC-011 | **Critical** | HTTP `$json.statusCode \|\| 200` 永遠 truthy → audit 撒謊 | ✅ `fullResponse: true` + Rehydrate state node |
| SEC-012 | High | dead-letter Slack 是孤立節點 | ✅ Exhausted? 並連到 Audit + Slack |
| SEC-013 | High | 排程使用 UTC slice → 算錯日 | ✅ `settings.timezone='Asia/Taipei'` + `Intl.DateTimeFormat` |

### 🩹 修：svc 從根本可用

- `package.json`：`@paid-tw/einvoice@^0.3.0`、`amego/ecpay/ezpay@^0.3.0`、`ezpay-crossborder/ezreceipt@^0.1.1`、`hono@^4.6.0`、`@hono/node-server@^1.13.0`。**全部對到 npm 真正發佈版本**。
- `providers.ts`：5 家 adapter config 從讀**真實的** `BaseProviderConfig` + 各家 `XxxConfig` 重寫 — `sellerUbn`（非 `sellerTaxId`）、`hashIV`（非 `hashIv`）、`appCode + appKey + accName + password`（ezReceipt）、`mode: TEST | PRODUCTION`（非 SANDBOX）。
- `index.ts`：`InvoiceError.rawCode` / `e.provider`（非 `providerCode`）、Hono `Context` 正規型別。
- `tsc --noEmit` ✅ 0 errors。`npm audit --omit=dev` ✅ 0 vulnerabilities。

### 🩹 修：6 個 workflow 全部重寫

- `einvoice-issue-from-order`：HTTP fullResponse + Rehydrate state + DLQ 連線修好 + responseNode + Asia/Taipei
- `einvoice-allowance`：同上
- `einvoice-void-with-approval`：`$resumeUrl` → `$execution.resumeUrl` + Rehydrate after Wait + responseNode
- `einvoice-daily-reconcile`：Asia/Taipei `Intl.DateTimeFormat` + 補上 README 承諾的 `Email finance` 節點
- `einvoice-provider-failover`：HTTP fullResponse + rehydrate
- `einvoice-monthly-audit-export`：Asia/Taipei 月初算法 + `Convert to File` 節點讓 Email attachment 真的存在

### ✅ V&V 紀錄（這次照 §10 走完兩層）

**Layer 1**：
- Scanner：6 files · 0 error · 3 expected warnings（SEC-009 entry webhooks）
- Live REST round-trip：6/6 ok · tag `claude-import-2026-06-18` · post-test DELETE

**Layer 2**（之前漏的）：
- `npm install` ✅ 0 phantom deps, 0 vulnerabilities
- `tsc --noEmit` ✅ 0 errors
- `node dist/index.js` ✅ service starts, `/healthz` 200
- 未認證 `/v1/*` ✅ 401
- SEC-2 `op=__proto__` ✅ 400
- SEC-4 2 MB body ✅ 413
- SEC-3 env 名 ✅ 不外洩

**仍未做（誠實揭露）**：
- 真正的 svc + n8n + Sheet end-to-end smoke（送一筆 mock issue 走完整條鏈、看到 audit row 真的長對）— 排 v0.29
- HMAC verifier sub-workflow（SEC-009 compensating control）— 排 v0.29
- logger 主動 redaction（SEC-006）— 排 v0.29

### 為什麼這版重要

不是「新功能版」。是**第一個案例驗證失格 → 修正 + 把標準寫進 SKILL/SOP**。Pack 的可信度不靠「我們有方法論」，靠「方法論在第一次出包時有被執行到」。

---

## v0.27.0 — 新案例：台灣電子發票 SDK → n8n 治理鏈（Code2n8n Path B 教科書級）

把 [`MorrisLu-Taipei/einvoice`](https://github.com/MorrisLu-Taipei/einvoice)（台灣電子發票統一 TypeScript SDK，5 家供應商：Amego / ECPay / ezPay / ezPay 跨境 / ezReceipt）做成可被 n8n 編排的治理鏈。**SDK 本身不搬進 n8n** — SDK 已經解了「5 家 → 1 介面」這層 partition，搬進 n8n 是反模式。Pack 給的答案是寫一個 80 行的 HTTP wrapper service 持有 credentials，n8n 只編排業務流程。

### 🆕 [`examples/einvoice-n8n/`](examples/einvoice-n8n/)

**Wrapper service**（`svc/`）— Hono + TypeScript 單檔 80 行，7 endpoints：
- `GET /healthz` / `GET /v1/capabilities/:provider`（meta）
- `POST /v1/issue` / `void` / `allowance` / `void-allowance` / `query`（5 個 SDK 方法）
- `POST /v1/route` — capability-aware failover，走 SDK 的 `supports(p, cap)` 找第一個能做的 provider
- Bearer token (`EINVOICE_SVC_TOKEN`)；附 Dockerfile + docker-compose

**6 個 importable workflow**（`workflows/`）：

| Workflow | 角色 | 套哪個 Pack 模板 |
| --- | --- | --- |
| `einvoice-issue-from-order` | 訂單 webhook → svc/issue → 重試 → 稽核 | `retry-with-backoff` + `handover-trace` |
| `einvoice-void-with-approval` | 作廢請求 → Slack 核可 → svc/void | `human-approval-gate` |
| `einvoice-allowance` | 退款 webhook → svc/allowance → 重試 | `retry-with-backoff` |
| `einvoice-daily-reconcile` | Schedule 02:00 → query 昨日 → diff → 告警 | — |
| `einvoice-provider-failover` | sub-workflow，capability-aware 走 `/v1/route` | — |
| `einvoice-monthly-audit-export` | Schedule 月初 03:00 → 上月稽核 CSV → 寄會計 | — |

### ✅ 驗證紀錄

- **Scanner**：`scripts/security-scan.mjs` → **6 files · 0 error · 3 warning**（3 個 warning 全是 issue/void/allowance 入口 webhook 沒驗簽 — **故意的**，生產環境前面要擋 reverse-proxy + HMAC SHA-256，README security 段有寫）
- **Live REST round-trip**（使用者 localhost:5678 受管 n8n）：
  ```
  OK   einvoice-allowance              (id=wJS2xiecMIns9VfB, nodes=11)
  OK   einvoice-daily-reconcile        (id=9l5vhxEdvX4Mco6s, nodes=11)
  OK   einvoice-issue-from-order       (id=AI5SS29TOiKTRsE6, nodes=11)
  OK   einvoice-monthly-audit-export   (id=vi5QAhu4TQIji498, nodes=7)
  OK   einvoice-provider-failover      (id=zZaLD8nG9yv7xbUp, nodes=7)
  OK   einvoice-void-with-approval     (id=ssP7iu9pKpH5igAT, nodes=9)
  Summary: 6/6 ok · tag=claude-import-2026-06-18
  ```
  Post-test 已 DELETE，instance 乾淨。

### 為什麼這版重要

v0.26.0 把 3 個模板丟出去當 drop-in。v0.27.0 證明它們**真的可以在一個外部開源 SDK 上組合出來**：
- `retry-with-backoff` 被 issue / allowance / failover 三條路徑套用
- `human-approval-gate` 被 void 套用（作廢不可逆 → 強制人工核可）
- `handover-trace` 在每個 workflow 都用 `correlationId` 把整條鏈串起

並把 Code2n8n 的核心 partition 主張 **「方法包 + 平台」** 演到 SDK 層級：**SDK 不該被 n8n 重做。n8n 編排業務，SDK 處理協定**。

### Proof bar 新增一列

`README.md` / `README.zh.md` 在三個原始案例後加一列：「Taiwan e-invoice unified SDK → 80-line Hono wrapper svc + 6 governance workflows」。

---

## v0.26.3 — Rollback v0.26.2（FB 案例不屬於 Pack）

撤回 v0.26.2 — 那四份 FB 每日廣告 workflow 是使用者個人練習，**不是 Pack 的公開案例**。在 v0.26.2 出貨之前未確認歸屬就上 GitHub 是判斷失誤，這版把它清乾淨：

- `git rm -r examples/fb-daily-ads/`
- GitHub release `v0.26.2` 刪除
- Tag `v0.26.2`（local + remote）刪除

**保留的部份**：使用者的 localhost:5678 instance 仍持有那四支已 import 的 workflow（personal 練習用），個人運作不受影響。

### 順手：紀錄使用者術語約定

寫進 `~/.claude/.../memory/feedback_terminology_push_vs_import.md`：

| 動詞 | 意思 |
| --- | --- |
| **「推上」** | git push 到 GitHub |
| **「上架」** | POST workflow 到 n8n instance |

兩者不可混用。

---

## v0.26.1 — 三層審查（自己 / 工程師 / 酸民）的防守強化

v0.26.0 把矩陣 🟡 結清。0.26.1 不加功能，把整套敘事的「容易被打 / 容易被誤讀」的點全部硬化。

### 🎨 Hero PNG：白底正式註解，不再是字幕浮層

之前 v0.25 是深色底白字像 caption，會被看成 subtitle overlay。改為**白底**、**頂部 hairline 分隔線**、**深色文字**的正式圖內註解，且 copy 升級為完整一句、不再點到為止：

> *Platform capabilities such as SSO / IAM, Audit Log, HA, Metrics, and Source Control are provided by n8n editions and enterprise IT deployment. This Pack provides the migration, review, validation, and governance method.*

中文同款。圖被單獨轉傳時，責任邊界**像圖的一部分**被看，不像被打字幕。重做後的 [`scripts/stamp-hero.ps1`](scripts/stamp-hero.ps1) 已 BOM-saved + PS 5.1 安全；底圖從 d5682fa（v0.23.0 pre-stamp 版）取回乾淨原檔再燒。

### 🪪 README 新增「What this Pack is — and what it is not」

緊接 hero 一張表，把工程師會挑、酸民會酸的五個誤讀路徑一次擋下：

| ✅ This Pack **is** | ⛔ This Pack **is not** |
| --- | --- |
| 移植方法論（Inventory → Partition → Workflow Design） | n8n Enterprise 的替代品 |
| Security Review 關卡（SOP + Skill + 範本 + 確定性掃描器） | 萬用 SAST / DAST / fuzzer |
| 驗證 SOP + 第一線 CI gate | 完整 workflow deployment pipeline |
| 三案例移植 + 16 個可審 workflow JSON | 萬用「程式碼 → workflow」compiler |
| 2,061 設計查找語料 | 已驗證 production 模板 |

英文版同步。表後直接附上 receipts 連結（responsibility-matrix + 最新 evidence report）。

### 🧪 Proof bar 精準化

`import 7/7` / `Import 6/6` 容易被工程師讀成「能跑」。改為三段式：

> Static lint 0 err / 0 warn · n8n REST import 7/7 · **live execution requires your Google Workspace credentials**

每一格都標出**靜態 lint + import + live 三個層次**，import 成功 ≠ runtime 成功被寫死在原文。On-prem 那欄改為直接寫 BLOCKED 結論 + 指向 SECURITY-REVIEW。

### 🧾 「2,061 reference workflows」加 inline 註

The whole-pack-in-one-picture 一行裡，把 *"2,061 reference workflows"* 直接 inline 標註 **"as a design-lookup corpus, not validated templates"** — 不靠讀者翻到責任矩陣才知道這是語料。

### 一句話

故事沒動。**證據、邊界、文案防守都向工程師那一側靠了一格**。v0.26.0 結清能力 backlog；v0.26.1 結清敘事 backlog。

---

## v0.26.0 — 結清 responsibility-matrix 最後 4 個 🟡

v0.25.0 把 installer / hero PNG / CI gate 收尾。v0.26.0 把責任矩陣裡剩下的 4 個 🟡（live-n8n round-trip、確定性 security scanner、完整 CI/CD、Retry/Approval/Handover drop-in 模板）一次清完。

### 🆕 [`scripts/security-scan.mjs`](scripts/security-scan.mjs) — 確定性 workflow 安全掃描器

regex / 結構性規則，不是 AI 判斷：
- 密鑰文字（OpenAI / AWS / GitHub / Slack / Google API / PEM 私鑰 / JWT / basic-auth URL）
- 敏感 key（password / secret / token / api_key / private_key…）底下的明文值
- 非 localhost 的 cleartext HTTP URL
- webhook 節點沒 authentication
- empty / unparsable JSON 結構問題

支援 `--glob "..."` / `--format markdown\|json\|text`。0 errors 就 exit 0；任何 error 就 exit 1。在本機跑 case-study + templates 共 16 個 workflow：0 errors、9 warnings（全部是 case study 故意保留的 webhook-no-auth，已在 SECURITY-CAVEATS 揭露）。

### 🆕 [`scripts/live-roundtrip.mjs`](scripts/live-roundtrip.mjs) — n8n REST round-trip

`POST /workflows` → `GET /workflows/{id}` 比對 node count → `DELETE /workflows/{id}`，每個 workflow 都不留垃圾。沒設 `N8N_API_URL` / `N8N_API_KEY` 時自動 exit 0 skip（CI optional job 用）。Import 名稱前綴 `[Claude YYYY-MM-DD] roundtrip —`，方便 crash 後找孤兒。

### 🆕 [`examples/templates/`](examples/templates/) — 三個 drop-in importable workflow

| 檔案 | 模式 | 節點 |
| --- | --- | --- |
| `retry-with-backoff.workflow.json` | 指數退避 retry + dead-letter | 10 nodes |
| `human-approval-gate.workflow.json` | 人工核可關卡（Wait + resume webhook） | 8 nodes |
| `handover-trace.workflow.json` | 跨系統交接 + correlation ID | 8 nodes |

每個檔案含結構化 sticky note 說明：模式定義、實作節點對應、上線前要改什麼、滿足 `n8n-security-governance` 哪幾條規則。三檔皆通過 security scanner 0/0。

### 🛡️ CI gate 擴充（多平台）

`.github/workflows/security-gate.yml` 新增 4 個 job：
- `workflow-security-scan` — 跑 security-scan.mjs 對 case studies + templates
- `dependency-cve` — matrix npm audit（LINE CS cloud / on-prem 各跑一份；`continue-on-error`，先報不擋）
- `container-scan` — Trivy filesystem scan on-prem case（HIGH / CRITICAL，`exit-code: 0` 先報不擋）
- `live-roundtrip` — 跑 live-roundtrip.mjs；secret-gated（`N8N_API_URL` / `N8N_API_KEY`）

[`.gitlab-ci.yml`](.gitlab-ci.yml) 鏡像同一份邏輯給 GitLab runner — 4 個 stage（parse / lint / scan / roundtrip），同樣的 script 被引用、不重抄。

### 📋 周邊串接

- `docs/responsibility-matrix.md`：4 個 🟡 全部翻 ✅，per-claim 表頂端的「狀態 as of」改 v0.26.0。
- `skills/tigerai/tigerai-enterprise-patterns/SKILL.md` 頂部加引用 `examples/templates/` 的指引條，讓 AI 套 skill 時可直接拿模板當骨架。

### Backlog 結餘

責任矩陣現在 **0 個 🟡** — 剩 ⛔ 都是「不在 Pack scope 內」（SSO / IAM / Audit Log / multi-main HA / `/metrics` 觀測 stack / ERP/CRM/DB/LLM 實際整合）。如果未來要再加項目，是 ✅ + ⛔ 兩種狀態而已；🟡 不再代表「我們答應但還沒做」。

---

## v0.25.0 — 把 responsibility-matrix 的 4 個 🟡 backlog 全部結清

v0.24.2 把文件落差掃乾淨，但責任矩陣裡還留 4 個 🟡（hero PNG 沒燒字、installer 沒旗標、沒 dry-run、沒官方 uninstall）。這版一次結清。

### 🆕 installer / uninstaller 改版

`install.sh`、`install.ps1`、`uninstall.sh`、`uninstall.ps1` 四支腳本同步加上：

| 旗標 | 行為 |
| --- | --- |
| `--target claude\|antigravity\|all` | 指定單一目標或全部 |
| `--dry-run` | 印出所有 fs 動作但不寫入 |
| `--help` / `-h` | 用法 |

`install.*` 完成後自動驗證 **14/14** skill 目錄到位，缺一個就 exit 非零。`uninstall.*` 鏡像 installer 的 manifest，明確列出 14 個 skill + `_tigerai-pack-shared` — 不存在的會靜默跳過。PowerShell 兩支都用 UTF-8 BOM 儲存，PS 5.1 不會再炸。

### 🎨 Hero PNG 燒字

新增 [`scripts/stamp-hero.ps1`](scripts/stamp-hero.ps1)（PowerShell + `System.Drawing`）把 "Platform capabilities (SSO / IAM / Audit Log / HA / Metrics / Source Control) provided by n8n & n8n Enterprise — not by this Pack." 燒進英文版 hero 圖底部灰條；中文版同款翻譯。圖被單獨轉傳時，責任邊界跟著走，README caption 不再是唯一防線。

### 🛡️ CI gate 跟進

`.github/workflows/security-gate.yml` 的 installer-parse job 擴充成 install + uninstall 都要過：

- `bash -n` 雙腳本
- 兩支 `.ps1` 都檢查 BOM (`EF BB BF`)
- 兩支 `.ps1` 都跑 `[Parser]::ParseFile`
- 四支腳本都跑 `--dry-run --target claude` smoke test

### 🩹 周邊清理

- `plugin.json` 加上 `uninstall_scripts` 條目
- `docs/responsibility-matrix.md` 的 hero PNG row 與 installer ergonomics row 改成 ✅
- 兩種語言 README hero caption 拿掉「Platform capabilities... provided by n8n & n8n Enterprise」那句（已燒進圖裡），保留一句話定位

### Backlog 結餘

剩下未處理（誠實揭露，留 v0.26 以後再看）：
- Production Validation 自動化（live n8n + credentials 上端對端 round-trip）
- Security 自動掃描器（目前還是 SOP + checklist）
- 完整 CI/CD（GitLab、dep CVE、container scan）
- Retry / Approval / Handover 的 drop-in importable workflow 模板

---

## v0.24.2 — 刷掉 v0.24.1 沒清乾淨的文件落差

v0.24.1 把 installer + manifest + CI gate + evidence 收齊，但使用者再做一輪 audit 又挖到一批「文件還停留在舊版」的中度落差。這版只動文件、不動程式碼，把所有跟事實對不上的字眼一次刷掉。

### 🩹 修：README 還留著已修好的舊警告

- `README.md` 樹狀圖：「14 skill folders on disk; plugin manifest registers 15 entries」→「14 skills (plugin.json manifest matches on-disk)」
- `README.md` 警告 footnote 換成中文版同款的事實說明：`/install-n8n-pack` 是 Antigravity workflow，不是 skill
- `README.md` / `README.zh.md` 歷史驗收章節原本硬編 v0.22.2 → 改連到 [`VERSION`](VERSION) 與 [`tests/REPORT-v0.24.1-evidence.md`](tests/REPORT-v0.24.1-evidence.md)，下一版不會再漂移

### 🩹 修：安裝文件自相矛盾

`01-INSTALL.en.md` / `01-INSTALL.md` 整篇重寫：

- 前提改成「No MCP server required」（與 plugin.json `"no MCP dependency"` 對齊），中文版原本還把 `n8n-mcp` 列為建議前提、宣稱會載入本 Pack 沒有的 `n8n-mcp-tools-expert` skill，全部移除
- 「Enable n8n-mcp in Claude Code / Antigravity」→ 改為「Smoke-test the REST connection」，直接附 curl 範例
- 移掉「Verify skill description triggers are loaded by Claude」這條腳本沒在做的虛假承諾，老實說明腳本只負責檔案複製，trigger verify 是使用者的事
- 解除安裝段補齊缺失目標：`code-to-workflow`、`_tigerai-pack-shared`、Antigravity `~/.gemini/antigravity/global_skills/` 路徑都明確列出來；並標註尚無官方 `uninstall.sh`（v0.25 backlog）
- 加上 installer 行為的誠實說明：寫入「所有偵測到的目標」、無 `--dry-run` 與 `--target` 旗標（v0.25 backlog）

### 🩹 修：責任矩陣對 n8n edition 過度簡化

`docs/responsibility-matrix.md` 把「Pack / n8n / n8n Enterprise / IT」四層拆成五層：

- **n8n Community / self-hosted**：runtime + nodes + **queue mode** + `/metrics`（queue mode 跟 Prometheus endpoint 都不是 Enterprise-only）
- **n8n Business**：加上 **Source Control / Environments**（這是 Business-tier，不是 Enterprise-only — 舊版錯標）
- **n8n Enterprise**：SSO / RBAC/IAM / Audit Log / External Secrets / **multi-main active-active HA** / LDAP/SAML
- **Enterprise IT / DevOps**：Postgres / Redis / LB / 備份 / DR / 真正的觀測 stack — 升上 Enterprise **不會自動拿到 HA**，IT 仍要部署底層

Per-claim 表格相應改：SSO 列拆成 SSO / Source Control / multi-main HA / queue-mode HA / Metrics 五個獨立 row，把哪個能力屬於哪一 tier 講清楚。新增 installer ergonomics row 標 v0.25 backlog（`--dry-run` / `--target` / post-install verify / official `uninstall.sh`）。

---

## v0.24.1 — 修正安裝器、補上 CI gate、刷新驗收證據

v0.24.0 後使用者實際拿去裝，挖到一批會打臉「四件套俱全」的實作落差：Windows 安裝器無法解析、manifest 比磁碟多算一個 skill、`n8n-security-governance` 講的 CI/CD gate 在這個 repo 本身完全沒跑、驗收報告還停在 2026-05-05。這版把這四件一起補上。

### 🩹 修：Windows 安裝器無法解析

- `install.ps1` 重新以 UTF-8 **with BOM**（`EF BB BF`）儲存。原本沒有 BOM，PowerShell 5.1 用 Windows-1252 解中文，第 71 行雙引號被誤認沒收尾，整個檔案 parse fail，使用者根本裝不了。
- `install.ps1` 與 `install.sh` 的 vendor skill 計數從硬寫的「7 個」改回「6 個」（磁碟上一直就是 6 個）。

### 🩹 修：manifest 對齊磁碟

- `plugin.json` 移掉 `skills/tigerai/install-tigerai-n8n-pack` 這個沒有對應目錄的孤兒 entry。對應的 `/install-n8n-pack` slash command 本來就放在 `.agent/workflows/install-pack.md`（Antigravity workflow），不是 skill。
- skills 計數 15 → **14**；README / README.zh.md 全部跟著更新，並把 "manifest 15 / disk 14" 的已知落差註腳改成「`/install-n8n-pack` 是 workflow 不是 skill」的事實說明。

### 🛡️ 新檔：[`.github/workflows/security-gate.yml`](.github/workflows/security-gate.yml)

`n8n-security-governance` skill 講了一整段 CI/CD gate，但這個 repo 自己之前一條 workflow 都沒有。這版補上實際會跑的 gate：

| Job | 卡什麼 |
| --- | --- |
| `manifest-consistency` | `plugin.json` 每筆都有 SKILL.md；每個磁碟 SKILL.md 都登錄。雙向比對。 |
| `json-audit` | 跑 Google Workspace + LINE CS（雲）案例的 `_audit.mjs`、+ on-prem brain JSON 結構檢查。 |
| `secret-scan` | OpenAI / AWS / GitHub / Slack token + PEM 私鑰 regex 掃描（排除 `reference-workflows/` 等已 scrub 目錄）。 |
| `installer-parse` | `bash -n install.sh`；驗證 `install.ps1` 開頭是 `EF BB BF`；用 PowerShell Core `[Parser]::ParseFile` 確認可解析。 |

故意先做窄而真實的版本：擋住本次三個已經發生過的 regression class，留 dependency CVE / container scan / 完整 n8n REST round-trip 給後續逐步補上。

### 📋 新檔：[`tests/REPORT-v0.24.1-evidence.md`](tests/REPORT-v0.24.1-evidence.md)

獨立的、有日期戳的 v0.24.1 驗收紀錄：installer parse 結果、manifest 雙向比對、三個案例 audit 輸出、CI gate 敘述、「這份報告**沒有**證明什麼」的誠實落差清單。原本的 [`REPORT-3.md`](tests/REPORT-3.md) 維持 2026-05-05 / v0.9.0 歷史 baseline，不被改寫。

### 為什麼這版重要

v0.24.0 的口號是「四件套俱全」。但「四件齊」的字面意義是文件齊，不代表使用者能可靠安裝、CI 真的會擋、manifest 跟磁碟對得起來。v0.24.1 是把那四件套**從文件層面落到實作層面**——installer 要真能跑、manifest 要真能對齊、CI 要真會擋、報告要真有日期。

---

## v0.24.0 — 補上「審查正例」+ 中文 hero v16

四件套俱全：方法論（marquee `code-to-workflow`）+ skill（`n8n-security-governance`）+ 反例（`SECURITY-CAVEATS.md`）+ **正例（`SECURITY-REVIEW.md`）** 終於到齊。

### 🆕 新檔：[`examples/line-ai-customer-service-onprem/SECURITY-REVIEW.md`](examples/line-ai-customer-service-onprem/SECURITY-REVIEW.md)

`n8n-security-governance` 套到 BLOCKED 案例的**完整書面範本**。任何要為自家 Code2n8n 移植寫 SECURITY-REVIEW 的人可以照搬結構：

- **10 條章節**：review metadata / scope+trust boundaries / mandatory check results / structured findings / chain analysis / decision / release traceability / rollback / cross-refs / re-review triggers
- **13 個 entry 的 trust boundary 矩陣**：每個端點宣稱 vs 實際 auth 狀況逐項對照
- **10 個 SEC-### 結構化 finding**：每筆含 Severity / Status / Evidence (file:line) / Impact / Reproduction / Required fix / Validation / Owner / Target version
- **Chain analysis**：把單一缺陷如何串成「未認證任意 SQL 執行＋無 audit trail」一目了然
- **正式 BLOCKED 決策**：列出再評估前必須完成的 10 項 deployment requirement
- **8 個 dimension 評分**：8 FAIL / 2 PARTIAL / 1 PASS — 在任一 Critical 個別計分前就已 BLOCKED
- 跟 `SECURITY-CAVEATS.md` 互補：caveats 是「短版警告」、review 是「長版審查書」

### 🔗 周邊串接

- `SECURITY-CAVEATS.md` 開頭加長版 review 連結
- onprem README 改成「短版 → CAVEATS；完整 → REVIEW」雙連結

### 🎨 中文 hero 升級

- `docs/images/code2n8n-hero-zh.png` 換成 v16 user-master-remaster-native（解決 v15 字體蓋 logo 問題）
- README.zh.md alt text 同步更新；中英 hero 現在都是 v16

### 為什麼這版重要

v0.22.2 揭露問題 → v0.23.0 提供 skill 規範 → **v0.24.0 提供「按 skill 跑出來的審查書長這樣」的可複製範本**。這三步把 Code2n8n 的「安全審查」從口號變成 SOP：

| 抽象層次 | 兌現處 |
| --- | --- |
| 為什麼要做（manifesto） | `CODE2N8N.md` Demo ≠ Production 章 |
| 怎麼做（methodology） | `code-to-workflow` Step 1.5 + hard rules §3/§8/§9 |
| 用什麼做（skill） | `n8n-security-governance` 141 行 |
| 反例（找到缺陷不修怎麼揭露） | `SECURITY-CAVEATS.md` |
| **正例（完整審查書長什麼樣）** | **本次新增的 `SECURITY-REVIEW.md`** |

## v0.23.0 — 安全/治理 skill 落地 + 對著 hero 圖逐項補實證

兌現 v0.22.2 安全揭露的下一步：把「Security Audit」從一行宣告升級為真正的 skill + 把 hero 圖每一格逐項對證並補上實際弱的地方。

### 🆕 新 skill：[`skills/tigerai/n8n-security-governance/`](skills/tigerai/n8n-security-governance/SKILL.md)

141 行的獨立安全治理 skill，不是 placeholder：

- **12 個強制檢查領域**：Authentication / Authorization / Injection / Webhooks / Secrets / Input&files / Browser&API / **AI&agents（prompt-injection 邊界、tool allowlist）** / Data / Operations / **n8n 自身（production webhook 認證、credential references、Code node 沙箱）** / Dependencies
- **結構化 finding 範本**：SEC-### + Severity / Status / Evidence / Impact / Reproduction / Required fix / Validation / Owner / Target version
- **PASS / CONDITIONAL / BLOCKED 決策矩陣**
- **Version control 章**：branch policy、SemVer sticky note、release tag、commit SHA 記錄
- **CI/CD gate 7 項閘門**：JSON lint、secret scan、dependency/container scan、n8n REST import、security regression tests、release artifact hash、production activation 簽核
- **Rollback 5 件必填**：known-good Git tag、previous workflow JSON、migration reversibility、credential compatibility、owner + procedure
- **新增 Observability 章**：8 項 runtime signal（execution success/error count、p50/p95/p99 latency、webhook 4xx/5xx、credential usage frequency、queue depth、disk usage、exception classes）+ 3 條告警路由 + dashboard 鏈接強制義務 + 「沒裝監控就要寫進 SECURITY-CAVEATS」原則
- 註冊在 plugin.json 為 `role: security`；skill 計數 14 → **15**

### 🔗 marquee `code-to-workflow` 升級

- 新硬規則 **§8**「Security review is a real gate, not a caption」— Step 1.5 強制 invoke `n8n-security-governance`
- 新硬規則 **§9**「Every release must be traceable and reversible」— commit SHA / workflow version / n8n tag / rollback target 必須描述同一個 release

### 🆕 補 Pillar 4.2：人工核准 / Handover 設計

在 `tigerai-enterprise-patterns` 加入 [Pillar 4.2](skills/tigerai/tigerai-enterprise-patterns/SKILL.md)（hero 圖 Step 4「Approval」對應的 SOP）：

- 5 種核准節點型態（Email / Slack / Form / Telegram / 內建 `sendAndWait`）+ 適用情境
- **每個 approval 節點 timeout 必設**（金流 4h、客服 2h、一般 24h）
- Timeout 後 3 種 escalation 模式（自動拒絕 / 升級 / 待事後追認）
- Audit trail 強制欄位（request_id / requester / approver / decision / timestamp / reason / channel）
- 拒絕路徑必寫補償動作
- Handover 設計：真人客服接手 / 跨班次交班 / AI→工程師人工接管
- 5 條反模式（無 timeout、timeout 自動 continue、無 log、共用節點、approver 寫死）

### 🆕 新檔：[`docs/enterprise-setup.md`](docs/enterprise-setup.md)

回答「hero 圖第三塊 SSO / IAM / HA / DR 是 Pack 還是 n8n 提供？」這個圖示讀起來容易誤解的問題：

- Pack vs n8n vs 你的 IT 完整責任表
- SSO 章：n8n self-hosted enterprise 提供 SAML / OIDC / LDAP / RBAC / Project；Pack workflow 該遵守的 IAM-friendly 原則（不寫死 user identity、credential 走 reference、每 webhook 標 owner project、拒絕 manualTrigger 上線）
- HA 章：n8n queue mode 多 worker；Pack workflow 必遵守的 queue-safe 設計（不依賴本機檔案、Wait 取代 sleep、idempotency key、必設 timeout）+ 部署層檢查清單
- DR 章：必備 4 種備份目標（Postgres / Encryption Key / Workflow JSON exports / IaC）+ 季度 DR drill 流程
- 採用順序：先架 n8n enterprise + SSO/RBAC → 才裝 Skill Pack → 才跑 Code2n8n 移植 → Step 1.5 review → CI gate → production

### 📝 周邊同步

- CODE2N8N.md 在「Demo ≠ Production」段後加 Pack/n8n/IT 責任邊界引導
- 兩個 README 在 Proof bar 後加責任邊界提醒 + 連到 enterprise-setup.md
- README.md 英文版 hero 換上 v16（user master remaster native，正視圖比例放大），alt text 同步更新
- Hero 中文版仍是 v11（v15 中文字體 logo 重疊問題待修）

### ✅ 對照 hero 圖逐項實證表

| 圖示元素 | 兌現 |
| --- | --- |
| Path A 意圖 → Workflow | ✅ sticky-note-to-workflow |
| Path B 既有系統 → 移植 | ✅ code-to-workflow |
| Step 1 Inventory | ✅ code-to-workflow Step 1 |
| Step 2 Partition | ✅ code-to-workflow Step 2 |
| **Step 3 Security Audit** | ✅✅ **n8n-security-governance 141 行專屬 skill + code-to-workflow Step 1.5 + 硬規則 §8/§9** |
| Step 4 Retry / Approval / Handover | ✅ Retry 在 5 個 skill 提到；Approval ✅ **新增 Pillar 4.2 補完**；Handover 在 code-to-workflow |
| Step 5 Production Validation | ✅ code-to-workflow Step 6（3 層漏斗）+ examples 內實際 `_audit.mjs` / `_n8n_import_test.mjs` |
| 未修補缺陷 → SECURITY-CAVEATS.md | ✅ n8n-security-governance 必產出 + onprem 案例實檔 |
| Block 3 SSO / IAM / HA / DR | ✅ enterprise-setup.md 切清責任邊界 + Pack 該遵守的 workflow 設計原則 |
| Block 3 Observability | ✅ n8n-security-governance 新 Observability 章 |

## v0.22.2 — on-prem 範例安全缺陷揭露（不修補，公開警告）

由使用者主動指出後稽核：[`examples/line-ai-customer-service-onprem/`](examples/line-ai-customer-service-onprem/) 的上游 POC 程式碼**不是**可上線實作。**我們選擇公開揭露而不靜悄悄打補丁** — 因為這些缺陷本身就是 Code2n8n 的教學重點（AI 寫的能跑 ≠ 能上線），偷修會誤導讀者也偏離 CREDITS.md 寫的「Morris Lu 沒做這層硬化」事實。

### 新增揭露文件：[`examples/line-ai-customer-service-onprem/SECURITY-CAVEATS.md`](examples/line-ai-customer-service-onprem/SECURITY-CAVEATS.md)

逐項稽核 + 程式行號 + 重現方式：

- ❌ `/api/auth/me` 永遠回 `{ authenticated: true }`，零 session/JWT 檢查（`auth.ts:27-30`）
- ❌ Login 用**明文密碼** SQL 比對（`auth.ts:10`）
- ❌ 所有 `/api/*` 資料路由完全裸奔：settings 讀寫、user_states 讀寫、reset-handover、logs add/search、upload、n8n credential listing、qdrant collections — 全無 auth middleware
- ❌ **SQL identifier injection**：`updateSettings` 把 `req.body` 的 key 直接拼進 INSERT/UPDATE SQL（`db.ts:23-44`）— 攻擊者可從欄位名注入任意 SQL
- ❌ 無 CSRF、無 rate limit、無 audit log、無 helmet、無 CORS 鎖定
- ❌ `GET /api/settings/n8n/credentials` 外露 n8n credential 名稱清單

包含 10 步硬化清單（middleware → session → bcrypt → SQL whitelist → CSRF → rate limit → audit log → 端點下架 / 縮窄 → 檔案上傳加固 → 金鑰 env / encryption），給想 fork 上線的人作為起點。

### 周邊文件下修「企業上線」過度承諾

- On-prem README 開頭加紅旗 banner + 速查清單
- 「適合誰」欄改為「**不是**企業可上線版 — 安全層有重大缺陷」
- 「Enterprise-grade real-world variant」字眼下修為「Real-world POC port」
- CREDITS.md 新增「Security audit performed, NOT patched」段落，明確 pack 的立場：揭露 ≠ 修補
- CODE2N8N.md 案例清單加 ⚠️ 提示與 SECURITY-CAVEATS 連結

### Marquee skill 升級

`code-to-workflow` SKILL.md：

- **新硬規則 §3**「Audit auth + injection before calling the port 'enterprise-grade'」— 列出最常見 POC 認證 / 注入模式；若不修就**必須**寫 SECURITY-CAVEATS.md
- **新步驟 1.5**「Security audit」— 10 項稽核 checklist（涵蓋 `/me` 真實檢查、middleware 覆蓋、密碼 hashing、identifier injection、CSRF、rate limit、audit log、secret 外露、檔案上傳）

這次升級確保未來用 Code2n8n 做客戶案場移植時，安全稽核強制納入流程，避免重複本次「漂亮但裸奔」的失誤。

## v0.22.1 — 整套 pack 改授權為 MIT

整個 repo 的授權從 *TigerAI Proprietary* 改為 **MIT**。原本就 MIT 的部分（vendor skills、reference-workflows、兩個從 MIT 上游衍生的 LINE CS 範例）維持原樣，這次是把「其餘 TigerAI 自製內容」也一起標成 MIT，整個 pack 一致。

- 新增 [`LICENSE`](LICENSE) — 根目錄 MIT 全文（Copyright (c) 2026 Morris Lu / TigerAI），含對 bundled 第三方材料的指引
- `plugin.json` 的 `license` 欄位：`Proprietary (...)` → `MIT`
- `README.md` / `README.zh.md` 授權段：標清楚整套 MIT，並列出每個衍生子目錄的出處
- `THIRD_PARTY_NOTICES.md` 結尾段：原本說「其餘是 TigerAI Proprietary」改為「其餘是 MIT」，第三方材料各自保留自己的版權聲明
- `VERSION` → 0.22.1

GitHub 上將自動偵測 LICENSE 並把 repo 的 license badge 顯示為 MIT。

## v0.22.0 — Marquee skill `code-to-workflow` + 地端 LINE CS 案例

兌現 [CODE2N8N.md](CODE2N8N.md) 宣言裡承諾的 marquee skill — 終於有一個明確的「拿任何程式系統轉成 n8n」方法論技能，由 3 個真實案例的踩坑經驗淬煉。

### 🎯 新 marquee skill：[`skills/tigerai/code-to-workflow/`](skills/tigerai/code-to-workflow/SKILL.md)

把上游程式（Apps Script / Netlify Functions / Express / Docker stack）轉成 n8n workflow 的完整方法論：

- **觸發詞**：「把這個 repo 移到 n8n」「Code2n8n 一下」「port this codebase to n8n」「我的 Python 腳本想丟給營運維護」
- **7 步驟方法論**：盤點 → 分區決策（code / node / connection）→ core+entry 拆法 → 前端可移植性 3 條決策樹（保留原前端 / 改打 n8n API / n8n 自托管薄管理）→ workflow 設計（native 優先 + 3 個 HTTP fallback）→ 3 層驗證漏斗（lint + n8n REST import + Layer 3 實跑）→ 文件範本（SDD / FRONTEND-SDD / PROVENANCE / FIELD-MAPPING / CREDITS）
- **真實雷點清單**：Port 衝突、Express v5 wildcard、ESM/tsx、共用 DB、共用 Redis、LINE 簽章 raw body、reply token TTL、Sheets dropdown 限制、Docs 段落樣式、GPT-5 Responses API、Gemini 沒原生節點、Ollama Docker 網路名、Vector RAG Switch on `active_ai`
- **配套規則**：絕不抹除上游 LICENSE / attribution；commit 前 grep secrets；不假裝 n8n 能取代 UI；保真度可追溯（PROVENANCE.md 釘 commit SHA）；本機 n8n 匯入必標 `[Claude YYYY-MM-DD]`

註冊為 `tigerai` 群、role: `marquee`。Skill 總數 13 → 14。

### 🆕 新案例：[`examples/line-ai-customer-service-onprem/`](examples/line-ai-customer-service-onprem/)

**MIT 授權的練習案例**：拿上游 [`scorpioliu0953/ai_customer_service`](https://github.com/scorpioliu0953/ai_customer_service) 跑完整 Code2n8n 流程，演化成地端 Docker 企業版：

- 從 Netlify Functions + Supabase（雲）→ **Docker Compose + Postgres + Redis + Qdrant + Ollama**（全自家）
- 加 **Qdrant 向量 RAG**（處理大型 PDF 知識庫）
- 加 **真實帳號認證**（Postgres `users` 表，取代 Supabase Auth）
- **37 節點 n8n 動態大腦**（Switch on `active_ai` → OpenAI / Gemini / Ollama 三條 RAG 線）
- **5 階段 V&V 計畫**（Infra / API / UI / HMR / E2E）+ 真 PASS 紀錄
- 5 個實戰 [`LESSON_LEARNED.md`](examples/line-ai-customer-service-onprem/docs/LESSON_LEARNED.md)：Port 衝突、Express v5、ESM/tsx、共用 DB 憑證、共用 Redis

跟既有的 [`examples/line-ai-customer-service/`](examples/line-ai-customer-service/) 雲端版**對照展示**：**同一系統可走不同 Code2n8n 路徑**。

完整出處鏈 + MIT 授權保留見 [`CREDITS.md`](examples/line-ai-customer-service-onprem/CREDITS.md)。Commit 前已 scrub 上游 `docker-compose.yml` 內一個硬編 API key，且 `n8n-backup/creds_backup.json` 未進 pack（隔離可能洩漏的憑證）。

### 📝 周邊更新

- [`CODE2N8N.md`](CODE2N8N.md) — 補上 marquee skill + 新案例 + 重新整理 skill / 案例的層級關係
- [`examples/line-ai-customer-service/README.md`](examples/line-ai-customer-service/README.md) — 加 onprem 變體的指引橫條
- `plugin.json`：skill 計數 14、description 加 marquee + 3 案例的具體名字
- `VERSION` → 0.22.0

## v0.21.0 — 改名為 TigerAI Code2n8n Skill Pack（品牌定位升級）

**Skill Pack 從「n8n 工具集」升級為「AI Coding → 企業可治理 n8n 工作流」的橋。**

- GitHub repo 改名：`TigerAI-n8n-Skill-Pack` → [`TigerAI-Code2n8n-Skill-Pack`](https://github.com/MorrisLu-Taipei/TigerAI-Code2n8n-Skill-Pack)（舊網址 GitHub 自動 301 redirect，star / fork / issue / commit 歷史完整保留）
- 新增 [`CODE2N8N.md`](CODE2N8N.md)：完整宣言文件 — 為什麼 AI Coding 時代企業反而**更**需要 n8n、Code2n8n 在中間扮演什麼角色、AI Coding vs Code2n8n + n8n 的新分工
- `README.md` / `README.zh.md`：標題改為 *TigerAI Code2n8n Skill Pack*，前言加 Code2n8n 定位（橋接 AI Coding 與企業 n8n 治理），導引到 manifesto
- `plugin.json`：`name` → `tigerai-code2n8n-skill-pack`，`description` 重寫凸顯 Code2n8n 定位
- `install.ps1` / `install.sh`：installer 標題對齊新品牌
- `research/source-inventory*.md`：交付路徑改為 `TigerAI-Code2n8n-Skill-Pack/`

**沒有刪除任何功能**，只是把同一套技術放在正確的故事裡：

> AI Coding 解決「功能怎麼做」；Code2n8n 解決「功能如何模組化」；n8n 解決「模組如何與整個企業協作」。

## v0.20.0 — 新 skill：n8n Code → Native node 重構 + LINE CS 後台 TODO

**新 skill：[`skills/tigerai/n8n-code-to-native/`](skills/tigerai/n8n-code-to-native/)**

把 n8n workflow 裡的 Code (JS) 節點重構成原生宣告式節點（Set / Filter / Merge / Crypto / Aggregate / ConvertToFile）— 讓「看得懂 n8n canvas 但不寫 JS」的工程師也能讀。觸發詞：「原生化」、「改成 n8n 原生 node」、「reduce Code nodes」。

- **硬規則** 6 條：每次轉換寫 sticky note 變更日誌；in-place（1→1）與 structural（1→N）分別處理；保留節點名（連線靠 name 對應）；善用表達式內的 `.map/.reduce/.filter/?./??/...`；禁止 IIFE 偽裝 JS；該留就留（LLM parser、crypto polyfill、動態巢狀 filter、per-item shape branching）。
- **5 步流程**：盤點 → 分類（in-place Set / structural / keep）→ 用 Set v3.4 在地替換 → 寫 sticky 變更日誌 → 匯入驗證。
- 附 **表達式速查表** + **常見陷阱**（`includeOtherFields` 在 parameter 層級、`Math.max(...[])` 回 `-Infinity` 要 guard、UTF-8 編碼、節點不要重命名等）。

註冊在 `plugin.json` 的 `tigerai` skill 群，role: `refactor`。

**LINE AI 客服範例補：後台 TODO**

新增 [`examples/line-ai-customer-service/TODO.md`](examples/line-ai-customer-service/TODO.md) — 誠實標記目前 approach C 只是薄管理 shim，缺：真認證 / 對話歷史檢視 / 真人即時接手介面 / KB 多檔管理 / 方向決策（C vs B）。也涵蓋非後台待辦：Layer 3 實跑驗證、Error-handler workflow、多通路 entry。同時存入跨 session memory。

## v0.19.0 — 新增 LINE AI 客服 n8n 移植範例 + Google Workspace 逐行出處

**新範例：[`examples/line-ai-customer-service/`](examples/line-ai-customer-service/)**

把 [scorpioliu0953/ai_customer_service](https://github.com/scorpioliu0953/ai_customer_service)（Netlify + React + Supabase + GPT/Gemini）的 **後端 webhook** 移植到 n8n，前端管理台用 approach C（n8n 自托管 UI）實作。

- **後端 runtime**：`core/core-message-router`（去重 / 關鍵字轉真人 / 真人模式逾時 / GPT or Gemini / 回覆）+ `entry-line`（webhook + raw-body HMAC-SHA256 簽章驗證 + 拆 event），1:1 對應上游 `line-webhook.ts` 175 行
- **前端管理台（approach C）**：4 條 admin workflow（`admin-ui` 吐單檔 HTML 儀表板 + `api-settings` / `api-users` / `api-kb`），整套含 UI 跑在 n8n、零外部主機；HTML 由 `admin/_build_admin.mjs` 產生避免手工跳脫
- **只需 1 個 n8n credential（Supabase）**：LINE / OpenAI / Gemini 金鑰沿用上游存在 DB settings 表的設計，從 DB 讀塞進 HTTP header
- **計畫書**：`SDD.md`（整體移植 + 可行性評估，誠實標明「後端可移植、React 儀表板不可移植」）+ `FRONTEND-SDD.md`（approach C 設計）
- 雷點都寫進文件：LINE 簽章需 raw body、自托管需 `NODE_FUNCTION_ALLOW_BUILTIN=crypto`、reply token ~1 分鐘失效、無原生 LINE/Gemini 節點

**Google Workspace 範例補強：逐行出處**

- 新增 [`examples/google-workspace-admin-workflow/PROVENANCE.md`](examples/google-workspace-admin-workflow/PROVENANCE.md)：每塊保真資料釘到上游 `src/Code.gs` @ `fce2513` 的**確切行號**（11 子資料夾 / 9 Doc 標題 / T001–T010 / 10 檢核項 / 5 提醒偏移 / 14 日期類型 / sheet headers）
- 在 3 個 core workflow 的 `Prepare`/overview 加 inline 出處標記（`<- Code.gs:Lxxx`），n8n UI 開節點即見來源

**驗證**：兩個範例都過 `_audit.mjs` 靜態 lint（0/0）+ 本機 n8n REST import（GW 7/7、LINE 6/6 accepted）。

## v0.18.0 — 新增 Google Workspace 行政專案 n8n 移植範例

**新範例：[`examples/google-workspace-admin-workflow/`](examples/google-workspace-admin-workflow/)**

把 [mihozip/google-workspace-admin-project-workflow](https://github.com/mihozip/google-workspace-admin-project-workflow) 的 Google Apps Script 系統 1:1 移植到 n8n。

- **1 個 setup workflow + 2 個 core sub-workflow + 4 個 entry workflow**（n8n Form Trigger × 2 + Google Forms webhook × 2，共用同一份 core）
- **原生節點優先**：Drive / Sheets / Docs / Calendar / Gmail 原生節點全用上；只有 3 處走 HTTP Request 因為原生不支援（Docs paragraph style、Sheets dropdown 驗證、Sheets header 格式化）— 每處掛 🟡 Sticky Note 寫清楚為什麼
- **逐字保真度**：11 個專案子資料夾、20 欄總控表 / 17 欄階段紀錄 / 12 欄待辦表 / 6 欄檢核表 header、10 筆預設任務、10 筆檢核項目、14 個日期類型、5 個提醒偏移、9 段 Doc 標題結構全部對齊上游
- **Apps Script bridge `.gs`** 供想保留原 Google Forms 體驗的人接到 n8n webhook
- **完整文件**：`README.md`（中英）+ `SCENARIO.md`（情境故事 + workflow 名字對照速查表）+ `SDD.md`（規劃/研發/轉移/測試/驗證 5 段）+ `docs/install.md` + `docs/google-credentials.md` + `docs/field-mapping.md`（Apps Script ↔ n8n 函式對照）
- **驗證腳本**：`_audit.mjs`（靜態 lint，依 `n8n-validation-expert` + `n8n-expression-syntax` 規則）+ `_n8n_import_test.mjs`（本機 n8n REST round-trip）。7/7 通過

**本版本不動核心 skill**。原本的 `skills/`、`reference-workflows/`、`cookbook/` 維持 0.17.0 狀態。

## v0.17.0 — 新增 Antigravity (AG) 支援

**安裝腳本與文件升級**

- `install.ps1` / `install.sh`：新增自動偵測 Antigravity (AG) 路徑邏輯。若偵測到 `~/.gemini/antigravity`，會同步將 Skill 安裝至其 `global_skills` 目錄。
- 新增 `skills/tigerai/install-tigerai-n8n-pack/SKILL.md`：AG 專用自動安裝 Skill 指引。
- 新增 `.agent/workflows/install-pack.md`：AG 專用一鍵安裝指令 `/install-n8n-pack`。
- `01-INSTALL.md` / `01-INSTALL.en.md`：更新 Prerequisites 與安裝步驟，明示支援 Antigravity 與 Claude Code 雙環境。
- `README.md` / `README.md`：更新目錄結構說明，標註安裝腳本具備雙環境支援。
- `plugin.json` / `VERSION`：版本號升級至 v0.17.0，並於 `requires` 中加入 `antigravity`。

## v0.16.0 — 全面移除 MCP 依賴 + 16 cookbook 雙語 sticky 範例

**MCP 移除**

- 刪除 `skills/_vendor/n8n-mcp-tools-expert/` 整個資料夾
- `skills/tigerai/n8n-api-bridge/SKILL.md` (zh+en)：改 REST API 唯一路徑（無 MCP fallback）
- `skills/tigerai/sticky-note-to-workflow/SKILL.md` (zh+en)：驗證階段改用 n8n REST API PUT 內建 schema 檢查
- `tigerai-qa-mode` / `tigerai-example-finder` / `tigerai-enterprise-patterns` SKILL：移除「呼叫 n8n-mcp-tools-expert」字眼
- `01-INSTALL.md` (zh+en)：明示「不需要 n8n-mcp」，安裝步驟簡化
- `plugin.json`：移除 mcp-tools-expert 條目，env vars `N8N_API_URL` / `N8N_API_KEY` 改 required=true
- `skills/_vendor/SOURCE.md`：列出移除原因 + 同步腳本明確排除
- `research/baseline.md` (zh+en)：vendor skill 計數從 7 改 6
- `research/PHASE-4-EMBEDDING-INDEX.md` (zh+en)：替換 `n8n-mcp.search_templates` 提及
- `examples/tigerai-flagship/INDEX.md` (zh+en)：澄清 `n8n-mcp-json/` 只是上游資料夾名

**16 cookbook 雙語 sticky 範例**

每個 cookbook（8 中文 + 8 英文 = 16 檔）的「🌱 自然語言版」現在含 **【中文】** 與 **【English】** 兩個 code block，讀任一語言版本都能看到雙語對照。

## v0.15.0 — Verified Runnable Examples（真實跑過的完整 workflow）

從 R3 v0.9.0 第三輪驗收挑出 2 個**已在真實 n8n 2.10.3 環境 curl 觸發成功**的 workflow，搬到 cookbook 給客戶當「保證能跑」的起點：

- `cookbook/_runnable-T1-github-slack.json` — GitHub webhook → Slack（5 節點，三層結構完整）
- `cookbook/_runnable-Q2-order-line.json` — 訂單 webhook → LINE Notify（5 節點，三層結構完整）
- `cookbook/_runnable-README.md` + `.en.md`：含驗收證據摘錄、3 步驟使用指引、與其他 cookbook 資源的差異對照

兩個都含完整 v0.9.0 修補（頂層 id / webhookId / ASCII 節點名 / stub credentials），import 即可 activate。webhook 已驗證 curl 200 + execution success（`continueOnFail` 設計讓 stub credential 失敗被吞但 workflow 正常結束）。

INDEX 中英版頂端加引導連結。

## v0.14.0 — Starter Templates（空白 / 雙語提示模板）

新增 4 檔給「不想手動拖便利貼」的使用者：
- `cookbook/_starter-blank.json` — 完全空白的黃色便利貼，已就定位
- `cookbook/_starter-template.json` — 雙語填空模板（中英並列 + 範例）
- `cookbook/_starter-README.md` + `.en.md` — 用法說明（3 步驟：import → 填字 → 呼叫 AI）

兩個 JSON 都含 v0.9.0 R3 規範必要欄位（頂層 id / Layer 1 sticky color=4 / position.y < 0），import 直通。INDEX 中英版頂端加引導連結。

## v0.13.0 — 便利貼中英文並列對照表

- 新增 `cookbook/STICKY-EXAMPLES-BILINGUAL.md`（與 `.en.md`）：8 個範例的便利貼內容**中英文並列**，使用者一頁挑語言複製
- 含「依團隊情境的語言選擇建議」表
- INDEX 中英版頂端加引導連結
- 補完 v0.12.0 漏掉的「同一張便利貼可選哪一種語言」具體展示

## v0.12.0 — 完整英文版（雙語化）

**新增 36 個 `.en.md` 英文版**

涵蓋全部使用者面與工程面文件：

- 頂層 5 檔：README / 01-INSTALL / 02-USAGE-MODES / 03-FIRST-WORKFLOW / 04-FAQ
- cookbook 9 檔：00-INDEX + 01–08
- spec 2 檔：sticky-note-three-layer / sticky-note-dsl
- examples/tigerai-flagship 7 檔：INDEX + 3×{spec, README}
- skills/tigerai 5 檔：所有自製 Skill 的 SKILL.en.md
- research 5 檔：baseline / source-inventory / node-frequency / patterns / PHASE-4-EMBEDDING-INDEX
- tests 3 檔：REPORT / REPORT-2 / REPORT-3

**全部中文檔頂端加上語言切換器**

```text
> 🌐 [English](xxx.en.md) | **繁體中文**
```

每個英文檔同步含反向連結。共 36 對中英對照可用。

**設計原則**

- 中文版仍是主版本；英文版逐字對譯關鍵段落，技術術語保留英文原文
- 命名 `xxx.en.md` 與中文版同層共存（不分資料夾，連結最簡單）
- README.md 仍是 GitHub 自動首頁（不破壞慣例）

## v0.11.0 — 使用手冊：閱讀順序與導航

**重新組織頂層文件，給使用者清楚的進入點**

- `README.md`：保留標準名（GitHub 自動渲染），重寫為「使用手冊入口」含閱讀順序與身份決策樹
- `INSTALL.md` → `01-INSTALL.md`
- `USAGE-MODES.md` → `02-USAGE-MODES.md`
- 新增 `03-FIRST-WORKFLOW.md`：15 分鐘 hands-on 教學（從零產出第一個 workflow）
- 新增 `04-FAQ.md`：21 條常見問題（安裝 / 寫便利貼 / AI 產 workflow / 三種模式 / 三層結構 / 企業情境）

**內部引用同步**

- `install.sh` / `install.ps1`：shared 資料夾改拷 02/03/04
- `plugin.json`：shared_resources 加 `first_workflow_tutorial` / `faq`
- `research/source-inventory.md`、`examples/tigerai-flagship/openwebui-bridge-v2/{spec,README}.md`：路徑同步

**設計理念**

- 不破壞 `README.md` 標準慣例（保留 GitHub 自動渲染）
- 數字前綴只用在「支援文件」上，達成排序而不犧牲常規

## v0.10.0 — UX 大幅降低門檻：自然語言為主、DSL 折疊為進階

**設計理念轉變**

把目標族群「不會寫程式的使用者」當第一公民。原本要求學 `@trigger:` / `@step:` DSL 的設計，現在改為：
- **入門路徑：純自然語言**（中文/英文都行，像跟同事講話那樣描述需求）
- **進階路徑：DSL 嚴謹寫法**（給工程師 / 嚴格規格化情境，折疊隱藏）

**Cookbook 8 個範例全部加上自然語言版**

每個範例頁面結構：
1. 🌱 自然語言版（推薦）— 純白話描述
2. 📐 進階：DSL 嚴謹寫法（`<details>` 折疊區塊）

新手讀完前者就能用，不必碰 DSL。

**Skill 對應升級**

- `sticky-note-to-workflow/SKILL.md` 新增 Step 0 / 0.1：自動偵測輸入是自然語言還是 DSL，自然語言路徑先做 NL→DSL 內部翻譯（不展示給使用者）
- `tigerai-qa-mode/SKILL.md`：description 與對話流程移除「sticky note」「Layer 1」「DSL」字眼；草稿確認改用純自然語言格式；新增「對話全程不講技術術語」規則
- `USAGE-MODES.md` / `cookbook/00-INDEX.md`：強調「完全不用學語法」

## v0.9.0 — R3 重跑：8/8 import / 7/8 activate / 4/4 webhook 端到端

**修補 4 generation BUG（自動化批次）**

- `tests/_r3_v09_fix.js`：對 8 個 workflow JSON 一次性補頂層 id / webhookId / webhook 節點 ASCII PascalCase rename / 清 placeholder / 補 stub credentials
- `tests/_r3_v09_api_patch.js`：對 n8n REST API PUT 補強寫回（取代直接 SQL UPDATE）

**真實 n8n 驗收結果（v0.7.0 → v0.9.0）**

- L3 Activate：1/8 → **7/8**（T3 Telegram trigger 真實 token 限制）
- L4 Webhook 路由：1/8 → **4/4**（全部 webhook 型路由可達）
- L5 完整 execute：1/8 → 2/4（含 continueOnFail）+ 2/4 中途 stub credential 失敗（合理行為）

**新揭露 + 寫進 Skill 的 micro-BUG**

- BUG-5：直接 SQL UPDATE workflow_entity 不被 n8n 採用 → `n8n-api-bridge/SKILL.md` §5.1 強制走 REST API PUT
- BUG-6：webhook node name 跨 workflow 同名造成衝突 → `sticky-note-to-workflow/SKILL.md` Step 4.3 加 path 唯一化規則

**`sticky-note-to-workflow/SKILL.md` 新章節**

- Step 4.2：Activate 友善設計（stub credentials for action nodes / 連線型 trigger 紅字警告）
- Step 4.3：webhook path 衝突避免（自動加 workflow tag）

**驗收報告**

- `tests/REPORT-3.md` v2.0：v0.7.0 + v0.9.0 兩版迭代對照、4 webhook 真實 curl + execution log、cleanup SQL

## v0.8.0 — 第三輪驗收（真實 n8n 執行）+ 4 BUG 修補

**真實環境驗收**

- 對使用者既有 n8n 2.10.3 / Postgres backend 跑端到端
- 8/8 workflow 真實 CLI import 成功
- Q2 PoC（修補後）走完 webhook→Set→LINE Notify 全鏈路 execute success
- `tests/REPORT-3.md`：4 層通過率 + Q2 真實 execution log + n8n 環境 cleanup 指引

**揭露 4 個生成 BUG（v0.8.0 修）**

- BUG-1：workflow JSON 缺頂層 `id` → n8n DB not-null constraint。已加 nanoid，8 個 workflow JSON 就地修補
- BUG-2：webhook 節點缺 `webhookId` → URL 路由壞。SKILL 已加規則
- BUG-3：webhook 節點 `name` 含特殊字元 → URL 編碼變形。SKILL 已加 ASCII-only 規則
- BUG-4：RL 參數用 `<REPLACE_X>` placeholder 通不過 n8n 驗證。SKILL 改用空字串 + Layer 3 警告
- `sticky-note-to-workflow/SKILL.md` §Step 4.1：「n8n 真實匯入必需欄位」新章節

**已就地修補檔案（補頂層 id）**

- tests/{1~5,Q1~Q3}/workflow.json or output-workflow.json

## v0.7.0 — 7 條缺口修補 + 旗艦範例

**Spec 修補（DSL v1.2）**

- DSL §2.2.1：`@input` / `@form-fields` 兩種寫法（inline + 縮排清單）
- DSL §2.4.1：v1.2 增強 `@before-branch` / `@after-branch` 跨路徑共用標籤
- DSL §6.1.1：中文 / 特殊字元欄位 header 的 expression bracket-notation gotcha
- `tigerai-qa-mode` §階段 3：提問上限 7 步，第 5 步起主動建議拆 sub-workflow
- `tigerai-example-finder` §3.3：「結構價值優先於主題」排序公式 + 範例對照
- `tigerai-enterprise-patterns` §Pillar 4.1：時效性警告（LINE Notify 2026 / cron / function / Twitter v1.1 等）
- `research/PHASE-4-EMBEDDING-INDEX.md`：reference-workflows 語意索引設計文件（暫不實作）

**旗艦範例（從 n8n-mcp-json 精選 3 個）**

- `examples/tigerai-flagship/INDEX.md`：學習地圖
- `examples/tigerai-flagship/splitPDF-orchestrated/`：原子化 + Universal Worker（Pillar 1+2）
- `examples/tigerai-flagship/splitMP3-API-Orchestrated/`：同模式不同媒介驗證遷移性
- `examples/tigerai-flagship/openwebui-bridge-v2/`：OpenWebUI ↔ n8n 系統整合（Pillar 3+4）
- 每範例配 `workflow.json` + `spec.md`（SDD）+ `README.md`（部署步驟）

## v0.6.0 — 第二輪驗收完成（對話模式 + DSL v1.1）

- `tests/Q1-qa-mode/`：問答模式 end-to-end（補習班繳費提醒，9 節點，5/5 階段對話完整）
- `tests/Q2-example-finder/`：範例查詢模式 end-to-end（訂單→LINE，4 節點，含 LINE Notify 停用警告）
- `tests/Q3-branch-syntax/`：DSL v1.1 `@branch` 重跑 Test 5（16 節點，AI 自動補 fallback）
- `tests/REPORT-2.md`：3/3 通過，8 條 v1.1 強化點全部落地，揭露 7 條新 minor/major 缺口
- 累計驗收：8/8（兩輪）100% 通過

## v0.5.0 — Spec 修補 + Phase 3 完成

**Spec 9 條缺口全修**

- `spec/sticky-note-three-layer.md` §6：新增「`@on-error` 兩種實作模式」（continueOnFail vs Error Trigger workflow）
- `spec/sticky-note-dsl.md` §2.4：新增 `@branch` 嚴格分流子規則語法
- `spec/sticky-note-dsl.md` §3：trigger 字典擴充 telegram/slack/discord/googleDrive/executeWorkflow
- `spec/sticky-note-dsl.md` §6.1：跨節點變數引用 gotcha (`$('Node').item.json` vs `$json`)
- `spec/sticky-note-dsl.md` §6.2：「無對應節點」降級對應規則
- `cookbook/05`、`cookbook/06`：補 `@assume` 範例
- `research/patterns.md` §5：節點數上限分流型放寬至 25；switch fallback 強制；LLM 風險提示

**Phase 3 自製 Skill 全到位**

- `skills/tigerai/tigerai-enterprise-patterns/SKILL.md`：四大支柱 + SDD + 8 條自查清單
- `skills/tigerai/sticky-note-to-workflow/SKILL.md`：核心執行者，七步產出流程
- `skills/tigerai/n8n-api-bridge/SKILL.md`：n8n REST API SOP，含三層合併寫回規則

**一鍵安裝與 plugin manifest**

- `install.sh`（Linux/macOS/WSL）/ `install.ps1`（Windows）
- `plugin.json`：宣告所有 12 個 skill + shared resources + entry points

## v0.4.0 — 5 情境驗收完成

- `tests/1-github-slack/`、`2-rss-ai-email/`、`3-telegram-bot/`、`4-pdf-worker-s3/`、`5-order-risk-route/`
- 每情境：STORY.md / layer1.md / workflow.json / EVAL.md
- 5/5 JSON 解析通過，三層結構合規
- `tests/REPORT.md`：揭露 9 條 spec 缺口（3 critical / 3 major / 3 minor），列入 Phase 3 必修

## v0.3.0 — Phase 1 完成

- 拷貝 2,061 個公開 workflow 至 `reference-workflows/`（40 MB）
- `research/_scan.js`：自動掃描器（node 20）
- `research/workflow-index.json`：每檔結構化索引（887 KB）
- `research/node-frequency.md`：419 種 node 出現頻率 + 規模分布
- `research/patterns.md`：7 大標準骨架 + 4 大反模式 + cookbook 對映
- 關鍵發現：64% workflow 用 stickyNote / 僅 12% 有錯誤處理（AI 必須補強）

## v0.2.0 — 新增三種使用模式

- `USAGE-MODES.md`：總覽 Cookbook / 問答 / 範例查詢三模式
- `skills/tigerai/tigerai-qa-mode/SKILL.md`：5 階段引導式 Q&A
- `skills/tigerai/tigerai-example-finder/SKILL.md`：從 cookbook + 2,061 語料找相似範例
- README 增加三模式對照表

## v0.1.0 — Phase 0–2 完成

- 建立交付目錄骨架
- Phase 0：對齊基準 + 來源盤點（`research/baseline.md`、`research/source-inventory.md`）
- Phase 2a：三層 Sticky Note 結構規範（`spec/sticky-note-three-layer.md`）
- Phase 2b：8 個 Cookbook 範例（`cookbook/01-08`）
- Phase 2c：DSL 語法規範（`spec/sticky-note-dsl.md`）
- 拷貝 7 個官方 Skill 至 `skills/_vendor/`（vendor: n8n-skills MIT）

## 待辦（Phase 3+）

- `skills/tigerai/sticky-note-to-workflow/` 實作
- `skills/tigerai/n8n-api-bridge/` 實作
- `skills/tigerai/tigerai-enterprise-patterns/` 實作
- `install.sh` / `install.ps1` / `plugin.json` 實作
- `examples/` 補入 TigerAI 旗艦範例（splitPDF-orchestrated 等）
- `integrations/openwebui/` 整合範例
