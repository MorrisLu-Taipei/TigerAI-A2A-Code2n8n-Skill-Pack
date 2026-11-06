# 第四輪實測報告：n8n 2.37.3 / 2.44.6 / 2.46.6 版本比對

> **實測日期**：2026-11-06
> **範圍**：匯入、啟用、webhook 觸發、API 端點行為、備份回滾。**不含**真實第三方服務與真實憑證。
> **相關文件**：[`docs/n8n-version-compat.md`](../docs/n8n-version-compat.md)、[`docs/n8n-upgrade-rollback-sop.md`](../docs/n8n-upgrade-rollback-sop.md)

## 1. 實測方式

- 每個版本各啟動一個全新的空實例（SQLite、獨立資料目錄、隨機加密金鑰），共 3 個。
- 建立測試擁有者與 API key，一律使用 `example.com` 假帳號。
- 憑證全部是假值。第二輪起，依 workflow 引用的憑證類型自動建立同名假憑證，並把 workflow 內的憑證 ID 換成實例內的 ID，以排除「憑證不存在」這個變因。
- 每支 workflow 的流程：`POST /api/v1/workflows` → `POST .../activate` → 有 webhook 就用 `curl` 觸發 → 讀 `GET /api/v1/executions` → 停用。
- 這些實例不使用任何正式環境的資料。

## 2. `tests/` 的 8 支 workflow（補上假憑證後）

| Workflow | 2.37.3 | 2.44.6 | 2.46.6 |
|---|---|---|---|
| 1 github-slack | 啟用 ✅ webhook 200，執行 success | 同左 | 同左 |
| 2 rss-ai-email | 啟用 ✅（schedule，未觸發） | 同左 | 同左 |
| 3 telegram-bot | 啟用 ❌（400，找不到資源） | 啟用 ✅ | 啟用 ✅ |
| 4 pdf-worker-s3 | 啟用 ✅（form，未觸發） | 同左 | 同左 |
| 5 order-risk | 啟用 ✅ webhook **200**，執行 error | 啟用 ✅ webhook **500**，執行 error | 同 2.44.6 |
| Q1 qa-mode | 啟用 ❌ 缺 Google Sheet 的 `documentId` | 同左 | 同左 |
| Q2 example-finder | 啟用 ❌ 409，webhook 路徑 `order` 衝突 | 同左 | 同左 |
| Q3 branch-syntax | 啟用 ❌ 409，路徑 `order` 衝突 | 同左 | 同左 |

說明：

- 5 號執行失敗的原因是 OpenAI 假憑證（`Authorization failed`），屬於預期。值得注意的是 webhook 回應碼在 2.37.3 與 2.44.6 以上不同。
- Q2、Q3、5 號三支都使用 webhook 路徑 `order`，同一實例只能同時啟用一支。這是範例之間的衝突，個別啟用不受影響。
- Q1 的 `documentId` 是輸出範本留給使用者填的參數。
- 3 號在 2.37.3 啟用失敗的原因沒有進一步追查。

### 未補假憑證的第一輪

| 項目 | 2.37.3 | 2.44.6 | 2.46.6 |
|---|---|---|---|
| 啟用成功 | 4 / 8 | 5 / 8 | **0 / 8** |

2.46.6 啟用時會檢查 workflow 引用的憑證是否存在，訊息為 `Credential "..." no longer exists`。

## 3. cookbook 與 examples 的 37 支 workflow

| 項目 | 2.37.3 | 2.44.6 | 2.46.6 |
|---|---|---|---|
| 匯入成功 | 37 / 37 | 34 / 37 | 34 / 37 |
| 啟用成功 | 12 / 37 | 10 / 37 | 10 / 37 |
| webhook 回 500 | 0 | 3 | 3 |

組成：`cookbook/_*.json` 4 支、`examples/templates/` 3 支、einvoice 14 支、google-workspace-admin 7 支、line-ai-customer-service 6 支、tigerai-flagship 3 支。

匯入失敗的 3 支都是 `examples/templates/` 下使用 `n8n-nodes-base.function` 的範本，訊息為「此節點類型已棄用，請改用 Code 節點」：

- `handover-trace.workflow.json`
- `human-approval-gate.workflow.json`
- `retry-with-backoff.workflow.json`

啟用失敗的原因分類（三個版本大致相同）：

| 原因 | 說明 |
|---|---|
| 缺憑證 | 節點本身沒有掛憑證（Google Sheets、Slack、SMTP、OpenAI），需要使用者設定 |
| 佔位符 | `REPLACE_WITH_*_WORKFLOW_ID`，需要先發布被呼叫的 workflow |
| 空的必填參數 | `path`、`folderId` 由使用者填寫 |
| 無觸發節點 | `_starter-blank.json`、`_starter-template.json` 設計上就是空白範本 |

## 4. `n8n-api-bridge` 端點

三個版本結果相同：

| 呼叫 | 結果 |
|---|---|
| `GET /api/v1/workflows`、`GET .../{id}` | 200 |
| `POST /api/v1/workflows` | 200 |
| `PUT /api/v1/workflows/{id}`（完整 body） | 200 |
| `PUT` 帶不合格的 `nodes` | **400**（原文件寫 422） |
| `PATCH /api/v1/workflows/{id}` | **405**（原文件列為支援） |
| `POST .../activate`、`.../deactivate` | 200 |
| `DELETE .../{id}` | 200 |
| `GET /api/v1/executions`、`/credentials` | 200 |

已更正 `skills/tigerai/n8n-api-bridge/SKILL.md` 與 `SKILL.en.md`。

## 5. 備份回滾演練

| 項目 | 結果 |
|---|---|
| 資料量 | 1.3 GB SQLite，469 個 workflow、63 位使用者、520 組憑證 |
| 做法 | 把升級前備份複製到新目錄，用 2.37.3 啟動，容器不接網路 |
| 就緒時間 | 約 5 秒 |
| 筆數 | 與備份一致 |

演練後已移除複製出來的資料目錄。PostgreSQL 的備份與還原沒有演練。

## 6. 結論與限制

觀察到的事實：

1. 同一批範本在 2.44.6 與 2.46.6 的結果幾乎相同；與 2.37.3 的差異集中在三處：已棄用的 `Function` 節點、webhook 失敗回應碼、2.46.6 的憑證檢查。
2. Pack 有 3 支範本在 2.44.6 以上無法匯入，尚未修正。
3. `n8n-api-bridge` 文件有兩處與實際行為不符，已更正。
4. 備份還原的路徑可行（SQLite）。

本輪**沒有**涵蓋：

- n8n 1.x 與 2.0～2.36。
- PostgreSQL 後端、queue mode、SSO、RBAC。
- 任何真實第三方服務，所以「啟用成功」不代表流程在真實環境中能跑完。
- 其它 AI 依照 Pack 從需求產生 workflow 的端到端流程。
- 以正式環境資料的副本做升級遷移。
