# Node Frequency 統計（n8n.io 公開範本）

> 🌐 [English](node-frequency.en.md) | **繁體中文**

> **樣本**：13,947 個 n8n.io 公開範本，解析失敗 0 筆。
> **來源**：n8n 官方公開 API（`https://api.n8n.io/api/templates`），2026-11-05 至 2026-11-06 慢速抓取。索引回報總數 14,013，去重後有 13,947 個唯一 ID，這 13,947 個範本以錨點清單比對全數到齊、失敗 0 筆（差異與方法見 [`n8n-templates-method.md`](n8n-templates-method.md)）。
> **解讀方式**：「N」= **出現該節點的範本數**，不是節點實例數；一個範本裡放了 10 個 `set`，只算 1 次。例外：§7 憑證類型的計數是「節點綁定次數」，該節另有說明。
> **性質**：以下全是描述性統計，反映「社群與官方公開範本長什麼樣子」，不是最佳實務清單，也不是品質認證。AI 產生 workflow 時，要用目前版本的節點重新建構，不是照抄範本。本 repo 只收統計數字，不收任何範本內容。

---

## 1. 總覽指標

| 指標 | 值 |
|---|---|
| 範本總數 | 13,947 |
| 節點總數（實例） | 310,179 |
| 獨立 node type 數 | **1,225** |
| 每個範本的節點數 | 中位數 19、平均 22.2、P90 39 |
| 含 stickyNote 的範本 | **12,978（93.1%）** |
| 不含 stickyNote 的範本 | 969（6.9%） |
| stickyNote 總張數 | 81,106（每個範本中位數 5 張；有 sticky 的範本平均 6.2 張） |
| 含節點層級或全域錯誤處理的範本 | 3,465（**24.8%**）；定義見 §9 |
| 含 AI（LangChain 系列）節點的範本 | 7,612（54.6%） |
| 建立於 2025–2026 年的範本 | 12,789（91.7%）；樣本偏新，見 §11 |

### 關鍵觀察
- 絕大多數公開範本都有 stickyNote 註解（93.1%），多區塊註解是常態；Layer 1 / Layer 3 允許多張 sticky 符合慣例。但這也反映「公開範本是寫給別人看的」，不代表一般內部 workflow 也有這個比例。
- 只有 24.8% 的範本有任何形式的錯誤處理，這是 AI 要主動補強的弱點，Layer 3 的「已知限制」段必須提醒。
- 範本偏大：節點數中位數 19、P90 為 39；不能把範本規模直接當成 AI 的預設上限（見 §2）。

---

## 2. 範本規模分布

| 桶 | 節點數 | 範本數 | 比例 |
|---|---|---|---|
| tiny | ≤ 3 | 315 | 2.3% |
| small | 4–7 | 897 | 6.4% |
| medium | 8–15 | 3,842 | 27.5% |
| large | 16–30 | 6,233 | 44.7% |
| xlarge | 31+ | 2,660 | 19.1% |

> **設計含意**：63.8% 的範本超過 15 個節點（large + xlarge），36.2% 在 15 個以內。範本為了展示完整情境而偏大，這**不是**「越大越好」的證據。本 Pack 的拆分準則（單線型 ≤ 15、分流型 ≤ 25 個節點時建議拆 sub-workflow）是維護性考量，不是從這份統計推出來的，詳見 [`patterns.md`](patterns.md) §5。

---

## 3. 觸發器 Top

觸發器判定：node type 以 `Trigger` 結尾，或是 `webhook`、舊版 `cron`。一個範本可以有多個觸發器，所以比例加總會超過 100%。

| 排名 | Trigger | N（範本數） | 占全部範本 |
|---|---|---|---|
| 1 | `scheduleTrigger` | 4,571 | 32.8% |
| 2 | `manualTrigger` | 3,324 | 23.8% |
| 3 | `webhook` | 2,775 | 19.9% |
| 4 | `formTrigger` | 1,635 | 11.7% |
| 5 | `telegramTrigger` | 832 | 6.0% |
| 6 | `lc:chatTrigger` | 771 | 5.5% |
| 7 | `executeWorkflowTrigger` | 577 | 4.1% |
| 8 | `gmailTrigger` | 553 | 4.0% |
| 9 | `errorTrigger` | 428 | 3.1% |
| 10 | `googleDriveTrigger` | 318 | 2.3% |
| 11 | `lc:mcpTrigger` | 309 | 2.2% |
| 12 | `googleSheetsTrigger` | 274 | 2.0% |
| 13 | `cron` | 244 | 1.7% |
| 14 | `whatsAppTrigger` | 160 | 1.1% |
| 15 | `slackTrigger` | 98 | 0.7% |

### 觸發器組合 Top 8

依範本內「不重複觸發器集合」統計，每個範本只落在一種組合。

| 排名 | 觸發器組合 | 範本數 | 占全部範本 |
|---|---|---|---|
| 1 | 只有 `scheduleTrigger` | 2,772 | 19.9% |
| 2 | 只有 `manualTrigger` | 1,898 | 13.6% |
| 3 | 只有 `webhook` | 1,738 | 12.5% |
| 4 | 只有 `formTrigger` | 1,177 | 8.4% |
| 5 | `manualTrigger` + `scheduleTrigger` | 585 | 4.2% |
| 6 | 只有 `telegramTrigger` | 539 | 3.9% |
| 7 | 只有 `lc:chatTrigger` | 378 | 2.7% |
| 8 | 只有 `gmailTrigger` | 348 | 2.5% |

另有 156 個範本（1.1%）完全沒有觸發器，可能是被其他流程呼叫的片段，或僅供展示。

> **設計含意**：
> - `scheduleTrigger`（32.8%）是最常見的觸發器，其次是 `manualTrigger`、`webhook`、`formTrigger`。
> - 只有 `manualTrigger` 的範本有 1,898 個（13.6%）：多為教學或展示，需要人手點一下才會跑，不適合直接當成長期運作的流程。
> - 舊版 `cron` 仍出現在 244 個範本；與 `scheduleTrigger` 並存時，AI 一律用 `scheduleTrigger`（見 §10）。

---

## 4. Top 40 最常用 Node Types

N = 出現該節點的範本數（不是節點實例數）。`@n8n/n8n-nodes-langchain.*` 系列以 `lc:` 前綴縮寫。

| 排名 | Node Type | N（範本數） | 占全部範本 | 角色 |
|---|---|---|---|---|
| 1 | `stickyNote` | 12,978 | 93.1% | 註解 |
| 2 | `code` | 8,423 | 60.4% | 自訂 JS/Python |
| 3 | `set` | 7,850 | 56.3% | 設欄位／整形資料 |
| 4 | `httpRequest` | 7,231 | 51.8% | API 呼叫 |
| 5 | `if` | 7,175 | 51.4% | 二分條件 |
| 6 | `googleSheets` | 5,062 | 36.3% | 試算表 |
| 7 | `scheduleTrigger` | 4,571 | 32.8% | 排程觸發 |
| 8 | `lc:agent` | 4,336 | 31.1% | AI Agent |
| 9 | `manualTrigger` | 3,324 | 23.8% | 手動觸發 |
| 10 | `lc:lmChatOpenAi` | 3,260 | 23.4% | OpenAI 聊天模型 |
| 11 | `gmail` | 3,248 | 23.3% | Email |
| 12 | `webhook` | 2,775 | 19.9% | HTTP 觸發 |
| 13 | `merge` | 2,646 | 19.0% | 多輸入合併 |
| 14 | `wait` | 2,494 | 17.9% | 等待／限速 |
| 15 | `slack` | 2,394 | 17.2% | 通訊 |
| 16 | `splitInBatches` | 2,361 | 16.9% | 批次迴圈 |
| 17 | `lc:outputParserStructured` | 2,294 | 16.4% | 結構化輸出解析 |
| 18 | `switch` | 2,229 | 16.0% | 多分支 |
| 19 | `telegram` | 1,717 | 12.3% | 通訊 |
| 20 | `formTrigger` | 1,635 | 11.7% | 表單觸發 |
| 21 | `lc:openAi` | 1,608 | 11.5% | OpenAI 動作節點 |
| 22 | `splitOut` | 1,603 | 11.5% | 拆陣列 |
| 23 | `lc:chainLlm` | 1,518 | 10.9% | 基本 LLM 鏈 |
| 24 | `googleDrive` | 1,488 | 10.7% | 雲端檔案 |
| 25 | `noOp` | 1,446 | 10.4% | 占位／收斂分支 |
| 26 | `respondToWebhook` | 1,408 | 10.1% | Webhook 回應 |
| 27 | `filter` | 1,348 | 9.7% | 過濾 |
| 28 | `lc:lmChatGoogleGemini` | 1,311 | 9.4% | Gemini 聊天模型 |
| 29 | `aggregate` | 1,289 | 9.2% | 彙總 |
| 30 | `lc:memoryBufferWindow` | 1,098 | 7.9% | 對話記憶（視窗） |
| 31 | `extractFromFile` | 835 | 6.0% | 讀檔 |
| 32 | `telegramTrigger` | 832 | 6.0% | Telegram 觸發 |
| 33 | `lc:chatTrigger` | 771 | 5.5% | 對話觸發 |
| 34 | `emailSend` | 753 | 5.4% | 寄信（SMTP） |
| 35 | `dataTable` | 589 | 4.2% | n8n 內建資料表 |
| 36 | `executeWorkflowTrigger` | 577 | 4.1% | 子流程入口 |
| 37 | `lc:lmChatOpenRouter` | 553 | 4.0% | OpenRouter 聊天模型 |
| 38 | `gmailTrigger` | 553 | 4.0% | Gmail 觸發 |
| 39 | `convertToFile` | 529 | 3.8% | 轉成檔案 |
| 40 | `airtable` | 504 | 3.6% | 雲端資料庫 |

> **設計含意**：`code`、`set`、`httpRequest`、`if` 四個通用節點幾乎是每個流程的底盤；AI 節點 `agent` 已排進前 10。DSL 標籤對應表（`sticky-note-dsl.md` §4）應優先涵蓋這 40 個。

### 結構性節點：高頻但容易被忽略

| Node | 用途 | N（範本數） | 占全部範本 | AI 何時要主動加 |
|---|---|---|---|---|
| `set` | 整形資料 | 7,850 | 56.3% | 跨節點欄位轉換時 |
| `noOp` | 分支收斂 | 1,446 | 10.4% | if/switch 後想合流時 |
| `merge` | 多輸入合併 | 2,646 | 19.0% | 平行分支結束 |
| `splitOut` | 陣列拆單筆 | 1,603 | 11.5% | 上游回 array、下游要逐筆 |
| `aggregate` | 收集迴圈結果 | 1,289 | 9.2% | splitInBatches 後要回合 |
| `respondToWebhook` | Webhook 回應 | 1,408 | 10.1% | webhook trigger 需要回覆呼叫端時 |
| `stopAndError` | 主動拋錯 | 325 | 2.3% | 輸入不合規格、要讓錯誤流程接手時 |

---

## 5. 分類 Top

分類是 n8n.io 範本上的官方分類標籤，一個範本可以同時有多個分類，所以比例加總會超過 100%。

| 排名 | 分類 | N（範本數） | 占全部範本 |
|---|---|---|---|
| 1 | AI Summarization | 4,299 | 30.8% |
| 2 | Multimodal AI | 2,960 | 21.2% |
| 3 | Content Creation | 1,743 | 12.5% |
| 4 | Market Research | 1,686 | 12.1% |
| 5 | AI Chatbot | 1,677 | 12.0% |
| 6 | Document Extraction | 1,411 | 10.1% |
| 7 | Lead Generation | 1,085 | 7.8% |
| 8 | AI RAG | 944 | 6.8% |
| 9 | Social Media | 809 | 5.8% |
| 10 | Personal Productivity | 712 | 5.1% |
| 11 | Engineering | 663 | 4.8% |
| 12 | CRM | 662 | 4.7% |
| 13 | Support Chatbot | 640 | 4.6% |
| 14 | DevOps | 580 | 4.2% |
| 15 | Ticket Management | 572 | 4.1% |
| 16 | Lead Nurturing | 558 | 4.0% |
| 17 | Invoice Processing | 466 | 3.3% |
| 18 | HR | 379 | 2.7% |
| 19 | Crypto Trading | 345 | 2.5% |
| 20 | Project Management | 314 | 2.3% |

各大分類中最常出現的節點（已排除 `stickyNote`、`noOp`、`manualTrigger`），前五大分類如下：

| 分類 | 最常出現的節點（N） |
|---|---|
| AI Summarization | `code` 3,202, `set` 2,695, `if` 2,464, `httpRequest` 2,245, `googleSheets` 2,076, `scheduleTrigger` 1,794 |
| Multimodal AI | `httpRequest` 1,918, `code` 1,712, `set` 1,677, `if` 1,425, `lc:agent` 1,097, `googleSheets` 1,065 |
| Content Creation | `httpRequest` 1,303, `set` 1,080, `code` 1,070, `if` 891, `wait` 745, `lc:agent` 649 |
| Market Research | `code` 1,244, `set` 1,082, `httpRequest` 1,078, `googleSheets` 852, `scheduleTrigger` 851, `if` 758 |
| AI Chatbot | `lc:agent` 1,120, `set` 873, `if` 839, `code` 808, `lc:lmChatOpenAi` 700, `httpRequest` 646 |

> **設計含意**：分類以 AI 相關為主（AI Summarization、Multimodal AI、AI Chatbot、AI RAG），符合 §11 所示「樣本偏新、偏 AI」的特性；傳統整合類需求（CRM、Invoice Processing 等）的樣本相對少。

---

## 6. AI 節點 Top

含任一 `@n8n/n8n-nodes-langchain.*` 節點的範本共 7,612 個（54.6%）。下表 N 為範本數，比例的分母是全部 13,947 個範本。

| 排名 | 節點（省略 `@n8n/n8n-nodes-langchain.`） | N（範本數） | 占全部範本 |
|---|---|---|---|
| 1 | `agent` | 4,336 | 31.1% |
| 2 | `lmChatOpenAi` | 3,260 | 23.4% |
| 3 | `outputParserStructured` | 2,294 | 16.4% |
| 4 | `openAi` | 1,608 | 11.5% |
| 5 | `chainLlm` | 1,518 | 10.9% |
| 6 | `lmChatGoogleGemini` | 1,311 | 9.4% |
| 7 | `memoryBufferWindow` | 1,098 | 7.9% |
| 8 | `chatTrigger` | 771 | 5.5% |
| 9 | `lmChatOpenRouter` | 553 | 4.0% |
| 10 | `lmChatAnthropic` | 470 | 3.4% |
| 11 | `googleGemini` | 418 | 3.0% |
| 12 | `documentDefaultDataLoader` | 407 | 2.9% |
| 13 | `embeddingsOpenAi` | 353 | 2.5% |
| 14 | `informationExtractor` | 318 | 2.3% |
| 15 | `mcpTrigger` | 309 | 2.2% |
| 16 | `toolWorkflow` | 263 | 1.9% |
| 17 | `lmChatGroq` | 255 | 1.8% |
| 18 | `textSplitterRecursiveCharacterTextSplitter` | 243 | 1.7% |
| 19 | `toolThink` | 199 | 1.4% |
| 20 | `vectorStorePinecone` | 168 | 1.2% |

### 語言模型廠商占比

以含有任一語言模型節點（node type 以 `lm` 開頭，如 `lmChatOpenAi`）的 5,879 個範本為分母（占全部範本 42.2%）。同一範本可同時使用多家模型，所以加總會超過 100%。

| 廠商 | 對應節點 | N（範本數） | 占含語言模型節點的範本 |
|---|---|---|---|
| OpenAI | `lmChatOpenAi`, `lmOpenAi` | 3,264 | 55.5% |
| Google Gemini | `lmChatGoogleGemini` | 1,311 | 22.3% |
| OpenRouter | `lmChatOpenRouter` | 553 | 9.4% |
| Anthropic | `lmChatAnthropic` | 470 | 8.0% |
| Groq | `lmChatGroq` | 255 | 4.3% |
| Azure OpenAI | `lmChatAzureOpenAi` | 142 | 2.4% |
| Ollama | `lmChatOllama`, `lmOllama` | 99 | 1.7% |
| DeepSeek | `lmChatDeepSeek` | 61 | 1.0% |
| Mistral | `lmChatMistralCloud` | 58 | 1.0% |
| xAI Grok | `lmChatXAiGrok` | 21 | 0.4% |

另有不走 `lm*` 聊天模型節點、直接用廠商動作節點的做法：`openAi` 1,608 個範本、`googleGemini` 418 個範本。

> **設計含意**：模型廠商占比反映的是 2025–2026 年範本作者的選擇，會隨時間快速變動，不應拿來決定使用者該選哪家模型；模型由使用者的環境與合規要求決定。AI 結構（`agent` + 語言模型 + `memoryBufferWindow` + `outputParserStructured`）比廠商選擇更值得參考。

---

## 7. 憑證類型 Top 20

只列憑證**類型名稱**（例如 `googleSheetsOAuth2Api`），範本裡不會也不應該有任何實際憑證內容。**注意：這一節的計數是「節點綁定該憑證類型的次數」（節點實例），不是範本數**，所以不能與其他章節的 N 直接比較。

| 排名 | 憑證類型 | 節點綁定次數 |
|---|---|---|
| 1 | `googleSheetsOAuth2Api` | 6,743 |
| 2 | `openAiApi` | 5,553 |
| 3 | `gmailOAuth2` | 3,751 |
| 4 | `telegramApi` | 3,376 |
| 5 | `httpHeaderAuth` | 2,737 |
| 6 | `googleDriveOAuth2Api` | 2,109 |
| 7 | `googlePalmApi` | 2,086 |
| 8 | `slackApi` | 1,248 |
| 9 | `airtableTokenApi` | 1,118 |
| 10 | `googleApi` | 836 |
| 11 | `slackOAuth2Api` | 778 |
| 12 | `httpBearerAuth` | 716 |
| 13 | `postgres` | 700 |
| 14 | `openRouterApi` | 678 |
| 15 | `supabaseApi` | 622 |
| 16 | `notionApi` | 581 |
| 17 | `smtp` | 551 |
| 18 | `googleCalendarOAuth2Api` | 536 |
| 19 | `anthropicApi` | 496 |
| 20 | `blotatoApi` | 381 |

> **設計含意**：Google 系列（Sheets、Drive、Gmail）、OpenAI、Telegram、HTTP 標頭認證是最常需要使用者事先備妥的憑證。AI 產生 workflow 時，應在 Layer 3 列出「使用者需要自行建立哪些憑證」，但**不得**把任何憑證值寫進 workflow。

---

## 8. 節點共現 Top

以範本為單位計算「兩種節點同時出現」的範本數；已排除 `stickyNote`、`noOp`、`manualTrigger` 與所有觸發器，只看業務節點。

| 排名 | 節點對 | N（範本數） | 占全部範本 | 暗示的做法 |
|---|---|---|---|---|
| 1 | `code` + `if` | 5,140 | 36.9% | 自訂邏輯後分支 |
| 2 | `code` + `httpRequest` | 5,027 | 36.0% | API 加客製處理 |
| 3 | `code` + `set` | 4,941 | 35.4% | 程式處理後整形欄位 |
| 4 | `if` + `set` | 4,592 | 32.9% | 條件分支後整形 |
| 5 | `httpRequest` + `set` | 4,571 | 32.8% | 拉 API 後整形資料 |
| 6 | `httpRequest` + `if` | 4,125 | 29.6% | API 結果分流 |
| 7 | `code` + `googleSheets` | 3,625 | 26.0% | 程式處理後寫入試算表 |
| 8 | `googleSheets` + `if` | 3,059 | 21.9% | 依試算表資料分流 |
| 9 | `googleSheets` + `set` | 2,934 | 21.0% | 整形後寫入試算表 |
| 10 | `googleSheets` + `httpRequest` | 2,673 | 19.2% | API 資料同步到試算表 |
| 11 | `lc:agent` + `set` | 2,580 | 18.5% | Agent 前後整形 |
| 12 | `lc:agent` + `lc:lmChatOpenAi` | 2,524 | 18.1% | Agent 搭配 OpenAI 模型 |
| 13 | `lc:agent` + `code` | 2,462 | 17.7% | Agent 搭配程式處理 |
| 14 | `code` + `gmail` | 2,297 | 16.5% | 處理後寄信／讀信 |
| 15 | `lc:lmChatOpenAi` + `set` | 2,104 | 15.1% | 模型輸出整形 |

> 共現只說明「常一起出現」，不代表連線順序或因果；骨架層級的歸納見 [`patterns.md`](patterns.md)。

---

## 9. 品質訊號

這些是「範本裡有沒有做這件事」的訊號，不是「做得好不好」的評分。

### 9.1 註解覆蓋率

- 含 stickyNote：12,978 / 13,947（93.1%）。
- 不含 stickyNote：969（6.9%）。
- 每個範本 sticky 張數的中位數為 5。

### 9.2 錯誤處理

本統計把範本算作「有錯誤處理」的條件，是符合下列任一項：含 `errorTrigger` 節點、任一節點設了 `continueOnFail`、或任一節點的 `onError` 不是預設的 `stopWorkflow`。**`retryOnFail`（重試）另計，不併入這個定義。**

| 訊號 | 範本數 | 占全部範本 |
|---|---|---|
| 符合上述任一項（有錯誤處理） | **3,465** | **24.8%** |
| 含 `errorTrigger`（獨立的錯誤處理流程） | 428 | 3.1% |
| 任一節點的 `onError` 不是 `stopWorkflow` | 2,857 | 20.5% |
| 任一節點設了舊式 `continueOnFail` | 411 | 2.9% |
| 任一節點設了 `alwaysOutputData` | 2,579 | 18.5% |

### 9.3 節點層級 `onError` 設定分布

`onError` 是節點設定中「這個節點失敗時怎麼辦」的欄位。下表同時列節點數與範本數；節點數會被少數大型範本放大，判斷普及程度請看範本數。

| `onError` 值 | 節點數 | 範本數 | 占全部範本 |
|---|---|---|---|
| `continueRegularOutput` | 6,564 | 2,037 | 14.6% |
| `continueErrorOutput` | 3,021 | 1,180 | 8.5% |
| `stopWorkflow` | 113 | 15 | 0.1% |

- `continueRegularOutput`：失敗後繼續走一般輸出；`continueErrorOutput`：失敗後走專屬的錯誤輸出分支；`stopWorkflow`：停下整個流程（即預設行為，顯式寫出的很少）。
- `continueRegularOutput` 容易讓錯誤被默默吞掉，使用時要搭配後續檢查，不要當成「處理好了」。

### 9.4 重試設定

- 設了 `retryOnFail` 的節點：6,648 個，分布在 1,879 個範本（13.5%）。
- 其中 692 個範本只有重試、沒有上述任何錯誤處理。把「有錯誤處理或有重試」合併計算是 4,157 個範本（29.8%）。
- 含 `httpRequest` 的 7,231 個範本中，有錯誤處理的 2,237 個（30.9%）、有重試的 1,314 個（18.2%）、兩者至少其一的 2,680 個（37.1%）。外部 API 呼叫是最需要錯誤處理與重試的地方，但多數範本仍沒做。

### 9.5 流程控制節點

| 節點 | 範本數 | 占全部範本 |
|---|---|---|
| `splitInBatches` | 2,361 | 16.9% |
| `wait` | 2,494 | 17.9% |
| `executeWorkflow` | 310 | 2.2% |
| `stopAndError` | 325 | 2.3% |

> **設計含意**：`respondToWebhook` 只出現在 1,357 個範本，而含 `webhook` 的範本有 2,775 個（48.9% 有回應節點）。沒有 `respondToWebhook` 不代表沒有回應（Webhook 節點本身也有回應模式），但設計 webhook 流程時要明確決定「誰回應、何時回應、失敗時回什麼」。

---

## 10. 棄用節點與年份趨勢

以下節點已被較新的節點取代，AI 產出時一律使用新版（對應如表）。「出現在幾個範本」同樣是範本數。實際可用的節點與取代關係以使用者環境當時的 n8n 版本為準，產生前先確認目前的節點清單。

| 舊節點 | 範本數 | 占全部範本 | 改用 |
|---|---|---|---|
| `function` | 328 | 2.4% | `code` |
| `cron` | 244 | 1.7% | `scheduleTrigger` |
| `functionItem` | 34 | 0.2% | `code` |
| `start` | 10 | 0.1% | `manualTrigger` |
| `interval` | 10 | 0.1% | `scheduleTrigger` |
| 合計（至少含其一） | **522** | **3.7%** | |

### 依建立年份

| 建立年份 | 範本數 | 含棄用節點 | 占該年範本 |
|---|---|---|---|
| 2019 | 24 | 11 | 45.8% |
| 2020 | 307 | 62 | 20.2% |
| 2021 | 136 | 50 | 36.8% |
| 2022 | 143 | 58 | 40.6% |
| 2023 | 86 | 0 | 0.0% |
| 2024 | 462 | 6 | 1.3% |
| 2025 | 6,564 | 300 | 4.6% |
| 2026 | 6,225 | 35 | 0.6% |

> **解讀**：2019–2022 年的範本約兩成到近五成含棄用節點；2025 年降到 4.6%（300 / 6,564），2026 年降到 0.6%（35 / 6,225）。但近兩年仍有 335 個新範本沿用舊寫法，所以「範本出現某節點」不等於「該節點仍是建議用法」。年份是範本建立時間，不代表範本內的節點版本。

---

## 11. 建立年份分布

| 年份 | 範本數 | 占全部範本 |
|---|---|---|
| 2019 | 24 | 0.2% |
| 2020 | 307 | 2.2% |
| 2021 | 136 | 1.0% |
| 2022 | 143 | 1.0% |
| 2023 | 86 | 0.6% |
| 2024 | 462 | 3.3% |
| 2025 | 6,564 | 47.1% |
| 2026 | 6,225 | 44.6% |

> **提醒**：2025 與 2026 兩年合計 12,789 個，占 **91.7%**，樣本明顯偏新，也偏向 AI 應用。2019–2024 年的統計樣本少（合計 1,158 個），不要對舊年份的趨勢做過度解讀。2026 年只涵蓋到抓取日（2026-11-06）為止。

---

## 12. 如何使用這份統計

- **這是描述性統計**：說明公開範本的樣貌，不是最佳實務、也不是品質認證。出現頻率高不等於寫法正確。
- **產生 workflow 時要重新建構**：用目前版本、目前可用的節點與參數；不要複製範本，也不要因為舊範本常見就沿用棄用節點。
- **樣本偏新、偏 AI**：2025–2026 年占九成以上，數字不代表所有 n8n 使用情境。
- **範本內容不在本 repo**：需要看原始範本時，請使用者同意後即時到 n8n.io 搜尋；使用後只需告訴使用者參考了哪個範本。

---

**資料版本**：2026-11-06 彙整（13,947 個範本）。方法與限制見 [`n8n-templates-method.md`](n8n-templates-method.md)。
