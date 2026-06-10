# 🏛️ 系統設計文件 (SDD) - AI 客服地端版

本文件描述了 `ai_customer_service` 遷移至地端架構後的系統架構設計。

## ⚙️ 1. 系統架構 (High-Level Architecture)
系統採用 **地端分層架構 (Local Layered Architecture)**，由 React 前端、Express.js 後端以及多個容器化服務組成。

- **前端 (Web Frontend)**: React / Vite / TailwindCSS。透過本地 API 代理 (Mock) 與後端進行通訊。
- **後端 (API Server)**: Express.js (Node 20 / tsx)。提供 LINE Webhook 處理、RAG 檢索輔助、與 AI 供應商連線。
- **資料層 (Data Layer)**:
    - **PostgreSQL**: 用於存取系統設定、用戶狀態、與事件歷史紀錄。
    - **Redis**: 用於全局去重緩存與用戶狀態快取以便高效讀取。
    - **Qdrant**: 向量資料庫，用於 Vector RAG 檢索知識庫內容。
- **AI 引擎 (AI Engines)**:
    - **Cloud**: OpenAI (GPT-4/5), Google Gemini (1.5/3)。
    - **Local**: Ollama (Llama3 / Gemma)。

## 📊 2. 資料庫模型 (Data Models)

### 表 1: `settings` (永久存儲)
- 紀錄 AI 模型參數 (API Keys, Temperature, Prompts)。
- 紀錄 LINE Channel 憑證。
- 紀錄 Ollama 連線資訊。

### 表 2: `user_states` (混合存儲 - PG & Redis)
- 紀錄用戶是否處於「真人客服」模式。
- `last_human_interaction`: 最近一次真人互動時間。
- `last_ai_reset_at`: 最近一次重置回 AI 模式的時間。

### 表 3: `processed_events` (去重機制)
- 存儲 LINE `event_id`。Redis 為主，PG 為輔。

## 🔐 3. 處理流程 (Core Workflows)

### LINE Webhook 處理流程
1. **去重 (Deduplication)**: 檢查 Redis 是否有該 `event_id`。若有則跳過 (防範 LINE 重複請求)。
2. **狀態檢查**: 檢查用戶是否在「真人服務」中且未超時。若是，則由客服專員手動處理。
3. **知識檢索 (RAG)**: AI 從 Qdrant 中檢索相關知識區塊。
4. **生成回答**: 調用選定的 LLM (OpenAI/Gemini/Ollama) 產生內容。
5. **發送回复**: 透過 LINE Messaging API 將答案傳回用戶。

## 🚀 4. 設計亮點
- **去雲端化**: 減少對外部服務 (Netlify/Supabase) 的依賴。
- **高效去重**: 結合 Redis TTL，在高併發 Webhook 下極致穩定。
- **Vector RAG**: 將原本的知識注入升級為向量檢索，處理超大型 PDF 無壓力。
