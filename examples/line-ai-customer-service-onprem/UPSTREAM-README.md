# 🤖 企業級 AI 客服系統 (Visual Brain / n8n 版)

這是一個具備 **視覺化管理大腦** 的企業級 AI 客服系統。本版本將核心對話邏輯遷移至 **n8n** 工作流，讓管理員能透過拖拉節點的方式控管 AI 的檢索（RAG）、判斷與回覆邏輯。

---

## 🌟 核心架構亮點

*   **視覺化大腦 (n8n)**：核心邏輯不再寫死在程式碼中。您可以透過導入 `n8n_workflow_export.json` 來視覺化管理 AI 對話流。
*   **薄代理 (Thin Proxy)**：Express.js 後端僅作為轉發熱點，負責 LINE Webhook 的初步校驗與轉發。
*   **高效去重**：利用 **Redis** 在代理層與 n8n 層同步進行事件去重，解決 LINE 重發造成的重複回覆。
*   **Vector RAG**：串接 **Qdrant** 向量資料庫，支援超高性能的知識檢索。
*   **多模型支援**：支援 OpenAI、Gemini 以及地端運行的 **Ollama** 模型。

---

## 🚀 快速部署手冊

### 1. 啟動基礎設施
確保 Docker 環境已裝載 `postgres`, `redis`, `qdrant` 與 `n8n`，然後啟動專案：
```bash
docker-compose up -d
```

### 🔐 預設登入資訊 (地端測試)
進入後台時，請使用以下預設帳密：
*   **帳號 (Email):** `admin@tigerai.tw`
*   **密碼 (Password):** `admin123`

### 2. 導入 n8n 工作流
1.  進入您的 n8n 管理介面 (通常是 `http://localhost:5678`)。
2.  選擇 `Import from file` 並選取專案根目錄下的 **[n8n_workflow_export.json](./n8n_workflow_export.json)**。
3.  在各節點（Postgres, Redis, Qdrant）選取對應的 **Credentials**。
4.  複製 `Webhook: LINE` 節點生成的 **Production URL** 並填回 Dashboard 的 n8n 設定中。

### 3. 設定 Dashboard 與 LINE
1.  開啟 `http://localhost:3010` (或 `https://temp.tigerai.tw`)。
2.  在 **「LINE 與人工轉接」** 區塊：
    *   **LINE Webhook URL 應填寫為：** `https://你的網域/api/line/webhook`
    *   (例：`https://temp.tigerai.tw/api/line/webhook`)
3.  在 **「n8n 可視化大腦設定」** 中：
    *   將剛才複製的 n8n Webhook URL 貼上。
    *   開啟「啟用 n8n 工作流」開關。
4.  存檔後即可開始測試 LINE 對話。

---

## 🛠️ 目錄說明

*   `n8n_workflow_export.json`：核心 AI 大腦定義檔。
*   `src/server/routes/line.ts`：Webhook 代理轉發邏輯。
*   `src/pages/Dashboard.tsx`：n8n 整合管理介面。
*   `WALKTHROUGH_N8N.md`：詳細的配置與教學。

---

## 📖 原專案參考
改編自 [scorpioliu0953/ai_customer_service](https://github.com/scorpioliu0953/ai_customer_service)。