# Phase 4：語意索引（已取代）

> 🌐 [English](PHASE-4-EMBEDDING-INDEX.en.md) | **繁體中文**

> **狀態：已取代。** 本檔原本記錄的語意索引設計，對象是 repo 內的 `reference-workflows/`；該語料已於 2026-11-06 自 repo 移除，原設計不再適用，內容也不再保留。

---

## 現在的做法

- **索引改在使用者本機建立與維護**，repo 不收錄任何索引、向量或範本內容。
- **範例查詢改為使用者同意後即時搜尋 n8n.io**：需要找參考範本時，先徵得使用者同意，再到 n8n.io 即時搜尋；使用後只需告訴使用者參考了哪個範本（編號、標題與官方網址）。
- Skill 本身只帶「已消化的知識」：骨架模式見 [`patterns.md`](patterns.md)，節點與品質統計見 [`node-frequency.md`](node-frequency.md)。
- 產生 workflow 時，一律用目前版本的節點重新建構，不複製範本。

## 為什麼取代

- 範本沒有開源授權，受 n8n 條款與作者分享條款約束，repo 不應收錄範本內容或其衍生索引。
- 資料來源改為 n8n.io 官方公開範本（13,947 個），方法、偏誤與授權立場見 [`n8n-templates-method.md`](n8n-templates-method.md)。
- 索引放在本機，可以隨使用者的需求自行更新，不必綁在 Pack 的版本裡。
