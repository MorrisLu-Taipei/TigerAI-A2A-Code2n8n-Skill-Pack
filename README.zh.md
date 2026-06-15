# TigerAI Code2n8n Skill Pack — 使用手冊

> 🌐 [English](README.md) | **繁體中文**
> 📖 **什麼是 Code2n8n？** 讀 [Code2n8n 宣言](CODE2N8N.md) — 為什麼 AI Coding 時代企業反而**更**需要 n8n。

> **Code2n8n 的定位**：AI Coding（Claude Code / Codex / Antigravity）擅長把程式「寫出來」；n8n 擅長把程式變成「企業管得住」的流程資產。這個 pack 就是兩者之間的橋 — **描述一個需求，或 指向一個既有系統**（Apps Script / Express / Lambda / Docker stack），產出 IT、營運、主管都看得懂、稽核得了、交接得下去、跨系統治理得來的 n8n workflow。

![TigerAI Code2n8n Skill Pack — Code2n8n hero（v11，中文版；v15 字體蓋到 logo，暫時回退）](docs/images/code2n8n-hero-zh.png)

> 📊 **一張圖看懂**：自然語言需求或既有程式系統 → Code2n8n Skill Pack（Cookbook + 2,061 參考 workflow + DSL v1.2 + 15 個 manifest Skill + 4 大企業模式）→ 分析哪些邏輯留在程式、哪些上升為 n8n 節點 → 產出可檢查、可交接、可跨系統編排的 workflow。
> *by n8n Taipei Ambassador Morris Lu*

---

## 🔄 兩條 Code2n8n 路徑

這個 Pack 不只會把便利貼變成 workflow。它支援兩個方向：

```text
路徑 A：從零開始
自然語言 / 黃色便利貼
  → sticky-note-to-workflow
  → n8n Workflow

路徑 B：移植既有系統
Apps Script / Express / Lambda / Netlify Functions / Docker stack
  → code-to-workflow（盤點、獨立安全閘門、分區、移植、驗證、版本與回滾證據）
  → 程式模組 + n8n Workflow + 移植文件
```

Code2n8n **不是逐行把 Python 或 JavaScript 翻成節點**。它做的是系統重新分工：複雜演算法留在程式，觸發、跨系統串接、重試、人工核准、通知與執行紀錄上升為可見、可管理的 workflow。

> **AI Coding 解決「功能怎麼做」；Code2n8n 解決「功能如何模組化與審查」；n8n 解決「模組如何與整個企業協作」。**

### 🧪 Proof bar — marquee skill 是從 3 個真實移植案例淬煉出來的

| 案例 | 上游 → n8n | 關鍵數字 |
|---|---|---|
| [Google Workspace 行政流程](examples/google-workspace-admin-workflow/) | 1,373 行 Apps Script → 7 條 workflow（core + entry + setup） | 逐行 `PROVENANCE.md` + import 7/7 |
| [LINE AI 客服雲端版](examples/line-ai-customer-service/) | Netlify + Supabase → core + entry + approach C 後台 | Import 6/6 |
| [LINE AI 客服地端版](examples/line-ai-customer-service-onprem/) | Docker + Postgres + Redis + Qdrant + Ollama → 37 節點大腦 | 5 階段 V&V + ⚠️ `SECURITY-CAVEATS.md`（刻意保留不可上線） |

完整證據表還在後面。上面這條是**第一屏就支撐兩條路徑宣稱**的證據 — 三個案例若有任何一個消失，宣稱就站不住。

> 🛠️ **責任邊界**：Hero 圖第三塊「n8n Enterprise Orchestration」裡的 SSO / IAM / 稽核日誌 / HA — **升 n8n Enterprise 開箱即有**，Pack 不重做。Pack 的工作是讓 Code2n8n 產出的 workflow **跑在 Enterprise 之上不會破洞**（IAM-friendly、queue-safe、可 rollback）。誰做什麼、workflow 怎麼接，見 [`docs/enterprise-setup.md`](docs/enterprise-setup.md)。

---

## 🤖 這是一個 Agentic Engineering Example

> **本專案完全使用 AI Agentic IDE（Antigravity / Claude Code）撰寫，從規格到 n8n Workflow 全程由 AI 代理人協作完成。**

這個 Skill Pack 本身就是「AI 代理工程（Agentic Engineering）」的實作示範：

| 維度 | 傳統做法 | 本專案做法（Agentic） |
|---|---|---|
| **規格撰寫** | 工程師逐字打 spec | 跟 AI 對話 → AI 產出 SDD（Spec-Driven Design） |
| **n8n Workflow 開發** | 在畫布上手動拖節點 | 黃色便利貼寫需求 → AI 直接產出可執行 JSON |
| **Skill / Plugin 製作** | 翻文件、寫範本 | Claude Code Skills + Antigravity `.agent/workflows/` 自動編排 |
| **驗收測試** | 手動跑 case、寫報告 | AI 自跑 8 情境 → 自動產出 [`tests/REPORT-3.md`](tests/REPORT-3.md) |
| **文件 / README / CHANGELOG** | 開發完才補 | AI 與程式碼同步生成 |
| **第三方授權合規** | 人工審查 | AI 偵測密鑰外洩、scrub、產生 `THIRD_PARTY_NOTICES.md` |

### 你會在這個 repo 看到的 Agentic 痕跡

- **`skills/`** — `plugin.json` 登錄 15 個 Claude Code / Antigravity Skill，每個 SKILL.md 都是 AI 與人共筆
- **`.agent/workflows/`** — Antigravity 專屬的 agentic workflow（如 `/install-n8n-pack` 一鍵安裝）
- **`cookbook/`** — 8 個自然語言 → workflow 的對照範例，示範如何「對 AI 講話」
- **`spec/sticky-note-three-layer.md`** — 三層結構規範，強制 AI 產出可 review 的 workflow
- **`research/patterns.md`** — AI 從 2,061 個真實 workflow 歸納出 7 大骨架 + 反模式
- **`reference-workflows/`** — AI 對照語料（[Zie619/n8n-workflows](https://github.com/Zie619/n8n-workflows) MIT，已 scrub 密鑰）

### 適合誰參考這個專案

- 想學「**怎麼把 AI Agent 當工程同事用**」的開發者 / PM
- 已有 Apps Script、Express、Lambda、Netlify Functions 或 Docker 系統，想評估「**哪些留在程式、哪些移到 n8n**」的工程團隊
- 評估「**Antigravity / Claude Code 能否取代手寫 Skill / Workflow**」的團隊
- 想看「**人 + AI 協作的真實工程產出長什麼樣**」的好奇者

> 💡 換句話說：這不只是「給 n8n 用的 Skill Pack」，更是一份**「AI Agent 怎麼蓋產品」的開源教材**。

### 👥 你（使用者）也可以這樣用

**裝上這個 Skill Pack 之後，你就能用同樣的 Agentic 方式打造自己的 n8n workflow** —— 完全不用學 n8n 節點語法，也不用寫程式：

| 工具 | 你怎麼做 | AI 幫你做什麼 |
|---|---|---|
| **Antigravity** | 在 Antigravity 開啟你的 n8n 專案，輸入 `/install-n8n-pack` 一鍵安裝，然後直接用自然語言描述 | 透過 `.agent/workflows/` 自動讀取需求 → 產生 workflow JSON → 透過 n8n API 部署 |
| **Claude Code (CLI / VS Code)** | 在你的工作目錄跑 `bash install.sh`（或 `install.ps1`），然後描述新需求或指定既有程式 | Skill 自動載入 → 從零產生 workflow，或執行 Code2n8n 系統移植 |
| **任何 AI 助理（ChatGPT / Gemini）** | 把 [`cookbook/`](cookbook/00-INDEX.md) 範例貼給它當 few-shot | 模仿三層結構，產出符合規範的 workflow JSON |

**典型對話流程**（30 秒理解）：

```text
你 ──> AI：「每天早上 9 點抓 Shopify 訂單，整理成日報寄給老闆，
              失敗就在 Slack #ops 通知」

AI ──> 你：✅ 已產生 workflow.json（Schedule → Shopify → Code → Email + Error → Slack）
            ✅ 黃便利貼：保留你的原始需求
            ✅ 藍便利貼：要設哪些 credential、限制、測試方法
            ✅ 已透過 n8n API 部署到你的環境，webhook URL：https://...
```

> 🎯 **核心精神**：使用者不需要先背熟 n8n 節點語法，只要能說清楚需求，就能產出有結構、可 review、可維護的 workflow。要宣稱可上線，仍必須完成 credential 設定、真實執行驗證與安全審查。

如果你已經有程式，不要先改寫成便利貼。直接說：

> 「請用 `code-to-workflow` 盤點這個專案，判斷哪些邏輯留在程式、哪些應移到 n8n；先做安全審查，再產出 SDD、workflow 與驗證結果。」

詳見 [`02-USAGE-MODES.md`](02-USAGE-MODES.md)（三種從零使用模式）與 [`03-FIRST-WORKFLOW.md`](03-FIRST-WORKFLOW.md)（15 分鐘手把手）；既有程式移植則直接使用 [`code-to-workflow`](skills/tigerai/code-to-workflow/SKILL.md)。

---

## 📖 閱讀順序（強烈建議照順序看）

| # | 檔案 | 適合誰 / 看多久 |
|---|---|---|
| 0️⃣ | **本檔 README.md** | 第一站總覽（5 分鐘） |
| 1️⃣ | [`01-INSTALL.md`](01-INSTALL.md) | 第一次設定（10 分鐘） |
| 2️⃣ | [`02-USAGE-MODES.md`](02-USAGE-MODES.md) | 三種從零使用模式怎麼選（5 分鐘） |
| 3️⃣ | [`03-FIRST-WORKFLOW.md`](03-FIRST-WORKFLOW.md) | 跟我做：產出第一個 workflow（15 分鐘 hands-on） |
| 4️⃣ | [`04-FAQ.md`](04-FAQ.md) | 卡關時查（隨時翻） |

---

## ⚡ 90 秒快速理解

### 它能做什麼

你在 n8n 畫布貼一張**黃色便利貼**，用中文（或英文）寫：

```text
每天早上 9 點抓銷售資料寄日報給老闆。
失敗就在 Slack #ops 通知。
```

呼叫 AI，畫布上就出現完整 workflow：

```
┌─ 黃便利貼：你寫的需求（保留）
├─ 中間：AI 產的節點：Schedule → HTTP → Code → Email
└─ 藍便利貼：AI 寫的說明：要哪些 credential、假設、限制、測試方法
```

不用寫程式，不用學語法，不用記 n8n 節點名稱。

### 四種使用方式

| 模式 | 何時用 | 觸發詞 |
|---|---|---|
| 🪄 Cookbook 照抄 | 知道要什麼，要最快 | 直接複製 [cookbook](cookbook/00-INDEX.md) 範例 |
| 💬 問答模式 | 完全不會描述需求 | 「啟用問答模式」 |
| 🔍 範例查詢 | 想先看別人怎麼做 | 「找跟 X 相關的範例」 |
| 🔄 Code2n8n 移植 | 已有程式或系統，想搬進 n8n 治理 | 「用 `code-to-workflow` 分析並移植這個專案」 |

前三種從「意圖」開始，第四種從「既有程式」開始。Code2n8n 移植的完整方法論見 [`skills/tigerai/code-to-workflow/SKILL.md`](skills/tigerai/code-to-workflow/SKILL.md)。

---

## 📂 Pack 內容

```text
TigerAI-Code2n8n-Skill-Pack/
├── README.md                  ← 你在這裡
├── CODE2N8N.md                ← Code2n8n 宣言（定位與核心論點）
├── 01-INSTALL.md              ← 安裝步驟
├── 02-USAGE-MODES.md          ← 三種從零使用模式
├── 03-FIRST-WORKFLOW.md       ← 跟我做：第一個 workflow
├── 04-FAQ.md                  ← 常見問題
│
├── cookbook/                  ← 8 個照抄範例（每個有自然語言版 + DSL 折疊）
│   └── 00-INDEX.md
│
├── skills/                    ← 14 個實體 Skill 目錄；plugin manifest 登錄 15 筆
│   ├── _vendor/                  6 個 vendor n8n-skills（MIT）
│   └── tigerai/                  8 個 TigerAI 執行 Skill
│       ├── code-to-workflow/        ← 旗艦：既有程式 / 系統 → n8n
│       ├── n8n-security-governance/ ← 安全、版本控制、CI/CD、回滾閘門
│       └── n8n-code-to-native/      ← Code node → 原生 n8n node
│
├── spec/                      ← 技術規範（給工程師）
│   ├── sticky-note-three-layer.md
│   └── sticky-note-dsl.md
│
├── examples/google-workspace-admin-workflow/    ← 1,373 行 Apps Script → n8n
├── examples/line-ai-customer-service/           ← 雲端 LINE 客服 → n8n + 後台
├── examples/line-ai-customer-service-onprem/    ← 地端 Docker + Qdrant RAG（不可直接上線）
├── examples/tigerai-flagship/ ← 3 個企業級範例（含 SDD）
├── reference-workflows/       ← 2,061 個公開 workflow（AI 對照語料）
├── research/                  ← 研究與統計（給工程師）
├── tests/                     ← 三輪驗收紀錄
│
├── CHANGELOG.md / VERSION
├── LICENSE                    ← 整套 Pack 的 MIT 授權
├── install.sh / install.ps1   ← 安裝腳本（支援 Claude Code 與 Antigravity）
├── .agent/workflows/          ← Antigravity 專屬自動化流程（如 /install-n8n-pack）
└── plugin.json                ← Skill 清單
```

> ⚠️ `plugin.json` 目前另登錄一筆 maintenance skill `install-tigerai-n8n-pack`，但對應實體目錄尚未納入 repository；因此 manifest 是 15 筆，實體 Skill 目錄是 14 個。發版前應補齊該目錄或移除失效 entry。

---

## 🎯 不同身份建議的閱讀路徑

### 我是 n8n 新手（沒寫過 workflow）
1. 本檔 → `01-INSTALL.md` → `03-FIRST-WORKFLOW.md`
2. 跑通第一個後，回 `cookbook/00-INDEX.md` 找你要的場景
3. 卡關 → `04-FAQ.md`

### 我是 n8n 老手，想評估這套值不值得用
1. 本檔 → `02-USAGE-MODES.md`
2. 看 `tests/REPORT-3.md`：真實 n8n 環境驗收成績
3. 看 `examples/tigerai-flagship/`：企業級範例 SDD

### 我是工程師 / 整合者
1. 本檔 → `spec/sticky-note-three-layer.md` + `spec/sticky-note-dsl.md`
2. 有既有程式要移植：`skills/tigerai/code-to-workflow/SKILL.md`
3. 安全、版本控制、CI/CD 與回滾閘門：`skills/tigerai/n8n-security-governance/SKILL.md`
4. 從零需求產 workflow：`skills/tigerai/sticky-note-to-workflow/SKILL.md`
5. `skills/tigerai/n8n-api-bridge/SKILL.md`：n8n REST API SOP
6. `research/patterns.md`：7 大標準骨架 + 反模式

### 我有既有程式，想搬到 n8n
1. 先讀 [`CODE2N8N.md`](CODE2N8N.md) 理解「保留程式 + 上升流程」的分工
2. 用 [`code-to-workflow`](skills/tigerai/code-to-workflow/SKILL.md) 做 source inventory、分區與 Step 1.5 安全審查
3. 對照三個實證案例：Google Workspace、LINE 雲端版、LINE 地端版
4. 通過靜態 lint、n8n REST import，再使用真實 credential 做端到端驗證

### 我要分發給內部團隊用
1. 本檔 → `01-INSTALL.md` 跑通
2. 讀 `04-FAQ.md` 把問題答案準備好
3. 把整個資料夾打包給團隊，請他們從本 README 開始讀

---

## ✨ 三層結構（一張圖看懂）

```text
┌─────────────────────────────────────────────────────┐
│ 🟡 Layer 1（黃色便利貼）：使用者需求                │
│    「每天早上 9 點...」                              │
│    ← AI 不會改它，永遠是 source of truth             │
├─────────────────────────────────────────────────────┤
│    Layer 2：AI 產出的 nodes 與連線                  │
│    Schedule → HTTP → Code → Email                   │
├─────────────────────────────────────────────────────┤
│ 🔵 Layer 3（藍色便利貼）：AI 回寫的說明             │
│    • 節點選型理由                                    │
│    • 你需要設哪些 credential                         │
│    • 前提假設與已知限制                              │
│    • 怎麼測試                                        │
└─────────────────────────────────────────────────────┘
```

---

## 🛠️ Pack 解決的痛點

| 痛點 | 解法 |
|---|---|
| AI 寫的 workflow 不一致、難 review | 強制三層結構 |
| 使用者不會寫需求給 AI | 自然語言便利貼 + 8 個 cookbook + 問答模式 |
| AI 不夠懂 n8n | 沿用 6 個官方 Skill + 2,061 個 workflow 語料 |
| 不知道既有程式哪些該留、哪些該移到 n8n | `code-to-workflow` 7 步驟移植方法論 + 三個實證案例 |
| AI 寫的程式能 demo，但認證、SQL 與秘密管理可能不能上線 | 強制 Step 1.5 security audit；未修補的缺陷必須用 `SECURITY-CAVEATS.md` 公開揭露 |
| 沒有企業級模式 | 4 大支柱：原子化 / Universal Worker / SDD / 安全 |
| 不知怎麼開始 | `03-FIRST-WORKFLOW.md` 15 分鐘手把手 |

---

## 🧪 Code2n8n 實證案例

| 案例 | Code2n8n 路徑 | 證據 |
|---|---|---|
| [Google Workspace 行政流程](examples/google-workspace-admin-workflow/) | 1,373 行 Apps Script → core + entry n8n workflows | `PROVENANCE.md` 逐項對照；靜態 lint 0 error / 0 warning；n8n REST import 7/7 |
| [LINE AI 客服雲端版](examples/line-ai-customer-service/) | Netlify Functions + Supabase → n8n runtime + approach C 後台 | 靜態 lint 0 error / 0 warning；n8n REST import 6/6 |
| [LINE AI 客服地端版](examples/line-ai-customer-service-onprem/) | Docker + Postgres + Redis + Qdrant + Ollama + n8n | 37 節點 workflow、5 階段 V&V；安全審查揭露重大缺陷，**不可直接上線** |

第三個案例刻意保留上游 POC 的安全缺陷並公開記錄於 [`SECURITY-CAVEATS.md`](examples/line-ai-customer-service-onprem/SECURITY-CAVEATS.md)。這不是「驗收失敗被藏起來」，而是 Code2n8n 的核心原則：**AI 寫的能跑，不代表企業能上線。**

---

## 📊 歷史驗收基準（v0.9.0 R3）

以下是三層 workflow 生成能力在 v0.9.0 R3 時建立的真實環境基準；目前 Pack 版本為 v0.22.2，上方三個 Code2n8n 案例則是 v0.22.x 的新增驗證證據。

| 層 | 通過率 |
|---|---|
| JSON 結構解析 | 8/8 (100%) |
| n8n CLI Import | 8/8 (100%) |
| API Activate | 7/8 (87.5%) — T3 因 Telegram bot token 真實檢查 |
| Webhook 路由正確 | 4/4 (100%) |
| 完整 execute success | 2/4（含 `continueOnFail` 設計）|

詳見 [`tests/REPORT-3.md`](tests/REPORT-3.md)。

---

## 🔢 版本與變更紀錄

當前版本見 [`VERSION`](VERSION)；歷次變更見 [`CHANGELOG.md`](CHANGELOG.md)。

---

## 📜 授權

**整套 pack 現已採 MIT 授權。** 見根目錄 [`LICENSE`](LICENSE)。

- `skills/_vendor/`：MIT — 來自 [czlonkowski/n8n-skills](https://github.com/czlonkowski/n8n-skills)，見 `skills/_vendor/LICENSE`
- `reference-workflows/`：MIT — 來自 [Zie619/n8n-workflows](https://github.com/Zie619/n8n-workflows)。原始檔內的 API token / bearer token 等密鑰，於收錄前已替換為佔位符（如 `YOUR_API_TOKEN_HERE`）
- `examples/line-ai-customer-service-onprem/`：MIT 授權衍生自 `scorpioliu0953/ai_customer_service`，出處鏈見該範例的 `CREDITS.md`
- 其餘（TigerAI 自製 skills、cookbook、spec、docs、安裝腳本、Code2n8n 宣言、marquee `code-to-workflow` skill 等）：**MIT**（Copyright (c) 2026 Morris Lu / TigerAI）

完整第三方授權聲明見 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。

---

## 🆘 卡關了？

對 AI（Claude / ChatGPT）說：

> 「我是新手，跟著 TigerAI Skill Pack 的 README 在做，目前看到 [檔名]，遇到 [問題]」

AI 會接手診斷。或先翻 [`04-FAQ.md`](04-FAQ.md)。
