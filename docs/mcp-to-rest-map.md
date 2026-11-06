# 官方 Skill 的 MCP 工具與 REST 呼叫對照

本文件給**使用 `skills/_vendor/*-official`（來自 [n8n-io/skills](https://github.com/n8n-io/skills)）的 AI 與人**。這 15 個官方 Skill 是為 n8n 的 MCP 工具設計的；本 Pack 只用 n8n 公開 REST API，沒有 MCP 連線。所以官方 Skill 叫你「呼叫某個 MCP 工具」時，請查本表：有對應就改用 REST，沒有對應就照實說明，不要假裝做過。

REST 的操作細節（連線、金鑰、合併寫回、錯誤碼）見 [`skills/tigerai/n8n-api-bridge/SKILL.md`](../skills/tigerai/n8n-api-bridge/SKILL.md)。

## 依據與範圍

- **MCP 工具清單**：以 15 個官方 Skill 的實際文字為準（釘選 commit `27b6b9f`，plugin 版本 1.3.0）。官方入口 Skill `using-n8n-skills-official` 內有完整的工具摘要表，共 58 個工具，本文件逐一列出，沒有漏。
- **REST 範圍**：以本機測試實例 n8n 2.46.6 的公開 API 規格（`/api/v1/openapi.yml`）為準。其他版本的端點可能不同，已跑過的版本見 [`n8n-version-compat.md`](n8n-version-compat.md)。
- **盤點方式**：先用 `grep -rIohE '\b[a-z]+(_[a-z0-9]+)+\b'` 掃出 15 個 Skill 內所有 snake_case 字串，再對照官方入口 Skill 的工具表確認哪些真的是 MCP 工具，最後逐一用 `grep -rIoh "\b<工具名>\b"` 計次。次數含入口 Skill 的工具表本身，所以只代表「被提到的程度」，不是呼叫頻率。
- **「有對應」的意思**：規格中有功能相同的端點。沒有在每個端點上實際執行過，寫入類操作使用前請先在測試實例確認。
- **不在對照範圍的名稱**：`n8n-agents-official` 內出現的 `delegate_subagent`、`load_skill`、`record_note`、`write_todos`、`find_file`、`search_text`、`read_file`、`get_environment`、`mark_session_failed`、`fetch_input_data`、`fetch_workflow_context` 等，是 n8n Agent **執行時內建的工具**，不是 MCP 管理工具；`create_issue`、`search_issues`、`get_order`、`get_current_datetime` 等是文件裡的範例工具名稱。這些都不需要 REST 對應。

## 總覽

| 對應程度 | 工具數 | 意思 |
|---|---|---|
| 有對應 | 17 | 可直接改用 REST 端點 |
| 部分對應 | 10 | 功能接近，但要自己組合呼叫，或有明顯限制 |
| 沒有對應 | 31 | REST-only 模式下做不到，見下方替代做法或請使用者手動處理 |

沒有對應的 31 個工具分成四群：

1. **節點與 SDK 知識**（`get_node_types`、`search_nodes`、`explore_node_resources`、`get_workflow_sdk_reference`、`get_workflow_best_practices`）：公開 API 不提供節點型別與參數定義。這是官方 Skill 最常要求先呼叫的一群，REST-only 模式下**不能**拿來當「已查過節點定義」的依據。
2. **伺服器端檢查與以程式碼建立**（`validate_workflow`、`validate_node_config`、`create_workflow_from_code`）。
3. **直接執行與測試**（`execute_workflow`、`test_workflow`、`prepare_workflow_pin_data`）。
4. **偏好與 Agent 管理**（4 個偏好工具、15 個 Agent 工具）、`list_n8n_gateway_services`。

## 對照表

### 一、工作流程管理

| MCP 工具（出現次數／分布的 Skill 數） | 官方 Skill 用它做什麼 | 對應程度 | REST 對應 | 備註與限制 |
|---|---|---|---|---|
| `search_workflows`（39 次／7 個） | 跨實例搜尋既有 workflow（名稱、標籤），建新東西前先找有沒有可重用的子流程 | 部分對應 | `GET /api/v1/workflows`，可帶 `name`、`tags`、`active`、`projectId`、`limit`、`cursor` | 規格沒說明 `name` 與 `tags` 的比對方式（子字串或完全相符、標籤是 AND 或 OR），第一次使用請用已知資料實測一次再信任結果。MCP 版會搜 description；REST 版要自己取回清單後在本地過濾 `description` 欄位。 |
| `get_workflow_details`（42 次／10 個） | 讀 workflow 完整 JSON；建立或更新後拉回來檢查 `connections` | 有對應 | `GET /api/v1/workflows/{id}` | 可加 `excludePinnedData=true` 省掉 pinData。Pack 的做法見 `skills/tigerai/n8n-api-bridge/SKILL.md` 第 4 節。 |
| `search_folders`（5 次／2 個） | 用資料夾名稱解析出資料夾 ID | 部分對應 | `GET /api/v1/projects/{projectId}/folders`（支援 `filter`、`select`、`sortBy`、`skip`、`take`） | 必須先知道 `projectId`。取得專案清單要用 `GET /api/v1/projects`，但該端點需要金鑰有對應權限；本機測試實例以現有金鑰呼叫曾回 403。 |
| `create_folder`（7 次／3 個） | 建立資料夾（可巢狀） | 有對應 | `POST /api/v1/projects/{projectId}/folders` | 同上，需要 `projectId`。 |
| `update_folder`（5 次／3 個） | 資料夾改名或搬移 | 有對應 | `PATCH /api/v1/projects/{projectId}/folders/{folderId}` | — |
| `move_workflows_to_folder`（8 次／3 個） | 把 workflow 搬進資料夾或專案根目錄 | 部分對應 | 沒有專用端點；規格中 `PUT /api/v1/workflows/{id}` 的 body 列有 `parentFolderId` | 實際上會不會真的搬移，本檔沒有在實例上實測，使用前請先在測試實例確認。搬移需要整份 workflow 一起 PUT（見 `update_workflow`）。 |
| `search_projects`（3 次／3 個） | 用專案名稱解析專案 ID（唯讀） | 部分對應 | `GET /api/v1/projects` | 需要金鑰有對應權限，也可能受授權方案限制；沒有權限時請使用者直接提供 `projectId`。 |
| `list_workflow_tags`（8 次／4 個） | 列出所有標籤，使用既有名稱避免重複 | 有對應 | `GET /api/v1/tags`（分頁：`limit`、`cursor`） | 規格沒有承諾回傳每個標籤的使用次數（MCP 版有 `usageCount`），需要時自己用 `GET /api/v1/workflows?tags=` 統計。 |
| `archive_workflow`（3 次／2 個） | 軟刪除 workflow | 有對應 | `POST /api/v1/workflows/{id}/archive` | 重複封存會回 200 並回傳目前內容。另有 `POST .../unarchive`。 |
| `publish_workflow`（17 次／3 個） | 發布（啟用）workflow；官方 Skill 要求發布前先做檢查 | 有對應 | `POST /api/v1/workflows/{id}/publish`（可選 body：`versionId`、`name`、`description`） | Pack 現行文件使用舊名 `POST .../activate`（規格仍有此端點）。發布時 n8n 會做結構檢查，失敗會回錯誤，見 `n8n-api-bridge` 第 5 節。 |
| `unpublish_workflow`（3 次／2 個） | 取消發布（停用） | 有對應 | `POST /api/v1/workflows/{id}/unpublish`（舊名 `POST .../deactivate`） | — |
| `search_workflow_executions`（2 次／2 個） | 跨 workflow 搜尋執行紀錄（狀態、時間範圍） | 有對應 | `GET /api/v1/executions`，可帶 `status`、`workflowId`、`projectId`、`startedAfter`、`startedBefore`、`limit`、`cursor` | 預設只回中繼資料；要節點輸入輸出加 `includeData=true`，資料量可能很大。 |

### 二、建構 workflow

| MCP 工具（出現次數／分布的 Skill 數） | 官方 Skill 用它做什麼 | 對應程度 | REST 對應 | 備註與限制 |
|---|---|---|---|---|
| `get_workflow_sdk_reference`（4 次／2 個） | 讀 n8n Workflow SDK 的參考文件，寫 SDK 程式碼前必讀 | 沒有對應 | （無） | SDK 與 MCP 綁定。REST 模式直接寫 workflow JSON，請改讀 Pack 的 `cookbook/`、`spec/` 與官方 Skill 內的節點設定文件。 |
| `get_workflow_best_practices`（2 次／1 個） | 依技巧類型取得最佳實務 | 沒有對應 | （無） | 替代做法：閱讀已收錄的官方 Skill 本文，以及 Pack 的 `research/patterns.md`。 |
| `search_nodes`（9 次／5 個） | 用功能關鍵字搜尋節點，取得節點 ID 與 resource/operation 判別值 | 沒有對應 | 公開 API 沒有節點型別目錄端點 | 替代做法：從現有 workflow JSON 或 UI 匯出的 JSON 讀 `type` 與 `typeVersion`；查 n8n 官方節點文件；參考 `research/` 的節點使用統計。不要憑記憶猜節點型別字串。 |
| `get_node_types`（43 次／5 個） | 取得節點精確的參數定義（官方 Skill 最常呼叫的工具） | 沒有對應 | 公開 API 沒有節點參數定義端點 | 替代做法：請使用者在 n8n UI 手動放一個該節點、設好後匯出 JSON，照著該 JSON 的參數名稱寫；或手動比對官方節點文件。查不到時要明講「參數名稱未經查證」，不要猜。 |
| `explore_node_resources`（16 次／5 個） | 把資源選擇器與下拉選項解析成實際值（Slack 頻道、Sheets 分頁、資料庫欄位等） | 沒有對應 | 公開 API 沒有對應端點 | 替代做法：請使用者提供實際 ID 或名稱，或從 UI 匯出現有節點的 JSON 取值。Pack 不呼叫 n8n 內部（非公開）端點。 |
| `create_workflow_from_code`（21 次／5 個） | 把 SDK 程式碼存成 workflow | 沒有對應 | 「以 SDK 程式碼建立」沒有對應；單純「建立 workflow」可用 `POST /api/v1/workflows` | REST 的 body 必須含 `name`、`nodes`、`connections`、`settings`，也就是你要自己產出完整 JSON。官方 Skill 中的 SDK 範例（`.to()`、`node()` 等寫法）只能當概念參考，不能直接貼進 REST。 |
| `update_workflow`（34 次／8 個） | 對 workflow 套用原子操作（節點與連線增刪、設定憑證、標籤、節點群組等，最多 100 個操作） | 部分對應 | `PUT /api/v1/workflows/{id}`；標籤另用 `PUT /api/v1/workflows/{id}/tags` | REST 是整份取代，不是逐項操作：先 GET、在本地修改 JSON、再 PUT（body 必須含 `name`、`nodes`、`connections`、`settings`；公開 API 不支援 PATCH）。已發布的 workflow 被 PUT 後預設會自動重新發布，可帶 `publishIfActive=false` 避免。`skillsUsed` 欄位在 REST 沒有意義，直接略過。 |
| `validate_node_config`（9 次／4 個） | 只針對節點參數做結構檢查 | 沒有對應 | 無伺服器端檢查端點 | 替代做法：用已收錄的 `n8n-validation-expert` 與官方 Skill 的檢查清單人工核對；實際寫入測試實例並 publish，由 n8n 回傳的錯誤判斷。 |
| `validate_workflow`（22 次／7 個） | 發布前對整份 workflow 做伺服器端檢查 | 沒有對應 | 無獨立檢查端點 | 替代做法：在測試實例用 `POST /api/v1/workflows` 建立，再 `POST .../publish`，n8n 會拒絕部分結構錯誤；之後 GET 回來檢查 `connections`。這只是結構層，官方 Skill 提醒的接線陷阱仍需人工核對檢查清單。 |
| `list_credentials`（12 次／5 個） | 列出可用憑證的中繼資料（不含機密），取得 ID 以綁定節點 | 部分對應 | `GET /api/v1/credentials`（分頁：`limit`、`cursor`） | 只有實例擁有者與管理員的金鑰能用，且沒有依類型或專案篩選的參數，要在本地過濾。回應不含機密值。 |
| `list_n8n_gateway_services`（2 次／1 個） | 列出平台可提供託管憑證（Gateway credits）的節點與憑證類型 | 沒有對應 | （無） | 官方 Skill 自己註明目前僅限 n8n Cloud。自架環境一律走一般憑證流程。 |

### 三、測試與執行

| MCP 工具（出現次數／分布的 Skill 數） | 官方 Skill 用它做什麼 | 對應程度 | REST 對應 | 備註與限制 |
|---|---|---|---|---|
| `prepare_workflow_pin_data`（11 次／5 個） | 回傳需要釘選資料的節點之 JSON Schema，由 AI 產生樣本值 | 沒有對應 | （無） | 替代做法：自己判斷觸發節點、需憑證節點與 HTTP Request 節點，手寫 `pinData` 放進 workflow JSON（REST 的 workflow body 有 `pinData` 欄位）。 |
| `test_workflow`（42 次／10 個） | 用釘選資料執行 workflow，觸發與憑證節點自動釘選 | 沒有對應 | 無（`/workflows/{id}/test-runs` 是評估（evaluation）測試，需要 workflow 內有評估觸發節點，不是同一件事） | 替代做法：在測試實例建一份測試用副本，把會對外送出的節點（寄信、寫入、付款）換成不動作的節點，再用 Webhook 觸發並用 `GET /api/v1/executions` 讀結果。`pinData` 只對編輯器的手動執行有效，不要期待 REST 或正式 URL 會套用。 |
| `execute_workflow`（8 次／3 個） | 以真實觸發器執行 workflow（manual 或 production 模式） | 沒有對應 | 公開 API 沒有「依 ID 執行 workflow」的端點 | 替代做法：workflow 用 Webhook、Form 或 Chat 觸發，發布後對正式 URL（`/webhook/...`）發 HTTP 請求；測試 URL（`/webhook-test/...`）需要編輯器處於監聽狀態，純 REST 無法開啟。排程類觸發只能等排程或改用 Webhook。 |
| `get_workflow_execution`（28 次／6 個） | 依 executionId 取得執行紀錄，可選取節點輸入輸出 | 部分對應 | `GET /api/v1/executions/{executionId}`，可帶 `includeData=true` | 沒有 `nodeNames` 與 `truncateData` 篩選，資料量大時自己在本地擷取需要的節點；規格另有 `ignoreDataSizeLimit`、`redactExecutionData` 參數。不需要提供 workflowId。 |

### 四、Data Tables

| MCP 工具（出現次數／分布的 Skill 數） | 官方 Skill 用它做什麼 | 對應程度 | REST 對應 | 備註與限制 |
|---|---|---|---|---|
| `create_data_table`（6 次／3 個） | 建立 Data Table | 有對應 | `POST /api/v1/data-tables` | — |
| `search_data_tables`（4 次／2 個） | 找既有 Data Table | 部分對應 | `GET /api/v1/data-tables`（`filter`、`sortBy`、`limit`、`cursor`） | 規格沒有說明 `filter` 可用的欄位，需要時取回清單後在本地以名稱過濾。 |
| `rename_data_table`（1 次／1 個） | 資料表改名 | 有對應 | `PATCH /api/v1/data-tables/{dataTableId}` | — |
| `rename_data_table_column`（2 次／2 個） | 欄位改名 | 有對應 | `PATCH /api/v1/data-tables/{dataTableId}/columns/{columnId}` | 需先用 `GET .../columns` 找出 `columnId`。 |
| `add_data_table_column`（2 次／2 個） | 新增欄位 | 有對應 | `POST /api/v1/data-tables/{dataTableId}/columns` | — |
| `delete_data_table_column`（2 次／2 個） | 刪除欄位 | 有對應 | `DELETE /api/v1/data-tables/{dataTableId}/columns/{columnId}` | 刪除不可復原，執行前先向使用者確認。 |
| `add_data_table_rows`（1 次／1 個） | 新增資料列 | 有對應 | `POST /api/v1/data-tables/{dataTableId}/rows` | 另有 `POST .../rows/upsert` 與 `PATCH .../rows/update`。 |
| `get_data_table_rows`（1 次／1 個） | 讀取資料列（可篩選、排序、分頁） | 有對應 | `GET /api/v1/data-tables/{dataTableId}/rows`（`filter`、`sortBy`、`search`、`limit`、`cursor`） | — |

### 五、版本歷史

| MCP 工具（出現次數／分布的 Skill 數） | 官方 Skill 用它做什麼 | 對應程度 | REST 對應 | 備註與限制 |
|---|---|---|---|---|
| `get_workflow_history`（2 次／2 個） | 列出 workflow 的歷史版本（新到舊） | 有對應 | `GET /api/v1/workflows/{id}/history`（分頁：`limit`、`cursor`） | 回傳版本 ID 與中繼資料，不含節點內容。 |
| `get_workflow_version`（2 次／2 個） | 依 versionId 取得歷史版本完整內容 | 有對應 | `GET /api/v1/workflows/{id}/versions/{versionId}` | 規格中另有 `GET /api/v1/workflows/{id}/{versionId}` 這個較不明確的路徑，建議用前者。 |
| `get_workflow_versions_diff`（1 次／1 個） | 比對兩個版本差異 | 部分對應 | 沒有專用端點 | 替代做法：分別取兩個版本的 JSON，在本地比對節點與連線的增減。 |
| `restore_workflow_version`（2 次／2 個） | 把舊版本重新套用為目前草稿 | 部分對應 | 沒有專用端點；組合做法：`GET .../versions/{versionId}` 取出內容，再 `PUT /api/v1/workflows/{id}` | 這是寫入動作，執行前先向使用者確認；是否產生新的歷史紀錄，以實例實際行為為準。 |

### 六、使用者偏好（n8n 內建的偏好儲存）

| MCP 工具（出現次數／分布的 Skill 數） | 官方 Skill 用它做什麼 | 對應程度 | REST 對應 | 備註與限制 |
|---|---|---|---|---|
| `get_user_preferences`（4 次／1 個） | 讀取實例、使用者、專案層級的偏好 | 沒有對應 | （無） | 替代做法：直接詢問使用者，需要保存時依你的工具環境用自己的記憶機制，並告訴使用者這份偏好不會同步到 n8n。 |
| `save_user_preference`（3 次／1 個） | 儲存一條偏好 | 沒有對應 | （無） | 同上。 |
| `update_user_preference`（2 次／1 個） | 修改偏好 | 沒有對應 | （無） | 同上。 |
| `undo_user_preference`（1 次／1 個） | 移除偏好 | 沒有對應 | （無） | 同上。 |

### 七、n8n Agents（第一級 Agent 物件）

官方 `n8n-agents-official` 與 `using-n8n-skills-official` 描述的是 n8n 內建的「Agent」功能，用一組專用 MCP 工具操作。公開 REST API 規格（2.46.6）沒有 Agent 的建立、修改、發布端點。唯一沾到邊的是 Beta 的 `POST /api/v1/n8n-packages/export` 與 `import`，可匯出或匯入包含 Agent 的套件，但那不是逐項編輯 Agent 的替代品。

| MCP 工具（出現次數／分布的 Skill 數） | 官方 Skill 用它做什麼 | 對應程度 | REST 對應 | 備註與限制 |
|---|---|---|---|---|
| `get_agent_builder_reference`（4 次／2 個） | 讀 Agent 設定與 mutate 操作的參考文件 | 沒有對應 | （無） | 只能請使用者在 n8n UI 操作，或改用 workflow 內的 AI Agent 節點（見 `n8n-ai-nodes-official`）。 |
| `discover_agent_assets`（9 次／2 個） | 找可引用的模型、聊天整合、可掛載的 workflow、子 Agent、MCP 伺服器 | 沒有對應 | （無） | 同上。 |
| `search_agents`（3 次／2 個） | 搜尋既有 Agent | 沒有對應 | （無） | 同上。 |
| `get_agent`（11 次／3 個） | 讀取 Agent 草稿設定與 `configHash` | 沒有對應 | （無） | 同上。 |
| `list_agent_versions`（2 次／2 個） | 列出 Agent 發布歷史 | 沒有對應 | （無） | 同上。 |
| `create_agent`（11 次／3 個） | 建立 Agent 草稿 | 沒有對應 | （無） | 同上。 |
| `mutate_agent`（12 次／2 個） | 對 Agent 套用一項設定、技能、任務或自訂工具變更 | 沒有對應 | （無） | 同上。 |
| `verify_agent_mcp_server`（3 次／2 個） | 測試 MCP 伺服器與憑證並回傳其工具清單 | 沒有對應 | （無） | 同上。 |
| `update_agent_integration`（10 次／2 個） | 連接或中斷 Slack、Telegram、Linear 頻道 | 沒有對應 | （無） | 同上。 |
| `validate_agent`（10 次／2 個） | 發布前檢查 Agent 草稿、引用與憑證權限 | 沒有對應 | （無） | 同上。 |
| `call_agent`（13 次／2 個） | 用內建預覽對話測試 Agent | 沒有對應 | （無） | 同上。 |
| `publish_agent`（9 次／2 個） | 發布 Agent（會啟動其任務與整合） | 沒有對應 | （無） | 同上。 |
| `unpublish_agent`（2 次／2 個） | 取消發布 Agent | 沒有對應 | （無） | 同上。 |
| `revert_agent`（2 次／2 個） | 從已發布版本還原草稿 | 沒有對應 | （無） | 同上。 |
| `delete_agent`（2 次／2 個） | 永久刪除 Agent | 沒有對應 | （無） | 同上。 |

## 給 AI 的使用規則

1. 官方 Skill 叫你呼叫某個 MCP 工具時，**先確認這個對話裡有沒有實際的 MCP 連線**。沒有，就查上面的對照表。
2. 表中標「有對應」或「部分對應」的，改用表中的 REST 呼叫，並照 `n8n-api-bridge` 的流程操作（先 GET、本地修改、再 PUT；寫入前先確認；金鑰只用環境變數，不印出、不寫進檔案）。
3. 表中標「沒有對應」的，**明確告訴使用者**：這項能力在 REST-only 模式下不可用，然後提出表中的替代做法，或請使用者自己在 n8n 介面操作並把結果（例如匯出的節點 JSON）貼給你。
4. **不得假裝呼叫成功。** 不可以：
   - 寫出「已用 `get_node_types` 查過參數」之類的句子，如果你根本沒有呼叫它；
   - 憑記憶猜節點型別、參數名稱、`typeVersion`，再說成是查過的結果；
   - 把「寫入測試實例後沒有報錯」說成「已做過 `validate_workflow` 或 `test_workflow`」；
   - 把 Webhook 呼叫成功說成「已用 `execute_workflow` 執行」。
5. 官方 Skill 的**規則與判斷準則**（例如 Code 節點是最後手段、錯誤分支、子流程、憑證不放在文字欄位）與是否有 MCP 無關，仍然適用，照常遵守。只有「呼叫哪個工具」這一層需要換成 REST 或說明做不到。
6. 官方 Skill 內的 SDK 程式碼範例（`workflow()`、`.to()`、`node()` 等）只能當概念參考。REST 模式要產出的是完整 workflow JSON（`name`、`nodes`、`connections`、`settings`）。
7. 完成工作時，要告訴使用者：哪些步驟用了 REST、哪些步驟因為沒有對應而改為人工或略過。

## 變更紀錄

- 初版：依 n8n-io/skills 釘選 commit `27b6b9f`（plugin 1.3.0）與 n8n 2.46.6 公開 API 規格整理。官方 Skill 或 n8n 版本更新時，請重新盤點。
