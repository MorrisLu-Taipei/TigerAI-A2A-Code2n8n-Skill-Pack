# Sticky Note Cookbook — 範例索引

> 🌐 [English](00-INDEX.en.md) | **繁體中文**

> 不知道怎麼寫便利貼？從本索引找最接近你需求的範例，照抄「🌱 自然語言版」貼進 n8n，AI 就能產出完整 workflow。

每個範例都有兩種寫法：
1. **🌱 自然語言版（推薦）** — 像跟同事講話那樣描述，不會程式也能用
2. **📐 進階 DSL 寫法（折疊）** — 給工程師 / 嚴謹規格使用，**不熟技術完全可跳過**

> 🌏 **想看 8 個範例的中英文便利貼並列對照表？** → [`STICKY-EXAMPLES-BILINGUAL.md`](STICKY-EXAMPLES-BILINGUAL.md)（一頁看完，挑語言複製）
>
> 🚀 **第一次用？** 直接匯入起手式 JSON 就有現成黃色便利貼可填 → [`_starter-README.md`](_starter-README.md)（含空白版與雙語提示模板版）
>
> ✅ **想要拿一個保證跑過的完整 workflow 當參考？** → [`_runnable-README.md`](_runnable-README.md)（2 個 R3 真實環境驗證 curl 200 + execution success 的版本）

範例頁面內容：
- **使用情境** — 什麼時候用這個
- **便利貼內容**（自然語言＋折疊 DSL）
- **AI 會產生的節點** — 預期的中間 workflow
- **AI 會回寫的說明** — 包括 credentials、假設、限制

---

| # | 範例 | 適用情境 | 主要節點 |
|---|---|---|---|
| 01 | [Webhook → Slack 通知](01-webhook-to-slack.md) | 接收外部事件，立即通知團隊 | webhook, slack |
| 02 | [定時抓資料 → Email 報表](02-schedule-report.md) | 每日/每週統計報表自動寄送 | scheduleTrigger, httpRequest, code, gmail |
| 03 | [Form → 驗證 → 寫入資料庫](03-form-to-database.md) | 表單收集資料，寫入後端系統 | formTrigger, if, postgres |
| 04 | [AI 分類 → 條件分支](04-ai-classify-route.md) | 收信/收訊息後 AI 分類自動處理 | webhook, openAi（langchain 套件）, switch |
| 05 | [檔案處理 Pipeline](05-file-process-pipeline.md) | PDF/MP3/圖片切分、轉檔、上傳 | formTrigger, httpRequest (FastAPI Worker), code |
| 06 | [錯誤處理與重試模式](06-error-retry-pattern.md) | API 不穩需要 retry / 失敗回報 | wait, errorTrigger, slack |
| 07 | [多來源合併](07-multi-source-merge.md) | 同時從多 API 拉資料合併輸出 | merge, set, splitInBatches |
| 08 | [迴圈批次處理](08-loop-batch-processing.md) | 批次處理大量項目（每筆/每頁）| splitInBatches, set, sendGrid, if, wait |

---

## 怎麼選範例？

```
我要做的事 …                     →  選範例
接收外部事件就觸發              →  01 / 04
時間到自動執行                   →  02
使用者填表單後處理              →  03
要 AI 判斷後分流                →  04
處理上傳的檔案                   →  05
需要重試或失敗通知              →  06
要從多個地方取資料合併          →  07
要對「每一筆」做一樣的處理      →  08
```

> 找不到？混合使用。例如「每天定時抓 100 筆 → AI 分類 → 寫 DB」= 02 + 04 + 08 + 03 的組合。把對應的 Layer 1 區塊全部寫進你的 sticky note 即可。
