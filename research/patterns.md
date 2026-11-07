# Workflow 骨架模式歸納（n8n.io 公開範本）

> 🌐 [English](patterns.en.md) | **繁體中文**

> 從 13,947 個 n8n.io 公開範本的節點組成與統計歸納出的常見骨架（資料版本：2026-11-06）。
> **這些是描述性統計與歸納出的做法，不是範本、也不是品質認證。** AI 產生 workflow 時，要用目前版本、目前可用的節點重新建構；範本只是被消化過的參考，不被複製使用。

---

## 1. 讀法與整體基準

- **「N」與比例**：骨架的數量是「符合該骨架條件的範本數」；占比的分母是全部 13,947 個範本。
- **骨架不是互斥的**：一個範本可以同時是「排程」又是「分批迴圈」，所以 14 類占比加總是 132.1%。分類規則只看節點組成（例如「含 `scheduleTrigger`」），不判斷連線順序。
- **整體基準**：節點數中位數 19（平均 22.2、P90 39）；sticky note 中位數 5 張；93.1% 含 sticky；24.8% 含任何錯誤處理（定義見 [`node-frequency.md`](node-frequency.md) §9）。
- **「含錯誤處理」的定義**：含 `errorTrigger`、任一節點設了 `continueOnFail`，或任一節點的 `onError` 不是預設的 `stopWorkflow`；重試（`retryOnFail`）不計入。
- **代表範本**：每類列出 3 個範本，挑選規則是節點數 6–25、有瀏覽數、依瀏覽數由高到低取前 3，只用來讓讀者知道「這類長什麼樣子」，高瀏覽數不等於寫法正確。

### 常見的業務節點組合

排除 `stickyNote`、`noOp`、`manualTrigger` 與觸發器後，最常一起出現的節點對（完整榜單見 [`node-frequency.md`](node-frequency.md) §8）：

| 節點對 | N（範本數） | 模式名 |
|---|---|---|
| `code` + `if` | 5,140 | 自訂邏輯後分支 |
| `code` + `httpRequest` | 5,027 | API + 客製邏輯 |
| `code` + `set` | 4,941 | 程式處理後整形 |
| `if` + `set` | 4,592 | 條件分支整形 |
| `httpRequest` + `set` | 4,571 | API 整形 |
| `httpRequest` + `if` | 4,125 | API 結果分流 |
| `code` + `googleSheets` | 3,625 | 處理後寫入試算表 |
| `googleSheets` + `if` | 3,059 | 依試算表資料分流 |

---

## 2. 14 個骨架

### 一覽

| 骨架 | 說明 | 範本數 | 占比 | 節點數中位數 | 含 sticky | 含錯誤處理 |
|---|---|---|---|---|---|---|
| `webhook-api` | Webhook 接收並回應 | 1,357 | 9.7% | 22 | 97.4% | 38.2% |
| `webhook-fire` | Webhook 接收（不回應內容） | 1,418 | 10.2% | 21 | 93.8% | 24.7% |
| `schedule` | 排程觸發 | 4,571 | 32.8% | 22 | 97.9% | 33.9% |
| `form` | 表單觸發 | 1,635 | 11.7% | 19 | 98.5% | 27.1% |
| `chat-agent` | 對話式 AI Agent | 641 | 4.6% | 19 | 95.3% | 16.2% |
| `agent-tools` | Agent 搭配工具 | 855 | 6.1% | 27 | 96.8% | 20.2% |
| `rag` | RAG（向量庫＋嵌入＋文件載入） | 395 | 2.8% | 28 | 99.2% | 24.1% |
| `telegram` | Telegram 機器人 | 832 | 6.0% | 25 | 95.2% | 22.4% |
| `gmail` | Gmail 觸發 | 553 | 4.0% | 21 | 98.4% | 24.8% |
| `subworkflow` | 可被呼叫的子流程 | 577 | 4.1% | 24 | 98.4% | 32.8% |
| `error-handler` | 錯誤處理流程 | 428 | 3.1% | 28 | 97.7% | 100.0% |
| `mcp-server` | MCP 伺服器 | 309 | 2.2% | 16 | 96.8% | 3.9% |
| `batch-loop` | 分批迴圈 | 2,361 | 16.9% | 23 | 97.5% | 37.6% |
| `wait` | 含等待節點 | 2,494 | 17.9% | 24 | 98.4% | 33.7% |

> 對照基準：全體 24.8% 含錯誤處理。`error-handler` 的 100.0% 是分類定義使然；其餘各類落在 3.9%（`mcp-server`）到 38.2%（`webhook-api`）之間，沒有任何一類超過四成。

### 2.1 `webhook-api`：Webhook 接收並回應

- **占比**：1,357 個範本（9.7%）
- **節點數中位數**：22（全體為 19）；含 sticky 97.4%
- **錯誤處理比例**：38.2%（全體為 24.8%）
- **典型節點組合**（占該類範本的比例）：`respondToWebhook` 100%、`webhook` 100%、`code` 74%、`if` 65%、`httpRequest` 57%、`set` 56%、`lc:agent` 31%、`googleSheets` 26%
- **常見形狀**（依上列節點歸納，非統計）：`webhook` → 檢查／分流（`if`、`code`）→ 處理（`httpRequest`、`set`、AI）→ `respondToWebhook`
- **怎麼用這個知識**：入口先做來源檢查（共用密鑰、簽章或標頭憑證），每一條分支（含失敗分支）都要走到回應節點，並決定逾時與錯誤時回什麼；不要讓呼叫端等到逾時。
- **代表範本**：
  - #2679《⚡AI-powered YouTube video summarization & analysis》（https://n8n.io/workflows/2679）
  - #2846《AI voice chatbot with ElevenLabs & OpenAI for customer service and restaurants》（https://n8n.io/workflows/2846）
  - #4484《Build a voice AI chatbot with ElevenLabs and InfraNodus knowledge experts》（https://n8n.io/workflows/4484）

### 2.2 `webhook-fire`：Webhook 接收（不回應內容）

- **占比**：1,418 個範本（10.2%）
- **節點數中位數**：21（全體為 19）；含 sticky 93.8%
- **錯誤處理比例**：24.7%（全體為 24.8%）
- **典型節點組合**（占該類範本的比例）：`webhook` 100%、`if` 64%、`code` 64%、`set` 63%、`httpRequest` 56%、`googleSheets` 37%、`lc:agent` 32%、`slack` 29%
- **常見形狀**（依上列節點歸納，非統計）：`webhook` → `if` / `code` / `set` → 通知或寫入（`slack`、`googleSheets`、AI Agent），沒有 `respondToWebhook`
- **怎麼用這個知識**：分類只看有沒有 `respondToWebhook` 節點，Webhook 節點自身的回應模式也算回應。先決定呼叫端要不要等結果；若平台要求快速確認收到，就先回應再處理長流程。入口同樣要做來源檢查。
- **代表範本**：
  - #1961《Slack chatbot powered by AI》（https://n8n.io/workflows/1961）
  - #2864《🐋🤖 DeepSeek AI agent + Telegram + LONG TERM memory 🧠》（https://n8n.io/workflows/2864）
  - #1938《Discord AI-powered bot》（https://n8n.io/workflows/1938）

### 2.3 `schedule`：排程觸發

- **占比**：4,571 個範本（32.8%）
- **節點數中位數**：22（全體為 19）；含 sticky 97.9%
- **錯誤處理比例**：33.9%（全體為 24.8%）
- **典型節點組合**（占該類範本的比例）：`scheduleTrigger` 100%、`code` 76%、`set` 63%、`if` 60%、`httpRequest` 58%、`googleSheets` 47%、`gmail` 32%、`lc:agent` 29%
- **常見形狀**（依上列節點歸納，非統計）：`scheduleTrigger` → 取資料（`httpRequest`、`googleSheets`）→ 整形與判斷（`code`、`set`、`if`）→ 輸出（`gmail`、試算表、AI）
- **怎麼用這個知識**：排程流程沒有人在旁邊看，所以要能重複執行而不重複寫入（記錄已處理的項目）、失敗時要通知，並明確設定時區與執行頻率；一律用 `scheduleTrigger`，不用舊版 `cron`。
- **代表範本**：
  - #8642《Generate AI viral videos with VEO 3 and upload to TikTok》（https://n8n.io/workflows/8642）
  - #4846《Generate AI videos with Google Veo3, save to Google Drive and upload to YouTube》（https://n8n.io/workflows/4846）
  - #8527《Learn n8n basics in 3 easy steps ✨》（https://n8n.io/workflows/8527）

### 2.4 `form`：表單觸發

- **占比**：1,635 個範本（11.7%）
- **節點數中位數**：19（全體為 19）；含 sticky 98.5%
- **錯誤處理比例**：27.1%（全體為 24.8%）
- **典型節點組合**（占該類範本的比例）：`formTrigger` 100%、`code` 63%、`httpRequest` 61%、`set` 56%、`if` 54%、`googleSheets` 41%、`lc:agent` 32%、`gmail` 29%
- **常見形狀**（依上列節點歸納，非統計）：`formTrigger` → 檢查欄位（`if`、`code`）→ 處理或寫入（`httpRequest`、`googleSheets`、AI）→ 通知（`gmail`）
- **怎麼用這個知識**：把表單欄位當成輸入契約：缺欄位、格式不對時要有明確分支；對外公開的表單要考慮被濫用，必要時加上來源或次數限制。
- **代表範本**：
  - #5148《Local chatbot with retrieval augmented generation (RAG)》（https://n8n.io/workflows/5148）
  - #2736《Summarize YouTube videos from transcript》（https://n8n.io/workflows/2736）
  - #5010《RAG Starter Template using Simple Vector Stores, Form trigger and OpenAI》（https://n8n.io/workflows/5010）

### 2.5 `chat-agent`：對話式 AI Agent

- **占比**：641 個範本（4.6%）
- **節點數中位數**：19（全體為 19）；含 sticky 95.3%
- **錯誤處理比例**：16.2%（全體為 24.8%）
- **典型節點組合**（占該類範本的比例）：`lc:agent` 100%、`lc:chatTrigger` 100%、`lc:memoryBufferWindow` 66%、`lc:lmChatOpenAi` 64%、`set` 46%、`code` 33%、`httpRequest` 30%、`if` 29%
- **常見形狀**（依上列節點歸納，非統計）：`chatTrigger` → `agent`（接語言模型、`memoryBufferWindow`、工具）→ 回覆
- **怎麼用這個知識**：只有一部分有錯誤處理，所以要主動補：模型或工具失敗時仍要回一句人話；記憶節點要設定會話識別，避免不同使用者的對話混在一起；在系統提示中寫清楚角色與界線。
- **代表範本**：
  - #6270《Build your first AI agent》（https://n8n.io/workflows/6270）
  - #2090《Chat with a database using AI》（https://n8n.io/workflows/2090）
  - #2753《RAG chatbot for company documents using Google Drive and Gemini》（https://n8n.io/workflows/2753）

### 2.6 `agent-tools`：Agent 搭配工具

- **占比**：855 個範本（6.1%）
- **節點數中位數**：27（全體為 19）；含 sticky 96.8%
- **錯誤處理比例**：20.2%（全體為 24.8%）
- **典型節點組合**（占該類範本的比例）：`lc:agent` 100%、`set` 68%、`lc:lmChatOpenAi` 68%、`httpRequest` 47%、`lc:memoryBufferWindow` 47%、`code` 44%、`if` 40%、`lc:outputParserStructured` 39%
- **常見形狀**（依上列節點歸納，非統計）：`agent` + 多個工具節點（`toolWorkflow`、`httpRequest` 等）+ 語言模型 + 記憶 + 輸出解析
- **怎麼用這個知識**：節點數中位數偏高，工具多了流程容易膨脹：每個工具的名稱與描述要寫清楚，讓模型知道何時該用；會寫入或刪除資料的工具要限縮權限，並考慮把複雜工具包成 sub-workflow。
- **代表範本**：
  - #2753《RAG chatbot for company documents using Google Drive and Gemini》（https://n8n.io/workflows/2753）
  - #8642《Generate AI viral videos with VEO 3 and upload to TikTok》（https://n8n.io/workflows/8642）
  - #2006《AI agent that can scrape webpages》（https://n8n.io/workflows/2006）

### 2.7 `rag`：RAG（向量庫＋嵌入＋文件載入）

- **占比**：395 個範本（2.8%）
- **節點數中位數**：28（全體為 19）；含 sticky 99.2%
- **錯誤處理比例**：24.1%（全體為 24.8%）
- **典型節點組合**（占該類範本的比例）：`lc:documentDefaultDataLoader` 100%、`lc:agent` 78%、`lc:embeddingsOpenAi` 70%、`set` 58%、`lc:textSplitterRecursiveCharacterTextSplitter` 58%、`lc:lmChatOpenAi` 56%、`code` 48%、`httpRequest` 47%
- **常見形狀**（依上列節點歸納，非統計）：`documentDefaultDataLoader` + 文字切分 + 嵌入（`embeddings*`）+ 向量庫（`vectorStore*`）+ `agent`／問答
- **怎麼用這個知識**：把「灌入資料」與「查詢」拆成兩條流程；嵌入模型與向量庫的維度、切分參數要記錄並保持一致，換模型就要重建索引；回答要能指出引用的來源段落。
- **代表範本**：
  - #2753《RAG chatbot for company documents using Google Drive and Gemini》（https://n8n.io/workflows/2753）
  - #1960《Ask questions about a PDF using AI》（https://n8n.io/workflows/1960）
  - #5148《Local chatbot with retrieval augmented generation (RAG)》（https://n8n.io/workflows/5148）

### 2.8 `telegram`：Telegram 機器人

- **占比**：832 個範本（6.0%）
- **節點數中位數**：25（全體為 19）；含 sticky 95.2%
- **錯誤處理比例**：22.4%（全體為 24.8%）
- **典型節點組合**（占該類範本的比例）：`telegramTrigger` 100%、`telegram` 96%、`set` 62%、`if` 57%、`lc:agent` 57%、`code` 55%、`httpRequest` 45%、`switch` 39%
- **常見形狀**（依上列節點歸納，非統計）：`telegramTrigger` → `switch`／`if` 分流（文字、語音、圖片）→ 處理（AI、`httpRequest`）→ `telegram` 回覆
- **怎麼用這個知識**：要處理文字以外的訊息型態（語音、圖片、貼圖）並給預設回覆；限制可使用機器人的對象（例如比對允許的聊天識別），避免陌生人觸發有成本或有副作用的動作。
- **代表範本**：
  - #2462《Angie, personal AI assistant with Telegram voice and text》（https://n8n.io/workflows/2462）
  - #8237《Personal life manager with Telegram, Google services & voice-enabled AI》（https://n8n.io/workflows/8237）
  - #1934《Telegram AI chatbot》（https://n8n.io/workflows/1934）

### 2.9 `gmail`：Gmail 觸發

- **占比**：553 個範本（4.0%）
- **節點數中位數**：21（全體為 19）；含 sticky 98.4%
- **錯誤處理比例**：24.8%（全體為 24.8%）
- **典型節點組合**（占該類範本的比例）：`gmailTrigger` 100%、`gmail` 74%、`code` 65%、`if` 64%、`set` 55%、`googleSheets` 48%、`lc:lmChatOpenAi` 38%、`lc:agent` 38%
- **常見形狀**（依上列節點歸納，非統計）：`gmailTrigger` → 分類或擷取（`code`、AI）→ 處理（`googleSheets`、`slack`）→ 回信或標記（`gmail`）
- **怎麼用這個知識**：要避免處理自己寄出的信而形成迴圈，處理過的信要標記或記錄；信件內容可能很長或含敏感資料，送進 AI 前先決定截取與遮蔽的範圍。
- **代表範本**：
  - #2740《Basic automatic Gmail email labelling with OpenAI and Gmail API》（https://n8n.io/workflows/2740）
  - #4722《Gmail AI Email Manager》（https://n8n.io/workflows/4722）
  - #1953《Suggest meeting slots using AI》（https://n8n.io/workflows/1953）

### 2.10 `subworkflow`：可被呼叫的子流程

- **占比**：577 個範本（4.1%）
- **節點數中位數**：24（全體為 19）；含 sticky 98.4%
- **錯誤處理比例**：32.8%（全體為 24.8%）
- **典型節點組合**（占該類範本的比例）：`executeWorkflowTrigger` 100%、`set` 75%、`code` 54%、`httpRequest` 52%、`if` 50%、`lc:agent` 48%、`lc:lmChatOpenAi` 36%、`lc:toolWorkflow` 33%
- **常見形狀**（依上列節點歸納，非統計）：`executeWorkflowTrigger` → 處理（`set`、`code`、`httpRequest`、AI）→ 回傳結果；常被 `toolWorkflow` 或其他流程呼叫
- **怎麼用這個知識**：把輸入與輸出欄位的約定寫在 sticky note 上；子流程失敗要把錯誤回傳給呼叫端，不要吞掉；拆分時以「單一職責、可獨立重跑」為準。
- **代表範本**：
  - #2006《AI agent that can scrape webpages》（https://n8n.io/workflows/2006）
  - #2786《Create a branded AI-powered website chatbot》（https://n8n.io/workflows/2786）
  - #2035《Telegram AI bot with LangChain nodes》（https://n8n.io/workflows/2035）

### 2.11 `error-handler`：錯誤處理流程

- **占比**：428 個範本（3.1%）
- **節點數中位數**：28（全體為 19）；含 sticky 97.7%
- **錯誤處理比例**：100.0%（全體為 24.8%）
- **典型節點組合**（占該類範本的比例）：`errorTrigger` 100%、`code` 80%、`if` 75%、`set` 64%、`slack` 58%、`scheduleTrigger` 55%、`gmail` 54%、`googleSheets` 53%
- **常見形狀**（依上列節點歸納，非統計）：`errorTrigger` → 整理錯誤資訊（`code`、`set`）→ 通知（`slack`、`gmail`）或記錄（`googleSheets`）
- **怎麼用這個知識**：這一類 100% 有錯誤處理是分類定義使然（含 `errorTrigger` 即計入），並不表示品質；相對地，整體只有約四分之一的範本有任何錯誤處理。建議做一支共用的錯誤流程，再讓其他 workflow 在設定中指向它，並讓通知附上流程名稱與失敗節點。
- **代表範本**：
  - #2894《Upload to Instagram, TikTok & YouTube from Google Drive》（https://n8n.io/workflows/2894）
  - #5787《From Google Drive to Instagram, TikTok & YouTube with AI descriptions & Airtable tracking》（https://n8n.io/workflows/5787）
  - #4474《Automate multi-channel customer support with Gmail, Telegram, and GPT AI》（https://n8n.io/workflows/4474）

### 2.12 `mcp-server`：MCP 伺服器

- **占比**：309 個範本（2.2%）
- **節點數中位數**：16（全體為 19）；含 sticky 96.8%
- **錯誤處理比例**：3.9%（全體為 24.8%）
- **典型節點組合**（占該類範本的比例）：`lc:mcpTrigger` 100%、`httpRequestTool` 24%、`lc:agent` 21%、`lc:mcpClientTool` 18%、`lc:memoryBufferWindow` 15%、`set` 13%、`lc:lmChatOpenAi` 13%、`lc:toolWorkflow` 13%
- **常見形狀**（依上列節點歸納，非統計）：`mcpTrigger` + 少量工具節點（`httpRequestTool`、`toolWorkflow` 等），常接 `agent`／`mcpClientTool`
- **怎麼用這個知識**：這一類最小、也最少做錯誤處理；工具會被外部 MCP 用戶端直接呼叫，要逐一盤點哪些工具會寫入或外洩資料，加上存取控制，並讓工具在失敗時回傳可讀的錯誤。
- **代表範本**：
  - #3905《Build a personal assistant with Google Gemini, Gmail and Calendar using MCP》（https://n8n.io/workflows/3905）
  - #3656《Ai-powered Telegram task manager with MCP server》（https://n8n.io/workflows/3656）
  - #3638《Build your own CUSTOM API MCP server》（https://n8n.io/workflows/3638）

### 2.13 `batch-loop`：分批迴圈

- **占比**：2,361 個範本（16.9%）
- **節點數中位數**：23（全體為 19）；含 sticky 97.5%
- **錯誤處理比例**：37.6%（全體為 24.8%）
- **典型節點組合**（占該類範本的比例）：`splitInBatches` 100%、`code` 73%、`set` 63%、`httpRequest` 61%、`if` 60%、`googleSheets` 47%、`scheduleTrigger` 47%、`wait` 37%
- **常見形狀**（依上列節點歸納，非統計）：取清單 → `splitInBatches` →（迴圈內）`httpRequest`／`code`／`set` →（常配 `wait`）→ `aggregate`／寫入
- **怎麼用這個知識**：迴圈裡呼叫外部服務時要注意速率限制：控制批次大小、必要時加 `wait`，並對單筆失敗設定重試或略過，避免一筆出錯拖垮整批；迴圈結束後記得收斂（`aggregate`）。
- **代表範本**：
  - #5385《Lead generation system: Google Maps to email scraper with Google Sheets export》（https://n8n.io/workflows/5385）
  - #5906《Automated job applications & status tracking with LinkedIn, Indeed & Google Sheets》（https://n8n.io/workflows/5906）
  - #1073《Scrape and store data from multiple website pages》（https://n8n.io/workflows/1073）

### 2.14 `wait`：含等待節點

- **占比**：2,494 個範本（17.9%）
- **節點數中位數**：24（全體為 19）；含 sticky 98.4%
- **錯誤處理比例**：33.7%（全體為 24.8%）
- **典型節點組合**（占該類範本的比例）：`wait` 100%、`httpRequest` 79%、`if` 71%、`code` 68%、`set` 65%、`googleSheets` 43%、`scheduleTrigger` 35%、`splitInBatches` 35%
- **常見形狀**（依上列節點歸納，非統計）：`wait` 搭配 `httpRequest`、`if`：等待非同步結果、輪詢，或在呼叫之間限速
- **怎麼用這個知識**：用於限速或等待非同步作業（影片、圖片產生等）時，輪詢要設次數或時間上限並有逾時分支，避免無限等待；長時間等待的流程要想清楚重啟後狀態如何保留。
- **代表範本**：
  - #8642《Generate AI viral videos with VEO 3 and upload to TikTok》（https://n8n.io/workflows/8642）
  - #4846《Generate AI videos with Google Veo3, save to Google Drive and upload to YouTube》（https://n8n.io/workflows/4846）
  - #2740《Basic automatic Gmail email labelling with OpenAI and Gmail API》（https://n8n.io/workflows/2740）

---

## 3. 反模式與過時寫法

以下是在公開範本中常見、但 AI 產生 workflow 時不應照搬的寫法。數字都是範本數，比例的分母是全部 13,947 個。

### 反模式 1：使用棄用節點
- 522 個範本（3.7%）含至少一個棄用節點：`function` 328、`cron` 244、`functionItem` 34、`start` 10、`interval` 10。
- 2025 年建立的 6,564 個範本中仍有 300 個（4.6%），2026 年的 6,225 個中有 35 個（0.6%）；趨勢在下降，但沒有歸零。
- **AI 規則**：一律使用新版節點（`code`、`scheduleTrigger`、`manualTrigger`），不因為範本裡出現就沿用。

### 反模式 2：缺錯誤處理
- 10,482 個範本（75.2%）沒有 `errorTrigger`、`continueOnFail`，也沒有任何非預設的 `onError`；含 `httpRequest` 的 7,231 個範本中，有錯誤處理的只有 30.9%，有重試的 18.2%。
- **AI 規則**：含 `httpRequest` 或其他外部呼叫的 workflow，必須在 Layer 3「已知限制」標註失敗時的行為；使用者沒寫 `@on-error` 時，主動建議補上，並依 `three-layer.md` §6 選模式。

### 反模式 3：缺少說明（沒有 sticky note）
- 969 個範本（6.9%）完全沒有 sticky note，使用者接手時只能逐個節點猜用途。整體中位數是 5 張。
- **AI 規則**：產出的 workflow 一律帶 Layer 1 / Layer 3 的說明 sticky note。

### 反模式 4：把只能手動啟動的流程當成長期運作
- 只有 `manualTrigger` 的範本有 1,898 個（13.6%），多為教學或展示。
- **AI 規則**：要長期自動運作的 workflow 不使用 `manualTrigger` 當唯一入口，除非使用者明示 `@trigger: manual`。

### 反模式 5：超大 workflow 不拆分
- 2,660 個範本（19.1%）超過 30 個節點，P90 為 39。節點多本身不是錯，但維護與除錯成本會上升。
- **AI 規則**：超出 §5 的節點數準則時，主動建議拆成 sub-workflow（`executeWorkflowTrigger`）。

---

## 4. 與 Cookbook 8 範例的對映

| Cookbook | 對應骨架 | 該骨架的範本數 |
|---|---|---|
| 01 webhook→slack | webhook-fire / webhook-api | 1,418 / 1,357 |
| 02 schedule-report | schedule | 4,571 |
| 03 form-to-database | form | 1,635 |
| 04 ai-classify-route | chat-agent / agent-tools / telegram | 641 / 855 / 832 |
| 05 file-process-pipeline | subworkflow / wait | 577 / 2,494 |
| 06 error-retry-pattern | error-handler | 428 |
| 07 multi-source-merge | schedule | 4,571 |
| 08 loop-batch-processing | batch-loop | 2,361 |

> 對映只表示「該 cookbook 的情境屬於哪類骨架」，不代表 cookbook 是由這些範本改寫而來。

---

## 5. AI 產出 workflow 的決策流程（總結）

下列是本 Pack 的設計準則，其中節點數上限是維護性考量，並非從統計推出；統計只用來提醒「社群的常見做法」。

```text
1. 解析 Layer 1 DSL → 確定 trigger
2. 比對 §2 的 14 個骨架 → 選最近的骨架（可同時符合多個）
3. 套節點對應表（node-frequency.md §4 + dsl §4），並確認節點在使用者環境中目前可用
4. 必加結構性節點：
   - if 後接 noOp 收斂
   - splitInBatches 後接 aggregate
   - webhook trigger 要決定回應方式（respondToWebhook 或 Webhook 節點的回應模式）
   - switch 沒明示 fallback 時必加 fallback (NaN/null/otherwise) 並走 noOp
   - 三路以上 switch → 結尾必接 merge (mode=append) 收斂到單一輸出
5. 節點數上限（彈性）：
   - 單線型 workflow ≤ 15 節點 → 超過建議拆 sub-workflow (executeWorkflowTrigger)
   - 分流型 workflow ≤ 25 節點 → 因為每路都有獨立節點，放寬上限
6. 主動加 Layer 3 風險提示：
   - 含 httpRequest → 提醒 retry/timeout
   - 缺 @on-error → 建議補（並依 three-layer.md §6 選 A 或 B 模式）
   - 節點數逼近上限 → 建議拆 sub-workflow
   - LLM 評分/分類 → 提醒非確定性、需校準
   - Switch fallback 缺漏 → AI 自補後在 Layer 3 標註「使用者未明示，預設 noOp」
   - 需要使用者自行建立的憑證 → 只列類型名稱，不寫入任何憑證值
7. 禁用：棄用節點（cron / function / functionItem / start / interval）；manualTrigger 除非明示
```

---

## 6. 如何使用

- **這是描述性統計，不是品質認證**：每個數字只說明「公開範本裡常見什麼」。常見不等於正確，也不等於應該這樣做。
- **高瀏覽數不等於正確**：代表範本是依瀏覽數挑出來的，反映受歡迎程度與曝光時間，而不是設計品質；別因為它排前面就當成標準答案。
- **用目前版本的節點重新建構**：產生 workflow 時，依使用者環境目前可用的節點與參數從頭建構。不複製範本、不沿用舊節點、不假設範本裡的參數仍然有效。
- **參考了範本時，只需告訴使用者參考了哪一個**：以「#ID《標題》（網址）」的形式說明即可，網址指向 n8n.io 官方頁面；本 repo 不存範本內容，要看原文請使用者同意後即時到 n8n.io 查閱。
- **樣本偏新、偏 AI**：2025–2026 年建立的範本占 91.7%，AI 相關占 54.6%；對傳統整合情境的代表性較弱。方法與限制見 [`n8n-templates-method.md`](n8n-templates-method.md)。

---

**資料版本**：2026-11-06 彙整（13,947 個範本）。本檔引用的範本共 34 個（見各骨架的代表範本）。
