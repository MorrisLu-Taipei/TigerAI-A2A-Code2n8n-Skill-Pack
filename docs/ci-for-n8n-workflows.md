# n8n workflow 的 CI 檢查腳本

這份文件說明 `scripts/ci/` 底下的檢查腳本怎麼接進 Gitea Actions（或 GitHub Actions、GitLab CI）。腳本全部是確定性的規則與 API 呼叫，**不用 AI 當閘門**，只需要 Node.js 18 以上；動態檢查另需要一個可丟棄的 n8n 實例（或本機的 docker）。

## 用途與整體流程

情境：團隊成員用對話開發 n8n workflow，由系統開分支與 PR，CI 在 PR 上自動檢查，主管核准後合併，再由 CD 匯入正式 n8n（預設不啟用）。本文件只涵蓋 CI 這一段。

```
PR 開啟或更新
  ├─ 靜態檢查  check-workflows.mjs   （不需要 n8n；每次都跑）
  ├─ 動態檢查  run-on-n8n.mjs        （需要拋棄式 n8n；可只在靜態檢查通過後跑）
  └─ 多版本對照 matrix.sh            （需要 docker 與本機已有的映像；選用）
        ↓ 產出 ci-report.json 與 ci-comment.md，貼回 PR
```

## 阻擋類與建議類

使用者的決策：**資安護欄與原生節點提醒都只是建議，不可讓 CI 失敗，只輸出成 PR 註解。** 只有下列「阻擋類」會讓 CI 失敗（退出碼 1）。**不使用** `scripts/security-scan.mjs` 的 `--strict`。

| 阻擋碼 | 觸發條件 | 來源 |
|---|---|---|
| `JSON_INVALID` | 檔案讀不到或不是合法 JSON | 靜態 |
| `STRUCTURE_INVALID` | 缺少 `name`、`nodes`、`connections`，或節點缺少 `name`／`type`／`typeVersion`／`position`／`parameters`，或 `connections` 指向不存在的節點 | 靜態 |
| `SECRET_DETECTED` | `security-scan` 的 `secret:*` 規則命中（內容不會顯示） | 靜態 |
| `MALICIOUS_CODE` | `security-scan` 的 `jscode:*` 偵測類 error 命中 | 靜態 |
| `CREDENTIAL_PLAINTEXT` | `security-scan` 的 `credential:plaintext`：敏感欄位寫成明文 | 靜態 |
| `NODE_NOT_FOUND` | 節點 `type` 不在目標版本的 `docs/node-versions/<版本>.json` | 靜態 |
| `NODE_DEPRECATED` | 節點在目標版本目錄中標示 `deprecated: true`（例如 `n8n-nodes-base.function`，2.44.6 以上匯入會被拒）。只標 `hidden` 而未棄用的節點**不在此列**，見下方建議類 | 靜態 |
| `TYPEVERSION_INVALID` | 節點 `typeVersion` 不在目錄的 `versions` 清單內 | 靜態 |
| `CREDENTIAL_MISSING` | 節點引用的憑證（類型加名稱）不在「憑證允許清單」；動態檢查啟用時 n8n 回報缺少憑證或憑證不存在也用此碼 | 靜態、動態 |
| `WEBHOOK_PATH_CONFLICT` | 同一批檔案內，或與既有清單中，同 HTTP 方法同 path 重複；動態檢查啟用時回 409 也用此碼 | 靜態、動態 |
| `IMPORT_FAILED` | 公開 API 匯入失敗 | 動態 |
| `ACTIVATE_FAILED` | 啟用失敗且訊息屬「結構性」：節點參數缺漏或無效、節點類型不存在或已棄用、節點版本不支援（分類見下方「啟用失敗的分類」）；其餘啟用失敗只列建議 | 動態 |

建議類（只輸出成註解，永遠不使狀態變成 `fail`）：

| 來源 | 內容 |
|---|---|
| `security-scan` | 護欄規則的 warning，例如 `webhook:no-auth`、`ai:agent-no-guardrails`、`error:no-handling`；規則說明見 [`spec/security-guardrails.md`](../spec/security-guardrails.md) |
| `security-scan`（提醒類） | 三條只提醒的規則（ADR-014，**都是建議代碼，不是阻擋碼**，沒有新增任何阻擋碼）：`egress:external-domain`（HTTP 類節點的網址參數連到非內網網域，列出網域並提醒核准人確認是否在允許清單內；網址由運算式組出時提醒「無法靜態判斷」）、`impact:high-impact-node`（寄信、寫入或刪除資料庫、HTTP 寫入方法、執行系統指令的節點，提醒核准人在工單上特別確認）、`notes:missing-change-log`（Layer 3 說明便條沒有「修改記錄」段，或有標題卻沒有任何一列資料）。說明文字直接帶具體內容（網域、動作種類），PR 註解的「說明」欄可以直接給核准人看。可在節點 notes 用 `guardrail-ack: <規則編號>` 確認。規則細節見 [`spec/security-guardrails.md`](../spec/security-guardrails.md) 2.13 至 2.15 |
| `native-first` | 可能可以用原生節點取代的 Code 節點，見 [`spec/native-first.md`](../spec/native-first.md)；是樣式比對，可能有誤 |
| `node-catalog` | 規則 `node:hidden-legacy`：目錄標示 `hidden: true` 但未 `deprecated` 的舊節點。訊息為「此節點在節點面板中已隱藏，屬舊節點，建議評估新版替代」；本 Pack 在 2.44.6、2.46.6 實測這類節點仍可匯入，是否阻擋以實測為準，不以 hidden 旗標為準 |
| `workflow-refs` | 規則 `workflow:unknown-subworkflow-reference`：Execute Workflow 節點的 `workflowId` 在同一批檔案與 `--existing-workflow-ids` 清單中都找不到。可能指向目標環境既有的 workflow，所以只提醒 |
| `activation` | 規則 `trigger:external-registration`：workflow 含需要向外部服務註冊的觸發節點（Telegram、GitHub、Slack、IMAP 等）。訊息：此 workflow 的觸發節點需要對外註冊，無法在無網路測試環境驗證啟用，建議在 staging 實測 |
| `credentials` | 規則 `credentials:missing-field`：節點類型在目標版本目錄中有「無條件需要」的憑證（`required` 為真且不帶 `conditional`），但節點沒有 `credentials` 欄位（或為空物件）。`disabled` 節點、以及 `parameters.authentication` 為 `none` 或 `genericCredentialType` 的節點不提醒。訊息會提示：若憑證尚未建立，請依受限模式在節點 notes 與 Layer 3「待補憑證」說明，需管理員建立；並註明可能誤報。誤報率評估見下方「`credentials:missing-field` 建議規則的誤報率評估」 |
| `matrix` | 規則 `matrix:version-difference`：`matrix.sh` 的跨版本差異（同一個檔案在不同 n8n 版本的匯入或啟用結果不同） |
| `n8n-run` | 動態檢查的提示：`NO_TRIGGER`（沒有觸發節點，屬於模式範本）、`activate:unverified-external`（啟用失敗但屬外部註冊或網路造成）、`activate:unverified-unknown`（啟用失敗但無法歸類，**需人工複核**，整體狀態為 `incomplete`）、`workflow:timeout`（單一 workflow 逾時，屬基礎設施問題，請重跑；整體狀態為 `incomplete`）、執行狀態為 error（假憑證下預期會發生）、假憑證建立失敗 |
| `ci` | 沒有提供憑證允許清單而略過檢查、webhook path 是運算式而無法靜態比對 |

## 腳本與用法

### `scripts/ci/check-workflows.mjs`（靜態）

```bash
node scripts/ci/check-workflows.mjs \
  --dir <workflows目錄> --target-version <例如 2.44.6> \
  [--credential-map <json檔或JSON字串>] \
  [--existing-webhook-paths <json檔或JSON字串>] \
  [--existing-workflow-ids <json檔或JSON字串>] \
  [--egress-allow <逗號分隔網域>] [--egress-allow-file <檔案>] \
  [--out ci-report.json] [--comment ci-comment.md]
```

- 目錄內所有 `.json` 都會檢查（遞迴；略過隱藏目錄與 `node_modules`）。
- `docs/node-versions/<版本>.json` 不存在時，明確報錯並以退出碼 2 結束；請先依 [`docs/node-versions/README.md`](node-versions/README.md) 對該版本實例重產。
- `--credential-map` 格式：`{"<憑證type>":["<名稱1>","<名稱2>"]}`，例如 `{"httpHeaderAuth":["webhook-header-auth"]}`。比對的是節點 `credentials` 裡的類型與名稱。沒有提供時略過此檢查，並在建議項說明。
- `--existing-webhook-paths` 格式：`["POST my-path", "GET other/path"]`；沒有寫方法的項目視為任何方法。清單由呼叫端從目標環境取得，本 Pack 不負責產生。
- `--existing-workflow-ids` 格式：`["<workflow id>", ...]`，供 Execute Workflow 的引用比對；同一批檔案的頂層 `id` 或 `name` 也算已知。只比對 `source` 為 `database`（或未設定）且字面值的 `workflowId`，運算式略過。
- `--egress-allow`／`--egress-allow-file`（選用）：外連網域的允許清單，交給 `security-scan.mjs` 的 `egress:external-domain` 規則比對；檔案可一行一個或逗號分隔，`#` 開頭為註解，讀不到檔案是使用錯誤（退出碼 2）。環境變數 `SKILLPACK_EGRESS_ALLOW` 也會傳給掃描器（旗標優先）。`*.example.com` 涵蓋所有子網域、不含 `example.com` 本身；沒有提供清單時只列出網域、不做判斷。這只影響建議項的內容，**不會讓 CI 失敗**。
- 檔案結構不合（`STRUCTURE_INVALID`）時，略過該檔的節點、憑證、webhook 檢查，但仍會做資安掃描。
- 內部會呼叫 `scripts/security-scan.mjs --format json` 與 `scripts/native-first-check.mjs --format json`（輸出導向暫存檔再讀，結束後刪除）。

### `scripts/ci/run-on-n8n.mjs`（動態）

```bash
N8N_URL=<拋棄式實例網址> N8N_API_KEY=<金鑰> \
  node scripts/ci/run-on-n8n.mjs --dir <workflows目錄> \
  [--target-version <版本>] [--workflow-timeout <秒>] [--disposable] [--hold-active] [--out <檔>] [--merge-into ci-report.json] [--comment <檔>]

# 對「全新空實例」自動建立擁有者與 API 金鑰（密碼與金鑰只放記憶體）
N8N_URL=<拋棄式實例網址> node scripts/ci/run-on-n8n.mjs --bootstrap --dir <workflows目錄>
```

對每個 workflow 依序：依引用的憑證類型建立同名假憑證（依實例回報的憑證 schema 補必填欄位，遇到 `requires property` 錯誤再補值重試，最多 12 次）→ 匯入 → 啟用 → 若有 webhook 就呼叫一次（用節點設定的 HTTP 方法與空 JSON；Header 或 Basic 認證會帶上假憑證的值）→ 讀 `/api/v1/executions` 的狀態 → 停用 → 刪除。

- 匯入失敗是 `IMPORT_FAILED`；啟用失敗是 `ACTIVATE_FAILED`；啟用回 409 是 `WEBHOOK_PATH_CONFLICT`。沒有觸發節點的 400 只標 `NO_TRIGGER` 提示。
- 執行失敗**不算** CI 失敗，只回報狀態。
- 含外部註冊型觸發節點的 workflow，停用後 n8n 還要一段時間對外取消註冊，期間刪除會回 409 `Workflow is still being unpublished`（實測：預設網路約 20 秒、無網路約 70 秒）。腳本會先跳過、全部跑完再統一重試（最多約 4 分鐘），所以這類檔案會讓整體多花一些時間。
- 只刪自己建立的 workflow 與憑證（以 API 回傳的 id 為準，用 try/finally 與訊號處理保證清理）；報告的 `cleanup` 欄位列出建立與刪除的數量。
- `--merge-into` 把結果合併進靜態檢查的報告（阻擋項與建議項相加、重算狀態與數量），並用合併後的內容重寫 `--comment`；`--out` 則寫出只含動態結果的報告。
- 輸出與報告不含 API 金鑰、密碼或 cookie。`--bootstrap` 結束時會嘗試刪除自己建立的 API 金鑰；擁有者帳號留在實例內，所以實例必須是丟棄式的。
- 其他選項：`--settle-seconds`（觸發 webhook 後等執行紀錄，預設 3）、`--wait-seconds`（等實例就緒，預設 30）。
- `--workflow-timeout <秒>`（預設 60）：單一 workflow 從建立假憑證到讀完執行紀錄的總時限。逾時**不算 workflow 的錯**：中止該檔、照常清理，列建議項 `workflow:timeout`，整體狀態為 `incomplete`（見上），請重跑一次；持續發生再調高時限或檢查實例資源。
- `--disposable`：目標是用完即銷毀的實例（`matrix.sh` 起的容器就是）。結束時每個 workflow 只嘗試刪除一次，遇到「還在取消註冊」的 409 就放棄、不等待，數量記在 `cleanup.workflowsAbandoned`（`workflowsCreated = workflowsDeleted + workflowsAbandoned`）。**預設（沒加這個選項）維持原行為**：遇到 409 最長等約 4 分鐘，確保把自己建立的東西刪乾淨，適合會長期存在的測試實例。不要對需要保留的實例使用 `--disposable`。
- `--hold-active`（預設關閉）：先匯入並啟用整批，最後才統一停用與清理，讓同批的 webhook 路徑衝突在啟用時出現 409（`WEBHOOK_PATH_CONFLICT`）。預設的逐檔流程是「啟用、呼叫、停用、刪除」，前一個檔案已刪除，所以幾乎看不到同批衝突。適用情境：想在動態階段再確認一次同批路徑衝突、或需要觀察多個 workflow 同時啟用的行為。代價：整批同時啟用（占用較多記憶體與連線）、含外部註冊型觸發的檔案會把取消註冊的等待集中到最後、單一檔案出問題時影響範圍較大。**同批與既有路徑衝突的主要防線仍是靜態檢查**（`check-workflows.mjs` 比對同批與 `--existing-webhook-paths`），`--hold-active` 只是補充，且只能偵測「同一批」的衝突，看不到目標環境既有 workflow 的路徑。

### `scripts/ci/matrix.sh`（多版本對照）

```bash
bash scripts/ci/matrix.sh --dir <workflows目錄> \
  [--versions "2.37.3 2.44.6 2.46.6"] [--out-dir <目錄>] [--image docker.n8n.io/n8nio/n8n] \
  [--offline] [--workflow-timeout <秒>] [--hold-active] [--no-disposable]
```

每個版本各起一個全新容器：`docker run -d --rm`、只綁 `127.0.0.1` 的隨機 port、`--cpus 1 --memory 1g`、空資料目錄（`mktemp -d`，結束刪除）、隨機的 `N8N_ENCRYPTION_KEY`、`N8N_DIAGNOSTICS_ENABLED=false`、`N8N_SECURE_COOKIE=false`；等實例就緒後跑 `run-on-n8n.mjs --bootstrap`，最後 `docker stop`（`--rm` 會自動移除容器）。`--offline`：容器改用 `--network none`（不綁 port、不連外），腳本以 `docker cp` 放進容器，在容器內用 `docker exec` 跑 `run-on-n8n.mjs`。沒有 `--offline` 時，容器走預設網路，n8n 為了啟用 Telegram、GitHub 這類觸發節點，會拿假憑證向外部服務發出請求；不希望如此就加 `--offline`（或在 runner 層擋掉對外連線）。**找不到映像時直接報錯，不會自動拉取。**

`matrix.sh` 起的容器都是拋棄式的，所以**預設對 `run-on-n8n.mjs` 加 `--disposable`**（`--no-disposable` 可改回預設清理，一般用不到）；`--hold-active` 會轉交給 `run-on-n8n.mjs`。

產出（在 `--out-dir`）：`ci-report-<版本>.json`、`matrix-report.json`、`matrix-report.md`（對照表）。`matrix-report.json` 另有 `advisories`（來源 `matrix`，規則 `matrix:version-difference`）：同一個檔案在不同版本的匯入或啟用結果不同時各列一則，只是提醒。退出碼：0 各版本都沒有阻擋項；1 有版本出現阻擋項；2 使用錯誤、找不到映像或實例起不來。

### 退出碼總表

| 腳本 | 0 | 1 | 2 |
|---|---|---|---|
| `check-workflows.mjs` | 無阻擋項 | 有阻擋項 | 使用錯誤、缺少版本目錄、內部工具失敗 |
| `run-on-n8n.mjs` | 無阻擋項（含 `incomplete`） | 有阻擋項 | 使用錯誤、連不上實例、`--bootstrap` 失敗 |
| `matrix.sh` | 各版本無阻擋項 | 有版本出現阻擋項 | 使用錯誤、映像不存在、實例起不來 |

## 啟用失敗的分類（依實測）

動態檢查在「假憑證、可能沒有網路」的實例上啟用 workflow，需要對外註冊的觸發節點本來就可能失敗，這不代表 workflow 有問題。分類只看 `/activate` 回應的訊息（先比對先贏）：

| 順序 | 類別 | 訊息特徵（不分大小寫） | 結果 |
|---|---|---|---|
| 1 | 憑證 | `Missing required credential`、`Credential "…" no longer exists` | 阻擋 `CREDENTIAL_MISSING` |
| 2 | 結構性 | `configuration issues`、`Missing or invalid required parameters`、`Unrecognized node type`、`not available in version`、`Cannot use a "…" node`（棄用）、`Cycle detected` | 阻擋 `ACTIVATE_FAILED` |
| 3 | 外部或網路 | `ENOTFOUND`、`ECONNREFUSED`、`ECONNRESET`、`EAI_AGAIN`、`ETIMEDOUT`、`getaddrinfo`、`timeout`、`socket hang up`、`fetch failed`、`The DNS server returned an error`、`The resource you are requesting could not be found`、`The Webhook can not work on "localhost"`、`custom domain`、`401`、`403`、`unauthorized`、`forbidden`、`Bad credentials`、`invalid_auth` | 該 workflow 含外部註冊型觸發節點：建議 `activate:unverified-external`；否則視為無法歸類 |
| 4 | 較寬鬆的結構性 | `Cannot publish workflow`、`invalid workflow`（前面都沒命中時） | 阻擋 `ACTIVATE_FAILED` |
| 5 | 無法歸類 | 其餘（含 HTTP 5xx、連不上實例） | 建議 `activate:unverified-unknown`，**需人工複核**，整體狀態為 `incomplete` |

另外：HTTP 409 一律是 `WEBHOOK_PATH_CONFLICT`；沒有觸發節點的 400 是提示 `NO_TRIGGER`。**分類不確定時一律歸為建議而非阻擋。**

### 實測紀錄

2026-11-06 在本機拋棄式容器實測（最小 workflow、假憑證；網路分「`--network none`」與「預設網路」兩種），每格是 `/activate` 的 HTTP 狀態與訊息：

| 情境 | 2.37.3 | 2.44.6 | 2.46.6 |
|---|---|---|---|
| Telegram Trigger，無網路 | 400 `The DNS server returned an error, perhaps the server is offline` | 200 | 200 |
| Telegram Trigger，預設網路（假 token） | 400 `The resource you are requesting could not be found` | 200 | 200 |
| GitHub Trigger（兩種網路相同） | 400 `The Webhook can not work on "localhost". Please setup n8n on a custom domain.` | 200 | 200 |
| Slack Trigger（兩種網路相同） | 200 | 200 | 200 |
| IMAP（`emailReadImap`），無網路／預設網路 | 400 `There was a problem activating the workflow: "getaddrinfo EAI_AGAIN imap.invalid"`／`…ENOTFOUND…` | 200 | 200 |
| 節點缺少憑證 | 400 `Cannot publish workflow: 1 node have configuration issues: … Missing required credential: telegramApi` | 同左 | 同左 |
| 引用不存在的憑證 id | 200 | 200 | 400 `Cannot publish workflow: Credential "…" no longer exists. Update the node to use a different credential.` |
| 節點參數缺漏（例如 Item Lists 沒有設定欄位） | 400 `Cannot publish workflow: 1 node have configuration issues: … Missing or invalid required parameters: …` | 同左 | 同左 |
| 節點版本不支援（If 2.4 在 2.37.3） | 400 `Node type "if" is not available in version 2.4. Available versions: 1, 2, 2.1, 2.2, 2.3.` | — | — |
| 兩支 workflow 同方法同 path，間隔 2 秒啟用第二支 | 409 `There is a conflict with one of the webhooks.` | 同左 | 同左 |

重要觀察：

- **2.44.6 與 2.46.6 的啟用 API 對外部註冊型觸發節點一律回 200**，註冊失敗（例如 `The Webhook can not work on "localhost"`、`getaddrinfo ENOTFOUND`、Telegram 404）只出現在 n8n 的日誌，`active` 仍為 `true`。所以這兩個版本的動態檢查**看不到**這類問題，要靠 staging 實測。2.37.3 則會同步回 400，由上表的規則歸為建議。
- webhook 衝突在兩次啟用間隔很短時，2.44.6 曾回 200，只在日誌留下 `The URL path that the "T" node uses is already taken`；間隔 2 秒時則穩定回 409。動態檢查是丟棄式實例、逐檔清理，真正的路徑衝突應由靜態檢查與 `--existing-webhook-paths` 擋下。
- 目錄標示 `hidden` 但未棄用的節點：對 2.44.6（46 個）與 2.46.6（44 個）各建立只含該節點的最小 workflow，全部匯入成功（200）；含 Webhook 或 Trigger 能啟用的也都能啟用，啟用被拒的都是缺必填參數或缺憑證（我們的最小設定沒填），不是節點被拒。Item Lists、Cron、HTTP Request Tool 補齊參數後，兩個版本都能匯入、啟用並執行（Item Lists 執行成功；掛在 AI Agent 底下的 HTTP Request Tool 因假憑證執行為 error）。因此 `hidden` 只列建議。

## ci-report.json 欄位

```json
{
  "status": "pass | incomplete | fail",
  "target": "2.44.6",
  "blocking":   [{ "code": "NODE_DEPRECATED", "file": "a.json", "node": "Old Function", "message": "…" }],
  "advisories": [{ "source": "security-scan", "rule": "webhook:no-auth", "file": "a.json", "node": "Webhook", "message": "…" }],
  "counts": { "files": 3, "filesWithBlocking": 1, "blocking": 1, "advisories": 2, "blockingByCode": { "NODE_DEPRECATED": 1 } }
}
```

- `status` 有三態：
  - `fail`：`blocking` 有任何一項。
  - `incomplete`：沒有阻擋項，但檢查沒有跑完（`incomplete` 陣列非空）。原因有兩種：`workflow-timeout`（單一 workflow 逾時）、`activate-unverified-unknown`（啟用失敗但無法歸類）。PR 註解會顯示「未完成（需重跑或人工複核）」，**不會顯示通過**。
  - `pass`：沒有阻擋項，也沒有未完成項。
- 退出碼與狀態的關係：只有 `fail` 使腳本以 1 結束；`incomplete` 仍是 0（依「只有阻擋類使 CI 失敗」的決策）。想把未完成也當成失敗的流程，請自行讀 `ci-report.json` 的 `status`，例如 `node -e "process.exit(JSON.parse(require('fs').readFileSync('ci-report.json','utf8')).status==='pass'?0:1)"`。
- `incomplete`（陣列）：`[{ "reason": "workflow-timeout", "file": "a.json" }]`；`counts.incomplete` 為其數量。
- `message` 只寫規則名稱、檔名、節點名與固定說明，不會放疑似機密的原文。
- 來自使用者 workflow 的字串（檔名、節點名稱、訊息片段）在報告中會去掉換行與控制字元，並限制每欄最長 200 字元（超過以 `…` 結尾）。
- 動態檢查與合併後的報告另有 `dynamic`（每個檔案的 `import`、`activate`、`webhook`、`executions`）與 `cleanup`。`activate` 的值為 `ok`（成功）、`failed`（結構性失敗，阻擋）、`conflict`（409，阻擋）、`no-trigger`（沒有觸發節點）、`unverified`（啟用失敗但屬外部註冊或無法歸類，只列建議）、`skipped`（匯入失敗等原因沒有嘗試）；逾時的檔案另有 `timeout: true`。

## PR 註解的防注入

`ci-comment.md` 會貼進 PR，而檔名與節點名稱是使用者可控的字串。輸出前一律處理：去掉換行與控制字元、限制 200 字元、跳脫反引號、角括號、方括號與圓括號（避免形成連結、圖片或 HTML）、`*`、`_`、`#`、`|`、`~`、`&`、`!`，把 `://` 與 `www.` 拆開避免自動連結，並在 `@` 後插入零寬空白避免 @mention。這些字串都以純文字呈現，不放進行內程式碼；只有固定詞彙（阻擋碼、規則 ID）用行內程式碼。每張表最多列 100 列，其餘請看 `ci-report.json`。

## Gitea Actions 範例

下面是片段，位址、標籤與機密都是占位符，請換成自己的設定。機密一律放在儲存庫的 secrets，用 `${{ secrets.NAME }}` 取用。

```yaml
name: n8n-workflow-ci
on:
  pull_request:
    branches: [main]

jobs:
  static:
    runs-on: pr-test
    steps:
      - uses: actions/checkout@v4
      - name: 取得 CI 腳本
        run: git clone --depth 1 "${{ secrets.PACK_GIT_URL }}" .ci-pack
      - name: 靜態檢查
        run: |
          node .ci-pack/scripts/ci/check-workflows.mjs \
            --dir workflows --target-version 2.44.6 \
            --credential-map ci/credential-allowlist.json \
            --existing-webhook-paths ci/existing-webhook-paths.json \
            --out ci-report.json --comment ci-comment.md
      - name: 貼回 PR 註解
        if: always()
        run: |
          test -f ci-comment.md || exit 0
          node -e "process.stdout.write(JSON.stringify({body: require('fs').readFileSync('ci-comment.md','utf8')}))" > payload.json
          curl -sS -X POST \
            -H "Authorization: token ${{ secrets.CI_BOT_TOKEN }}" \
            -H "Content-Type: application/json" \
            --data @payload.json \
            "${{ github.server_url }}/api/v1/repos/${{ github.repository }}/issues/${{ github.event.pull_request.number }}/comments"
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: ci-report, path: ci-report.json }

  dynamic:
    needs: static
    runs-on: pr-test
    steps:
      - uses: actions/checkout@v4
      - name: 取得 CI 腳本
        run: git clone --depth 1 "${{ secrets.PACK_GIT_URL }}" .ci-pack
      - name: 靜態檢查（取得報告供合併）
        run: node .ci-pack/scripts/ci/check-workflows.mjs --dir workflows --target-version 2.44.6 --credential-map ci/credential-allowlist.json --out ci-report.json
      - name: 動態檢查（拋棄式 n8n 實例）
        env:
          N8N_URL: ${{ secrets.CI_N8N_URL }}        # 專用的拋棄式測試實例，絕不是正式環境
        run: node .ci-pack/scripts/ci/run-on-n8n.mjs --bootstrap --dir workflows --target-version 2.44.6 --merge-into ci-report.json --comment ci-comment.md
      # 或改在 runner 本機用 docker 起容器、一次跑多個版本：
      # - run: bash .ci-pack/scripts/ci/matrix.sh --dir workflows --versions "2.44.6 2.46.6" --out-dir matrix-out
```

幾點提醒：

- `static` 失敗時 `dynamic` 不會執行（`needs: static`）；若想在同一個 PR 同時看到兩種結果，可拿掉 `needs`，改用 `--merge-into`。
- 「合併前需主管核准」「合併後才由 CD 匯入正式 n8n（預設不啟用）」屬於分支保護與 CD 的設定，不在這些腳本的範圍。
- PR 上的 CI 不應持有可以寫入正式 n8n 的金鑰；`CI_N8N_URL` 指向的實例要能隨時整個丟掉。

## `credentials:missing-field` 建議規則的誤報率評估

評估日期：2026-11-06。這份數字用來決定規則維持建議還是升為阻擋；**阻擋清單由 Founder 決定，不因這份評估擴大**。

### 樣本與方法

- 樣本：公開 n8n 範本庫的 13,947 個範本（全部可解析），共 308,884 個啟用中的節點（略過 `disabled`），其中 303,731 個的類型在 2.44.6 目錄內。
- 節點目錄：`docs/node-versions/2.44.6.json` 的 `credentials` 欄位。
- 把規則套在每個範本上，計算「目錄要求憑證、節點卻沒有 `credentials` 欄位（或為空物件）」的節點。範本是社群作者寫成、在 n8n 裡可用的 workflow，所以這個比例是「規則對正常 workflow 誤提醒」的**上限估計**，不是精確的誤報率。
- 比較兩種判斷口徑：
  - 寬鬆口徑：目錄中任一憑證 `required` 為真就算需要。
  - 採用口徑（目前實作）：只算 `required` 為真且無 `conditional`（不依參數組合）的憑證。

### 結果

| 項目 | 寬鬆口徑 | 採用口徑 |
|---|---|---|
| (a) 有 required 憑證需求的節點實例 | 110,555 | 31,776 |
| (b) 其中沒有 `credentials` 欄位 | 65,921（59.6%） | 13,336（42.0%） |
| (d) 再套用 authentication 排除後 | 63,395（57.3%） | 13,336（42.0%） |
| (e) 含至少一個提醒的範本占全部範本 | 83.7% | 27.4%（3,825 個） |

- 寬鬆口徑誤報嚴重，主因是 HTTP Request、Webhook、AI Agent、Wait、Respond to Webhook、Form Trigger 這類節點的憑證只在特定參數組合才需要；誤報最多的類型依序為 `httpRequest`（73.2%）、`agent`（99.9%）、`googleSheets`（47.3%）、`wait`、`webhook`、`respondToWebhook`、`gmail`、`slack`、`lmChatOpenAi`、`telegram`、`formTrigger`、`googleDrive`、`openAi`、`httpRequestTool`、`postgres`。`authentication` 為 `none` 或 `genericCredentialType` 的比例很低（約 2 個百分點），排除效果有限。因此採用口徑。
- 採用口徑的誤報最多類型（缺欄位數／實例數）：`lmChatOpenAi`（35.1%）、`telegram`（38.8%）、`openAi`（40.9%）、`postgres`（60.6%）、`lmChatGoogleGemini`（29.4%）、`emailSend`（49.7%）、`notion`（44.1%）、`whatsApp`（56.3%）、`googleCalendar`（54.8%）、`lmChatAnthropic`（42.2%）、`telegramTrigger`（35.8%）、`lmChatOpenRouter`（31.3%）、`redis`（55.0%）、`embeddingsOpenAi`（35.5%）、`googleGemini`（30.2%）。這 15 種缺欄位的節點都沒有設定 `authentication`，所以 (d) 的排除對採用口徑沒有影響。
- 這些缺欄位的主因是範本資料本身：把「範本內完全沒有任何節點帶 `credentials` 欄位」的範本分開看，該群的缺欄位比例是 100%（11,731 個節點），推測是發布範本時憑證資訊被移除，不是作者的 workflow 真的缺憑證。
- 只看「範本內至少有一個節點帶 `credentials` 欄位」的範本（排除上述被移除的情況）：採用口徑的缺欄位為 1,605／20,045（8.0%），含至少一個提醒的範本占該群 7.3%（642／8,752）。這群的提醒多集中在 `telegram`、`postgres`、`lmChatOpenAi`、`emailSend`、`openAi`，可能是作者漏設，也可能是子節點或別的設定方式，無法由 JSON 區分。

### 限制

- 範本不是受限模式 Agent 的產出；受限模式下 Agent 會在 notes 說明待補憑證，實際比例會不同。這份數字只能當上限的參考。
- 範本資料的憑證欄位有被移除的情況，無法精確區分「真缺」與「被移除」，所以才另列至少有一個節點帶欄位的子群。
- 只用 2.44.6 目錄；其他版本的目錄差異很小（有 `required` 憑證的節點數：2.37.3 為 786、2.44.6 為 797、2.46.6 為 798），結論不變。
- 採用口徑會漏報條件式憑證節點（HTTP Request、Slack、Gmail 等）；這是刻意用漏報換低誤報。

### 判斷

**維持建議，不升為阻擋。** 上限估計 42.0% 明顯偏高；即使排除被移除憑證的範本，仍有 8.0% 的節點被提醒，且無法由 JSON 區分真缺與其他設定方式。依 Portal 端的原則（誤報率明顯偏高就維持建議）與使用者決策（護欄與提醒只是建議，不使 CI 失敗），規則只輸出在 PR 註解。若日後要重評，先累積受限模式 Agent 實際產出的資料，再以相同方法計算。

## 限制

- **動態檢查用的是假憑證**：能確認匯入、啟用、webhook 註冊與節點設定是否被該版本接受，**不代表**真實服務（Slack、Google、LLM 等）可用，也不代表真實憑證有效。執行紀錄為 error 在假憑證下是預期的結果。
- 目標版本必須有 `docs/node-versions/<版本>.json`；沒有就無法做節點與 `typeVersion` 檢查。目錄只含該實例預設載入的節點，未安裝的社群節點會被判為 `NODE_NOT_FOUND`。
- 靜態的 `typeVersion` 檢查比 n8n 本身嚴格：例如 Webhook 2.2 不在 2.37.3 的目錄內，但該版本實際仍可匯入與啟用；以目錄為準是刻意的選擇。`hidden` 但未棄用的節點不阻擋，只出 `node:hidden-legacy` 建議。
- 憑證只比對「類型加名稱」是否在允許清單，不檢查憑證內容、權限或是否過期。
- `credentials:missing-field` 只看目錄標示「無條件需要」的憑證；像 HTTP Request、Webhook、Slack、Gmail 這類要看 `authentication` 等參數才需要憑證的節點，因為工作流 JSON 通常省略預設參數值，無法可靠判斷，一律不提醒（會漏報，不會誤報）。仍可能誤報的情況見下方評估。
- 受限模式禁止 `STUB-` 假憑證，提供 credentialMap 時此類憑證會被擋（`CREDENTIAL_MISSING`，夾具 `fail-stub-credential`）；沒有提供 credentialMap 時這項檢查會略過，所以接入 Portal 的宿主一定要提供。規則見 [`spec/agent-restricted-mode.md`](../spec/agent-restricted-mode.md)。
- webhook path 的靜態比對只認字面值；以運算式組出的 path 會略過並在建議項說明。同一個 path 是否已被其他啟用中的 workflow 使用，要靠既有清單或動態檢查啟用時的 409。
- 沒有觸發節點的 workflow 無法啟用，這在動態檢查只是提示（`NO_TRIGGER`）。
- 需要對外註冊的觸發節點（Telegram、GitHub、IMAP 等）無法在無網路的測試環境驗證啟用；2.44.6 以上的啟用 API 還會對這類失敗回 200（見「啟用失敗的分類」），務必另在 staging 實測。
- 沒有加 `--offline` 時，假憑證會讓 n8n 對外部服務發出請求（內容是假 token）；`--offline` 則完全不連外，代價是 2.37.3 的外部註冊型觸發會因 DNS 失敗而歸為 `activate:unverified-external`。
- `matrix.sh` 只用本機已有的映像，並且需要本機可以執行 docker；它不會拉取映像，也不會修改 Docker 設定。
- 動態檢查未涵蓋：PostgreSQL 後端、queue mode、外部 secrets、SSO 與權限設定。

## 腳本自己的回歸測試

```bash
node scripts/__test__/run-ci-tests.mjs                 # 靜態部分，不需要 docker
node scripts/__test__/run-ci-tests.mjs --with-n8n      # 另用 matrix.sh 在本機容器上跑動態部分
```

報告與註解的三態另有 `scripts/__test__/ci-report-fixtures/`（通過、失敗、逾時未完成、啟用無法歸類、失敗且未完成各一份）。夾具放在 `scripts/__test__/ci-fixtures/`（`pass-*`、`advisory-*`、`fail-*`），檔名與預期結果寫在 `scripts/__test__/expected.json`。測試會斷言：每個 `fail-*` 恰好得到預期的阻擋碼、每個 `pass-*` 與 `advisory-*` 退出碼為 0、建議項不會使狀態變成 `fail`、輸出不含疑似機密。`fail-secret` 夾具內只放佔位符，測試時才在暫存目錄展開成假金鑰。
