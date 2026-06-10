# 用戶操作手冊 (User Guide) - AI 客服系統 (Visual Brain / n8n 版)

本文件介紹如何操作 AI 客服後台，進行管理、配置與監控。

---

## 1. 系統架構總覽

本系統由以下元件組成：

| 元件 | 用途 | 預設位址 |
|---|---|---|
| **Dashboard (前端)** | 管理後台 UI | `http://localhost:3010` |
| **Express (後端)** | API 伺服器、LINE Webhook 代理 | 容器內 port 3000，對外 3010 |
| **n8n** | 視覺化 AI 對話工作流大腦 | `http://localhost:5678` |
| **PostgreSQL** | 儲存設定、用戶狀態、對話紀錄 | 容器內 5432 |
| **Redis** | 事件去重 (Dedupe) | 容器內 6379 |
| **Qdrant** | 向量知識庫 (RAG) | `http://localhost:6333` |

### 開發模式 vs 正式模式

| | 開發模式 (Dev) | 正式模式 (Production) |
|---|---|---|
| 啟動指令 | `docker-compose up -d app-dev` | `docker-compose up -d --build app` |
| 前端網址 | `http://localhost:5173` (Vite HMR) | `http://localhost:3010` |
| 後端 API | `http://localhost:3011` | `http://localhost:3010` |
| 前端改動 | 即時 Hot Reload，存檔即生效 | 需要 rebuild 容器 |
| 後端改動 | `tsx --watch` 自動重載 | 需要 rebuild 容器 |
| 新增檔案 | `docker-compose restart app-dev` | 需要 rebuild 容器 |
| 對外服務 | 僅限本地開發測試 | 可對外 (如 `https://temp.tigerai.tw`) |

> 兩者可同時運行，port 不衝突。

---

## 2. 登入

1. 瀏覽器打開 `http://localhost:3010`（正式）或 `http://localhost:5173`（開發）。
2. 預設帳密：
   - 帳號：`admin@tigerai.tw`
   - 密碼：`admin123`
3. 登入後進入「AI 客服大腦主控台」。

---

## 3. Dashboard 主控台

### 3.1 AI 模型選擇

頁面上方有三張卡片，點選即切換目前使用的 AI 引擎：

| 模型 | 說明 |
|---|---|
| **OpenAI** | GPT-4o 系列，需要 API Key |
| **Gemini** | Google 1.5 Flash/Pro |
| **Ollama** | 地端模型 (如 Llama3)，無需 API 費用 |

> 小技巧：地端優先使用 Ollama 以減輕 API 流量支出並保護隱密性。

### 3.2 第一層：腦部決策核心

- **n8n 憑證 ID**：從下拉選單選擇已在 n8n 建立的 API 憑證（系統自動讀取 n8n 資料庫）。
- **Qdrant 大腦知識庫**：選擇向量知識庫的 Collection（系統自動列出已建立的 Collection）。
- **系統提示詞 (System Prompt)**：設定 AI 的說話口氣與專業領域，例如「你是一個親切的電子產品客服專員」。
- **靜態對話知識板塊 (Reference)**：將產品條款、常見問題、價目表等直接貼入。

### 3.3 第二層：n8n 可視化通路

- **同步啟動 n8n 工作流**：開關控制是否將對話轉送至 n8n 處理。
- **n8n Webhook 通訊 URL**：填入 n8n 工作流中 `Webhook: LINE` 節點產生的 Production URL。

### 3.4 第三層：LINE 憑證與轉接中心

#### LINE Webhook URL

頁面頂部會顯示系統自動產生的 Webhook URL，例如：
```
https://temp.tigerai.tw/api/line/webhook
```
點「複製」按鈕，貼到 LINE Developers Console 的 Webhook URL 設定。

> 注意：對外服務使用 **port 3010**。開發模式 (5173) 顯示的 URL 會自動修正為 3010。

#### LINE 憑證

- **LINE Channel Access Token**：從 LINE Developers Console 取得。
- **LINE Channel Secret**：從 LINE Developers Console 取得。

#### 專人客服轉接設定

- **強制切換為專人客服模式**：全局開關，開啟後才會啟用關鍵字觸發轉接。
- **觸發轉接關鍵字**：預設 `真人,客服,人工`（逗號隔開），用戶在 LINE 輸入任一關鍵字即觸發轉接。
- **自動重置時間 (分鐘)**：超過此時間未有互動，系統自動將用戶切回 AI 模式（預設 30 分鐘）。
- **專員 LINE User IDs**：管理員的 LINE User ID（可多人，逗號隔開）。觸發轉接時系統會推播通知到這些帳號。

#### 真人工作流對話監控站

底部有即時對話記錄表，可搜索查看用戶與 AI 的歷史對話。

### 3.5 永久保存

點右上角「永久保存」按鈕，所有設定會寫入 PostgreSQL。按鈕旁邊會顯示最後更新時間。

---

## 4. 專人客服管理

點左側選單「專人客服」進入管理頁面。

### 4.1 完整轉接流程

```
用戶在 LINE 輸入「客服」（或其他設定的關鍵字）
        |
   n8n 工作流接收並判斷
        |
   匹配轉接關鍵字？
    ├─ No → AI 正常回覆
    └─ Yes ↓
        |
   ┌────────────────────────────────────────┐
   │ 1. 取得用戶 LINE 資料 (暱稱)           │
   │ 2. DB 標記該用戶為「真人模式」          │
   │ 3. 回覆用戶：「已為您轉接真人客服，請稍候。」│
   │ 4. 推播通知管理員 (LINE Push Message)   │
   └────────────────────────────────────────┘
        |
   管理員的 LINE 收到通知：
   「🚨 [真人轉接通知] 用戶：XXX，原因：觸發關鍵字」
        |
   管理員打開 LINE Official Account Manager
   (https://manager.line.biz) 找到該用戶，手動回覆
        |
   真人模式期間，AI 完全靜默不回覆該用戶
        |
   超時自動恢復 或 後台手動歸還 → AI 重新接管
```

### 4.2 管理員如何收到通知

n8n 透過 **LINE Push Message API** 直接推播到管理員的 LINE 個人帳號：

```
POST https://api.line.me/v2/bot/message/push
{
  "to": "管理員的 LINE User ID",
  "messages": [{
    "type": "text",
    "text": "🚨 [真人轉接通知]\n用戶：Morris Lu\n原因：觸發關鍵字"
  }]
}
```

**前提條件：**

1. 管理員必須先**加 LINE Bot 為好友** — 不然 Bot 推播不到。
2. Dashboard 第三層的「專員 LINE User IDs」必須填入管理員的 LINE User ID。
3. LINE Channel Access Token 必須正確有效。

> 通知是到管理員的 **LINE 個人帳號**（像朋友傳訊息一樣跳通知），回覆用戶則要去 **LINE OA 後台** (manager.line.biz)。兩者是分開的。

### 4.3 真人模式期間發生什麼

當用戶被標記為真人模式後，n8n 的判斷鏈會這樣運作：

```
每次該用戶發新訊息 → n8n 接收
    → IF: Human Mode?
    → 條件：is_human_mode=true 且 handover_enabled=true 且 未超時
    → true → 什麼都不做（AI 靜默，讓真人透過 LINE OA 後台回覆）
    → false → 進入正常 AI 回覆流程
```

AI 不會搶話，所有回覆由管理員在 LINE OA 後台手動處理。

### 4.4 如何結束轉接（回到 AI 模式）

有三種方式：

| 方式 | 操作 |
|---|---|
| **自動超時** | 超過設定的分鐘數（預設 30 分鐘）沒有互動，n8n 自動判斷超時，恢復 AI |
| **手動歸還（單一用戶）** | 在「專人客服」頁面，找到該用戶，點「轉回 AI 接手」 |
| **一鍵全部歸還** | 在 Dashboard 第三層，點「一鍵歸還給 AI」重置所有用戶 |

### 4.5 專人客服頁面功能

| 欄位 | 說明 |
|---|---|
| 用戶暱稱 | 觸發轉接時從 LINE API 取得的 displayName |
| LINE User ID | 用戶的唯一識別碼 |
| 呼叫時間 | 觸發轉接的時間點 |
| 操作 | 點「轉回 AI 接手」將該用戶切回 AI 模式 |

頁面每 10 秒自動刷新一次。

---

## 5. n8n 工作流總覽

n8n 是系統的「視覺化大腦」，所有 AI 對話邏輯都在這裡。工作流分為 5 個區域：

### Zone 1：入口區 (Entrance)
- **Webhook: LINE** — 接收 LINE 訊息封包
- **Redis: Check Dedupe** — 5 分鐘內重複事件過濾
- **Filter: New Event** — 確認為新事件才繼續

### Zone 2：設定區 (Config)
- **Postgres: Get Settings** — 從 DB 讀取所有後台設定
- **Postgres: Get User State** — 讀取該用戶目前是否在真人模式

### Zone 3：導航區 (Navigation)
- **IF: AI Enabled?** — AI 全局開關檢查
- **IF: Human Mode?** — 真人模式 + 超時判斷
- **IF: Handover Trigger?** — 關鍵字 Regex 匹配
- **Switch: Provider** — 依 `active_ai` 設定導向 GPT / Gemini / Ollama

### Zone 4：智慧心臟 (Brain)
- **AI Agent** — 三組獨立的 AI Agent (GPT/Gemini/Ollama)
- **Model** — 各模型參數 (溫度、模型名稱)
- **Qdrant** — RAG 知識庫檢索工具
- **Embeddings** — 向量化引擎
- **Memory** — 對話歷史記憶 (Buffer Window)

### Zone 5：出口區 (Exit)
- **LINE: Reply** — AI 回覆推送到 LINE
- **Log: AI** — 記錄 AI 回覆到 DB
- **Redis: Mark Done** — 標記事件處理完成

---

## 6. 常見問題 (FAQ)

### Q: 改了設定但沒生效？
按「永久保存」後，設定會即時寫入 DB。n8n 每次處理訊息都會重新讀取 DB 設定，不需要重啟。

### Q: 開發模式改了程式碼看不到效果？
- 前端 (.tsx/.css)：Vite HMR 自動刷新，存檔即生效。
- 後端 (server/*.ts)：tsx watch 自動重載。
- 新增檔案：需 `docker-compose restart app-dev`。

### Q: 正式環境改了程式碼看不到效果？
正式模式 (port 3010) 需要 rebuild：
```bash
docker-compose up -d --build app
```

### Q: 管理員收不到轉接通知？
1. 確認管理員已加 LINE Bot 為好友。
2. 確認「專員 LINE User IDs」填的是正確的 LINE User ID。
3. 確認 LINE Channel Access Token 有效。

### Q: 用戶觸發了轉接但 AI 還在回覆？
確認 Dashboard 第三層的「強制切換為專人客服模式」開關已開啟。

### Q: 如何取得管理員的 LINE User ID？
在 LINE Bot 的 Webhook 日誌中可以找到，或從後台「真人工作流對話監控站」查看用戶 ID。