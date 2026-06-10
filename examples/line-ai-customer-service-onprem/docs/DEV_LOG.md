# 研發紀錄 (Development Log) - AI 客服系統 v2.3

**日期**: 2026-03-29
**負責人**: Morris Lu + Claude Code (Opus 4.6)

---

## 已完成項目

### 1. 前端 UI 修復

| # | 項目 | 檔案 | 狀態 |
| --- | --- | --- | --- |
| 1.1 | Layout 滿版修復 (padding 過大) | `src/components/Layout.tsx` | 已完成，未驗證 |
| 1.2 | LINE Webhook URL 提示加回第三層 | `src/pages/Dashboard.tsx` | 已完成，未驗證 |
| 1.3 | Webhook URL 自動修正 port (dev:5173 → 3010) | `src/pages/Dashboard.tsx` | 已完成，未驗證 |
| 1.4 | 永久保存旁顯示「最後更新時間」 | `src/pages/Dashboard.tsx` | 已完成，未驗證 |

### 2. 移除 Supabase 依賴

| # | 項目 | 檔案 | 狀態 |
| --- | --- | --- | --- |
| 2.1 | 刪除 supabase proxy | 刪除 `src/lib/supabase.ts` | 已完成，未驗證 |
| 2.2 | 新增本地 API helper | 新增 `src/lib/api.ts` | 已完成，未驗證 |
| 2.3 | Login 改用 api.auth.login | `src/pages/Login.tsx` | 已完成，未驗證 |
| 2.4 | App 改用 api.auth.isLoggedIn | `src/App.tsx` | 已完成，未驗證 |
| 2.5 | Layout 改用 api.auth.logout | `src/components/Layout.tsx` | 已完成，未驗證 |
| 2.6 | AgentService 改用 fetch 直呼 API | `src/pages/AgentService.tsx` | 已完成，未驗證 |

### 3. 後端 API 修復

| # | 項目 | 檔案 | 狀態 |
| --- | --- | --- | --- |
| 3.1 | 修正 fetchSettings 路徑 `/api/settings/settings` → `/api/settings` | `src/pages/Dashboard.tsx` | 已完成，未驗證 |
| 3.2 | 修正 reset-handover 路徑 `/api/settings/reset-handover` → `/api/reset-handover` | `src/pages/Dashboard.tsx` | 已完成，未驗證 |
| 3.3 | 新增 user_states API route (GET/POST) | 新增 `src/server/routes/agent.ts` | 已完成，未驗證 |
| 3.4 | 掛載 agentRouter 到 Express | `src/server/index.ts` | 已完成，未驗證 |
| 3.5 | logs 路由掛載修正 `/api` → `/api/logs` | `src/server/index.ts` | 已完成，未驗證 |

### 4. n8n Workflow JSON 校正

| # | 項目 | 檔案 | 狀態 |
| --- | --- | --- | --- |
| 4.1 | AI Agent 輸出接上 LINE: Reply (原本跳過) | `n8n_workflow_export.json` | 已完成，未驗證 |
| 4.2 | 移除不存在的 LINE: Status Notify 節點 | `n8n_workflow_export.json` | 已完成，未驗證 |
| 4.3 | Postgres: Set Human → Reply User + Notify Admin 並行 | `n8n_workflow_export.json` | 已完成，未驗證 |
| 4.4 | 欄位名對齊 DB: gpt_model_name → gpt_model | `n8n_workflow_export.json` | 已完成，未驗證 |
| 4.5 | 欄位名對齊 DB: gemini_model_name → gemini_model | `n8n_workflow_export.json` | 已完成，未驗證 |
| 4.6 | 欄位名對齊 DB: ollama_model_name → ollama_model | `n8n_workflow_export.json` | 已完成，未驗證 |
| 4.7 | 溫度欄位改固定值 0.7 (DB 無此欄位) | `n8n_workflow_export.json` | 已完成，未驗證 |
| 4.8 | Memory 節點升級 v1.2 → v1.3，清空 parameters | `n8n_workflow_export.json` | 已完成，未驗證 |

### 5. SQL Schema 更新

| # | 項目 | 檔案 | 狀態 |
| --- | --- | --- | --- |
| 5.1 | 表名 settings → app_settings | `supabase_schema.sql` | 已完成，未驗證 |
| 5.2 | 補齊所有實際使用欄位 | `supabase_schema.sql` | 已完成，未驗證 |
| 5.3 | 移除 Supabase RLS/storage 語法 | `supabase_schema.sql` | 已完成，未驗證 |

### 6. Docker / 開發環境

| # | 項目 | 檔案 | 狀態 |
| --- | --- | --- | --- |
| 6.1 | 新增 dev 容器 (Vite HMR + tsx watch) | 新增 `Dockerfile.dev` | 已完成，未驗證 |
| 6.2 | docker-compose 加入 app-dev service | `docker-compose.yml` | 已完成，未驗證 |
| 6.3 | dev port 改 3011 避免與 prod 3010 衝突 | `docker-compose.yml` | 已完成，未驗證 |
| 6.4 | Vite 設定加 host/polling for Docker | `vite.config.ts` | 已完成，未驗證 |

### 7. 文件整理

| # | 項目 | 檔案 | 狀態 |
| --- | --- | --- | --- |
| 7.1 | 使用手冊全面重寫 | `ai-customer-service-docs/USER_GUIDE.md` | 已完成 |
| 7.2 | SKILL/LESSON 集中到 RD-Skills | `RD-Skills/docs/` | 已完成 |
| 7.3 | RD-Skills 索引更新 | `RD-Skills/SKILL.md` | 已完成 |

---

## V&V 驗證計畫

### Phase 1: 基礎環境驗證 (Infra)

| # | 測試項目 | 驗證方法 | 預期結果 | 通過 |
| --- | --- | --- | --- | --- |
| V1.1 | Production 容器啟動 | `docker-compose up -d --build app` | 容器 running，無 error log | PASS |
| V1.2 | Dev 容器啟動 | `docker-compose up -d app-dev` | Vite ready + Server listening | PASS |
| V1.3 | 兩容器同時運行不衝突 | `docker ps` 確認 3010 + 5173 + 3011 | 三個 port 都能回應 | PASS |
| V1.4 | Production 首頁可存取 | `curl http://localhost:3010/` | 200，回傳 index.html | PASS |
| V1.5 | Dev 首頁可存取 | `curl http://localhost:5173/` | 200，回傳 Vite 頁面 | PASS |

### Phase 2: API 端點驗證 (Backend)

| # | 測試項目 | 驗證方法 | 預期結果 | 通過 |
| --- | --- | --- | --- | --- |
| V2.1 | GET /api/settings | `curl http://localhost:3010/api/settings` | 200，回傳 app_settings JSON | PASS |
| V2.2 | POST /api/settings (永久保存) | `curl -X POST -H "Content-Type: application/json" -d '{"system_prompt":"test"}' http://localhost:3010/api/settings` | 200，回傳 success | PASS |
| V2.3 | POST /api/reset-handover | `curl -X POST http://localhost:3010/api/reset-handover` | 200，回傳 success | PASS |
| V2.4 | GET /api/user_states | `curl "http://localhost:3010/api/user_states?is_human_mode=true"` | 200，回傳 JSON array | PASS |
| V2.5 | POST /api/user_states (轉回 AI) | `curl -X POST -H "Content-Type: application/json" -d '{"is_human_mode":false,"line_user_id":"test"}' http://localhost:3010/api/user_states` | 200，回傳 updated row | PASS |
| V2.6 | POST /api/logs/add | `curl -X POST -H "Content-Type: application/json" -d '{"line_user_id":"test","role":"user","content":"hello"}' http://localhost:3010/api/logs/add` | 201，回傳新紀錄 | PASS (rebuild 後) |
| V2.7 | GET /api/logs/search | `curl "http://localhost:3010/api/logs/search"` | 200，回傳 JSON array | PASS (rebuild 後) |
| V2.8 | POST /api/auth/login | `curl -X POST -H "Content-Type: application/json" -d '{"email":"admin@tigerai.tw","password":"admin123"}' http://localhost:3010/api/auth/login` | 200，回傳 success + user | PASS |

### Phase 3: 前端功能驗證 (UI)

| # | 測試項目 | 驗證方法 | 預期結果 | 通過 |
| --- | --- | --- | --- | --- |
| V3.1 | 登入頁面 | 瀏覽器打開 localhost:5173/login，輸入帳密 | 成功登入，跳轉 Dashboard | |
| V3.2 | Layout 滿版 | 觀察 Dashboard 內容區域 | 無過大的左右留白 | |
| V3.3 | AI 模型切換 | 點選 OpenAI / Gemini / Ollama 卡片 | 下方設定區對應切換 | |
| V3.4 | 永久保存 | 修改任一欄位 → 點「永久保存」 | alert 成功，最後更新時間刷新 | |
| V3.5 | 最後更新時間顯示 | 保存後觀察按鈕旁 | 顯示正確的時間戳 | |
| V3.6 | LINE Webhook URL 顯示 | 第三層觀察 | 顯示 `http://localhost:3010/api/line/webhook`，可複製 | |
| V3.7 | 專人客服頁面載入 | 點左側「專人客服」 | 顯示表格，無 loading 卡住 | |
| V3.8 | 專人客服「轉回 AI」 | 有資料時點按鈕 | alert 成功，列表刷新 | |
| V3.9 | 一鍵歸還給 AI | Dashboard 第三層點按鈕 | alert 成功 | |
| V3.10 | 對話監控站搜索 | 點「全量追蹤」 | 顯示對話紀錄 | |
| V3.11 | 登出 | 點左下「登出」 | 跳回登入頁 | |

### Phase 4: Hot Reload 驗證 (Dev Mode)

| # | 測試項目 | 驗證方法 | 預期結果 | 通過 |
| --- | --- | --- | --- | --- |
| V4.1 | 前端 HMR | 修改 Dashboard.tsx 的文字 → 存檔 | 瀏覽器 5173 即時更新，不用 F5 | |
| V4.2 | 後端 watch | 修改 server route 的 console.log → 存檔 | docker logs 顯示 server 重啟 | |
| V4.3 | Vite proxy 轉發 | 在 5173 操作永久保存 | API 正確轉發到後端 3000 | |

### Phase 5: n8n Workflow 驗證 (End-to-End)

| # | 測試項目 | 驗證方法 | 預期結果 | 通過 |
| --- | --- | --- | --- | --- |
| V5.1 | Import workflow | n8n 後台 Import n8n_workflow_export.json | 導入成功，無錯誤 | |
| V5.2 | 節點連接完整性 | 在 n8n 畫布上檢查 | 無斷線、無孤立節點 | |
| V5.3 | Webhook 接收 | LINE 發訊息到 Bot | n8n execution 有觸發 | |
| V5.4 | AI 回覆正常 | 發一般問題 | LINE 收到 AI 回覆 | |
| V5.5 | 轉接觸發 | 發「客服」關鍵字 | 用戶收到「已為您轉接」+ 管理員收到推播 | |
| V5.6 | 真人模式靜默 | 轉接後再發訊息 | AI 不回覆 | |
| V5.7 | 超時恢復 | 等超過設定時間後再發 | AI 恢復回覆 | |
| V5.8 | 對話記錄寫入 | 檢查 chat_logs 表 | user + ai 兩筆記錄 | |

---

## 建議驗證順序

```
Phase 1 (Infra)     ← 先確保容器能跑
    ↓
Phase 2 (API)       ← 確保後端端點都通
    ↓
Phase 3 (UI)        ← 確保前端功能正常
    ↓
Phase 4 (Hot Reload) ← 確保開發環境可用
    ↓
Phase 5 (E2E)       ← 最後跑完整 LINE → n8n → AI 流程
```

Phase 1-4 可以在本機完成，Phase 5 需要 LINE Bot + n8n 都正確設定才能測。

---

## V&V 執行紀錄

### 2026-03-29 18:42 — Phase 1 + Phase 2 自動化驗證

**執行者**: Claude Code (自動化)

**Phase 1 結果**: 5/5 PASS
- 所有容器 running，port 無衝突，首頁均可存取

**Phase 2 結果**: 8/8 PASS
- V2.6 和 V2.7 首次 FAIL（Production 容器未包含 logs 路由修正）
- 執行 `docker-compose up -d --build app` 後重測 PASS
- 測試資料已清理

**待驗證**: Phase 3 (UI 手動) / Phase 4 (Hot Reload) / Phase 5 (LINE E2E)

---

## 備註

- n8n workflow JSON 修改後需要重新 Import 到 n8n (`localhost:5678`)
- Production 程式碼修改後需要 `docker-compose up -d --build app`
- Dev 模式前端改動即時生效，後端改動自動重載，新增檔案需 `docker-compose restart app-dev`