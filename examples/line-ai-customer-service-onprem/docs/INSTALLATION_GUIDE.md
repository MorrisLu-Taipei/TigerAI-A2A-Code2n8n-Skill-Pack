# 🛠️ 安裝手冊 (Installation Guide) - AI 客服地端版

本文件詳述如何從零開始在地端伺服器部屬此服務。

## 📍 1. 預備工作 (Pre-deployment)

確保您的 **Docker 環境** 中已具備：
- 共享網路：`tigerai-net`
- 共享資料庫：PostgreSQL (名稱：`tigerai` / 使用者：`adm`)
- 共享快取：Redis 容器 (名稱：`redis`)
- 共享向量庫：Qdrant (名稱：`qdrant-tigerai`)

## 🚀 2. 部屬步驟 (Deployment Steps)

### Step A: 獲取程式碼與準備
下載本專案至伺服器目錄 `ai-customer-service`。

### Step B: 初始化資料庫 (Postgres)
執行專案內的 SQL 腳本以配置資料表：
```bash
docker cp ./src/server/schema.sql postgres:/schema.sql
docker exec postgres psql -U adm -d tigerai -f /schema.sql
```

### Step C: 配置環境變數 (Environment)
編輯 `docker-compose.yml` 中的環境變數：
- `POSTGRES_USER=adm`
- `POSTGRES_PASSWORD=tigerai`
- `POSTGRES_DB=tigerai`
- `REDIS_URL=redis://redis:6379`
- `QDRANT_URL=http://qdrant-tigerai:6333`
- `OLLAMA_BASE_URL=http://ollama:11434` (若使用地端模型)

### Step D: 啟動專案 (Startup)
執行以下指令建置並啟動：
```bash
docker-compose up -d --build
```

## 🌐 3. 測試連通性 (Verification)
1. **健康檢查**：訪問 `http://localhost:3010/health`。若看到 `{"status": "OK"}` 則後端已啟動。
2. **存取後台**：訪問 `http://localhost:3010`。
3. **預設登入**：`admin@tigerai.tw` / `admin123`。

## 🔧 4. 常見問題修復 (Troubleshooting)
- **錯誤：`password authentication failed`**：請確認 `docker-compose.yml` 中的資料庫使用者名稱是否與 Postgres 容器一致。
- **錯誤：`PathError` 或連不上網站**：請確認 `docker logs ai-customer-service` 是否有路由語法錯誤或埠口已被 `open-webui` 佔用。
