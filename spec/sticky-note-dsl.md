# Sticky Note DSL 規範 v1.0

> 🌐 [English](sticky-note-dsl.en.md) | **繁體中文**

> **目的**：定義 Layer 1（使用者輸入）的標籤語法，讓 AI 能可靠地解析使用者意圖。
> **設計原則**：寬鬆輸入、嚴格輸出。使用者可以混用中英文與自然語言；AI 必須能解析至少所有 `@`-prefixed 標籤。

---

## 1. 基本語法規則

### 1.1 標籤格式
```
@<keyword>: <value>
```

- `@` 後緊接英文小寫關鍵字，不可有空格。
- `:` 後可有任意空白。
- `<value>` 可為單行或續行（續行縮排 2+ 空白）。

### 1.2 區塊與註解
- 標籤外的純文字視為人類註解，AI 略過但**保留**至 Layer 3 的「對應使用者需求」段。
- Markdown 標題 `##`、`###` 會被視為「邏輯區塊分隔」，多區塊可組合成多 workflow（罕見）。

### 1.3 順序語意
- `@trigger` 為起點，每個 workflow **必須恰好一個**。
- `@step` 依出現順序串成主鏈。
- `@on-error` 不論位置，皆為錯誤路徑。
- `@output` 視為最後一個 step 的別名（語意：「對外回傳/通知」）。

---

## 2. 標準標籤表

### 2.1 必要標籤

| 標籤 | 必填 | 出現次數 | 用途 |
|---|---|---|---|
| `@trigger` | ✅ | 恰 1 | workflow 啟動條件 |
| `@step` | ✅ | 1+ | 主鏈步驟 |

### 2.2 選用標籤

| 標籤 | 出現次數 | 用途 |
|---|---|---|
| `@flow` | 0–1 | 一句話總覽（給 AI 與人類快速看懂）|
| `@input` | 0–1 | 描述 trigger 的輸入 schema（單行 inline 或 YAML-like 縮排，見下方）|
| `@form-fields` | 0–1 | `@trigger: form` 時，列舉欄位（YAML-like 縮排） |
| `@output` | 0–1 | 對外輸出（視同最終 step） |
| `@on-error` | 0–1 | 錯誤處理路徑 |
| `@assume` | 0+ | 使用者明示假設（AI 寫入 Layer 3）|
| `@credential` | 0+ | 使用者已知的 credential 名稱 |
| `@retry` | 0–1 | 全 workflow 預設 retry 行為 |
| `@batch` | 0–1 | 批次處理參數（size, wait） |

### 2.2.1 `@input` / `@form-fields` 兩種寫法

**寫法 A — 單行 inline**（適合簡單 schema）：
```text
@input: { order_id, customer_email, amount, ip, items[] }
```

**寫法 B — 縮排清單**（適合需要型別/必填/說明）：
```text
@input: Google Sheet "補習班學員" / 分頁 "繳費紀錄"
  - A: 姓名 (string)
  - B: 手機 (string, required)
  - C: 下次繳費日 (date YYYY-MM-DD)
```

**規則**：
- 縮排層級 ≥ 2 空白被視為續行屬於前一個 `@input` / `@form-fields`
- 每筆格式 `- <field>: <description> (<type>[, <flags>])`
- `<type>` 採 JSON 基本型 + `date` / `email` / `url` / `binary`
- `<flags>` 可選：`required` / `optional` / `default=<value>`
- AI 解析後寫入對應節點的 schema / formFields，並把整段保留至 Layer 3「前提假設」

---

### 2.3 內嵌修飾子（在 @step 行內）

`@step` 後可帶子修飾，皆寫在同一行或下方縮排：

```text
@step: 呼叫 API GET /data
  - retry: 3
  - timeout: 30s
  - parallel: false
```

### 2.4 `@branch` — 分流子規則（嚴格語法）

當需要 switch / 多路分流時，**避免在 `@step` 內塞自然語言**。改用 `@branch` 區塊：

```text
@branch: <branch-name> when <condition>
  - <action 1>
  - <action 2>
```

**範例**（取自 Test 5 訂單風險分流）：

```text
@step: AI 風險評分 → 回 {score, reason}
@branch: high when score > 70
  - jira project=FRAUD create issue
  - slack #fraud-alert
@branch: medium when score >= 30 and score <= 70
  - postgres insert review_queue
@branch: low when score < 30
  - postgres insert orders
@branch: fallback when otherwise
  - slack #ops-alert "未知 score: {score}"
```

**規則**：
- `@branch` 必須在 `@step`（產生分流依據的步驟）之後
- `<condition>` 用人類可讀運算式（`>`、`>=`、`==`、`contains`、`and`、`or`）
- AI 解析時對應到 `n8n-nodes-base.switch` 節點的 rules
- **若沒寫 `@branch: fallback when otherwise`，AI 必須自動補一條，並在 Layer 3 標註「使用者未明示 fallback，AI 預設無動作」**

### 2.4.1 `@before-branch` / `@after-branch`（v1.2 增強）

跨路徑共用的步驟（如所有路徑都要寫 audit log），不必在每個 `@branch` 內重複，改用：

```text
@before-branch:
  - postgres insert audit_log (event_id, score, ts=NOW())

@branch: high when score > 70
  - jira create issue ...

@branch: low when score < 30
  - postgres insert orders ...

@after-branch:
  - slack #report-channel "處理完成 #{event_id}"
```

**對應節點結構**：
- `@before-branch` 動作 → 串接在 `Switch` 節點**之前**（共用上游路徑）
- `@after-branch` 動作 → 串接在 `Merge`（多路收斂節點）**之後**（共用下游路徑）
- 多個 `@before-branch` / `@after-branch` 區塊依書寫順序串接
- AI 在 Layer 3「節點選型」說明哪些節點是 before / after 共用

**何時用**：
- 所有路徑都要做的副作用（log、metrics、audit）
- 統一的後處理（通知、清理）

**何時不用**：
- 只有 1–2 路有此動作 → 直接寫在那幾個 `@branch` 內
- 動作邏輯依路徑變化 → 仍需各自寫

---

## 3. `@trigger` 詞彙表

| value 樣式 | 對應節點 | 範例 |
|---|---|---|
| `webhook <METHOD> /<path>` | `n8n-nodes-base.webhook` | `@trigger: webhook POST /order` |
| `schedule cron "<cron>"` | `n8n-nodes-base.scheduleTrigger` | `@trigger: schedule cron "0 8 * * *"` |
| `schedule every <N> <unit>` | 同上 | `@trigger: schedule every 15 minutes` |
| `form` | `n8n-nodes-base.formTrigger` | `@trigger: form` (需配 `@form-fields`) |
| `manual` | `n8n-nodes-base.manualTrigger` | `@trigger: manual` |
| `email <address>` | `n8n-nodes-base.emailReadImap` | `@trigger: email inbox@x.com` |
| `error` | `n8n-nodes-base.errorTrigger` | `@trigger: error` (建立全域錯誤處理 workflow) |
| `telegram` | `n8n-nodes-base.telegramTrigger` | `@trigger: telegram bot 收到訊息` |
| `slack` | `n8n-nodes-base.slackTrigger` | `@trigger: slack 訊息事件` |
| `discord` | `n8n-nodes-base.webhook`（n8n 沒有原生 Discord 觸發節點，見下方註） | `@trigger: discord` |
| `googleDrive` | `n8n-nodes-base.googleDriveTrigger` | `@trigger: googleDrive 新檔案` |
| `executeWorkflow` | `n8n-nodes-base.executeWorkflowTrigger` | `@trigger: executeWorkflow` (sub-workflow 入口) |

> **節點是否存在，以 [`docs/node-versions/`](../docs/node-versions/README.md) 為準**：上表的節點 type 在 2.37.3、2.44.6、2.46.6 三版的節點目錄都查得到，只有 `discord` 例外。
>
> **Discord 觸發**：這三版的節點目錄都查不到 `n8n-nodes-base.discordTrigger`，n8n 沒有原生的 Discord 觸發節點。AI 遇到 `@trigger: discord` 時，改產 `n8n-nodes-base.webhook`，由使用者的 Discord 機器人或中繼服務把事件轉送到該 Webhook URL，並在 Layer 3 寫明「n8n 沒有原生 Discord 觸發節點，事件需自行轉送」。（在 2.46.6 實際試過：API 可以建立含 `discordTrigger` 的 workflow，但啟用時回 `Unrecognized node type`。）社群套件提供的觸發節點（社群範本裡出現過 `n8n-nodes-discord-trigger`）不在原生目錄，AI 不預設使用，使用者明確要求時須在 Layer 3 標示風險。要「發送」訊息到 Discord，則用 `n8n-nodes-base.discord`（見 §4.3）。

---

## 4. `@step` 動作詞彙對應表

> AI 從動詞 + 名詞推論節點。模糊時，依下表優先順序選擇。

### 4.1 HTTP / API
| 自然語言關鍵字 | 推論節點 |
|---|---|
| 「呼叫 API」、「GET/POST」、「取資料」 | `httpRequest` |
| 「等待」、「Wait」、「停 N 秒」 | `wait` |

### 4.2 邏輯與資料整形
| 關鍵字 | 推論節點 |
|---|---|
| 「判斷」、「驗證」、「if」、「條件」 | `if` |
| 「分流」、「依 X 分」、「switch by」 | `switch` |
| 「組訊息」、「設定欄位」、「set」 | `set` |
| 「過濾」、「filter」、「只留下」 | `filter` |
| 「合併」、「merge」、「左 join」 | `merge` |
| 「彙總」、「aggregate」、「統計」 | `aggregate` 或 `code` |
| 「迴圈」、「每 N 筆一批」、「loop」 | `splitInBatches` |
| 「自訂程式」、「JS」、「Python」 | `code` |

### 4.3 整合型節點
| 關鍵字 | 推論節點 |
|---|---|
| 「Slack」、「Slack 通知」 | `slack` |
| 「Gmail」、「寄信」、「Email」 | `gmail`（無 credential 時 fallback `emailSend`） |
| 「Google Sheet」、「試算表」 | `googleSheets` |
| 「Postgres」、「DB」、「資料庫」 | `postgres`（其他可指明 mysql/mongoDb）|
| 「S3」、「上傳雲端」 | `awsS3` |
| 「Jira」、「開 ticket」 | `jira` |
| 「Discord」 | `discord` |
| 「Telegram」 | `telegram` |

### 4.4 AI / LLM
| 關鍵字 | 推論節點 |
|---|---|
| 「AI 分類」、「LLM」、「GPT 判斷」 | `@n8n/n8n-nodes-langchain.openAi` |
| 「AI Agent」、「對話」 | `@n8n/n8n-nodes-langchain.agent` |
| 「embedding」、「向量化」 | 對應 langchain embedding 節點 |

### 4.5 檔案
| 關鍵字 | 推論節點 |
|---|---|
| 「存暫存」、「寫檔」 | `readWriteFile`（`writeBinaryFile` 在 2.37.3、2.44.6、2.46.6 的節點目錄都標為隱藏，新 workflow 不用） |
| 「FastAPI Worker」、「呼叫 worker」 | `httpRequest` (TigerAI 慣例) |

---

## 5. 完整範例對照

### 範例 A：最小 workflow

```markdown
@trigger: webhook POST /ping
@step: 回傳 "pong"
```

→ AI 產出：`webhook` → `respondToWebhook(text="pong")`

### 範例 B：含全部選用標籤

```markdown
## 流程意圖
@flow: 每日銷售報表

@trigger: schedule cron "0 8 * * *"
@input: 無

@step: 呼叫 API GET https://api.example.com/sales
  - retry: 3
  - timeout: 30s
@step: 統計總額與 Top3 (用 code 節點)
@step: 套 HTML 模板

@output: gmail to sales@x.com, subject "日報"
@on-error: slack #ops "日報失敗: {error}"

@assume: API 回 JSON `{orders: []}`
@credential: gmail-prod
```

→ AI 產出 workflow，並把 `@assume` / `@credential` 寫入 Layer 3 的「前提假設」與「所需 Credentials」段。

---

## 6. 解析器行為規範（給實作 Skill 的工程師）

1. **Tokenize**：以 `\n@(\w+):\s*(.*?)(?=\n@|\n##|\Z)` 為主 regex，多行續接以縮排判定。
2. **Validate**：缺 `@trigger` 或 `@step` → 拒絕，要求補充。
3. **Resolve**：依第 3、4 章詞彙表把 value 對應到 node type。
4. **Disambiguate**：模糊時取詞彙表第一個 match；同時記錄到 Layer 3「節點選型/可能的替代」。
5. **Generate**：建立 nodes + connections，套 `position.y` 區間（見 `sticky-note-three-layer.md`）。
6. **Annotate**：填寫 Layer 3 sticky note，含「修改記錄」段（新建的第一列寫「建立」，修改既有 workflow 就新增一列，規則見 `sticky-note-three-layer.md` §4.4；缺少只提醒，不阻擋）。

### 6.1 跨節點變數引用 gotcha（**最常踩坑**）

n8n 的 `$json` 在每個節點都會被**前一節點的輸出覆蓋**。當下游節點需要引用「更上游」的資料時，必須用 `$('NodeName').item.json` 而非 `$json`：

| 情境 | 錯誤寫法 | 正確寫法 |
|---|---|---|
| Webhook 後呼叫 OpenAI，再寫 Slack 引用 webhook 的 user.id | `$json.body.user.id` | `$('Webhook').item.json.body.user.id` |
| Form 收資料，中間經過 IF/Set 後仍要存原始 body | `$json.body` | `$('Form Trigger').item.json` |
| Telegram trigger，最後回訊用 chat.id | `$json.message.chat.id` | `$('Telegram Trigger').item.json.message.chat.id` |

**AI 產出規則**：
- 任何節點若需要引用「非直接前一節點」的資料 → 強制用 `$('NodeName').item.json`
- 若 trigger payload 在多個下游節點都會用到 → 全部用 `$('<TriggerNodeName>').item.json`

### 6.1.1 中文 / 特殊字元欄位 header 的 expression gotcha

當資料來源（Google Sheet / DB / API）的欄位 header 含**中文、空格、連字號、含 `.`** 等字元時，**不能用 dot 寫法**：

| 情境 | 錯誤寫法 | 正確寫法 |
|---|---|---|
| 中文 header 「姓名」 | `$json.姓名` | `$json['姓名']` |
| 含空格 header 「Order ID」 | `$json.Order ID` | `$json['Order ID']` |
| 含連字號「customer-email」 | `$json.customer-email`（會被當作減法）| `$json['customer-email']` |
| 開頭數字「1stName」 | `$json.1stName` | `$json['1stName']` |
| 含 dot「user.email」實為單一欄位 | `$json.user.email`（被誤認為巢狀）| `$json['user.email']` |

**AI 產出規則**：
- 只要 header 不是純 ASCII 英文字母+數字+底線，**強制使用 bracket notation**
- 跨節點引用同樣適用：`$('Sheet').item.json['姓名']`
- Layer 3 必標註「欄位 header 含 X，使用 bracket notation」以便維運者後續若改 schema 時記得同步改 expression

### 6.2 「無對應節點」的降級對應規則

當使用者寫的動作沒有原生節點時，AI 必須按以下順序降級：

| 動作描述 | 降級對應 |
|---|---|
| 「寫入 console」、「印 log」 | `noOp` 節點 + Layer 3 註明「n8n 無 console，請看 execution log」 |
| 「忽略錯誤」、「靜默失敗」 | 在會失敗的節點設 `continueOnFail=true` |
| 「清理檔案」、「rm -rf」、「刪暫存」 | 這三版的節點目錄都查不到 `executeCommand`，不要產出。改在 Layer 3 註明「需另建 cleanup 機制」，或用 `httpRequest` 呼叫 Worker 的清理端點；`ssh` 節點存在但屬高風險節點，使用前先依 [`security-guardrails.md`](security-guardrails.md) 評估 |
| 「等 N 分鐘後重做」 | `wait` 節點 + 後續同樣節點重執行 |
| 「發送系統通知」（無指定服務） | `slack` 預設；若無 credential → `gmail`；若皆無 → `httpRequest` 任意 webhook |
| 找不到任何對應 | **拒絕生成** + 在 Layer 3 列出「歧義動作」要使用者澄清 |

**核心原則**：降級必定在 Layer 3 明文標註，**不允許靜默替代**。

---

## 7. 反模式（使用者請避免）

- ❌ 不要用 `@step` 包多動作：`@step: 呼叫 API 然後存 DB 然後通知` → 拆成 3 個 `@step`
- ❌ 不要省略 `@trigger`，AI 會直接拒絕
- ❌ 不要在 Layer 1 sticky note 內手繪 ASCII 流程圖（AI 不解析圖形，只解析 `@` 標籤）
- ❌ 不要混用兩個 `@trigger`（多觸發請建多個 workflow）

---

**版本**：v1.2（v1.1 + §2.2.1 `@input` 兩種寫法 / §2.4.1 `@before-branch` / `@after-branch` / §6.1.1 中文欄位 gotcha）
**狀態**：DSL 鎖定，後續 Phase 3 的 `sticky-note-to-workflow` Skill 將以本檔為實作合約。
