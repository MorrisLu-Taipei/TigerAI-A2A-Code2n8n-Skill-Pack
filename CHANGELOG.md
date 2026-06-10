# Changelog

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
