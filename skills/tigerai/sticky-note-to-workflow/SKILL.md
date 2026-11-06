---
name: sticky-note-to-workflow
description: Core skill that converts a Layer 1 Sticky Note (DSL-formatted user requirement) into a complete three-layer n8n workflow JSON — Layer 1 preserved, Layer 2 nodes generated, Layer 3 AI commentary auto-written. Use when the user pastes a sticky note draft, references an existing workflow ID containing user sticky notes, or asks to "generate the workflow" / "build it" / "產 workflow" / "幫我寫 workflow" after providing a DSL spec. This is the central executor — it orchestrates the n8n-mcp tools, validates output, and emits a JSON ready for n8n import.
---

# sticky-note-to-workflow — 核心 Skill

> 🌐 [English](SKILL.en.md) | **繁體中文**

## 受限 Agent 模式（Portal）

> 先看宿主有沒有放標記 `[PORTAL-RESTRICTED-AGENT-MODE v1]`（放在系統提示或工作階段上下文；格式與全部規則見 [`spec/agent-restricted-mode.md`](../../../spec/agent-restricted-mode.md)）。**沒有標記：本 Skill 全文照舊（單機模式）。有標記：下表調整生效，優先於本檔其他步驟。** 這段文字只是提示，真正的強制在宿主的工具白名單；本 Skill 在此模式下的行為是「符合宿主的限制」。

| 位置 | 受限模式下的調整 |
|---|---|
| §2 輸入（既有 workflow ID） | 不經 `n8n-api-bridge`；只能用宿主提供的唯讀工具讀取（名稱以宿主為準），沒有工具就請使用者貼 JSON |
| Step 4（頂層欄位） | `active` 一律 `false` |
| **Step 4.2** | **改為「只引用 credentialMap」**：只用宿主提供的 `credentialMap` 內的憑證名稱，逐字照抄；節點只寫 `{ "<type>": { "name": "<名稱>" } }`，**絕不寫 `credentials.id`**（宿主在伺服器端依名稱補 id，補不到就標缺憑證並回報）；**禁止 `STUB-` 假憑證**與任何杜撰的名稱；需要但不在 map 內的憑證，該節點不寫 `credentials`，節點 `notes` 與 Layer 3「待補憑證」寫明「需管理員建立：type=…、建議名稱=…」。連線型觸發節點同樣處理，並提醒啟用只由管理員執行 |
| Step 6（Layer 3） | 在「所需 Credentials」旁加「待補憑證」清單，並告知使用者：憑證補齊前 CI 會失敗，這是預期且正確的 |
| **Step 7** | **改為「不寫入 n8n，只輸出 JSON」**：不 PUT、不啟用；改呼叫宿主的靜態檢查工具，依阻擋碼做合法修正，最多 N 輪（宿主設定，起始 3）；仍失敗就把原因如實交給使用者 |
| Step 8（收尾區塊） | 「資安掃描結果」是宿主檢查結果的如實轉述（只寫規則名稱與節點名稱）；沒執行就寫「未執行資安掃描：<原因>」 |
| §5 輸出格式、§7 對話準則 | `metadata.validation` 不填 `passed`，改填宿主預檢的原文摘要（例如「無阻擋碼」「未預檢」）；不得說「已通過」「安全」「可部署」「已啟用」「已匯入」 |
| §8 鏈接 | 不走 `n8n-api-bridge` 的寫回；成品交給宿主的草稿流程 |

## 1. 觸發條件

**精確觸發詞**：
- 「產 workflow」/「建 workflow」/「幫我寫 workflow」
- 「generate the workflow」/「build it」/「create」
- 使用者貼出含 `@trigger:` `@step:` 的 sticky note 草稿

**隱式觸發**：
- 問答模式（`tigerai-qa-mode`）收完 5 階段，使用者確認 Layer 1 → 自動接力進本 Skill
- 範例查詢模式（`tigerai-example-finder`）使用者選 A（拿範例改）→ 自動接力

---

## 2. 輸入合約

接收以下任一形式：

| 形式 | 來源 |
|---|---|
| 純文字 Layer 1（含 DSL 標籤） | 對話內貼上 |
| n8n workflow ID + 已存在的 Layer 1 sticky note | n8n REST API 讀取（透過 `n8n-api-bridge` Skill） |
| 結構化 JSON `{ layer1: "..." }` | 程式呼叫 |

---

## 3. 七步產出流程

### Step 0：判斷輸入是「自然語言」還是「DSL」（v0.10.0 必做）

使用者寫的便利貼有兩種風格，AI 必須先判斷：

| 訊號 | 判斷 |
|---|---|
| 含 `@trigger:` / `@step:` / `@branch:` 等標籤 | DSL → 直接進 Step 1 |
| 純自然語言（中文 / 英文 / 混雜） | 先做 **Step 0.1 NL→DSL 翻譯** 再進 Step 1 |
| 兩者混雜 | 視為自然語言處理（更寬鬆） |

#### Step 0.1：自然語言 → DSL 內部翻譯

LLM 把使用者描述映射到 `@`-tagged 結構（**不展示給使用者**，純內部）：

| 自然語言訊號 | 映射 |
|---|---|
| 「每天早上 9 點」/「每週一」 | `@trigger: schedule cron "..."` |
| 「有人 call webhook」/「外部系統送資料」 | `@trigger: webhook POST /...` |
| 「我要一個表單給人填」 | `@trigger: form` + `@form-fields:` |
| 「Telegram bot 收訊息」 | `@trigger: telegram` |
| 第 1, 2, 3 點 / 步驟 / 然後 | 多個 `@step:` |
| 「分成 X / Y / Z」 | 多個 `@branch:` |
| 「失敗就 ...」 | `@on-error:` |
| 「假設 ...」/「⚠️ ...」 | `@assume:` |
| 「寄到」/「通知」/「回應」 | `@output:` |

**翻譯後 AI 必複述「我理解的需求是 ...」並請使用者確認**（避免誤譯）。
複述語言用使用者原語言（不講 DSL）。

### Step 1：解析 DSL
- 套 `spec/sticky-note-dsl.md` §6 解析器規範
- Tokenize → 抽 `@trigger` / `@step` / `@branch` / `@output` / `@on-error` / `@assume` / `@form-fields` / `@credential` / `@retry` / `@batch`
- **失敗條件**：缺 `@trigger` 或 `@step` → 若是自然語言路徑來的、回 Step 0.1 重譯（標警告給使用者）；若是 DSL 路徑、直接拒絕並要求補齊

### Step 2：選骨架
- 比對 `research/patterns.md` §2 的 14 個骨架（`webhook-api`、`schedule`、`batch-loop` 等，名稱見該節一覽表）；決策流程見該檔 §5
- 命中度高者優先；多個命中時取最簡單的
- 同時記錄「為何選 X 不選 Y」→ 寫入 Layer 3「節點選型」段

### Step 3：解析節點
- 對每個 `@step`：
  1. 套 DSL §4 詞彙對應表抽節點 type
  2. 若不在表內 → 查 `research/node-frequency.md` Top 30 + AI 知識庫
  3. 仍找不到 → 走 DSL §6.2「降級對應」
- 對 `@trigger`：套 DSL §3 字典（v1.1 含 telegram/slack/googleDrive 等；`discord` 沒有原生觸發節點，字典改對應 Webhook，見 DSL §3 的註）
- 對 `@branch`：產 `switch` 節點 + 多輸出，缺 fallback 必補

### Step 3.5：原生節點優先

建立節點（Step 4）之前，依 [`spec/native-first.md`](../../../spec/native-first.md) 第 6 章做一次閘門，不要做完才補：

- 列出規劃中打算用 Code 的步驟，逐一過決策順序（運算式 → Edit Fields → 原生節點 → Code），能原生就原生；原生節點的對照見該規格第 3 章。
- DSL §4 詞彙對應表會把「彙總、統計」與「自訂程式」對到 `code`，不要直接採用，先過閘門。
- 剩下確實要用的 Code 節點，`notes` 寫一行「為什麼用 Code」，程式碼加簡短註解（該規格第 5 章）。

### Step 4：產 nodes 陣列
- 每節點欄位：
  ```json
  {
    "id": "<unique>",
    "name": "<ASCII-only-PascalCase>",
    "type": "<typeFromMapping>",
    "typeVersion": <目標版本的 default；default 為 null 時取 latest>,
    "position": [x, y],
    "parameters": { ... },
    "notes": "<只有非顯而易見的設定才寫，內容是「為什麼這樣設定」；顯而易見的節點留空>"
  }
  ```
- `type` 與 `typeVersion` 一律查目標 n8n 版本的 [`docs/node-versions/`](../../../docs/node-versions/README.md) 查表：查不到的 `type` 不能用，`deprecated` 或 `hidden` 為 `true` 的節點不用於新 workflow，版本號取 `default`（為 null 時取 `latest`），不要沿用別的版本的數字
- 節點 `notes` 的寫法依 [`spec/references-disclosure.md`](../../../spec/references-disclosure.md) 第 7 章；針對該節點的建議（資安、原生節點優先）也以簡短一行寫在這裡（§4.4）；對應 Layer 1 的追溯由 Layer 3 的「對應使用者需求」段承擔
- `position.y` 嚴守三層分區：Layer 1 sticky < 0、Layer 2 nodes ∈ [0, 500]、Layer 3 sticky > 600
- `position.x` 依執行順序遞增 220–260px / 節點

> **受限 Agent 模式（Portal）**：有標記時本步驟整段不適用，改為「只引用 credentialMap、只寫名稱不寫 `credentials.id`、禁止 `STUB-`」，見上方「受限 Agent 模式（Portal）」。

### Step 4.2：Activate 友善設計（v0.9.0 R3 驗證強制）

n8n 有兩級 credential 驗證：activate 時只查 ref 存在；execute 時查真實 DB。為了讓 workflow 能即時 activate（即使使用者尚未配 credential），AI 必須對**非連線型 action node** 自動補 stub credentials：

```json
"credentials": {
  "<credName>": { "id": "stub-<random8>", "name": "STUB-<credName>" }
}
```

**Action node 對應 credential**：
| node type | credential 名 |
|---|---|
| `n8n-nodes-base.slack` | `slackApi` |
| `n8n-nodes-base.gmail` | `gmailOAuth2` |
| `n8n-nodes-base.googleSheets` | `googleSheetsOAuth2Api` |
| `n8n-nodes-base.postgres` | `postgres` |
| `n8n-nodes-base.jira` | `jiraSoftwareCloudApi` |
| `n8n-nodes-base.awsS3` | `aws` |
| `@n8n/n8n-nodes-langchain.openAi` | `openAiApi` |
| `n8n-nodes-base.telegram`（action）| `telegramApi` |

**連線型 trigger（不能用 stub）**：
- `telegramTrigger`、`emailReadImap`、`slackTrigger` 等（n8n 沒有原生 `discordTrigger`，見 DSL §3 的註）
- AI 必須在 Layer 3 用 ⚠️ 紅字提示「activate 前需在 n8n 建真實 credential」
- Stub 會直接讓 activate 失敗（n8n 撥真實 API 驗證 token）

### Step 4.3：避免 webhook path 衝突（v0.9.0 規則）

同一 n8n 實例不能有 2 個 active workflow 共用 `webhook + path`。AI 在生成 webhook 節點時：
- 若 Layer 1 寫 `@trigger: webhook POST /order` → 預設用 path `order-<workflow-tag>`
- workflow-tag 從 workflow name 推（如 `Order-Risk-Routing` → `risk` 或 `order-risk`）
- Layer 3 列出最終 path 並提醒「同實例不可重複」

### Step 4.1：n8n 真實匯入必需欄位（R3 驗收強制）

n8n CLI `import:workflow` 與 REST API 對 JSON 有額外要求，AI 必須產出：

| 位置 | 欄位 | 規則 | R3 驗證錯誤訊息 |
|---|---|---|---|
| 頂層 workflow | `id` | 16 字元 nanoid（[A-Za-z0-9]）| `null value in column "id" of relation "workflow_entity"` |
| webhook trigger node | `webhookId` | UUID v4 | webhook URL 退化使用 node name → URL 不可用 |
| webhook trigger node | `name` | **ASCII only / 無空格 / 無 `/`** | 含 `/` 或中文時 webhook URL 變 `<workflowId>/<encoded-name>/<path>` 無法呼叫 |

**生成程式碼**：
```js
function newWorkflowId() {
  const a='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s=''; for (let i=0;i<16;i++) s+=a[Math.floor(Math.random()*a.length)];
  return s;
}
function newWebhookId() { return crypto.randomUUID(); }
function safeWebhookNodeName(s) { return s.replace(/[^A-Za-z0-9]/g, ''); }
```

**Layer 3 必註明**：
- 「`webhookId` 已自動產生為 `<uuid>`，webhook URL 為 `https://<n8n>/webhook/<configured-path>`」
- 若節點名被改寫，列出對照（給人類維運者好查）

### Step 5：產 connections
- 主鏈線性：trigger → step1 → step2 → ... → output
- `if` / `switch`：依輸出 index 連接各分支
- `splitInBatches`：output[0]→loop body、output[1]→aggregate
- 多分支結尾：必接 `merge` (mode=append) → 單一 output
- 結構性節點自動加：if 後 noOp、splitInBatches 後 aggregate、webhook 配 respondToWebhook

### Step 6：產 Layer 3 sticky note
- 強制含 5 段（依 `spec/sticky-note-three-layer.md` §4.2 模板）：
  1. 節點選型（含為何不選 alternatives）
  2. 所需 Credentials（清單格式 `- [ ] xxx`）
  3. 前提假設（含 `@assume` 內容）
  4. 測試建議（≥ 2 case：golden + error）
  5. 已知限制
  6. 對應使用者需求（@trigger / @step / @output / @on-error 一一對應）
- 套用反模式檢查（`research/patterns.md` §3）— 若觸發任一條，加入「已知限制」
- 依 [`spec/references-disclosure.md`](../../../spec/references-disclosure.md) 第 4 章，在標題之後加入「參考來源」「建議事項」「資安掃描結果」三個區塊（見 Step 8）；這三個區塊是建議與資訊的正式紀錄

> **受限 Agent 模式（Portal）**：有標記時本步驟不寫入 n8n，只輸出 JSON，見上方「受限 Agent 模式（Portal）」。

### Step 7：驗證
- 透過 `n8n-api-bridge` Skill 把 JSON PUT 回 n8n（n8n 會做內建 schema 驗證）
- 422 → 依錯誤訊息 AI 自修 → 重新 PUT
- 仍失敗 → 回報使用者並列出問題

### Step 8：完成後：參考來源、建議事項與掃描結果

- **邊做邊記**：從 Step 0 開始，把實際讀過、且影響設計的資料記進「參考紀錄」（Step 2 選骨架、Step 3 解析節點時最常新增）。
- **在哪個步驟做**：Step 6 產生 Layer 3 便條時寫入；Step 7 之後、交付前，對最終的 workflow JSON 執行資安掃描，並用結果更新便條（之後又改了 JSON 就對最終版重掃）。
- 把參考來源、建議事項與掃描結果寫進 Layer 3 便條與相關節點 notes，對話只放摘要。順序、格式、狀態與誠實規則依 [`spec/references-disclosure.md`](../../../spec/references-disclosure.md) 第 4 章（掃描見第 8 章），本 Skill 不重複；建議的內容規則見 [`spec/security-guardrails.md`](../../../spec/security-guardrails.md) 與 [`spec/native-first.md`](../../../spec/native-first.md)。

---

## 4. 與企業級分支整合

當輸入觸發 `tigerai-enterprise-patterns`（如包含 PDF/MP3/敏感資料），Step 4 套用其規則：

- 重邏輯改成 `httpRequest` 呼叫 worker（不寫 code）
- loop 強制 `batchSize=1`
- Layer 3 多加「資安風險」/「資料留存」段
- 建議使用者建 SDD `specification.md`

---

## 5. 輸出格式

回傳一個 JSON 物件：

```json
{
  "success": true,
  "workflow": { "name": "...", "nodes": [...], "connections": {...}, "settings": {...} },
  "metadata": {
    "skeleton_pattern": "webhook-api",
    "node_count": 11,
    "layer3_warnings": ["缺 @on-error 已建議使用模式 B"],
    "downgraded_actions": [],
    "validation": "passed"
  }
}
```

呼叫端可：
- 透過 `n8n-api-bridge` Skill 把 `workflow` PUT 回 n8n
- 直接給使用者下載 import

---

## 6. 失敗模式與處置

| 失敗 | 處置 |
|---|---|
| 缺 @trigger | 拒絕，提示使用者補；或建議啟動問答模式 |
| 動作完全無對應節點 | 列出歧義，要求澄清；不靜默替代 |
| validation 連二次失敗 | 標 `success=false`，回報具體錯誤 + 局部 JSON |
| 節點數超 25（分流型）/ 15（單線型） | 標 warning，建議拆 sub-workflow，仍產出 |

---

## 7. 對話準則

- **產出前先複述意圖**：「我理解的需求是：〈一句話〉。如無誤即開始產出。」
- **產出後直接秀 JSON**，不長篇解釋（解釋已在 Layer 3）
- **同時提示**：「workflow 已含三層結構。Layer 3 列出了 N 個 credential 與 M 個假設請確認。」
- **不騙**：缺什麼就說缺什麼；不確定就標「已知限制」

---

## 8. 與其他 Skill 鏈接

```
tigerai-qa-mode (5 階段問答)  ─┐
tigerai-example-finder (找參考) ─┼─→  sticky-note-to-workflow (本 Skill)
直接貼 Layer 1                  ─┘            │
                                              ▼
                              n8n REST API PUT (含 schema 驗證)
                                              ▼
                              n8n-api-bridge (寫回 n8n)
                                              ▼
                              使用者在 n8n 畫布看三層成品
```
