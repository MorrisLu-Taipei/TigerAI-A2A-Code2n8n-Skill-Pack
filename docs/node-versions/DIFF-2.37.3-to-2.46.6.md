# 節點版本差異：n8n 2.37.3 → 2.46.6

> 資料來源：[`2.37.3.json`](2.37.3.json)、[`2.44.6.json`](2.44.6.json)、[`2.46.6.json`](2.46.6.json)，由 [`scripts/dump-node-versions.mjs`](../../scripts/dump-node-versions.mjs) 從三個全新的空實例的節點目錄產生。本文的數字是用腳本比對三份 JSON 得到的，不是手寫。
> 這是三個版本的觀察，不代表其他 2.x 版本；其他版本請自己重產（見 [`README.md`](README.md)）。

## 重點

同一份 workflow 在不同 n8n 版本上，**同一個節點該填的 `typeVersion` 不一樣**。例如 IF 在 2.37.3 的目前版本是 2.3，在 2.44.6 與 2.46.6 是 2.4；把 typeVersion 2.4 的 IF 匯入只有 2.3 的實例，節點可能無法載入（本文沒有針對這點做匯入實測）。產生 workflow 前，先查目標版本的 JSON，不要沿用別的版本的數字。

欄位格式：`latest / default`。`default` 為 `—` 表示目錄沒有標示 `defaultVersion`，此時以 `latest` 為準。`不存在` 表示該版本的目錄查不到這個 type。

節點總數（以 type 計，同名條目合併）：2.37.3 為 911、2.44.6 為 923、2.46.6 為 924。

## 1. 版本有變動的常用節點

| 節點 | type | 2.37.3 | 2.44.6 | 2.46.6 |
|---|---|---|---|---|
| IF | `n8n-nodes-base.if` | 2.3 / 2.3 | 2.4 / 2.4 | 2.4 / 2.4 |
| Switch | `n8n-nodes-base.switch` | 3.4 / 3.4 | 3.5 / 3.5 | 3.5 / 3.5 |
| Filter | `n8n-nodes-base.filter` | 2.3 / 2.3 | 2.4 / 2.4 | 2.4 / 2.4 |
| Webhook | `n8n-nodes-base.webhook` | 2.1 / 2.1 | 2.2 / 2.2 | 2.2 / 2.2 |
| Extract From File | `n8n-nodes-base.extractFromFile` | 1.1 / — | 1.2 / — | 1.2 / — |
| Convert to File | `n8n-nodes-base.convertToFile` | 1.1 / — | 1.1 / — | 1.2 / — |
| Split Out | `n8n-nodes-base.splitOut` | 1 / — | 1.1 / — | 1.1 / — |
| Execute Workflow | `n8n-nodes-base.executeWorkflow` | 1.3 / — | 1.4 / — | 1.4 / — |
| Execute Workflow Trigger | `n8n-nodes-base.executeWorkflowTrigger` | 1.2 / — | 1.3 / — | 1.3 / — |
| Chat Trigger | `@n8n/n8n-nodes-langchain.chatTrigger` | 1.4 / 1.4 | 1.5 / 1.5 | 1.5 / 1.5 |
| Postgres | `n8n-nodes-base.postgres` | 2.7 / 2.7 | 2.7 / 2.7 | 2.8 / 2.8 |
| MongoDB | `n8n-nodes-base.mongoDb` | 1.4 / — | 1.5 / — | 1.5 / — |
| Perplexity | `n8n-nodes-base.perplexity` | 2 / 2 | 3 / 3 | 3 / 3 |
| Edit Image | `n8n-nodes-base.editImage` | 1 / — | 1.1 / 1.1 | 2 / 2 |
| Brevo（sendInBlue） | `n8n-nodes-base.sendInBlue` | 1 / — | 1.1 / — | 1.1 / — |
| Monday.com | `n8n-nodes-base.mondayCom` | 1 / — | 1 / — | 2 / 2 |
| Kafka | `n8n-nodes-base.kafka` | 2 / 1 | 2 / 1 | 2 / 2 |
| Kafka Trigger | `n8n-nodes-base.kafkaTrigger` | 2 / 1.3 | 2 / 1.3 | 2 / 2 |
| Google Gemini Chat Model | `@n8n/n8n-nodes-langchain.lmChatGoogleGemini` | 1.1 / — | 1.2 / — | 1.2 / — |
| Azure OpenAI Chat Model | `@n8n/n8n-nodes-langchain.lmChatAzureOpenAi` | 1 / — | 1.1 / 1.1 | 1.1 / 1.1 |
| Qdrant Vector Store（其他向量庫同步變動） | `@n8n/n8n-nodes-langchain.vectorStoreQdrant` | 1.3 / — | 1.3 / — | 1.4 / — |

除 Qdrant 外，另有 12 個 `@n8n/n8n-nodes-langchain.vectorStore*` 向量庫節點（含 PGVector、Pinecone、Redis、Supabase、Weaviate 等）在 2.44.6 → 2.46.6 之間由 1.3 升到 1.4，變動方式與 Qdrant 列相同，不逐一列出；以 JSON 為準。

Kafka 與 Kafka Trigger 值得注意：它們的 `default` 與 `latest` 不同（2.37.3 與 2.44.6 的 default 是 1 或 1.3、latest 是 2），到 2.46.6 才一致。可見 `default` 與 `latest` 不一定相等，README 說明的取用順序（先看 `default`）就是為此。

## 2. 三個版本都沒變的常用節點

這些節點的 `latest` 與 `default` 在三個版本相同，寫一個 `typeVersion` 就能通用（仍要確認目標版本有這個節點）。

| 節點 | type | 2.37.3 | 2.44.6 | 2.46.6 |
|---|---|---|---|---|
| Edit Fields (Set) | `n8n-nodes-base.set` | 3.5 / 3.5 | 3.5 / 3.5 | 3.5 / 3.5 |
| Merge | `n8n-nodes-base.merge` | 3.2 / 3.2 | 3.2 / 3.2 | 3.2 / 3.2 |
| HTTP Request | `n8n-nodes-base.httpRequest` | 4.5 / 4.5 | 4.5 / 4.5 | 4.5 / 4.5 |
| Form Trigger | `n8n-nodes-base.formTrigger` | 2.6 / 2.6 | 2.6 / 2.6 | 2.6 / 2.6 |
| Wait | `n8n-nodes-base.wait` | 1.1 / — | 1.1 / — | 1.1 / — |
| Code | `n8n-nodes-base.code` | 2 / 2 | 2 / 2 | 2 / 2 |
| AI Agent | `@n8n/n8n-nodes-langchain.agent` | 3.1 / 3.1 | 3.1 / 3.1 | 3.1 / 3.1 |
| Guardrails | `@n8n/n8n-nodes-langchain.guardrails` | 2 / 2 | 2 / 2 | 2 / 2 |
| Summarize | `n8n-nodes-base.summarize` | 1.1 / — | 1.1 / — | 1.1 / — |
| Aggregate | `n8n-nodes-base.aggregate` | 1 / — | 1 / — | 1 / — |
| Compare Datasets | `n8n-nodes-base.compareDatasets` | 2.3 / — | 2.3 / — | 2.3 / — |
| Remove Duplicates | `n8n-nodes-base.removeDuplicates` | 2 / 2 | 2 / 2 | 2 / 2 |
| Sort | `n8n-nodes-base.sort` | 1 / — | 1 / — | 1 / — |
| Limit | `n8n-nodes-base.limit` | 1 / — | 1 / — | 1 / — |
| Date & Time | `n8n-nodes-base.dateTime` | 2 / 2 | 2 / 2 | 2 / 2 |
| Crypto | `n8n-nodes-base.crypto` | 2 / 2 | 2 / 2 | 2 / 2 |
| XML | `n8n-nodes-base.xml` | 1 / — | 1 / — | 1 / — |
| HTML | `n8n-nodes-base.html` | 1.2 / — | 1.2 / — | 1.2 / — |
| Markdown | `n8n-nodes-base.markdown` | 1 / — | 1 / — | 1 / — |
| Data Table | `n8n-nodes-base.dataTable` | 1.1 / — | 1.1 / — | 1.1 / — |
| Manual Trigger | `n8n-nodes-base.manualTrigger` | 1 / — | 1 / — | 1 / — |
| Schedule Trigger | `n8n-nodes-base.scheduleTrigger` | 1.4 / — | 1.4 / — | 1.4 / — |
| Respond to Webhook | `n8n-nodes-base.respondToWebhook` | 1.5 / 1.5 | 1.5 / 1.5 | 1.5 / 1.5 |
| Loop Over Items | `n8n-nodes-base.splitInBatches` | 3 / — | 3 / — | 3 / — |
| Sticky Note | `n8n-nodes-base.stickyNote` | 1 / — | 1 / — | 1 / — |

## 3. 新增的節點

- 2.37.3 → 2.44.6 新增 12 個：`@n8n/mcp-registry.databricksGenie`（Databricks Genie One MCP）、`@n8n/mcp-registry.gitHub`（GitHub MCP）、`@n8n/mcp-registry.supabase`（Supabase MCP）、`@n8n/n8n-nodes-langchain.databricksAiAgent`（Databricks AI Agent）、`@n8n/n8n-nodes-langchain.embeddingsDatabricks`（Embeddings Databricks）、`@n8n/n8n-nodes-langchain.lmChatDatabricks`（Databricks Chat Model）、`@n8n/n8n-nodes-langchain.vectorStoreDatabricks`（Databricks Vector Store）、`n8n-nodes-base.confluenceTool`（Confluence Tool）、`n8n-nodes-base.databricksTrigger`（Databricks Trigger）、`n8n-nodes-base.microsoftDataverse`（Microsoft Dataverse）、`n8n-nodes-base.microsoftDataverseTool`（Microsoft Dataverse Tool）、`n8n-nodes-base.microsoftSharePointTrigger`（Microsoft SharePoint Trigger）。
- 2.44.6 → 2.46.6 新增 1 個：`@n8n/n8n-nodes-langchain.memoryLakebaseChat`（Databricks Lakebase Chat Memory）。
- 合計 2.37.3 → 2.46.6 新增 13 個，以 Databricks、Microsoft（Dataverse、SharePoint）、MCP registry 項目為主。
- Guardrails（`@n8n/n8n-nodes-langchain.guardrails`）與 Data Table（`n8n-nodes-base.dataTable`、`dataTableTool`）**在 2.37.3 就已存在**，不是這段期間新增的；兩者的 latest 在三個版本都沒變（Guardrails 2、Data Table 1.1）。

## 4. 消失、被標示棄用或隱藏的節點

- 2.37.3 有、2.46.6 沒有的節點：無（0 個）。
- 2.37.3 沒有標示、2.46.6 標示 `deprecated` 的節點：`@n8n/n8n-nodes-langchain.code`、`n8n-nodes-base.function`、`n8n-nodes-base.functionItem`。其中 `function`、`functionItem` 的 `replacedBy` 為 `n8n-nodes-base.code`。
- 2.37.3 沒有標示、2.46.6 標示 `hidden` 的節點：`n8n-nodes-base.e2eTestPollingTrigger`、`n8n-nodes-base.line`、`n8n-nodes-base.lineTool`。

舊式節點在三個版本的狀態：

| type | 2.37.3 | 2.44.6 | 2.46.6 |
|---|---|---|---|
| `n8n-nodes-base.function` | 未棄用／隱藏（latest 1） | 棄用／隱藏（latest 1） | 棄用／隱藏（latest 1） |
| `n8n-nodes-base.functionItem` | 未棄用／隱藏（latest 1） | 棄用／隱藏（latest 1） | 棄用／隱藏（latest 1） |
| `n8n-nodes-base.cron` | 未棄用／隱藏（latest 1） | 未棄用／隱藏（latest 1） | 未棄用／隱藏（latest 1） |
| `n8n-nodes-base.interval` | 未棄用／隱藏（latest 1） | 未棄用／隱藏（latest 1） | 未棄用／隱藏（latest 1） |
| `n8n-nodes-base.start` | 不存在 | 不存在 | 不存在 |
| `n8n-nodes-base.executeCommand` | 不存在 | 不存在 | 不存在 |
| `n8n-nodes-base.itemLists` | 未棄用／隱藏（latest 3.1） | 未棄用／隱藏（latest 3.1） | 未棄用／隱藏（latest 3.1） |
| `n8n-nodes-base.spreadsheetFile` | 未棄用／隱藏（latest 2） | 未棄用／隱藏（latest 2） | 未棄用／隱藏（latest 2） |

說明：

- `function`、`functionItem`：目錄裡仍有條目，但 2.37.3 只有 `hidden`，**從 2.44.6 起多了 `deprecated`**。這與 [`../n8n-version-compat.md`](../n8n-version-compat.md) 觀察到的「2.44.6 起匯入含 Function 節點的 workflow 被拒（400）」同一時間點。一律改用 Code。
- `cron`、`interval`：三個版本都只有 `hidden`，沒有 `deprecated` 標記。目錄把它們標為隱藏，新 workflow 應改用 Schedule Trigger。
- `start`：三個版本的目錄都沒有這個 type。舊範本的 Start 節點要換成 Manual Trigger 或其他觸發器。
- `executeCommand`：三個版本的目錄都**查不到**。本文觀察的是預設設定的全新實例；若管理員另行設定允許載入，行為可能不同，本文沒有觀察。
- `itemLists`、`spreadsheetFile`：三個版本都是 `hidden`、未標示 `deprecated`，目錄仍保留它們。產生新 workflow 不要使用，改用 Split Out／Sort／Limit／Aggregate 與 Extract From File／Convert to File。

## 5. 對產生 workflow 的影響

1. 目標版本是 2.37.3 時，IF／Filter 用 2.3、Switch 用 3.4、Webhook 用 2.1、Extract From File 與 Convert to File 用 1.1、Split Out 用 1。
2. 目標版本是 2.44.6 時，IF／Filter 用 2.4、Switch 用 3.5、Webhook 用 2.2、Extract From File 用 1.2、Split Out 用 1.1，但 Convert to File 仍是 1.1。
3. 目標版本是 2.46.6 時，以上全部取最新；Convert to File 為 1.2。
4. 不確定目標版本時，使用 [`README.md`](README.md) 的步驟對該實例重產一份 JSON，不要用上面的數字推測。
