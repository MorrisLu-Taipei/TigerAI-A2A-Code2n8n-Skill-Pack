# LINE AI 客服系統 — 地端 Docker 版（Code2n8n 案例）

> 🌐 **繁體中文** | [English summary at bottom](#english-summary)
>
> ## ⚠️ 安全警告（必讀）
>
> **本範例不可公開部署。** 上游 POC 程式碼有**零真實認證**（`/api/auth/me` 永遠回登入成功 + 所有 `/api/*` 資料路由完全裸奔）和 **SQL identifier injection**（`updateSettings` 把 request body 的 key 直接拼進 SQL）。明文密碼、無 CSRF / rate limit / audit log、n8n credential 名單外露⋯⋯
>
> **完整清單與重現方式見 [`SECURITY-CAVEATS.md`](SECURITY-CAVEATS.md)。**
>
> 我們**主動稽核並公開揭露**，而不靜悄悄打補丁 — 因為這些缺陷本身就是 Code2n8n 的教學重點（AI 寫的程式能跑 ≠ 能上線）。要上線請 fork 後依 SECURITY-CAVEATS 末段的 10 步驟硬化。
>
> ---
>
> 📦 **這是一份 Code2n8n 練習案例**：我們拿一個 **MIT 授權** 的開源 POC 當原始素材，跑完整的 **Code2n8n** 流程（盤點 → 分區 → n8n workflow → 文件 → 驗證），把成果完整放在這裡讓你照著學或照著抄 — 但**不要直接上線**。

---

## 這個範例是什麼？

| 項目 | 內容 |
| --- | --- |
| **原始來源** | [`scorpioliu0953/ai_customer_service`](https://github.com/scorpioliu0953/ai_customer_service)（MIT 授權，可自由衍生）|
| **本範例做了什麼** | 把它從 **Netlify Functions + Supabase 雲端版** 改造為 **地端 Docker 全自家版**（Postgres + Redis + Qdrant + Ollama），並補上完整的 n8n 「動態大腦」工作流 |
| **演化者** | Morris Lu + Claude Code（依 MIT 授權衍生），完整保留上游 LICENSE 與作者署名 |
| **為何進這個 pack** | 這是 [CODE2N8N 宣言](../../CODE2N8N.md) 中「Code2n8n Skill 把程式系統轉成 n8n 工作流」的**實證案例** — 不是我們宣傳的口號，是真跑通的整套系統 |
| **配套 skill** | [`skills/tigerai/code-to-workflow`](../../skills/tigerai/code-to-workflow/SKILL.md) — 把這個案例走過的方法論抽成可重用 SOP |

---

## 跟 pack 內另一個 LINE 範例的差別

我們在 `examples/` 下其實有 **兩個 LINE 客服範例**，是同一系統的**兩條移植路徑**：

| 維度 | [`line-ai-customer-service/`](../line-ai-customer-service/) | **`line-ai-customer-service-onprem/`** （本範例）|
| --- | --- | --- |
| 部署模式 | Netlify Functions（serverless）| Docker Compose（地端） |
| 資料庫 | Supabase（雲）| Postgres + Redis + Qdrant（全自家容器） |
| AI 模型 | OpenAI、Gemini | OpenAI、Gemini、**Ollama 地端 LLM** |
| 知識庫 | reference_file_url 純文字 / PDF | **Qdrant 向量 RAG**（適合大型 PDF） |
| 後台認證 | `LINECS_ADMIN_TOKEN` 共享 token | **僅有 login form + 明文密碼比對**；`/me` 永遠回登入成功；無 session/JWT；資料路由全裸奔（見 [`SECURITY-CAVEATS.md`](SECURITY-CAVEATS.md)） |
| 去重 | Supabase PK 衝突 | **Redis TTL + Postgres**（雙層、企業級） |
| n8n workflow | 我們自己用 core+entry 拆法手刻 | 上游已有 `n8n_workflow_export.json`（37 節點，Switch on `active_ai` → 三條 RAG 線） |
| 後台 UI | n8n 自托管薄管理 shim（approach C） | 完整 React Dashboard / AgentService / Login |
| 驗證 | lint + n8n REST import | **5 階段 V&V**（Infra / API / UI / HMR / E2E）+ 真實 PASS 紀錄 |
| 適合誰 | 學 Code2n8n **核心方法論**（最小可移植版） | 學 Code2n8n **方法論的踩坑紀錄 + 容器化部署模板**（**不是**「企業可上線版」 — 安全層有重大缺陷，見 SECURITY-CAVEATS） |

兩個並排看，就能體會 Code2n8n 的核心思想：**同一個程式系統，依企業需求可以走不同的移植路徑**。

---

## 目錄結構

```text
line-ai-customer-service-onprem/
├── README.md                          ← 你在這
├── LICENSE                            ← MIT（scorpioliu0953）
├── CREDITS.md                         ← 完整出處鏈
├── UPSTREAM-README.md                 ← 上游 README 原樣保留
├── WALKTHROUGH_N8N.md                 ← n8n 動態大腦使用指南
├── n8n_workflow_export.json           ← 37 節點 n8n 工作流（可直接 Import）
├── docker-compose.yml                 ← Production 容器（port 3010）+ Dev 容器（port 5173/3011）
├── Dockerfile / Dockerfile.dev
├── supabase_schema.sql                ← 上游版 schema（含 Supabase 殘留）
├── netlify.toml / index.html / vite.config.ts / tsconfig*.json / postcss.config.js / tailwind.config.js / package.json
├── src/
│   ├── App.tsx / main.tsx / index.css
│   ├── components/Layout.tsx
│   ├── pages/{Dashboard,AgentService,Login}.tsx
│   ├── lib/api.ts                     ← 已移除 Supabase 依賴
│   └── server/
│       ├── index.ts                   ← Express entry
│       ├── schema.sql                 ← 地端 Postgres schema（移除 RLS/storage）
│       ├── routes/{auth,line,settings,agent,logs,upload}.ts
│       └── services/{ai,db,qdrant,redis}.ts
└── docs/
    ├── onboarding.md                  ← Onboarding Skill（地端部署 SOP）
    ├── SDD.md                         ← 系統設計文件（地端架構）
    ├── INSTALLATION_GUIDE.md
    ├── USER_GUIDE.md
    ├── DEV_LOG.md                     ← 完整研發紀錄 + 5 階段 V&V PASS/PENDING 表
    ├── LESSON_LEARNED.md              ← 5 個實戰雷點（port 衝突 / Express v5 wildcard / ESM tsx / 共用 DB / 共用 Redis）
    ├── SDD-upstream.md                ← 上游版 SDD 原樣保留
    └── README.md                      ← docs 自己的 README
```

---

## 怎麼用這個範例

### 路徑 A：照著跑（部署實作）
1. 看 [`docs/onboarding.md`](docs/onboarding.md) — 環境需求（Docker、Postgres、Redis、Qdrant、Ollama）
2. 看 [`docs/INSTALLATION_GUIDE.md`](docs/INSTALLATION_GUIDE.md) — 完整安裝步驟
3. 看 [`WALKTHROUGH_N8N.md`](WALKTHROUGH_N8N.md) — 把 `n8n_workflow_export.json` 匯入 n8n 後怎麼設定憑證
4. 跑 `docker-compose up -d --build app`

### 路徑 B：照著學（Code2n8n 方法論）
1. 看 [`docs/SDD.md`](docs/SDD.md) — 為什麼地端架構這樣設計
2. 看 [`docs/LESSON_LEARNED.md`](docs/LESSON_LEARNED.md) — 從雲端版移植過來踩到的 5 個坑
3. 看 [`docs/DEV_LOG.md`](docs/DEV_LOG.md) — 5 階段 V&V 計畫怎麼編，怎麼驗
4. 看 [`skills/tigerai/code-to-workflow`](../../skills/tigerai/code-to-workflow/SKILL.md) — 上述步驟抽成可重用 skill

### 路徑 C：對照另一個範例
- 打開 [`../line-ai-customer-service/`](../line-ai-customer-service/) 看「雲端版」的 Code2n8n 路徑
- 跟本範例「地端版」比較，理解**同一個程式系統可以有不同移植目的地**

---

## ⚠️ 安全提醒（必讀）

**完整稽核結果在 [`SECURITY-CAVEATS.md`](SECURITY-CAVEATS.md)。** 速查版：

- ❌ **`/api/auth/me` 永遠回登入成功** — 無 session、無 JWT
- ❌ **所有 `/api/*` 資料路由完全裸奔** — settings 含金鑰可被任意讀寫、user_states 可被任意修改、上傳可被任意觸發
- ❌ **`updateSettings` SQL identifier injection** — request body 的 key 直接拼進 SQL
- ❌ **明文密碼** — `users.password` 沒 hash
- ❌ **n8n credential 名單外露** — `GET /api/settings/n8n/credentials`
- ❌ **無 CSRF / rate limit / helmet / audit log / CORS 鎖定**
- ✅ `docker-compose.yml` 的 `OPENWEBUI_API_KEY` 已改為環境變數 placeholder（原值已 scrub）
- ✅ `supabase_schema.sql` 與 `src/server/schema.sql` 只含 schema 結構，無預植入金鑰

**結論**：本範例供方法論學習、容器化部署參考、Code2n8n 移植踩坑紀錄。**禁止直接上線。** 要上線請 fork 後執行 SECURITY-CAVEATS 末段的 10 步硬化清單。

---

## 致謝

- **scorpioliu0953** — 原始 [`ai_customer_service`](https://github.com/scorpioliu0953/ai_customer_service) MIT 授權釋出，是這個 Code2n8n 案例能夠進行的基礎
- **Morris Lu + Claude Code (Opus 4.6)** — 地端化、Ollama 整合、Qdrant RAG、5 階段 V&V 演化

完整出處鏈見 [CREDITS.md](CREDITS.md)。

---

## English summary

**⚠️ Not production-safe.** A real-world POC port: we took an **MIT-licensed** open-source project (`scorpioliu0953/ai_customer_service`) and walked it through the full Code2n8n pipeline into an **on-prem Docker stack** (Postgres + Redis + Qdrant + Ollama) with a matching n8n "dynamic-brain" workflow (37 nodes, Switch on `active_ai` → three RAG paths). Both **the deployable system** (Docker + React + Express) and **the methodology** (SDD + DEV_LOG + LESSON_LEARNED + WALKTHROUGH_N8N) are in this folder.

**The upstream POC has zero real authentication and an SQL identifier-injection vulnerability** in `updateSettings`; we **disclosed but did not patch** (see [`SECURITY-CAVEATS.md`](SECURITY-CAVEATS.md)) because the vulnerabilities themselves are part of the Code2n8n teaching: "AI-written software that runs ≠ enterprise-deployable software."

Pair this with the simpler [`line-ai-customer-service/`](../line-ai-customer-service/) example to see **the same upstream system on two Code2n8n paths**: cloud-minimum vs on-prem-with-RAG. Neither is shippable without hardening; both are honest Code2n8n teaching artefacts.

The companion skill [`skills/tigerai/code-to-workflow`](../../skills/tigerai/code-to-workflow/SKILL.md) codifies the methodology this case study walked through.

Upstream MIT license preserved; full attribution chain in [CREDITS.md](CREDITS.md).
