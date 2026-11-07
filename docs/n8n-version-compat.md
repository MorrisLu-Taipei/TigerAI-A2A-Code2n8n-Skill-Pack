# n8n 版本相容表（實測紀錄）

> 對應報告：[`tests/REPORT-4.md`](../tests/REPORT-4.md)
> 實測日期：2026-11-06

`plugin.json` 的 `requires` 寫的是 `n8n_instance >=1.0.0`，但 1.x 與 2.x 全部沒有實測。本表只記錄**實際在三個 2.x 版本上觀察到的行為**，沒有觀察到的一律標為「未實測」。

## 實測條件

| 項目 | 內容 |
|---|---|
| 版本 | 2.37.3、2.44.6、2.46.6（官方 docker 映像） |
| 實例 | 每個版本各一個全新的空實例（SQLite），互不共用資料 |
| 憑證 | 全部是假值；不呼叫任何真實第三方服務 |
| 方法 | 用 public API（`/api/v1`）匯入 → 啟用 → 有 webhook 就用 `curl` 觸發 → 停用 |
| 測試對象 | 第一組 37 支：`cookbook/_*.json` 4 支、`examples/templates/` 3 支、`examples/` 其餘案例 30 支（einvoice 14、google-workspace-admin 7、line-ai-customer-service 6、tigerai-flagship 3）。第二組 8 支：`tests/` 下的 T1–T5、Q1–Q3，結果見 [`tests/REPORT-4.md`](../tests/REPORT-4.md) |

## 結果總表（修正前）

> 這張表是三支範本還在使用 `Function` 節點時的觀察，保留作為版本差異的證據。修正後的重測結果見下一節「修正後複測」。

| 項目 | 2.37.3 | 2.44.6 | 2.46.6 |
|---|---|---|---|
| 匯入成功（第一組 37 支） | 37 / 37 | 34 / 37 | 34 / 37 |
| 啟用成功（第一組，假憑證下） | 12 / 37 | 10 / 37 | 10 / 37 |
| `n8n-nodes-base.function` 節點 | 可匯入、可啟用 | **匯入被拒（400）** | **匯入被拒（400）** |
| 執行失敗時 webhook 的回應碼 | 200 | 500（3 支） | 500（3 支） |
| `tests/` 8 支，憑證 ID 指向不存在的憑證時啟用 | 4 支成功；Telegram 被拒（憑證）；Q1 缺 `documentId`；Q2、Q3 webhook 路徑衝突 | 5 支成功；Q1、Q2、Q3 同樣失敗 | **0 支成功，8 支全部被拒（400）** |
| `PATCH /api/v1/workflows/{id}` | 405 | 405 | 405 |
| 不合格的 `PUT` | 400 | 400 | 400 |
| 兩支 workflow 使用相同 webhook `path` 同時啟用 | 409 | 409 | 409 |

啟用失敗幾乎都是範本設計上要使用者填值，不是版本差異：缺憑證、`REPLACE_WITH_*` 佔位符、空的 `path` 或 `folderId`、沒有觸發節點的 starter。

## 修正後複測（2026-11-06）

三支範本（`examples/templates/`）已修正：棄用的 `Function` 節點改為 `Code`，並順帶修掉複測時發現的節點設定錯誤（見下方「已修正」）。複測在同一組三個實例上進行。

### 範本本身的結果

匯入與啟用直接使用 repo 內的檔案。執行則是在**暫存副本**把 `Trigger`（Manual Trigger）換成 Webhook 後，用 `curl` 觸發；repo 內的檔案沒有被改成 Webhook。

| 範本 | 項目 | 2.37.3 | 2.44.6 | 2.46.6 |
|---|---|---|---|---|
| `retry-with-backoff` | 匯入 | 200 | 200 | 200 |
| | 啟用（原檔） | 200 | 200 | 200 |
| | 2xx 成功路徑 | 走到 `Mark success` | 同左 | 同左 |
| | 先失敗再成功（重試 1 次） | 走到 `Mark success`，約 3 秒 | 同左 | 同左 |
| | 一直回 500 | 呼叫 4 次（1 次加 3 次重試），等待 2/4/8 秒，約 15 秒，進 `Dead-letter sink` | 同左 | 同左（約 14 秒） |
| | 網址無法連線（原檔的 `example.invalid`） | 同上，進 `Dead-letter sink` | 同左 | 同左 |
| `human-approval-gate` | 匯入 | 200 | 200 | 200 |
| | 啟用（原檔） | 200 | 200 | 200 |
| | 核准（`decision=approve`） | `Wait` 恢復，走 `Apply destructive action` | 同左 | 同左 |
| | 拒絕（`decision=reject`） | 走 `Audit reject`，`approver` 取到 `bob` | 同左 | 同左 |
| | 沒帶 `decision` | 走 `Audit reject` | 同左 | 同左 |
| | 等待逾時（暫存副本改成 1 分鐘） | 走 `Audit reject` | 同左 | 同左 |
| `handover-trace` | 匯入 | 200 | 200 | 200 |
| | 啟用（原檔） | **400**，沒有觸發節點 | **400** | **400** |
| | 暫存副本（換成 Webhook）啟用與執行 | 7 個節點全部成功；`Merge handovers` 輸出 2 筆，`downstreamIds` 有 A 與 B 兩個 ID | 同左 | 同左 |

### 已修正

| 範本 | 修正內容 |
|---|---|
| 三支共通 | `Function` 節點改為 `Code`（typeVersion 2）；說明便條加上「這是模式範本，需自行接上真實觸發器後才能啟用」，並讓便條上的節點名稱與實際節點一致 |
| `retry-with-backoff` | `HTTP ok?`：IF v1 不支援的 `between` 運算（執行時 `compareOperationFunctions[...] is not a function`），改為 IF 2.3 的兩個數字條件（`>= 200` 且 `<= 299`）；`Exhausted?` 同樣改為 IF 2.3 |
| | 迴圈狀態：`Increment + decide` 的輸入是 HTTP 節點的結果，不是迴圈狀態。改為從 `Init loop state` 讀狀態、用 `$runIndex` 計算第幾次嘗試 |
| | `Try HTTP`：加上 `POST` 與 JSON body 設定、`fullResponse`、`neverError`，讓 4xx、5xx 也能取得 `statusCode`；失敗處理改用 `onError: continueRegularOutput` |
| | `Wait backoff`：單位由 `ms` 改為 `seconds`（`waitMs / 1000`），typeVersion 1.1 |
| `human-approval-gate` | `Approved?`：原本在 IF v1 使用無效的運算名稱 `equals`（v1 為 `equal`），改為 IF 2.3 的字串 `equals` 條件 |
| | `Wait for approval`：原本的 `webhookSuffix: approve` 會讓拒絕連結無法恢復流程，且 `responseTimeout` 不是 Wait 節點的選項（等於沒有逾時）。改為 `limitWaitTime`（24 小時），逾時走拒絕分支 |
| | `Notify approver`：實際組出 `approveUrl`、`rejectUrl`。`$execution.resumeUrl` 本身已帶 `?signature=`，所以用 `&decision=` 接上去；用 `?` 接會把 `decision` 併進簽章值，在 2.46.6 得到 401 `Invalid token`（其它兩版沒有重跑這條錯誤路徑） |
| | `Apply destructive action`、`Audit reject`：Wait 恢復後的輸入是核准者的請求，不含先前的資料，改從 `Stamp correlation` 讀 `correlationId` |
| `handover-trace` | `Merge handovers`：原本 `combine` 加 `mergeByPosition` 會把 A、B 兩筆合成一筆，欄位同名時後者覆蓋前者，只剩一個 `acceptedId`。改為 Merge 3.2 的 `append`，兩筆各自保留 |

### 37 支重跑（2026-11-06，同一份腳本流程）

| 項目 | 2.37.3 | 2.44.6 | 2.46.6 |
|---|---|---|---|
| 匯入成功 | 37 / 37 | 37 / 37 | 37 / 37 |
| 啟用成功（假憑證下） | 12 / 37 | 12 / 37 | 12 / 37 |
| webhook 回 500 | 0 | 3 | 3 |

啟用成功的 12 支裡，包含 `retry-with-backoff` 與 `human-approval-gate`。`handover-trace` 啟用被拒（400）是範本設計：它只有 Manual Trigger。原先在 2.44.6、2.46.6 匯入失敗的 3 支現在都能匯入。其餘 34 支的匯入、啟用、webhook 回應碼與修正前逐支比對，沒有差異，沒有變動。

### 仍存在的限制

- 三支都是「模式範本」，使用者必須先接上真實觸發器。`retry-with-backoff` 與 `human-approval-gate` 含 `Wait` 節點，n8n 允許直接啟用，但沒有任何來源能啟動它們；`handover-trace` 則直接拒絕啟用。
- 執行路徑是在暫存副本（觸發器換成 Webhook）上走過；repo 內的檔案本身沒有被直接執行。
- `retry-with-backoff` 的 2xx 與 500 回應來自同一實例上的測試用 webhook，沒有對真實 API 試過 429、逾時（`timeout: 10000`）等情況。
- `human-approval-gate` 的 24 小時等待沒有實際等完，逾時分支是用 1 分鐘的副本走的。`Notify approver` 仍是 `Code` 佔位節點，沒有接 Slack、信箱等真實通道。
- `Wait` 的恢復連結帶有簽章（`signature`）。從 `$execution.resumeUrl` 組連結時要保留它，再用 `&` 接其它參數。
- 只在 2.37.3、2.44.6、2.46.6 測過；其它版本沒有結果。

## 已知相容問題

### 已修正

1. **已棄用的 `Function` 節點**（修正前觀察見上方總表）
   `examples/templates/` 三支原本使用 `n8n-nodes-base.function`，2.44.6 以上直接拒絕匯入。已改為 `Code` 節點，複測三個版本都能匯入。
2. **範本內的節點設定錯誤**
   `retry-with-backoff` 的 `between` 運算與迴圈狀態、`human-approval-gate` 的條件運算與恢復連結、`handover-trace` 的 Merge 設定，細節見「修正後複測 → 已修正」。
3. **API 文件與實際不符**
   `n8n-api-bridge` 先前寫的 `PATCH` 與 422，實測為 405 與 400，已在 SKILL 更正。

### 仍未修正（版本行為，非 Pack 可改）

1. **Webhook 失敗回應碼改變**
   2.37.3 在 workflow 執行出錯時，webhook 仍回 200；2.44.6 以上回 500。依賴回應碼判斷成敗的呼叫端要注意。
2. **憑證檢查變嚴**
   2.46.6 啟用時會檢查 workflow 引用的憑證是否存在；只用假的 ID 字串無法啟用。
3. **`Function` 節點在 2.44.6 以上不能匯入**
   這是 n8n 的行為。Pack 內已沒有使用它的檔案，所以複測沒有再次直接觀察；使用者自己的舊 workflow 若含此節點仍會被拒。

## 未實測

- n8n 1.x 與 2.0～2.36 的任何版本。
- PostgreSQL 後端。本次實例全部是 SQLite。
- Queue mode、多 worker、外部 secrets、SSO、RBAC。
- 真實第三方服務（Slack、Google、Telegram、OpenAI、LINE、電子發票業者）。
- 需要真實憑證才會走到的節點，執行結果只到「啟用與觸發」為止。
