> 歷史紀錄：文中的 `reference-workflows/` 已於 2026-11-06 自 repo 移除，見 `research/n8n-templates-method.md`

# Baseline 對齊基準（Phase 0）

> 🌐 [English](baseline.en.md) | **繁體中文**

> 目的：在動工前，把「我們參考誰、產出什麼格式、AI 看到什麼」固定下來，後續所有 Skill / spec / cookbook 都以本檔為準。

---

## 1. 學習語料總覽

| 來源 | 路徑 | 數量 | 角色 |
|---|---|---|---|
| 官方 Skill 庫 | `n8n-skills-main/skills/` | 6 個 SKILL.md（移除 mcp-tools-expert，本 Pack 不依賴 MCP）| **格式合約** — 我們自製 Skill 的範本 |
| 公開 workflow 庫 | `n8n-workflows-main/workflows/` | 2,061 個 JSON（188 廠商資料夾） | **實例語料** — AI 對照學習 |
| TigerAI 內部 workflow | `n8n-mcp-json/` | 12 個 JSON（splitPDF/splitMP3/openwebui-bridge 系列） | **企業範例** — 體現原子化/FastAPI/Orchestrator 模式 |
| Engineering Playbook | `n8n-global-state-manager/README.md` | 1 份 | **方法論** — Workflow as Code (WaC) + SDD |
| RAG 模組 SDD | `n8n-rag-system/specification.md` | 1 份（Draft，待 JSON 匯入） | **占位符** — 暫不納入學習 |

---

## 2. n8n Workflow JSON 結構合約

每個 workflow JSON 必有：

| 欄位 | 說明 | AI 必須關注 |
|---|---|---|
| `name` | workflow 名稱 | ✅ |
| `nodes[]` | 所有節點（含 stickyNote） | ✅ |
| `connections{}` | 節點連線拓撲 | ✅ |
| `settings{}` | workflow 層級設定 | △ |
| `staticData` | 跨 execution 持久資料 | △ |
| `tags[]` | 分類標籤 | △ |
| `createdAt` / `updatedAt` | 時間戳 | ✗ |

### Node 共通欄位

```json
{
  "id": "uuid",
  "name": "顯示名稱",
  "type": "n8n-nodes-base.<nodeType>",
  "typeVersion": 1,
  "position": [x, y],
  "parameters": { /* node-specific */ },
  "credentials": { /* optional */ },
  "notes": "節點備註（選填）",
  "notesInFlow": true
}
```

### Sticky Note Node（關鍵）

`type = "n8n-nodes-base.stickyNote"`，`parameters` 包含：
- `content`：**Markdown 字串**，支援標題/列表/連結/圖片/`{{ $env.* }}`
- `width` / `height`：尺寸（pixels）
- 配合 `position` 決定畫布位置（上/中/下由 y 座標決定）

> **這是我們三層結構的技術基礎**：上方 sticky note (用戶輸入) / 中間 nodes (流程) / 下方 sticky note (AI 回寫說明) — 三者皆以 `position.y` 區分。

---

## 3. 官方 6 個 Skill 格式合約

每個 Skill 為一資料夾，必含：

```
skills/<skill-name>/
├── SKILL.md          # 主文件，含 YAML frontmatter
├── README.md         # 對人類讀者的說明
└── *.md              # 補充參考（依需求）
```

### SKILL.md frontmatter 規範

```yaml
---
name: <skill-name>             # 與資料夾名稱一致，kebab-case
description: <一句話觸發描述>    # 描述何時啟用本 Skill；AI 用這段判斷是否載入
---
```

> **要點**：`description` 必須包含明確觸發詞（例如 "Use when …"），否則 Skill 不會被自動載入。我們自製的 Skill 必須遵守此格式。

### 7 個官方 Skill 的角色分工

| Skill | 角色 | 我們是否覆寫 |
|---|---|---|
| `n8n-expression-syntax` | `{{ }}` 表達式語法 | ❌ 直接沿用 |
| `n8n-workflow-patterns` | 5 大架構模式 | ❌ 直接沿用 |
| `n8n-validation-expert` | validation 錯誤詮釋 | ❌ 直接沿用 |
| `n8n-node-configuration` | 節點設定規範 | ❌ 直接沿用 |
| `n8n-code-javascript` | Code 節點 JS 寫法 | ❌ 直接沿用 |
| `n8n-code-python` | Code 節點 Python 寫法 | ❌ 直接沿用 |

---

## 4. 命名慣例（從 2,061 檔案歸納）

公開語料採用：`<seq-id>_<Vendor>_<Action>_<Trigger>.json`

- `<Vendor>`：廠商或節點類別（Activecampaign / Aggregate / Airtable / Stickynote / …）
- `<Action>`：Create / Send / Automate / Automation / Update …
- `<Trigger>`：Triggered / Webhook / Scheduled / Automation

> **我們交付物採不同命名**（見 `examples/` 規範），避免與公開語料混淆。

---

## 5. AI 工作流程的硬約束（由本基準衍生）

1. **AI 產生的 workflow JSON 必須可直接被 n8n import** — 結構合約不可違反。
2. **AI 必須先讀 sticky note 再寫 nodes** — 不可憑空產生。
3. **AI 必須回寫一張下方 sticky note 說明自己做了什麼** — 三層結構。
4. **AI 必須沿用官方 6 個 Skill 的觸發機制** — 不重造輪子。
5. **AI 對照學習 2,061 個語料時，僅供參考，不得直接拷貝** — 避免授權問題。

---

**狀態**：Phase 0 對齊完成。下一步進 Phase 2a（三層結構規範）。
