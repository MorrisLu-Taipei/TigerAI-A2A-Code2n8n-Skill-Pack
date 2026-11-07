> 歷史紀錄：文中的 `reference-workflows/` 已於 2026-11-06 自 repo 移除，見 `research/n8n-templates-method.md`

# 來源盤點 Source Inventory（Phase 0）

> 🌐 [English](source-inventory.en.md) | **繁體中文**

> 對 `c:\Tools\@@@@@@Antigravity\n8n-RD-Rules\` 下所有素材的角色與整合方式做一次性釐清。

---

## A. 學習素材（給 AI 讀的）

### A1. `n8n-skills-main/`
- **角色**：**格式合約 + 直接沿用的 7 個 Skill**
- **整合方式**：拷貝 `skills/*` 至 `delivery/TigerAI-Code2n8n-Skill-Pack/skills/_vendor/`
- **關鍵檔**：`CLAUDE.md`（架構說明）、`skills/<name>/SKILL.md`（每個 Skill 的本體）
- **授權**：MIT，可拷貝，需保留 LICENSE 與來源標註

### A2. `n8n-workflows-main/workflows/`
- **角色**：**2,061 個實例語料**，AI 對照學習用
- **整合方式**：
  1. 全量拷貝至 `delivery/.../reference-workflows/`（給客戶/AI 隨時查閱）
  2. 用 script 萃取結構化索引至 `research/workflow-index.json`
- **關鍵發現**：
  - 命名 `<id>_<Vendor>_<Action>_<Trigger>.json`
  - Trigger 類型集中：Triggered / Webhook / Scheduled / Automation
  - 含 `Stickynote` 子類別（Aggregate/Airtabletool/Code/… 多處可見），是 sticky note 用法的天然範例
  - sticky note 內容是 Markdown，常含 Introduction / Benefits / Key Features / Setup Instructions / Testing 等章節
- **附帶檔**：`api_server.py`、`workflow_db.py` — 該專案自身的 search API，**不納入交付**（與我們的 AI Pipeline 路線不同）

---

## B. TigerAI 內部資產（既有實作）

### B1. `n8n-mcp-json/`
- **角色**：TigerAI 的 12 個正式 workflow（splitPDF / splitMP3 / openwebui-bridge 系列）
- **代表的設計模式**：
  - `*-orchestrated.json`：原子化編排，loop 級透明度
  - `*-form.json`：Form Trigger 起手式
  - `*-WSL-Remote.json`：跨環境 Worker 的位置透明
  - `*-modular.json`：子 workflow 拆分
  - `*-native.json` vs `*-fixed.json`：n8n 原生 vs 修補版本對照
- **整合方式**：
  - 選 3–5 個代表作（建議：`splitPDF-orchestrated.json`、`splitMP3-API-Orchestrated.json`、`openwebui-bridge-v2.json`）拷貝至 `examples/tigerai-flagship/`，作為**企業級範例**
  - 其餘留在原處，不複製

### B2. `n8n-global-state-manager/`
- **角色**：**Engineering Playbook**（README.md 是 v1.0 方法論文件）
- **核心觀念**：
  - Workflow as Code (WaC)
  - Specification-Driven Development (SDD)
  - 標準專案結構：`specification.md` + `workflow.json` + `README.md`
  - SDD 必含章節：Purpose / Trigger & Inputs / Business Logic / Outputs / Errors / Test Scenarios
- **整合方式**：
  - 將 SDD 模板抽取出來，融入 `skills/tigerai/tigerai-enterprise-patterns/`（Phase 3）
  - 本 Phase 先在 `research/` 引用之，不複製

### B3. `n8n-rag-system/`
- **角色**：占位 SDD（Draft，待 JSON 匯入才能展開）
- **整合方式**：**本階段不納入**，待後續有具體 RAG workflow 再說
- **備註**：在 `MEMORY.md` 留追蹤項

### B4. `Docker-Installation/`
- **角色**：n8n 本機部署資料
- **整合方式**：**不納入交付**（客戶有自己的部署），但在 `01-INSTALL.md` 提及「需自備 n8n 實例」

### B5. `SDD.md` / `README.md`（根目錄）
- **角色**：本專案頂層說明
- **整合方式**：交付物的 `README.md` 會引用 `SDD.md` 的「四大顧問價值」段落

---

## C. 不納入學習/交付的項目（明確排除）

| 項目 | 原因 |
|---|---|
| `n8n-workflows-main/api_server.py` 等程式碼 | 與我們的 AI Pipeline 路線不同 |
| `n8n-workflows-main/Dockerfile` / `docker-compose*.yml` | 該專案自部署用，與交付無關 |
| `Docker-Installation/` | 客戶自備 |
| `n8n-rag-system/` | Draft 階段 |
| `install_docker.sh`（根目錄） | 客戶自備 |

---

## D. 整合矩陣（一張圖看懂去向）

```
[來源]                           →  [交付物位置]
n8n-skills-main/skills/*         →  skills/_vendor/*
n8n-workflows-main/workflows/*   →  reference-workflows/*  +  research/workflow-index.json
n8n-mcp-json/(精選)              →  examples/tigerai-flagship/*
n8n-global-state-manager/README  →  skills/tigerai/tigerai-enterprise-patterns/ (Phase 3)
n8n-rag-system/                  →  [暫不納入]
Docker-Installation/             →  [不納入，文件提及]
```

---

**狀態**：Phase 0 盤點完成。Phase 1 拷貝動作排程在 `research/workflow-index.json` 完成後執行（會因 2,061 個檔案產生顯著磁碟占用，需先用戶確認）。
