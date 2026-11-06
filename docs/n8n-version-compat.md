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

## 結果總表

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

## 已知相容問題

1. **已棄用的 `Function` 節點**
   `examples/templates/` 下的 `handover-trace`、`human-approval-gate`、`retry-with-backoff` 三支使用 `n8n-nodes-base.function`。2.44.6 以上直接拒絕匯入，錯誤訊息要求改用 Code 節點。這三支範本需要改寫，Pack 尚未修正。
2. **Webhook 失敗回應碼改變**
   2.37.3 在 workflow 執行出錯時，webhook 仍回 200；2.44.6 以上回 500。依賴回應碼判斷成敗的呼叫端要注意。
3. **憑證檢查變嚴**
   2.46.6 啟用時會檢查 workflow 引用的憑證是否存在；只用假的 ID 字串無法啟用。
4. **API 文件與實際不符**
   `n8n-api-bridge` 先前寫的 `PATCH` 與 422，實測為 405 與 400，已在 SKILL 更正。

## 未實測

- n8n 1.x 與 2.0～2.36 的任何版本。
- PostgreSQL 後端。本次實例全部是 SQLite。
- Queue mode、多 worker、外部 secrets、SSO、RBAC。
- 真實第三方服務（Slack、Google、Telegram、OpenAI、LINE、電子發票業者）。
- 需要真實憑證才會走到的節點，執行結果只到「啟用與觸發」為止。
