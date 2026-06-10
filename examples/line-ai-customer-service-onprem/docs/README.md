# 🤖 企業級 AI 客服系統 (Local Edge 版)

這是一個將原專案遷移至地端架構的人生化客服版本，移除雲端依賴，改為高性能、隱密的本地服務。

## 🌟 亮點
- **Express.js 後端**: 極速處理 Webhook。
- **Redis 全局快取**: 高效防重複處理 (Deduplication)。
- **Vector RAG (Qdrant)**: 支援解析與檢索大型 PDF 知識庫。
- **地端模型支援**: 完美整合 Ollama 運行本地模型。
- **現代化後台**: 使用 React + TailwindCSS 提供極致視覺體驗。

## 📂 快速指南
請參考 `./` 目錄下的文件進行深度設定：
1. [安裝手冊](./INSTALLATION_GUIDE.md) - 如何在 Docker 啟動。
2. [用戶手冊](./USER_GUIDE.md) - 如何操作 AI 客服後台。
3. [系統設計](./SDD.md) - 技術架構與資料模型。
4. [踩雷筆記](./LESSON_LEARNED.md) - 分享部署心得。
5. [安裝 Skill](./SKILL.md) - 給 AI 代理程式使用的 Skill 文件。

## 🚀 快速啟動
```bash
docker-compose up -d --build
```
> 地址：http://localhost:3010

---

## 🏗️ 技術棧 (Stack)
- **Frontend**: React, Lucide Icons, Tailwind CSS.
- **Backend**: Node.js, Express.js (v5), tsx.
- **Database**: PostgreSQL (adm/tigerai).
- **Cache**: Redis.
- **Vector DB**: Qdrant.
- **AI Providers**: OpenAI, Gemini, Ollama.

---

## 📜 免責聲明
本專案僅供學習與內部部署使用。請確保遵循相關 API 供應商之條款。
