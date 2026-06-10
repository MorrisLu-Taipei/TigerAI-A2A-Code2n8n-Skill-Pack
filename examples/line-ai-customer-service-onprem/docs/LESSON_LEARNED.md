# 📝 AI 客服系統遷移與部屬 - Lesson Learned

本文件紀錄了在遷移與部屬過程中所遇到的技術挑戰、解決方案與建議的最佳實務 (Best Practices)。

## ⚠️ 1. 埠口衝突處理 (Port Collision)
- **問題**：原本預設使用 `3000` 埠口，但地端環境已運行 `Open-WebUI` 且使用了該埠口，導致 Docker 服務衝突。
- **解決**：將本服務外部映射埠口改為 **`3010`** (`3010:3000`)。
- **Lessons**：地端平行部屬多個 AI 工具時，務必建立 **TigerAI Port Mapping 表** 以防衝突。

## ⚠️ 2. Express v5 路由語法變更 (Wildcard Routing)
- **問題**：系統使用的是 Express v5，其對於萬用字元 `*` 的處理與 v4 不同。在 v5 中，`*` 必須具備名稱 (`:splat*`) 或使用 Regex 否則會崩潰。
- **解決**：將前端 React 的 SPA 路由 fallback 改為 **正規表示式 `/.*/`**。
- **Lessons**：現代化的 Node.js 專案若使用最新的 npm packages，務必測試其底層語法變更。

## ⚠️ 3. ESM 模組與 TypeScript 執行 (Node Loader)
- **問題**：在 ESM (`"type": "module"`) 環境下，使用 `ts-node` 執行 `.ts` 檔案容易發生 Loader 錯誤，導致容器退出的 `ERR_UNKNOWN_FILE_EXTENSION`。
- **解決**：遷移至 **`tsx`** 執行引擎。`tsx` 具備卓越的 ESM 支援且無需複雜配置即可正確處理 TypeScript。
- **Lessons**：地端部屬建議優先使用 `tsx` 作為 Node/TypeScript 的執行器以提高穩定性。

## ⚠️ 4. 共用資料庫憑證 (Database Credentials)
- **問題**：預設使用 `postgres/postgres` 導致 `password authentication failed`。
- **解決**：檢查現有 Postgres 容器的環境變數，確認應使用 `adm/tigerai/tigerai`。
- **Lessons**：遷移至共用環境時，務必先執行 `docker inspect` 確認目標資料庫的使用者與密碼。

## ⚠️ 5. 共用 Redis 的設計思考 (Global Cache)
- **問題**：Redis 應從單一專案容器抽離，形成全局緩存層。
- **解決**：在 `docker-compose.yml` 中將 Redis 連結至外部現有容器，並移除本地 Redis 定義，交由地端全局腳本維運。
- **Lessons**：地端基礎設施 (Redis, Postgres, Qdrant) 應定義為 **Global Stack** 以降低多專案時的資源浪費。

---

## 💡 總結建議
- **初始化檢查清單**：在啟動前務必執行 `docker ps` 與 `docker inspect postgres` 檢查環境。
- **部署工具鏈**：推薦使用 `docker-compose up -d --build` 確保編譯器模擬層 (`tsc` & `vite build`) 正確執行。
- **日誌監控**：若網頁連不上，第一步應執行 `docker logs <container_name>` 查看是否有 `PathError` 或連線逾時。
