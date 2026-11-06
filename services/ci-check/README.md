# n8n workflow 檢查服務（HTTP 包裝層）

把 Pack 的確定性檢查腳本（`scripts/ci/check-workflows.mjs`、`scripts/ci/run-on-n8n.mjs`）包成兩個 HTTP 服務，供專用管線 n8n 以 HTTP Request 節點呼叫。介面、限額與錯誤碼以規格草稿（`services-spec`：`static-check-api.md`、`dynamic-check-api.md`、`error-model-and-codes.md`、`security-and-limits.md`）為準；本文件只寫怎麼啟動、安全設計摘要、與規格的差異和已知限制。

兩個服務都只用 Node 內建模組（Node 18 以上），沒有任何對外網路呼叫，不持有任何真實機密，只回報事實、不決定放行。

## 1. 檔案

| 檔案 | 說明 |
| --- | --- |
| `static-service.mjs` | 靜態檢查服務：`POST /v1/check/static`、`POST /v1/review/build-input`、`POST /v1/review/validate`（AI 審查，見第 2.1 節）、`GET /healthz`、`GET /version` |
| `review-api.mjs` | AI 審查兩個端點的輸入檢核與包裝（組輸入與驗證輸出的邏輯在 `scripts/review/`，這裡不重寫） |
| `dynamic-front.mjs` | 動態檢查前端：`POST /v1/check/dynamic`、`GET /v1/jobs/{jobId}`、`DELETE /v1/jobs/{jobId}`、`GET /v1/capacity`、`GET /healthz`、`GET /version` |
| `dynamic-result.mjs` | 前端用：執行器結果的檢核、重算與 PR 註解渲染 |
| `shared.mjs` | 共用零件：錯誤格式、認證、限流、輸入檢查、記錄、註解的縱深防禦 |
| `executor/Dockerfile.executor` | 執行器映像（基於官方 n8n 映像，不安裝任何額外套件） |
| `executor/executor-loop.mjs` | 執行器驅動程式：處理一個 job 就結束 |
| `test/` | 測試（見第 7 節） |

## 2. 靜態檢查服務

```
STATIC_API_TOKEN_CURRENT=<至少 32 字元的亂數> node services/ci-check/static-service.mjs
```

靜態服務會呼叫 Pack 內的 `scripts/ci/check-workflows.mjs`，它又會呼叫 `scripts/security-scan.mjs` 與 `scripts/native-first-check.mjs`，所以部署時 Pack 的 `scripts/` 與 `docs/node-versions/` 要完整存在（以 `PACK_ROOT` 指定）。

| 環境變數 | 預設 | 說明 |
| --- | --- | --- |
| `STATIC_API_TOKEN_CURRENT` | 必填 | Bearer token，至少 32 字元；沒設或太短，服務拒絕啟動（退出碼 2），錯誤訊息不回顯 token |
| `STATIC_API_TOKEN_NEXT` | 無 | 輪替用的第二把 token，兩把同時有效 |
| `STATIC_CALLER_ID_CURRENT`、`STATIC_CALLER_ID_NEXT` | `pipeline-n8n`、`pipeline-n8n-next` | 該 token 對應的呼叫者名稱；記錄與速率限制只用它 |
| `ALLOWED_SOURCE_CIDRS` | 不限制 | 逗號分隔的 IPv4 CIDR（或 `::1`），例如 `<PIPELINE_HOST_IP>/32`；不在名單內回 403。若服務在反向代理後面，看到的來源是代理位址，名單要設代理（服務不信任 `X-Forwarded-For`） |
| `HOST`、`PORT` | `127.0.0.1`、`8080` | 容器內請設 `HOST=0.0.0.0` 並只對管線主機開放該埠 |
| `PACK_ROOT` | 本檔往上兩層 | Pack 根目錄 |
| `WORK_ROOT` | 系統暫存區下的 `ci-check-static` | 臨時目錄的位置；建議指向 tmpfs（`noexec,nosuid,size=64m`）。啟動時會清空這個資料夾，不要與其他用途共用 |
| `CHECK_TIMEOUT_MS`、`MAX_CONCURRENT` | `30000`、`4` | 單次處理逾時、並行上限（另可排隊 8 個、最久 5 秒） |
| `RATE_PER_MINUTE`、`RATE_BURST` | `60`、`20` | 每個呼叫者的速率與突發量（只套在 POST；`/v1/review/validate` 不計） |
| `REVIEW_MAX_INPUT_CHARS` | `150000` | AI 審查送進模型的資料字元數預算（見 2.1） |

行為重點：

- 請求內容寫進臨時目錄（路徑逐一檢查），以不經 shell 的子行程呼叫 `check-workflows.mjs`，子行程環境只有 `PATH`、`TMPDIR`、`HOME`、`LANG`（不繼承 token）；逾時殺整個行程群組；`finally` 一律刪除臨時目錄。
- 記錄是一行一筆的 JSON（stdout），只含 requestId、callerId、來源 IP、端點、狀態碼、耗時、版本、檔名、各阻擋碼與建議規則的次數、錯誤碼；寫入前再過一次欄位白名單。
- 同一個 `ci-report` 的內容與直接跑 CLI 相同（測試會逐項比對）。

### 2.1 AI 審查端點（只給建議，不影響任何檢查）

兩個端點掛在靜態服務上，沿用同一把 Bearer token、來源白名單、`Content-Type: application/json` 規則、5 MB 本文上限與 `{ error }` 錯誤格式。它們**不呼叫任何模型、不做任何對外連線**：呼叫模型是宿主（例如管線 n8n）的事，這裡只做「組輸入」與「驗證輸出」兩段。邏輯在 Pack 的 `scripts/review/build-input.mjs` 與 `validate-review.mjs`（映像內 `/opt/pack/scripts/review/`），端點只做輸入檢核與包裝。規格見 `spec/agent-reviewer-mode.md`，宿主怎麼接見 `docs/ai-review-in-pr.md`。

**`POST /v1/review/build-input`**：請求（未定義的欄位回 400）

| 欄位 | 必填 | 說明 |
| --- | --- | --- |
| `requestId` | 是 | 8 至 64 字元，與靜態檢查相同規則 |
| `workflowsAfter` | 是 | `[{ path, content }]`，規則同 `/v1/check/static` 的 `workflows`（最多 50 個、單檔 1 MB、路徑檢查） |
| `workflowsBefore` | 否 | 同上；新建（沒有前一版）時省略或給 `[]` |
| `staticReport`、`dynamicReport` | 否 | 檢查服務回應的 `report`／`result`；只留 `status`、`target`、`complete`、`state`、`counts`、`blocking`、`advisories`（各項欄位與長度受限），其餘丟棄 |
| `targetEnv` | 否 | 目標環境快照，**只有名稱**：`environment`、`n8nVersion`、`credentialMap`（`{ 類型: [憑證名稱] }`）、`existingWebhookPaths` |
| `prMeta` | 否 | `number`、`title`、`body`、`baseRef`、`headRef`、`author`、`repo`、`targetEnv`、`sha`（皆受長度限制，不含機密） |

回應 200：`{ requestId, service, serviceVersion, apiVersion, packVersion, messages, nonce, parts, reduced, tooLarge, inputChars, allowedReferences, nodeNames, durationMs }`。`messages` 是可直接送給 OpenAI 相容 `/v1/chat/completions` 的 `[system, user]`：system 是 `skills/tigerai/n8n-review-mode/SKILL.md` 第 3 節的原文（含 `[PORTAL-REVIEWER-AGENT-MODE v1]` 標記，測試會逐字比對）加上宿主參考清單；user 是帶隨機 nonce 的不可信資料區塊（先遮罩機密樣式、改寫偽造的分隔標記）。`allowedReferences` 與 `nodeNames` 原樣交給 validate。資料超過字元預算時先省略 `workflow_before` 並在 `reduced` 註明；仍超過則 `tooLarge: true`、`messages: null`（**不靜默截斷**，宿主應顯示「AI 審查未執行」）。

**`POST /v1/review/validate`**：請求 `{ output, allowedReferences?, nodeNames?, notRun?, requestId? }`。`output` 是模型的原始回覆；`notRun` 為 `unavailable` 或 `timeout` 時不讀 `output`，直接回該未執行結果（宿主在模型不可用、逾時時用同一套呈現）。回應 `{ requestId, service, serviceVersion, apiVersion, packVersion, result, markdown, durationMs }`：`result` 是 `validate-review.mjs` 的結果物件（`status` 為 `ok` 或 `not-run`、`injectionSuspected`、`suggestions`、`dropped` 等），`markdown` 是含橫幅『AI 建議，僅供參考，不能取代人工審核』與『參考了哪些資料』的呈現。

- **通過認證後一律回 200**：輸出無效、疑似遭提示注入、請求本身有問題（壞 JSON、欄位錯、Content-Type 錯、本文過大）都只是 `result` 的內容（`status: "not-run"`），不會回錯誤碼。唯一例外是存取控制：沒有或錯的 token 仍回 401、來源不在白名單回 403、連續認證失敗被封鎖回 429。
- `output` 超過 32,768 字元一律視為無效（`output-too-large`）：`validate-review.mjs` 有幾條正規表示式對長字串是二次方時間（實測 60,000 字元約 3 秒），先在這裡設上限避免單一請求拖住服務；3,000 tokens 的輸出遠小於此值。
- 被丟棄的內容只留原因代碼，不出現在回應與記錄；記錄不含 workflow 內容、PR 標題、模型輸出。
- 這個端點不是閘門：沒有任何選項能讓它的結果影響檢查狀態，宿主也不應該這麼用。

## 3. 動態檢查前端與執行器

```
DYNAMIC_API_TOKEN_CURRENT=<亂數> DYN_ROOT=<共享目錄> node services/ci-check/dynamic-front.mjs
```

前端有網路，但沒有 n8n、沒有 docker 權限，也不啟動任何子行程。

| 環境變數 | 預設 | 說明 |
| --- | --- | --- |
| `DYNAMIC_API_TOKEN_CURRENT`、`DYNAMIC_API_TOKEN_NEXT`、`DYNAMIC_CALLER_ID_*` | 同靜態服務 | 與靜態服務使用不同的 token |
| `DYN_ROOT` | 必填 | 共享目錄，建議 tmpfs 或專用小分割區 |
| `DYN_MAX_BYTES` | `536870912` | 共享目錄用量上限（遞迴計算大小）：>= 80% 拒收（`DISK_FULL`），>= 90% 由最舊的終態 job 開始清 |
| `QUEUE_MAX`、`CALLER_JOB_MAX` | `20`、`5` | 佇列長度、每個呼叫者的非終態 job 數 |
| `ALLOWED_SOURCE_CIDRS`、`HOST`、`PORT`、`PACK_ROOT`、`RATE_*` | 同靜態服務（埠預設 `8081`） | |

共享目錄配置：

```
<DYN_ROOT>/
  jobs/<jobId>/meta.json      狀態的唯一來源（前端寫）；request.json 在 job 進入終態時刪除
  done/<jobId>/result.json    前端重算、淨化後的結果，保留 1 小時
  slots/<n8n版本>/<slot>/     每個執行器容器只掛載自己的這一個資料夾
  quarantine/<版本>-<slot>    隔離旗標（內容只有時間）
```

池 = `slots/` 下已建立的 slot 資料夾；實驗室只需建立 `slots/2.44.6/1`。建立資料夾與權限（執行器的 UID 要能寫入、前端要能讀寫）由部署者負責；前端不會替你建立 slot。

### 執行器映像與啟動旗標

```
docker build -f services/ci-check/executor/Dockerfile.executor --build-arg N8N_VERSION=2.44.6 -t p0-ci-executor:2.44.6 .
```

以 Pack 根目錄為 build context（`Dockerfile.executor.dockerignore` 只放行需要的路徑）；不需要網路，基底映像要先存在本機。每個 slot 一個容器：

```
docker run -d --name <執行器名稱> --restart unless-stopped \
  --network none --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=256m \
  --cap-drop ALL --security-opt no-new-privileges \
  --cpus 1 --memory 1g --memory-swap 1g --pids-limit 512 --ulimit nofile=4096:4096 \
  --user <UID>:<GID> \
  -v <DYN_ROOT>/slots/2.44.6/1:/slot \
  p0-ci-executor:2.44.6
```

- 執行器處理完一個 job 就以 0 結束，由 restart policy 換一個全新的容器（新的 `bootId`、空的 tmpfs）。前端保證「同一個 `bootId` 最多只收一個 job」。
- n8n 的資料目錄在 `/tmp`（tmpfs）下的每個 job 專屬資料夾；加密金鑰每個 job 隨機產生，只放在 n8n 子行程的環境變數。
- 映像內沒有任何機密；不需要 `docker.sock`。實際旗標與行為見 `test/run-executor-smoke.sh`（旗標含 `noexec` 與 `--memory-swap` 的組合已實際跑過）。

### 規格要求的流程（檔案佇列協定）

前端把 `job.json` 以「寫 `*.tmp`、fsync、rename」放進空閒 slot；執行器每 2 秒更新 `status.json`，完成時原子寫入 `result.json`、刪除 `job.json`、結束。前端對 slot 內的一切當作不可信輸入：`O_NOFOLLOW`、一般檔案、大小上限（`result.json` 1 MB、`status.json` 4 KB）、未知檔案即隔離；`result.json` 逐欄檢核（身分、檔名必須在請求內、阻擋碼只收動態 4 碼、狀態欄位與阻擋項要互相對得上、字串截斷與遮罩），然後重算 `status`、`counts`、`executionSummary` 並自行渲染註解，不使用執行器宣稱的任何總結。

## 4. 安全設計摘要

- 認證：Bearer token 由環境變數注入，以 SHA-256 摘要做常數時間比對（比對所有 token，不提早離開）；不寫入記錄、不回顯；可用 `*_NEXT` 輪替（先讓管線改用新值，再把新值設為 CURRENT、移除舊值）。同一來源連續 10 次失敗封鎖 5 分鐘。token 請放在權限 0600 的環境檔（`docker run --env-file`、systemd 的 `EnvironmentFile=`／`LoadCredential=`），不要寫進映像、命令列參數或版本控制。
- 輸入：本文 5 MB、檔數（靜態 50／動態 20）、單檔 1 MB、外層 JSON 深度 8、檔內括號深度 100（超過產生 `JSON_INVALID`）、節點數 2000（超過產生 `STRUCTURE_INVALID`）；路徑拒絕絕對路徑、`..`、隱藏段、`node_modules`、控制字元、非 `.json`、重複（不分大小寫、NFC 後）；拒絕 `Content-Encoding`。
- 隔離：靜態服務的子行程獨立行程群組、牆鐘逾時、`--max-old-space-size`；執行器無網路、唯讀根檔案系統、非 root、cap-drop ALL、資源限額；每個執行器只掛載自己的 slot。
- 輸出：訊息不含 workflow 內容；PR 註解的跳脫由 Pack 的 `renderComment` 負責，服務端再做一次縱深防禦（表格列內出現未跳脫的危險字元，就把該列改成代碼區塊並記一則稽核事件）。
- 失敗關閉：Pack 輸出不可信（未知阻擋碼、狀態與阻擋項不一致、沒有報告）一律回 500，不放行。

## 5. 與規格的差異

| 項目 | 規格 | 實作 | 原因 |
| --- | --- | --- | --- |
| 臨時檔名 | 4.4 建議以檢查過的相對路徑寫入，第 9 節又寫「由服務依序號產生實際檔名」 | 採前者：以檢查過的原始相對路徑寫入 | 這樣 `report` 內的 `file` 與直接跑 CLI 完全相同，不必事後改寫訊息內的檔名 |
| 並行閘門的位置 | 在 JSON 解析之前 | 在本文讀完、欄位與路徑檢查之後、寫檔之前 | 避免慢速連線占住處理名額 |
| 認證失敗封鎖的回應 | 未指定 | 429 `RATE_LIMITED`＋`Retry-After`；來源白名單先於 token 檢查（沒帶 token 也回 403） | 錯誤碼表沒有專用碼 |
| 不存在的路徑或錯的方法 | 未指定 | 404 `NOT_FOUND` | 錯誤 schema 沒有 405 |
| 路徑規則 | 4.2 列出的規則 | 另外拒絕 Unicode 行分隔與雙向控制字元、單一路徑段超過 255 位元組、檔名同時是另一個檔案的目錄 | 避免檔案系統錯誤與顯示欺騙 |
| 靜態 `report` | 與 `ci-report` 同形 | 去掉 Pack 內部的 `incomplete` 與 `counts.incomplete` | 規格 schema 對這兩處是 `additionalProperties: false`；靜態檢查本來就不會有 incomplete |
| 動態 `incomplete` | 8.1：`activate:unverified-unknown` 只是建議 | 依 Pack 實作，它同時使版本結果成為 `incomplete`（`complete=false`，不得視為通過） | 衝突時以腳本行為為準 |
| 註解結果行 | 範例寫「未通過」「未完成（有 workflow 逾時…）」 | 直接用 Pack `renderComment` 的字樣（「失敗」「未完成（沒有阻擋項，但檢查沒有跑完…）」） | 規格要求共用同一組函式 |
| 逾時的部分結果 | 7.3：寫入已完成的部分結果 | 只有「沒有任何 workflow 結果」的部分結果（`complete=false`） | Pack 的 `run-on-n8n.mjs` 沒有逐檔的中途輸出 |
| 驅動程式的提供方式 | 7.1 範例以唯讀 bind mount 提供 | 打進映像（任務要求 `Dockerfile.executor`） | 執行器自成一體，不需主機目錄 |
| 清理等待 | 建議 Pack 增加略過清理等待的選項 | 直接用 Pack 已有的 `--disposable` | 該選項已存在 |
| 心跳時間 | `status.json` 的 `updatedAt` | 前端以檔案的 mtime 判斷新鮮度（`updatedAt` 仍會寫入） | 不依賴容器內時鐘與格式 |
| `executions` 單項長度 | schema 32，Pack 截到 40 | 執行器結果只接受 `^[A-Za-z0-9_-]{1,32}$` | n8n 的狀態字串都很短，其餘視為無效結果 |
| 速率限制 | 未區分 | 只套在 POST；GET 輪詢不限速 | 輪詢頻率由呼叫端控制 |
| `credentialStubPolicy.mode=strip` | 預留 | 回 400 `INVALID_REQUEST`（尚未支援） | schema 允許實作這樣回 |
| 前端先要求靜態通過 | 規格說前端看不到靜態結果，不強制 | 不強制 | 同規格 |

## 6. 已知限制與未實作

- 未實作：Prometheus 指標端點（只有結構化記錄）；宿主機重啟守護程序（規格 7.8，選用；隔離旗標檔已寫出，供它讀取）；TLS（請放在內部反向代理後）；記錄轉送到另一台主機。
- 靜態服務與前端沒有提供映像或部署檔（任務範圍只含執行器映像）。
- 認證失敗計數、速率限制與佇列索引都在記憶體；前端只支援單一實例（單一寫入者）。前端重啟後從 `meta.json` 復原。
- 來源白名單只支援 IPv4 與 `::1`；其他 IPv6 位址視為不在名單內。
- 共享目錄用量以 `DYN_MAX_BYTES` 為分母計算，不是檔案系統的 df。
- 單一 job 的實際耗時、n8n 開機時間（本機實測約 10 秒）、1 GB 是否夠跑 20 個 workflow、三個 n8n 版本的環境變數相容性，只在 2.44.6 與少量 workflow 上跑過。
- 動態檢查的邊界（授權功能、真實外部服務、外部註冊型觸發節點等）見回應的 `limitations`，與規格第 9 節相同。

### 給 Pack 的觀察（沒有修改 Pack）

1. `run-on-n8n.mjs` 沒有逐檔的中途輸出，所以逾時或取消時拿不到部分結果。
2. `run-on-n8n.mjs` 的 `die()` 路徑（連不上實例、bootstrap 失敗）退出碼 2 且不寫報告，執行器無法區分原因，一律歸為 `N8N_BOOT_FAILED`。
3. `ci-report` 帶 `incomplete` 與 `counts.incomplete`，與規格的靜態回應 schema 不同形（服務端剔除）。
4. Pack 的 `credentials:missing-field` 建議項來源是 `credentials`，規格的來源清單沒列（schema 允許任意字串）。

## 7. 測試

```
node services/ci-check/test/run-service-tests.mjs            # 全部（不需要 docker 或 n8n）
node services/ci-check/test/run-service-tests.mjs static     # static、dynamic、executor、misc 可擇一或多個
bash services/ci-check/test/run-executor-smoke.sh [版本]       # 需要 docker 與本機的 n8n 映像
```

- AI 審查：系統提示與 SKILL.md 逐字比對、build-input 與直接呼叫 Pack 函式逐字相同、機密遮罩與偽造標記、輸入檢核、validate 端點的各種壞請求都回 200、假模型（`eval/mock-model/review-server.mjs`）17 種模式走完 build-input 與 validate、提示注入整份丟棄、記錄不含內容。
- 靜態：Pack 的 `ci-fixtures` 逐一送出，斷言回應符合 schema（`test/schemas/`，是規格 schema 去掉說明文字後的副本）、阻擋碼與 `expected.json` 相符、與直接跑 CLI 的結果逐項相同；各種錯誤碼、路徑穿越、逾時與行程群組擊殺、並行與速率、token 不外洩、臨時目錄清除。
- 動態：以模擬執行器寫 `status.json`／`result.json`，涵蓋建立到讀回、冪等、惡意或造假的結果、重試與隔離、reaper、取消、佇列、容量與健康、多版本矩陣、前端重啟後復原。
- 執行器：用假的 n8n 與假的 `run-on-n8n` 跑真正的 `executor-loop.mjs`，另有前端與執行器串接的測試。
- 煙霧測試：建映像、在第 3 節的旗標下跑一個 job、用 `docker inspect` 只取旗標欄位核對、確認容器內只有 `lo` 且對外連線與 DNS 失敗。每次最多一個容器；`free -m` 的 available 低於 9000 MiB 會先等 60 秒，仍不足就印出 `SKIP` 並以 0 結束。
- 測試用的 token 在執行時隨機產生，不寫在檔案內。
