---
name: ai-customer-service-onboarding
description: 企業級 AI 客服服務（地端版）安裝與佈署 Skill 文件
version: 1.0.0
last_modified: 2026-03-26
---

# 🤖 企業級 AI 客服服務部屬與維運手冊

本文件旨在規範如何在全新的「TigerAI 地端邊緣伺服器 (Local Edge Server)」中安裝並運行這套為 LINE 設計的 AI 客服系統。

## 📍 系統先決條件 (Pre-requisites)
在進行部屬前，目標機器必須具備：
1. **Docker & Docker Compose**：並建立共用的 `tigerai-net` 網路。
2. **PostgreSQL**：已建立名為 `tigerai` 的資料庫。
3. **Qdrant**：已啟動且可供連線。
4. **Redis**：已啟動用於共用快取（去重功能）。

## 🚀 快速安裝步驟 (Installation Workflow)

### Step 1: 基礎基礎設施配置
確保專案共用網路已存在：
```bash
docker network create tigerai-net
```

### Step 2: 資料庫初始化 (Database Init)
將專案內的 `src/server/schema.sql` 導入 Postgres 的 `tigerai` 資料庫：
```bash
docker exec -i postgres psql -U adm -d tigerai < ./src/server/schema.sql
```

### Step 3: 配置與連線設定 (Environment Setup)
編輯並確保本專案 `docker-compose.yml` 中的環境變數與目標機器一致：
- `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB`
- `REDIS_URL` (共用 Redis)
- `QDRANT_URL` (共用 Qdrant)

### Step 4: 啟動服務 (Start up)
在專案根目錄下：
```bash
docker-compose up -d --build
```
> **注意**：預設埠口為 **3010**。

---

## 🔒 管理與存取權限 (Security)
- **管理後台**：`http://localhost:3010/`
- **預設管理員**：`admin@tigerai.tw` / `admin123`
- **Webhook 端點**：`http://<SERVER_IP>:3010/api/line/webhook`

## 📘 維運指南 (Operational Guide)
- **更新知識庫**：在後端「系統設定」上傳 PDF，系統會自動在 Qdrant 建立 Vector Index。
- **切換 AI 模型**：支援 OpenAI, Gemini 以及本地 Ollama。在地端機器建議優先使用 **Ollama**。
