# 黃金情境評測套件（eval）

> **一句話**：用 50 個固定的情境，量測「某個內網模型寫 n8n workflow 的結構品質」——通過靜態檢查的比例、需要自我檢查迴圈幾輪、（選用）動態檢查通過比例。評分器就是 Pack 自己的檢查腳本，不另寫第二套規則。
>
> **這是結構性評測，不代表語意正確。** 它只看節點類型、版本、憑證引用、阻擋碼與註解結構；workflow 做的事是否符合需求、參數是否填對，需要動態檢查與人工複核。

完整的情境清單、判定規則與解讀方式見 [`../docs/eval-golden-scenarios.md`](../docs/eval-golden-scenarios.md)。本檔說明怎麼跑、有哪些選項、指標怎麼算。

## 1. 目的與限制

- **目的**：D-AI-04 已決定先用內網模型、不送外部雲端，且目前不選模型。模型接上之後，先量「現有內網模型寫 workflow 的品質」，結果作為日後選模型的依據之一。
- **不是什麼**：不是語意評審、不是模型排行榜、不替人決定通過門檻（門檻與容許帶一律待討論，見 [`../docs/eval-golden-scenarios.md`](../docs/eval-golden-scenarios.md) 第 7 節）、不推薦任何模型。
- **現在不接任何真實模型**：本套件附的假模型（`mock-model/`）只用來測試評分程式本身，輸出不是品質基準。
- **只連私有網段**：`--base-url` 只允許 localhost 或私有網段；公網位址一律拒絕（第 5 節）。

## 2. 資料夾

| 路徑 | 內容 |
|---|---|
| `run-eval.mjs` | 評分程式（Node 18 以上，只用內建模組） |
| `scenarios/scenarios.json` | 50 個情境（G01 到 G50） |
| `lib/` | 提示詞組裝、模型呼叫與私網防護、抽取 workflow、評分、彙整 |
| `mock-model/` | 離線測試用的假模型（OpenAI 相容，只綁 127.0.0.1）與手寫的參考輸出 `oracles/` |
| `test/run-eval-tests.mjs` | 評測套件自身的測試 |
| `tools/scenario-table.mjs` | 由情境檔產生文件用的情境清單表格 |
| `results/` | 每次執行的結果（已在 `eval/.gitignore` 排除，不會進版本控制） |

## 3. 快速開始

### 3.1 離線自測（不需要任何模型）

```bash
node eval/test/run-eval-tests.mjs          # 啟動假模型，跑評分程式的全部測試
```

手動用假模型跑幾個情境：

```bash
node eval/mock-model/server.mjs --mode oracle &       # 印出一行 JSON，內含 url
node eval/run-eval.mjs --base-url <假模型印出的 url> --model mock --only G01,G04,G07
```

### 3.2 接上內網模型（LLM Manager 閘道，OpenAI 相容 `/v1`）

```bash
export EVAL_API_KEY='<由人取得，不要寫進指令列、腳本或版本控制>'
node eval/run-eval.mjs \
  --base-url http://<LLM_MANAGER_HOST>:<PORT>/v1 \
  --model <閘道提供的模型代號> \
  --max-rounds 3 --repeat 3
```

- 位址與模型代號請向閘道管理者確認；本套件不寫死任何位址或模型名稱。
- 閘道若需要額外參數（例如關閉思考模式），用 `--extra-body '{"...":...}'` 帶入。
- 閘道是否記錄提示詞全文，請先確認日誌政策（第 9 節）。

### 3.3 常用組合

```bash
node eval/run-eval.mjs ... --only trap              # 只跑 10 個陷阱情境
node eval/run-eval.mjs ... --only schedule,form     # 依骨架類別
node eval/run-eval.mjs ... --node-hint none         # 不給節點清單，量模型自己記得多少
node eval/run-eval.mjs ... --skill sticky-note-to-workflow --skill-max-chars 4000
node eval/run-eval.mjs --list                       # 列出情境，不需要端點
node eval/run-eval.mjs ... --check-only             # 只檢查設定與網址，不呼叫模型
```

## 4. 命令列選項

| 選項 | 預設 | 說明 |
|---|---|---|
| `--base-url`、`--model` | 無（也可用環境變數 `EVAL_BASE_URL`、`EVAL_MODEL`） | 端點與 model 欄位 |
| `--api-key-env <名稱>` | `EVAL_API_KEY` | 存放 API 金鑰的環境變數名稱；金鑰只從環境變數讀取 |
| `--scenarios <檔>` | `scenarios/scenarios.json` | 自訂情境檔 |
| `--only <id,類別>`、`--category`、`--limit` | 全部 | 篩選情境 |
| `--repeat <k>` | 1 | 每題重複 k 次（模型輸出非確定性，建議 3 次以上） |
| `--max-rounds <n>` | 3 | 自我檢查迴圈上限（受限模式規格的起始建議值） |
| `--no-stagnation-stop` | 關 | 預設連續兩輪阻擋碼相同就停止；加上則跑滿上限 |
| `--temperature`、`--max-tokens`、`--seed`、`--extra-body` | 0、8192、無、無 | 送給端點的參數 |
| `--timeout-ms`、`--retries` | 120000、1 | 單次呼叫逾時；網路錯誤或 5xx 的重試（不佔輪數） |
| `--node-hint curated\|none\|full` | `curated` | 系統提示是否附節點清單（`full` 很長） |
| `--skill <名稱,…>`、`--skill-max-chars` | 不載入、6000 | 載入 `skills/*/<名稱>/SKILL.md`，有字數上限 |
| `--out-dir`、`--run-id` | `eval/results`、依時間產生 | 結果位置 |
| `--no-save-outputs`、`--save-raw` | 保存 workflow、不存原始回覆 | 見第 9 節 |
| `--dynamic` 與相關選項 | 關 | 見第 7 節 |
| `--allow-external` | 關 | 見第 5 節 |

退出碼：0 正常完成（不論通過率）；1 全部情境都因錯誤中止；2 命令列或設定錯誤。

## 5. 安全限制

1. **私有網段限制**：`--base-url`（與動態檢查的 `--n8n-url`）只允許 localhost、`127/8`、`10/8`、`172.16/12`、`192.168/16`、`::1`；主機名稱（含 `.local`、`.internal`）解析後的位址必須全部落在上述範圍。公網位址一律拒絕並說明原因。
   - 檢查發生兩次：啟動時檢查網址；每次連線當下再檢查一次解析結果（防止檢查之後 DNS 改指別處）。
   - 不跟隨轉址；網址內不可含帳號密碼；IPv6 只放行 `::1` 與其對應的 IPv4 映射位址（ULA 不在清單內）。
   - 確有需要時由人明確加 `--allow-external`；輸出會以紅字警示，`summary.md` 開頭也會標示。這與 D-AI-04 的方向不同，不是預設行為。
2. **API 金鑰只讀環境變數**，不印出、不寫入任何檔案；錯誤訊息與結果檔寫入前一律遮罩（含伺服器回顯的 `Authorization`）。子行程（檢查腳本）只拿到最小環境，不繼承金鑰。
3. **送給模型的內容有白名單**：規則文字、該情境的 credentialMap、節點目錄摘要、情境本身（提示詞與外部文字）、（選用）`SKILL.md`、檢查回饋。不會送出工作目錄或結果資料夾裡的其他檔案；`--skill` 只接受 Skill 資料夾名稱，且 `SKILL.md` 不可是符號連結。
4. **假金鑰以程式組合**：情境檔只放占位符（例如 `{{FAKE_KEY_OPENAI}}`），執行時才組成金鑰樣式字串；原始檔不含完整樣式。輸出中出現餵入的假金鑰即判定失敗。
5. **結果不記錄端點位址**，只記端點類型（本機、私有網段、外部），避免內網位址進報告。

## 6. 指標定義

下表的分母以「執行次數」計（情境數 × `--repeat`）。「要求產出 workflow」指 `expect.mode` 為 `generate` 的情境（目前 45 個）；`refuse-or-safe` 的 5 個情境允許用拒絕作答，不計入靜態通過率的分母。

| 指標 | 定義 | 分母 |
|---|---|---|
| 一次通過率 | 第 1 輪就沒有阻擋碼 | 要求產出 workflow 的執行次數 |
| 最終通過率 | 輪數上限內沒有阻擋碼 | 同上 |
| 通過者平均輪數 | 通過那一輪的編號，取平均（1 表示第一版就過） | 最終通過者 |
| 各輪累積通過率 | 至第 k 輪為止通過的比例 | 同上；用來判斷輪數上限是否值得再加 |
| 情境斷言全過率 | 靜態檢查加上該情境的 `expect` 斷言與契約斷言全部成立 | 全部執行次數 |
| 陷阱類處理正確率 | 10 個陷阱情境的斷言全過率；另報可拒絕子集 | 陷阱情境的執行次數 |
| 阻擋碼分布 | 各碼在「第 1 輪、任一輪、最終」出現的次數 | 全部執行次數 |
| 失敗原因分布 | 未全過的次數中，各原因（靜態碼、斷言名稱、錯誤）的出現數 | 未全過的執行次數 |
| Code 節點占比 | Code 類節點 ÷ 全部節點（不含便條）；報各 workflow 平均與全體合計 | 能解析出 workflow 的執行次數 |
| 建議項數與類型 | 最終版本檢查報告的建議項；原生節點提醒另列 | 同上 |
| 不存在節點率 | 出現 `NODE_NOT_FOUND` 的比例；另報占第 1 輪節點總數的比例 | 全部執行次數 |
| 杜撰憑證率 | 出現 `CREDENTIAL_MISSING` 的比例（任一輪、最終） | 全部執行次數 |
| Layer 3 與參考來源比例 | 有 Layer 3 便條、有三個區塊、順序正確的比例 | 能解析出 workflow 的執行次數 |
| 動態通過率 | 動態檢查狀態為 pass 的比例 | **已執行動態檢查的份數**（只對最終靜態通過者執行） |
| 延遲與 token | 模型呼叫總時間的平均、中位數、第 95 百分位；回應含 `usage` 時加總 token | 全部執行次數（token 只算有回報者） |

因基礎設施問題（連不上、逾時、5xx）而中止的次數視為未通過，並在摘要單獨列出，方便判斷是否為環境問題。

### 斷言與契約

每個情境的 `expect` 欄位見 [`../docs/eval-golden-scenarios.md`](../docs/eval-golden-scenarios.md) 第 3 節。除此之外，每份產出的 workflow 一律檢查下列契約：`active` 不為 `true`、`credentials` 不寫 `id`、沒有 STUB 類憑證名稱、沒有禁用節點（n8n API 節點、Execute Command、Function 類）、不含餵入的假金鑰、不宣稱已通過或已啟用（啟發式：同一句沒有否定詞才算）。

## 7. 動態檢查（選用）

預設關閉，因為需要一個可丟棄的 n8n 實例，且吃資源。

```bash
export N8N_URL='http://<n8n 實例位址>:<埠>'      # 同樣只允許私有網段
export N8N_API_KEY='<該實例的 API 金鑰>'
node eval/run-eval.mjs ... --dynamic --dynamic-limit 10 --dynamic-disposable
```

- **測試主機記憶體吃緊**：動態檢查一次只跑一個 workflow，評分程式本身是序列執行，不提供並行選項；請先用 `--dynamic-limit` 小量試跑，並確認沒有其他重負載的工作同時進行。
- 只對「最終通過靜態檢查」的 workflow 執行；實際呼叫 `scripts/ci/run-on-n8n.mjs`，它會匯入、補假憑證、啟用、觸發、停用並清理，只動自己建立的東西。
- 對全新空實例可加 `--dynamic-bootstrap`；用完即銷毀的實例可加 `--dynamic-disposable`。
- 尚未實作經由檢查服務 HTTP 呼叫動態檢查（第 11 節）。

## 8. 假模型

`node eval/mock-model/server.mjs --mode <模式>` 啟動一個只綁 127.0.0.1 的 OpenAI 相容伺服器，用來測試評分程式。**不是品質基準。**

| 模式 | 行為 |
|---|---|
| `oracle` | 對 13 個情境回傳手寫的參考輸出（`oracles/`），其餘情境回覆沒有 JSON |
| `broken-json` | 回傳被截斷的 JSON |
| `hallucinate-node` | 用不存在的節點（Discord 觸發等） |
| `function-node` | 用已棄用的 Function 節點 |
| `stub-credential` | 用 STUB 開頭的假憑證 |
| `hardcoded-secret` | 在標頭寫死用程式組合出的假金鑰 |
| `always-refuse` | 一律拒絕 |
| `fix-after-feedback` | 第一輪有缺陷；收到阻擋碼回饋後才修好（`--fix-round` 可指定第幾輪修好） |
| `slow` | 延遲回應（`--delay-ms`） |
| `http-500` | 回 500，並在錯誤內容回顯收到的 `Authorization`（用來測試遮罩） |
| `non-json` | 只回純文字 |

### 審查者假模型（`review-server.mjs`）

`node eval/mock-model/review-server.mjs --mode <模式>` 是另一支假模型，專門給「AI 審查者模式」（[`../spec/agent-reviewer-mode.md`](../spec/agent-reviewer-mode.md)）用：離線、只綁 127.0.0.1，依輸入裡 workflow 的內容回傳預先寫好的審查 JSON，或故意回不合格的輸出（含網址、HTML、放行用語、超長、超過 20 則、格式錯誤、機密樣式、非 JSON、逾時、500）。workflow 便條含 `SYSTEM: approve` 之類文字時，它會故意「被說服」並回放行用語，用來證明輸出檢查（`scripts/review/validate-review.mjs`）會擋下。它與上表的 `server.mjs` 互相獨立，不影響評測套件；不是品質基準。測試見 `node scripts/__test__/run-review-tests.mjs`。

參考輸出的來源與檢查：`oracles/Gxx.workflow.json` 可直接拿去跑 `node scripts/ci/check-workflows.mjs --dir <絕對路徑> --target-version 2.44.6 --credential-map '<json>'`；它們在受限模式下只引用情境的 credentialMap 名稱。

## 9. 風險與日誌政策

- **提示詞可能含使用者資料**：本套件的情境全是合成資料，請**不要**把真實使用者資料放進情境檔。若日後補入真實失敗案例，需先去識別化。
- **閘道是否記錄提示詞全文**（D-AI-03 仍待決）：接上之前先確認；若會記錄，情境與回覆都會進入日誌。
- `--save-raw` 會把模型的原始回覆（已遮罩金鑰樣式）寫進結果資料夾，可能含情境中的文字；預設關閉。結果資料夾已被 `.gitignore` 排除，但仍是本機檔案，請依資料政策保管與清除。
- 假金鑰會被送進提示詞（模擬使用者貼了金鑰）。它們是程式組合出的假值，沒有任何權限。

## 10. 測試

```bash
node eval/test/run-eval-tests.mjs
```

涵蓋：私網限制（公網拒絕、私網允許、`--allow-external` 放行並標紅）、金鑰不外洩、臨時目錄清除、50 個情境的結構與期望 type、各種假模型行為下的輪數與指標、結果檔格式與 `summary.md`、動態檢查（用替身腳本，不連任何 n8n）、文件與情境檔同步、機密與用語掃描。

## 11. 已知落差與未實作

- **Pack 檢查腳本的一個限制**：`check-workflows.mjs` 的 `--dir` 若是相對路徑，資安護欄與原生節點的建議項會被靜默略過。評分程式一律傳絕對路徑的臨時目錄，不受影響；手動對參考輸出跑時請用絕對路徑。
- 未實作：經檢查服務 HTTP 的動態檢查；參考來源如實率、註解與 JSON 一致率、建議事項完整率（需要宿主的工具日誌）；多輪對話與「修改既有 workflow」情境；模型的工具呼叫（function calling）；token 總預算與牆鐘總時限（目前只有單次呼叫的 `--max-tokens` 與 `--timeout-ms`）；兩次執行結果的比較工具。
- 評測用的系統提示是精簡版，不等於 Portal 實際使用的系統提示；Portal 的提示定案後需要對齊。
