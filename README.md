# TigerAI n8n Skill Pack — 使用手冊

> 🌐 [English](README.en.md) | **繁體中文**

> 用「跟同事講話」的方式描述需求，AI 自動產出 n8n 完整 workflow。
> 不會寫程式也能用。

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

- **`skills/`** — 13 個 Claude Code / Antigravity Skill，每個 SKILL.md 都是 AI 與人共筆
- **`.agent/workflows/`** — Antigravity 專屬的 agentic workflow（如 `/install-n8n-pack` 一鍵安裝）
- **`cookbook/`** — 8 個自然語言 → workflow 的對照範例，示範如何「對 AI 講話」
- **`spec/sticky-note-three-layer.md`** — 三層結構規範，強制 AI 產出可 review 的 workflow
- **`research/patterns.md`** — AI 從 2,061 個真實 workflow 歸納出 7 大骨架 + 反模式
- **`reference-workflows/`** — AI 對照語料（[Zie619/n8n-workflows](https://github.com/Zie619/n8n-workflows) MIT，已 scrub 密鑰）

### 適合誰參考這個專案

- 想學「**怎麼把 AI Agent 當工程同事用**」的開發者 / PM
- 評估「**Antigravity / Claude Code 能否取代手寫 Skill / Workflow**」的團隊
- 想看「**人 + AI 協作的真實工程產出長什麼樣**」的好奇者

> 💡 換句話說：這不只是「給 n8n 用的 Skill Pack」，更是一份**「AI Agent 怎麼蓋產品」的開源教材**。

---

## 📖 閱讀順序（強烈建議照順序看）

| # | 檔案 | 適合誰 / 看多久 |
|---|---|---|
| 0️⃣ | **本檔 README.md** | 第一站總覽（5 分鐘） |
| 1️⃣ | [`01-INSTALL.md`](01-INSTALL.md) | 第一次設定（10 分鐘） |
| 2️⃣ | [`02-USAGE-MODES.md`](02-USAGE-MODES.md) | 三種使用方式怎麼選（5 分鐘） |
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

### 三種使用方式（細節見 [02-USAGE-MODES.md](02-USAGE-MODES.md)）

| 模式 | 何時用 | 觸發詞 |
|---|---|---|
| 🪄 Cookbook 照抄 | 知道要什麼，要最快 | 直接複製 [cookbook](cookbook/00-INDEX.md) 範例 |
| 💬 問答模式 | 完全不會描述需求 | 「啟用問答模式」 |
| 🔍 範例查詢 | 想先看別人怎麼做 | 「找跟 X 相關的範例」 |

---

## 📂 Pack 內容

```text
TigerAI-n8n-Skill-Pack/
├── README.md                  ← 你在這裡
├── 01-INSTALL.md              ← 安裝步驟
├── 02-USAGE-MODES.md          ← 三種使用方式
├── 03-FIRST-WORKFLOW.md       ← 跟我做：第一個 workflow
├── 04-FAQ.md                  ← 常見問題
│
├── cookbook/                  ← 8 個照抄範例（每個有自然語言版 + DSL 折疊）
│   └── 00-INDEX.md
│
├── skills/                    ← AI 助理載入的 13 個 Skill
│   ├── _vendor/                  7 個官方 n8n-skills（MIT）
│   └── tigerai/                  6 個 TigerAI 自製（含 AG 自動安裝 Skill）
│
├── spec/                      ← 技術規範（給工程師）
│   ├── sticky-note-three-layer.md
│   └── sticky-note-dsl.md
│
├── examples/tigerai-flagship/ ← 3 個企業級範例（含 SDD）
├── reference-workflows/       ← 2,061 個公開 workflow（AI 對照語料）
├── research/                  ← 研究與統計（給工程師）
├── tests/                     ← 三輪驗收紀錄
│
├── CHANGELOG.md / VERSION
├── install.sh / install.ps1   ← 安裝腳本（支援 Claude Code 與 Antigravity）
├── .agent/workflows/          ← Antigravity 專屬自動化流程（如 /install-n8n-pack）
└── plugin.json                ← Skill 清單
```

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
2. `skills/tigerai/sticky-note-to-workflow/SKILL.md`：核心執行邏輯
3. `skills/tigerai/n8n-api-bridge/SKILL.md`：n8n REST API SOP
4. `research/patterns.md`：7 大標準骨架 + 反模式

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
| AI 不夠懂 n8n | 沿用 7 個官方 Skill + 2,061 個 workflow 語料 |
| 沒有企業級模式 | 4 大支柱：原子化 / Universal Worker / SDD / 安全 |
| 不知怎麼開始 | `03-FIRST-WORKFLOW.md` 15 分鐘手把手 |

---

## 📊 真實環境驗收成績（v0.9.0 R3）

對使用者既有的 n8n 2.10.3 + Postgres 環境跑 8 個情境：

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

- `skills/_vendor/`：MIT — 來自 [czlonkowski/n8n-skills](https://github.com/czlonkowski/n8n-skills)，見 `skills/_vendor/LICENSE`
- `reference-workflows/`：MIT — 來自 [Zie619/n8n-workflows](https://github.com/Zie619/n8n-workflows)。原始檔內的 API token / bearer token 等密鑰，於收錄前已替換為佔位符（如 `YOUR_API_TOKEN_HERE`）
- 其餘（TigerAI 自製 skills、cookbook、spec、docs、安裝腳本等）：**TigerAI Proprietary**（散佈條件依公司決定）

完整第三方授權聲明見 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。

---

## 🆘 卡關了？

對 AI（Claude / ChatGPT）說：

> 「我是新手，跟著 TigerAI Skill Pack 的 README 在做，目前看到 [檔名]，遇到 [問題]」

AI 會接手診斷。或先翻 [`04-FAQ.md`](04-FAQ.md)。
