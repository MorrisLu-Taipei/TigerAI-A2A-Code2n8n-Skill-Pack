# 🚀 n8n 動態大腦導入指南 (Dynamic Multi-Provider)

這份指南將引導您如何在 n8n 中使用全新的「動態切換大腦」。本工作流支援根據 Dashboard 設定，在 **OpenAI**, **Gemini**, 與 **Ollama** 之間即時切換。

## 1. 導入流程
1.  下載專案根目錄下的 `n8n_workflow_export.json`。
2.  在 n8n 介面選擇 **Import from JSON**。
3.  本工作流包含了一個 **Switch** 節點，它會讀取資料庫中的 `active_ai` 欄位。

## 2. 節點與連線說明
- **Postgres: Get Settings**: 從本地資料庫抓取所有 AI 配置。
- **Switch: Provider**: 
  - `gpt` -> 走 OpenAI 路線 (含 RAG & Memory)。
  - `gemini` -> 走 Google 路線 (含 RAG & Memory)。
  - `ollama` -> 走 Ollama 路線 (含 RAG & Memory)。
- **Knowledge Tool (RAG)**: 每個路線都有專屬的 Embedding 節點，確保向量搜尋準確。

## 3. 重要帳密設定 (Credentials)
請確保在 n8n 中建立了以下憑證：
- **Redis**: 請填寫 `redis` (Host) 與 `6379` (Port)。
- **Postgres**: 請填寫 `postgres` (Host), `5432`, `adm`, `tigerai`。
- **OpenAI / Gemini**: 填入您的 API Keys。
- **Qdrant**: `http://qdrant-tigerai:6333`。

## 4. Docker 環境提示
- 如果您在 Docker 內執行 n8n：
  - **Ollama URL**: 在 Dashboard 中請填寫 `http://ollama:11434`。
  - **Postgres/Redis Host**: 請直接使用服務名稱 `postgres` 與 `redis`。
  - 確保所有服務都在 `tigerai-net` 網路下。

## 5. 常見問題
- **Q: 為什麼沒有回應？**
  - 請檢查 `Webhook: LINE` 節點是否已啟動，並將生產環境的 Webhook URL 貼回 Dashboard。
- **Q: 關鍵字轉接真人？**
  - n8n 工作流已內建去重，但轉接邏輯仍保留在 Express Proxy 層以確保穩定。
