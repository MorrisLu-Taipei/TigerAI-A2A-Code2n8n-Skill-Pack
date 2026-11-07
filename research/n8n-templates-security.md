# n8n.io 公開範本：資安面的社群做法統計

> 🌐 [English](n8n-templates-security.en.md) | **繁體中文**

> 從 13,947 個 n8n.io 公開範本統計出的「資安面」社群做法（抓取日期 2026-11-05 至 2026-11-06，資料版本 2026-11-06；取得方式與完整性見 [`n8n-templates-method.md`](n8n-templates-method.md)），並對照本 Pack 目前版本的規則式掃描器 [`scripts/security-scan.mjs`](../scripts/security-scan.mjs)，說明各類做法目前由哪些掃描規則涵蓋、哪些尚未涵蓋。
> **這些是公開範本的描述性統計，不是漏洞清單，也不是對任何作者的指控。** 本檔不收任何範本編號、作者、命中內容或範例機密，只收彙整數字。掃描器的結果是給使用者參考的建議（護欄類為 warning，預設執行不會因它們而失敗），要不要處理由使用者決定。

---

## 1. 讀法與限制

### 1.1 怎麼讀數字

- **單位是「範本數」**，不是節點數；凡以節點為單位的數字，表格裡都會明寫「節點」。
- **分母每張表都標註**。預設分母是 13,947（全部範本）；Webhook 相關比例以「含 Webhook 的範本（2,775）」或「Webhook 節點（3,318）」為分母；HTTP 相關比例以「含 `httpRequest` 的範本（7,231）」或「`httpRequest` 節點（20,620）」為分母；Code 相關比例以「含 Code／Function 節點的範本（8,699）」為分母。
- 百分比四捨五入到小數一位；小於 0.1% 的寫成「<0.1%」。
- **「未設定」視同預設值**：範本匯出時會省略預設參數，所以 Webhook、Form Trigger 等沒有 `authentication` 欄位，就等於預設的「none」。
- 一個範本可以同時有多個節點，所以「至少一個節點符合」的比例會比節點層級的比例高一點；各表會註明採哪一種。

### 1.2 限制與措辭

- **範本多為示範**。「無認證」不等於實際部署有漏洞：使用者可能在反向代理或網路層另外限制、只在內網測試，或依範本說明自行補上設定。
- **命中比例不是漏洞確認**。本檔不判斷任何一個範本的實際風險，也不追究作者。
- **「像佔位字串」是啟發式判斷**（含 `your`、`example`、連續 `x`、角括號、大括號樣板、字元種類極少等），會有誤判；它只用來估量級，不能當作「這是真的機密」或「這不是機密」的依據。
- **規則式靜態比對**：不執行；除 §2.10 外不看連線可達性。例如「無認證 Webhook 與 `executeCommand` 同在一個範本」不代表兩者真的相連。已停用的節點也計入（22 個停用中的 Webhook 節點），影響很小（見 §2.1）。
- **公開範本的分布不等於使用者私有 workflow 的分布**。機密命中很少，可能反映上架前的清理，不一定反映作者的習慣。
- **年份是範本在 n8n.io 的建立時間**，不是節點版本；2025 與 2026 合計占全部範本的 91.7%，2019–2023 每年樣本很小，趨勢只能看大方向。
- 只統計 `n8n-nodes-base.httpRequest`；LangChain 的 `toolHttpRequest` 標頭不在「寫死授權資訊」的範圍內。
- **統計是描述性的，掃描結果是建議**：護欄類規則的命中只表示「這裡有一項值得考慮的設定」，是否處理由使用者決定；本檔不把命中比例當成品質或風險的評分。

### 1.3 統計方法與一致性

- 統計腳本是唯讀的，放在工作目錄，**不收進 repo**；所有輸出都只是彙整數字。
- 機密樣式與 Code 節點惡意樣式的正規式，是**直接從 `security-scan.mjs` 原始碼載入**，沒有另外改寫，所以與掃描器的判斷一致。
- 另外把全部 13,947 個範本的 workflow 圖逐檔餵給**目前版本**的掃描器實跑（結果見 §4.2）。兩邊測量同一件事的規則，命中範本數與自寫腳本逐項相同：`webhook:no-auth`（2,647）、`form:no-auth`（1,589）、`network:http-cleartext`（121）、`credential:plaintext`（43）、`exec:execute-command`（84）、`exec:ssh`（59），以及 Code 規則 `net-exfil-pattern`（15）、`require-fs-with-write`（6）、`base64-decode-suspect`（4）、`require-child-process`（2）、`env-dump`（1）。有差異的地方都來自掃描範圍或規則定義不同，已在 §4 註明：機密規則因納入 `pinData`，由 16 個增為 25 個範本；`jscode:process-spawn` 因收斂誤報而大幅減少；`jscode:dynamic-eval` 因補掃 `toolCode` 與 LangChain Code 多 1 個；`tls:allow-unauthorized-certs`、`file:rw-access`、`ai:*` 的範圍或判斷方式與 §2 的自寫統計不同，數字也就不同。另有 5 條規則（`secret:github-pat`、`secret:slack-token`、`jscode:reverse-shell`、`jscode:fs-write-sensitive`、`schema:empty-nodes`）在本資料集零命中。

---

## 2. 各指標

### 2.1 Webhook 節點（`n8n-nodes-base.webhook`）

| 指標 | 數量 | 比例（分母） |
|---|---|---|
| 含 Webhook 的範本 | 2,775 | 19.9%（13,947） |
| Webhook 節點總數 | 3,318 | 平均每個含 Webhook 的範本 1.2 個 |
| 至少一個 Webhook 無認證 | 2,647 | **95.4%**（2,775） |
| 所有 Webhook 都有設定認證 | 128 | 4.6%（2,775） |
| 排除已停用節點後，至少一個啟用中的 Webhook 無認證 | 2,633 | 95.4%（2,759，含啟用中 Webhook 的範本） |
| 設有 IP 白名單（`options.ipWhitelist`）的節點 | 2 | 0.1%（3,318） |
| 設有 IP 白名單的範本 | 2 | 0.1%（2,775） |
| 有明確設定 CORS 允許來源（`allowedOrigins`）的節點 | 69 | 2.1%（3,318） |
| 　其中設為萬用（`*`）的節點 | 66 | 2.0%（3,318） |

**認證方式分布**

| 認證設定 | 節點數 | 占 Webhook 節點（3,318） | 含該設定的範本數 | 占含 Webhook 的範本（2,775） |
|---|---|---|---|---|
| 無（未設定或 none） | 3,167 | 95.4% | 2,647 | 95.4% |
| headerAuth | 120 | 3.6% | 103 | 3.7% |
| basicAuth | 30 | 0.9% | 28 | 1.0% |
| jwtAuth | 1 | <0.1% | 1 | <0.1% |

右側兩欄一個範本可能同時有多種設定，所以不能直接相加。

**回應模式（`responseMode`，分母 3,318 個節點）**

| 模式 | 節點數 | 占比 |
|---|---|---|
| 收到即回應（`onReceived`，含未設定的預設） | 1,609 | 48.5% |
| 由 Respond to Webhook 節點回應（`responseNode`） | 1,449 | 43.7% |
| 最後一個節點的輸出（`lastNode`） | 254 | 7.7% |
| 串流（`streaming`） | 6 | 0.2% |

**HTTP 方法（分母 3,318 個節點）**

| 方法 | 節點數 | 占比 |
|---|---|---|
| POST | 2,466 | 74.3% |
| GET（含未設定的預設） | 791 | 23.8% |
| 多方法（`multipleMethods`） | 50 | 1.5% |
| 其他（PUT、DELETE、PATCH、HEAD 與運算式） | 11 | 0.3% |

**路徑（`path`）的形態（分母 3,318 個節點；只報數字，不列任何路徑內容）**

| 形態 | 節點數 | 占比 |
|---|---|---|
| 未設定（空） | 340 | 10.2% |
| 長度 8 個字元以下 | 171 | 5.2% |
| 　其中為常見字（test、webhook、hook、api 等清單） | 13 | 0.4% |
| UUID 形式 | 653 | 19.7% |
| 運算式 | 9 | 0.3% |
| 其他（長度大於 8 的自訂字串） | 2,145 | 64.6% |

「長度 8 以下」（不含空）的路徑出現在 145 個範本（5.2%，分母 2,775）。**無認證、路徑很短、也沒有 IP 白名單**三者同時成立的節點有 161 個（4.9%，分母 3,318 個節點），範本有 135 個（4.9%，分母 2,775）。

**無認證 Webhook 與高風險元素同在一個範本**（分母 2,647；只表示同一個範本內出現，不代表連線可達）

| 同在的元素 | 範本數 | 占比 |
|---|---|---|
| 高風險節點（`executeCommand`、`ssh`、讀寫檔案類） | 29 | 1.1% |
| 　其中 `readWriteFile` | 16 | 0.6% |
| 　其中 `executeCommand` | 11 | 0.4% |
| 　其中 `ssh` | 5 | 0.2% |
| 　其中 `readBinaryFile` | 4 | 0.2% |
| 　其中 `writeBinaryFile` | 3 | 0.1% |
| SQL 節點的查詢字串內含運算式（見 §2.8） | 35 | 1.3% |
| 呼叫自己 n8n 實例 API 的 HTTP 節點（見 §2.7） | 22 | 0.8% |
| Code 節點含 `eval(` 或 `new Function` | 2 | 0.1% |

高風險節點的各細項是同一範本可能出現多種節點，所以不能相加成 29。

### 2.2 其他對外入口：Form、Chat、MCP 與 AI Agent

| 指標 | 數量 | 比例（分母） |
|---|---|---|
| 含 Form Trigger（`formTrigger`）的範本 | 1,635 | 11.7%（13,947） |
| 　至少一個 Form Trigger 無認證 | 1,589 | **97.2%**（1,635） |
| 　Form Trigger 節點：無認證／basicAuth／n8nUserAuth | 1,643／30／23 | 96.9%／1.8%／1.4%（1,696 個節點） |
| 含 Chat Trigger（`chatTrigger`）的範本 | 771 | 5.5%（13,947） |
| 　設為公開（`public: true`）的節點 | 192 | 24.9%（771） |
| 　公開且無認證的節點 | 184 | 95.8%（192） |
| 含 MCP Trigger（`mcpTrigger`）的範本 | 309 | 2.2%（13,947） |
| 　至少一個 MCP Trigger 無認證 | 299 | 96.8%（309） |
| 　MCP Trigger 節點無認證 | 335 | 97.1%（345 個節點） |
| 含 AI Agent 節點的範本 | 4,336 | 31.1%（13,947） |
| 　同時有「無認證的對外入口」 | 1,485 | 34.2%（4,336） |
| 　　再加上動作類工具（`toolCode`、`toolHttpRequest`、`httpRequestTool`、`executeCommand`） | 153 | 3.5%（4,336） |

說明：「無認證的對外入口」指無認證的 Webhook、Form Trigger、MCP Trigger，或設為公開且無認證的 Chat Trigger。Form Trigger 與公開 Chat 的設計本來就是讓人開表單或對話，無認證不一定是疏忽，但對接 AI Agent 時會讓外部輸入直接進到模型與工具，值得在說明便條中提醒使用者（更完整的 Agent 數字見 §2.10，兩處的定義不同）。

### 2.3 寫死在標頭或參數的授權資訊

「寫死」的定義：值是字面字串（不以 `=` 開頭、也就不是運算式）。只統計 `httpRequest` 節點。

| 指標 | 範本數 | 占全部（13,947） | 占含 `httpRequest` 的範本（7,231） |
|---|---|---|---|
| `Authorization` 標頭（不分大小寫）為字面值 | 512 | 3.7% | 7.1% |
| 　其中至少一個值「不像佔位字串」 | 32 | 0.2% | 0.4% |
| `Authorization` 以 JSON 標頭方式寫成字面值 | 10 | 0.1% | 0.1% |
| 名稱含 key、token、secret、auth 的其他標頭為字面值 | 290 | 2.1% | 4.0% |
| 　其中至少一個值「不像佔位字串」 | 54 | 0.4% | 0.7% |
| URL 內有 token／apikey／key 等查詢參數且值為字面值 | 122 | 0.9% | 1.7% |
| 查詢參數欄位（`sendQuery`）內有同類名稱且值為字面值 | 136 | 1.0% | 1.9% |
| 　以上兩種合計（任一） | 251 | 1.8% | 3.5% |
| 　　其中至少一個值「不像佔位字串」 | 34 | 0.2% | 0.5% |
| **以上全部合計（任一種寫死的授權資訊）** | **961** | **6.9%** | **13.3%** |
| 　其中至少一個值「不像佔位字串」 | 81 | 0.6% | 1.1% |

觀察：

- `Authorization` 標頭的字面值共 1,065 個（以標頭計），約 94%（1,001 個）看起來是佔位字串，開頭為 `Bearer` 的占 81%（864 個）。也就是說社群常見的做法是**把授權標頭直接寫在節點上，再讓使用者把佔位字串換成自己的金鑰**，而不是使用 n8n 的憑證機制。
- 這 961 個範本裡，只有 4 個同時被節點參數內的機密規則或 `credential:plaintext` 命中。原因是名稱與值分開存放的標頭／查詢參數，鍵名是 `name`／`value`，`credential:plaintext` 比對的鍵名（`token`、`password` 等）看不到它們。目前版本另有 `header:hardcoded-authorization`，只針對 `Authorization` 標頭，且只對「以 `Bearer`、`Basic` 或 `Token` 開頭、長度足夠、不像佔位字串」的值提出建議，在本資料集命中 21 個範本（0.2%）；其餘寫死的授權資訊（其他金鑰類標頭、查詢參數）尚無規則涵蓋，見 §5.2。
- 在「未使用憑證機制」的 `httpRequest` 節點（11,320 個）中，有 1,873 個（16.5%）帶有上述寫死的授權資訊。

### 2.4 憑證使用（`httpRequest` 的 `authentication`）

| 指標 | 數量 | 比例（分母） |
|---|---|---|
| 含 `httpRequest` 的範本 | 7,231 | 51.8%（13,947） |
| `httpRequest` 節點總數 | 20,620 | — |
| 節點：使用憑證機制（`predefinedCredentialType`、`genericCredentialType`，以及舊版的 `headerAuth`、`basicAuth`、`oAuth1／2`、`queryAuth`） | 9,300 | 45.1%（20,620） |
| 　其中 `predefinedCredentialType` | 3,416 | 16.6%（20,620） |
| 　其中 `genericCredentialType` | 5,784 | 28.1%（20,620） |
| 節點：未設定（預設 none） | 11,248 | 54.5%（20,620） |
| 節點：明確設為 none | 63 | 0.3%（20,620） |
| 節點：其他（不屬於任何已知選項的字串） | 9 | <0.1%（20,620） |
| 範本：至少一個節點使用憑證機制 | 3,571 | 49.4%（7,231） |
| 範本：所有節點都沒使用憑證機制 | 3,660 | 50.6%（7,231） |
| 範本：兩種節點並存 | 987 | 13.6%（7,231） |

`genericCredentialType` 底下的通用類型（分母 5,784）：`httpHeaderAuth` 4,007（69.3%）、`httpBearerAuth` 694（12.0%）、`httpBasicAuth` 390（6.7%）、`httpQueryAuth` 260（4.5%）、`oAuth2Api` 258（4.5%）、`httpCustomAuth` 102（1.8%），其餘合計約 1.3%。

注意：「未設定」的 `httpRequest` 不全是問題，許多是呼叫不需要認證的公開 API；因此這個比例不能直接當成「缺少認證」。

### 2.5 TLS 憑證檢查

| 指標 | 範本數 | 占全部（13,947） | 占含 `httpRequest` 的範本（7,231） |
|---|---|---|---|
| `httpRequest` 的 `options.allowUnauthorizedCerts` 為真 | 82 | 0.6% | 1.1% |
| 任何節點設有「略過憑證檢查」類選項（`allowUnauthorizedCerts`、`ignoreSSL`、`rejectUnauthorized` 為 false 等） | 118 | 0.8% | — |

`httpRequest` 節點層級有 136 個。其餘節點的類似選項分布在 RSS 讀取（`ignoreSSL`）、寄信、IMAP 收信與 HTTP 工具類節點，節點數各在個位數到二十餘個之間。

### 2.6 高風險節點與 Code 節點

**高風險節點（分母 13,947）**

| 節點 | 範本數 | 占比 | 節點數 |
|---|---|---|---|
| `executeCommand` | 84 | 0.6% | 219 |
| `ssh` | 59 | 0.4% | 178 |
| `readWriteFile` | 175 | 1.3% | 334 |
| `readBinaryFile` | 42 | 0.3% | 54 |
| `writeBinaryFile` | 41 | 0.3% | 54 |
| 上述任一（含舊名 `readBinaryFiles`，6 個範本） | 325 | 2.3% | — |

`executeCommand` 的命令字串內含 `{{ }}` 運算式的範本有 63 個，占 `executeCommand` 範本（84）的 75.0%。

**Code／Function 節點（分母 8,699，即含這類節點的範本，占全部的 62.4%）**

| 簡單樣式（補充） | 範本數 | 占比 |
|---|---|---|
| 含 `$env` | 40 | 0.5% |
| 含 `process.env` | 6 | 0.1% |
| 含 `require(` | 156 | 1.8% |
| 含 `eval(` | 4 | <0.1% |
| 含 `new Function` | 2 | <0.1% |
| 含 `child_process` | 3 | <0.1% |

`require(` 的 156 個範本中，載入 `crypto` 的有 102 個，其餘分散在 cheerio、luxon、zlib、fs 等；載入 `child_process` 的 2 個、`fs` 的 6 個。所以單看 `require(` 的存在意義不大，要看載入的模組。

| 掃描器的 Code 規則（目前版本，與 §4.2 一致） | 嚴重度 | 範本數 | 占比（分母 8,699；含 `toolCode`、LangChain Code 的命中） |
|---|---|---|---|
| `jscode:process-spawn` | warning | 3 | <0.1% |
| `jscode:net-exfil-pattern` | error | 15 | 0.2% |
| `jscode:dynamic-eval` | error | 7 | 0.1% |
| `jscode:require-fs-with-write` | warning | 6 | 0.1% |
| `jscode:base64-decode-suspect` | warning | 4 | <0.1% |
| `jscode:require-child-process` | error | 2 | <0.1% |
| `jscode:env-dump` | error | 1 | <0.1% |
| `jscode:reverse-shell`、`jscode:fs-write-sensitive` | error | 0 | 0.0% |

- 目前版本下，Code 規則中有 error 的範本共 25 個、有 warning 的共 11 個。`jscode:dynamic-eval` 的 7 個範本中，有 1 個來自 `toolCode` 或 LangChain Code 節點（目前版本也掃這兩類節點的 JavaScript），其餘 6 個來自 Code／Function 節點。
- `jscode:process-spawn` 在改版前有 243 個範本、523 個 Code 節點命中，其中只有 4 個節點含 `child_process`、`.spawn(` 或 `.execSync(`，其餘 519 個只靠 `.exec(` 命中，而其中 502 個的程式碼裡有 `RegExp` 風格的 `.exec(` 用法（啟發式判斷）。這是因為舊的正規式把單獨的 `.exec(` 也算進去。掃描器現已收斂為只認真正的子行程呼叫（`child_process`、`cp` 類物件的 `exec`／`fork`／`spawn`、`.spawn(`、`.execSync(` 等），目前版本的命中降為 4 個節點（3 個範本），見 §4.2、§5.1。
- `jscode:net-exfil-pattern` 的 15 個範本沒有任何一個含 `process.env`；它們是因為「呼叫 fetch／axios 後 500 字元內出現 token、password、credential 等字樣」而命中。本檔沒有逐一人工判讀，無法確定其中有多少是正常用法。

**其他**

| 指標 | 範本數 | 占比（分母） |
|---|---|---|
| 任何地方使用 `$env`（Code 或各節點的運算式） | 211 | 1.5%（13,947） |
| 　其中在非 Code 節點的參數內 | 193 | 1.4%（13,947） |
| 含 Python 程式碼（`pythonCode`）的範本 | 83 | 0.6%（13,947） |
| 　其中含 `os`／`subprocess`／`eval`／`exec` 等樣式 | 3 | 3.6%（83） |

目前版本的掃描器讀取 Code／Function／Function Item 的 `jsCode`／`functionCode`，以及 `toolCode`、LangChain Code 節點的 JavaScript，仍不讀 `pythonCode`。環境變數能否被節點讀取，依 n8n 版本與部署設定而定，本檔不推測。

### 2.7 呼叫自己的 n8n API

| 指標 | 範本數 | 占比（13,947） |
|---|---|---|
| HTTP 節點的 URL 含 `/api/v1/` 或 `/rest/`，且網域為本機（localhost、loopback、`host.docker.internal`）或 n8n 環境變數 | 14 | 0.1% |
| 　其中為本機位址 | 13 | 0.1% |
| 　其中為 n8n 環境變數 | 1 | <0.1% |
| URL 含 `/rest/` 或 `/api/v1/` 且網域為 `n8n.cloud` 子網域（未併入上列） | 3 | <0.1% |
| 任何網域的 URL 帶有 n8n 公開 API 的資源路徑（workflows、executions、credentials 等） | 54 | 0.4% |
| 使用 n8n 官方節點（`n8n-nodes-base.n8n`，以 API 憑證管理自己的實例） | 180 | 1.3% |
| 以字面值寫死 `X-N8N-API-KEY` 標頭 | 4 | <0.1% |

### 2.8 其他值得注意的觀察

| 指標 | 範本數 | 占比（分母） |
|---|---|---|
| 含 SQL 類節點（postgres、mySql、microsoftSql 等）的範本 | 409 | 2.9%（13,947） |
| 　`executeQuery` 的查詢字串內含 `{{ }}` 運算式 | 115 | 28.1%（409） |
| 　設有查詢參數化選項（`queryReplacement`） | 87 | 21.3%（409） |
| 含非空的 `pinData`（匯出時一併帶出的釘選資料）的範本 | 935 | 6.7%（13,947） |
| 　`pinData` 內命中 8 條機密規則之一 | 9 | 1.0%（935） |
| 　`pinData` 內出現類似電子郵件的字串 | 318 | 34.0%（935） |
| 　　其中網域不像示範網域 | 225 | 24.1%（935） |

SQL 查詢內含運算式不一定是注入風險（可能只是表名、常數或數字），而且兩項並非互斥，所以這裡只呈現量級。`pinData` 的電子郵件很可能是假資料，是否為個人資料需另行判斷；目前版本的掃描器會把 `pinData` 納入機密樣式掃描（命中即為 error），但不判斷其中的電子郵件形狀是否為個資。

### 2.9 機密外洩樣式

**重用 `security-scan.mjs` 的 8 條機密正規式**，逐一掃描所有節點參數內的字串（與掃描器相同）。

| 規則 | 命中範本數 | 占比（13,947） | 說明 |
|---|---|---|---|
| `secret:openai-key` | 2 | <0.1% | 其中 1 個不像佔位字串 |
| `secret:aws-access-key` | 2 | <0.1% | 皆像佔位字串（啟發式） |
| `secret:github-pat` | 0 | 0.0% | |
| `secret:slack-token` | 0 | 0.0% | |
| `secret:google-api-key` | 3 | <0.1% | 其中 2 個不像佔位字串 |
| `secret:pem-private` | 4 | <0.1% | 只命中標頭，後面沒有足以構成金鑰本體的內容 |
| `secret:jwt-literal` | 3 | <0.1% | 3 個都不像佔位字串（可能是已過期、已撤銷或示範用的權杖，無法判斷） |
| `secret:basic-auth-url` | 3 | <0.1% | 皆像佔位字串（通用帳密字樣或樣板，啟發式） |
| **任一條** | **16** | **0.1%** | 其中至少一個命中不像佔位字串的有 6 個（<0.1%） |

- 16 個範本中，5 個只在 Sticky Note 的說明文字內命中；扣掉後為 11 個（0.1%）。
- 目前版本的掃描器也掃 `pinData`：另有 9 個範本在 `pinData` 內命中機密規則（與上列 16 個沒有重疊），合計 25 個（0.2%）。
- `credential:plaintext`（鍵名為 password、token、secret 等且值為字面字串）命中 43 個範本（0.3%）；以啟發式判斷，43 個全都像佔位字串。
- 社群範本裡的真實機密很少，但這不代表使用者不會犯；產生 workflow 時，預設建議不要寫死機密。

**掃描器尚未涵蓋的機密樣式（補充探測，只報數字）**

| 樣式 | 命中範本數 | 其中至少一個不像佔位字串 |
|---|---|---|
| 字面的 `Bearer <權杖>` 字串（長度 20 以上，非運算式） | 36 | 4 |
| Slack Incoming Webhook URL 形狀 | 7 | 7 |
| Telegram Bot 權杖形狀 | 3 | 3 |
| Discord Webhook URL 形狀 | 3 | 3 |
| 新版 OpenAI／Anthropic 專案金鑰、GitHub 其他權杖、GitLab、Stripe 正式金鑰、SendGrid、Notion、Airtable、Hugging Face 等形狀 | 0 | 0 |
| **任一** | **48（0.3%）** | **16（0.1%）** |

現行 `secret:openai-key` 的正規式不含連字號，不會命中含連字號的新版專案金鑰格式；這份資料裡沒有該格式的命中，但產生工具時仍可能出現。

### 2.10 AI 護欄與 Agent 風險

含 Agent 的範本指含 `@n8n/n8n-nodes-langchain.agent` 或 `agentTool` 節點者（`agentTool` 的 149 個範本都同時有 `agent`，所以聯集仍是 4,336）。這一節的工具與觸發器都盡量以**連線**判斷（工具要以 `ai_tool` 連到 Agent；觸發器要能沿 `main` 連線到達 Agent），與 §2.2 以「同在一個範本」為準的數字定義不同，兩者不能直接比較。

| 指標 | 數量 | 比例（分母） |
|---|---|---|
| 含 Agent 的範本 | 4,336 | 31.1%（13,947） |
| Agent 節點總數 | 7,050 | 平均每個含 Agent 的範本 1.6 個 |
| 含**原生 Guardrails 節點**（`@n8n/n8n-nodes-langchain.guardrails`）的範本 | 19 | **0.4%**（4,336） |
| 　全部範本中含原生 Guardrails 的範本 | 24 | 0.2%（13,947），其中 5 個沒有 Agent |
| 　含第三方 PII 護欄節點（`n8n-nodes-piiguardrails`）的範本 | 2 | <0.1%（13,947），皆沒有 Agent |
| 　含 Guardrails 的 Agent 範本，依建立年份 | 2025 年 8 個、2026 年 11 個 | 0.3%（2,493）、0.6%（1,764） |

**Agent 連接的工具**（以 `ai_tool` 連到 Agent；分母 4,336）

| 工具 | 範本數 | 占比 |
|---|---|---|
| `toolCode` | 95 | 2.2% |
| `toolWorkflow` | 218 | 5.0% |
| `toolHttpRequest`（含 `httpRequestTool`） | 313 | 7.2% |
| MCP client 工具（`mcpClientTool`、含社群版 `n8n-nodes-mcp`） | 208 | 4.8% |
| **以上任一（動作類工具）** | **765** | **17.6%** |
| 　僅看範本內有這些節點、不看連線 | 784 | 18.1% |
| 另外連了其他服務類工具（例如各服務的 `*Tool` 節點） | 860 | 19.8% |
| 沒有任何工具連到 Agent | 2,453 | 56.6% |

**Agent 與面向外部使用者的觸發器**

「面向外部使用者的觸發器」指 `chatTrigger`、`webhook`、`telegramTrigger`、`whatsAppTrigger`、`formTrigger`、`slackTrigger`、`twilioTrigger`、`facebookTrigger`、`jotFormTrigger`、`typeformTrigger`、Tally 表單觸發器與 `mcpTrigger`。

| 指標 | 範本數 | 占比（分母） |
|---|---|---|
| 同範本有上述外部觸發器 | 2,542 | **58.6%**（4,336） |
| 　若再加上信箱類觸發器（Gmail、IMAP、Outlook） | 2,733 | 63.0%（4,336） |
| 　外部觸發器能沿 `main` 連線到達 Agent | 2,440 | 56.3%（4,336） |
| 外部觸發器 + Agent，**同時有 Guardrails** | 17 | **0.7%**（2,542） |
| 　以可到達 Agent 的範本計 | 16 | 0.7%（2,440） |
| 外部觸發器 + 連到動作類工具 | 526 | 12.1%（4,336） |
| 　其中有 Guardrails | 2 | 0.4%（526） |
| 　其中沒有 Guardrails 且沒有 `sendAndWait` 人工核准 | 505 | 11.6%（4,336） |
| 　以「可到達 Agent」計：沒有 Guardrails 且沒有 `sendAndWait` | 486 | 11.2%（4,336） |

**迭代上限與人工核准**

| 指標 | 數量 | 比例（分母） |
|---|---|---|
| Agent 節點有設定 `options.maxIterations` | 311 | 4.4%（7,050 個 Agent 節點） |
| 　以範本計（至少一個 Agent 有設定） | 222 | 5.1%（4,336） |
| 含 Wait 節點 | 757 | 17.5%（4,336） |
| 含 `sendAndWait` 類人工核准操作（Telegram、Gmail、Slack 等） | 153 | 3.5%（4,336） |
| 　以上任一 | 874 | 20.2%（4,336） |
| 連到動作類工具的 Agent 範本中，有 Wait 或 `sendAndWait` | 115 | 15.0%（765） |
| 有外部觸發器的 Agent 範本中，有 Wait 或 `sendAndWait` | 502 | 19.7%（2,542） |

說明：

- Wait 節點常用於等待、限流，**不等於人工核准**；`sendAndWait` 才是明確的「送出訊息並等人回覆」。上表兩者分開列出。
- 原生 Guardrails 節點出現得很晚（含 Agent 的範本中只見於 2025 與 2026 年），社群範本的普遍狀態是**面對外部輸入的 Agent 幾乎都沒有護欄**；這反映的是範本多為示範與節點太新，不代表每個實際部署都沒有其他防護（例如在提示詞或下游做檢查）。
- 目前版本的掃描器已認得部分 AI 節點（`ai:agent-no-guardrails`、`ai:agent-code-tool`，見 §4），`jscode:*` 規則也會掃 `toolCode` 與 `@n8n/n8n-nodes-langchain.code` 的 JavaScript。這兩類節點分別出現在 104 個（0.7%）與 15 個（0.1%）範本；改版前它們的程式碼不在掃描範圍，目前版本實跑，這兩類節點新增的命中只有 1 個（`jscode:dynamic-eval`）。
- 護欄只是降低風險的一層，有護欄不等於不會被提示注入，也不能用這個比例判斷任何一個範本的實際風險。

---

## 3. 依建立年份的趨勢

分母各欄不同，已在欄名標明。「Webhook 無認證」指至少一個 Webhook 無認證。

| 年份 | 範本數 | 含 Webhook | Webhook 無認證 | 含 `httpRequest` | 其中使用憑證機制 | 其中有寫死的授權資訊 | 略過 TLS 檢查（占該年範本） |
|---|---|---|---|---|---|---|---|
| 2019 | 24 | 5 | 4（80.0%） | 6 | 0（0.0%） | 0（0.0%） | 2（8.3%） |
| 2020 | 307 | 13 | 10（76.9%） | 42 | 3（7.1%） | 0（0.0%） | 2（0.7%） |
| 2021 | 136 | 18 | 15（83.3%） | 24 | 7（29.2%） | 0（0.0%） | 1（0.7%） |
| 2022 | 143 | 26 | 26（100.0%） | 44 | 18（40.9%） | 3（6.8%） | 4（2.8%） |
| 2023 | 86 | 19 | 18（94.7%） | 37 | 22（59.5%） | 2（5.4%） | 1（1.2%） |
| 2024 | 462 | 93 | 90（96.8%） | 266 | 160（60.2%） | 25（9.4%） | 8（1.7%） |
| 2025 | 6,564 | 1,057 | 1,021（96.6%） | 3,340 | 1,410（42.2%） | 555（16.6%） | 70（1.1%） |
| 2026 | 6,225 | 1,544 | 1,463（94.8%） | 3,472 | 1,951（56.2%） | 376（10.8%） | 30（0.5%） |

「其中使用憑證機制」與「其中有寫死的授權資訊」的分母是該年含 `httpRequest` 的範本；「寫死的授權資訊」是 §2.3 的合計（任一種）。

- **Webhook 無認證沒有明顯改善**：2024 至 2026 三年穩定落在 94.8%–96.8%；2019–2023 合計 73／81（90.1%），樣本太小，不能解讀成「早期比較好」。2026 比 2025 低 1.8 個百分點，在這個樣本量下不足以說是趨勢。
- 2026 年的範本在**憑證機制的使用比例**（56.2%，2025 為 42.2%，但 2024 為 60.2%，並非持續上升）與**寫死授權資訊的比例**（10.8%，2025 為 16.6%）略有改善，略過 TLS 檢查的比例也從 1.1% 降到 0.5%；每年的差距受範本組成影響，不宜過度解讀。
- 含 Webhook 的範本占比在 2026 為 24.8%，高於 2025 的 16.1%，暴露面的絕對數量在增加。

---

## 4. 與目前掃描規則的對照

### 4.1 掃描器規則一覽（`scripts/security-scan.mjs` 目前版本）

> **對照基準**：本節與 §4.2 的實跑結果，都是目前版本的 `security-scan.mjs`。本檔先前對照的是舊版（沒有護欄類規則）；舊版的數字只在 §4.2 用來說明改版前後的差異。規則編號與 [`../spec/security-guardrails.md`](../spec/security-guardrails.md) 使用同一組。

目前版本的規則分兩類，**性質不同**：

- **護欄類（建議，皆為 warning）**：提醒使用者「這裡有一項值得考慮的設定」。預設執行不會因它們而失敗；使用者可在節點 notes 寫 `guardrail-ack: <規則編號>`（可附說明）表示已知悉，已知悉的項目不再列為待處理。`--strict` 只是選用旗標，Pack 的流程不使用。
  - `webhook:no-auth`：`n8n-nodes-base.webhook` 的 `authentication` 未設定或為 none。
  - `form:no-auth`：Form Trigger 未設定認證。
  - `tls:allow-unauthorized-certs`：任何節點的 `allowUnauthorizedCerts`（含 `options` 內）為真。
  - `network:http-cleartext`：字串以 `http://` 開頭且不是本機位址。
  - `exec:execute-command`、`exec:ssh`：使用 Execute Command 或 SSH 節點。
  - `file:rw-access`：使用讀寫本機檔案類節點（`readWriteFile`、`readBinaryFile(s)`、`writeBinaryFile`、`localFileTrigger`）。
  - `header:hardcoded-authorization`：`httpRequest`／`httpRequestTool` 的 `Authorization` 標頭（含 JSON 標頭寫法）是字面值，以 `Bearer`、`Basic` 或 `Token` 開頭、長度足夠，且不像佔位字串。
  - `ai:agent-code-tool`：同一個 workflow 有 AI Agent 與 `toolCode`。
  - `ai:agent-no-guardrails`：workflow 有 AI Agent 與外部觸發器（Webhook、Chat、MCP、Form、訊息平台、信箱等），卻沒有 Guardrails 節點。
  - `error:no-handling`：有外部呼叫類節點，但整個 workflow 沒有 `onError`／`retryOnFail` 設定、Error Trigger，也沒有 `settings.errorWorkflow`。
  - 這些護欄類規則都不看 `connections`，只看同一個 workflow 內有沒有某類節點或設定。
- **偵測類（發現型，error 為主）**：描述「長得像機密」或「長得像惡意程式碼」的樣式，供 Pack 自己的 CI 檢查 repo 內的檔案；預設執行遇到 error 時，退出碼不為 0。偵測類不接受 `guardrail-ack`。
  - 機密樣式（error）：`secret:*` 8 條（`openai-key`、`aws-access-key`、`github-pat`、`slack-token`、`google-api-key`、`pem-private`、`jwt-literal`、`basic-auth-url`），逐一比對節點 `parameters` 與 `pinData` 內的每個字串。
  - `credential:plaintext`（error）：鍵名為 password、secret、apikey、token、client_secret、private_key 等，值為 4 個字元以上且不是運算式或 `$credentials` 引用。
  - Code 類 `jscode:*`：`reverse-shell`、`env-dump`、`dynamic-eval`、`require-child-process`、`fs-write-sensitive`、`net-exfil-pattern`（以上 error），以及 `process-spawn`、`base64-decode-suspect`、`require-fs-with-write`（以上 warning）。掃描範圍是 Code、Function、Function Item，加上 `toolCode` 與 LangChain Code 節點的 JavaScript；Python 程式碼不掃。
  - 另有檔案讀取與 JSON 解析失敗的 error，以及節點為空的 warning（`schema:empty-nodes`）；本資料集沒有這類情形。

### 4.2 把目前版本的掃描器跑在全部範本上

以預設模式（不加 `--strict`）掃描全部 13,947 個範本的 workflow 圖：

| 預設模式的結果 | 範本數 | 占比（13,947） | 改版前（舊版） |
|---|---|---|---|
| 有至少一個 error | 91 | 0.7% | 82 |
| 只有 warning（沒有 error） | 10,834 | 77.7% | 2,910 |
| 沒有任何發現 | 3,022 | 21.7% | 10,955 |

「只有 warning」的 10,834 個範本中，10,830 個含護欄類建議，其餘 4 個只有 Code 類的 warning。error 的 91 個範本全部來自偵測類。

**護欄類規則（建議，warning）**

| 規則 | 範本數 | 占比（13,947） | 節點數 |
|---|---|---|---|
| `error:no-handling` | 8,633 | 61.9% | （整個 workflow 一則） |
| `webhook:no-auth` | 2,647 | 19.0% | 3,167 |
| `ai:agent-no-guardrails` | 2,644 | 19.0% | （整個 workflow 一則） |
| `form:no-auth` | 1,589 | 11.4% | 1,643 |
| `file:rw-access` | 246 | 1.8% | 462 |
| `network:http-cleartext` | 121 | 0.9% | 190 |
| `tls:allow-unauthorized-certs` | 105 | 0.8% | 164 |
| `ai:agent-code-tool` | 99 | 0.7% | 144 |
| `exec:execute-command` | 84 | 0.6% | 219 |
| `exec:ssh` | 59 | 0.4% | 178 |
| `header:hardcoded-authorization` | 21 | 0.2% | 33 |
| **至少命中其中一條** | **10,910** | **78.2%** | — |

**偵測類規則**

| 規則 | 嚴重度 | 範本數 | 占比（13,947） |
|---|---|---|---|
| `credential:plaintext` | error | 43 | 0.3% |
| `secret:*` 合計（含 `pinData`） | error | 25 | 0.2% |
| 　`secret:jwt-literal` | error | 10 | <0.1% |
| 　`secret:google-api-key`、`secret:pem-private` | error | 各 4 | <0.1% |
| 　`secret:aws-access-key`、`secret:basic-auth-url` | error | 各 3 | <0.1% |
| 　`secret:openai-key` | error | 2 | <0.1% |
| 　`secret:github-pat`、`secret:slack-token` | error | 0 | 0.0% |
| `jscode:*` error 級合計 | error | 25 | 0.2% |
| 　`jscode:net-exfil-pattern` | error | 15 | 0.1% |
| 　`jscode:dynamic-eval` | error | 7 | <0.1% |
| 　`jscode:require-child-process` | error | 2 | <0.1% |
| 　`jscode:env-dump` | error | 1 | <0.1% |
| 　`jscode:reverse-shell`、`jscode:fs-write-sensitive` | error | 0 | 0.0% |
| `jscode:*` warning 級合計 | warning | 11 | <0.1% |
| 　`jscode:require-fs-with-write` | warning | 6 | <0.1% |
| 　`jscode:base64-decode-suspect` | warning | 4 | <0.1% |
| 　`jscode:process-spawn` | warning | 3（4 個節點） | <0.1% |
| **至少一個 error** | error | **91** | **0.7%** |

91 個範本的組成：`credential:plaintext` 43 個、`secret:*` 25 個、`jscode:*` error 級 25 個，彼此有少量重疊。

**與改版前相比，變動的部分**

| 項目 | 改版前 | 目前版本 | 原因 |
|---|---|---|---|
| 有 error 的範本 | 82 | 91 | `pinData` 納入機密掃描，新增 9 個範本（與原本的機密命中沒有重疊） |
| `secret:*` 命中範本 | 16 | 25 | 同上 |
| `jscode:process-spawn` | 523 個節點、243 個範本 | 4 個節點、3 個範本 | 只認真正的子行程呼叫，單獨的 `.exec(`（正規式用法）不再命中 |
| `jscode:dynamic-eval` | 7 個節點、6 個範本 | 8 個節點、7 個範本 | 補掃 `toolCode` 與 LangChain Code 的 JavaScript，新增 1 個命中 |
| 護欄類 11 條規則 | 不存在 | 見上表 | 新增 |

### 4.3 風險類型對照表

「類別」欄的「護欄」指建議式（warning）、「偵測」指發現型。數字沿用 §2、§4.2。

| 風險類型 | 社群範本中的普遍程度 | 目前由哪條規則涵蓋（類別，嚴重度） | 涵蓋範圍與備註 |
|---|---|---|---|
| Webhook 無認證 | 95.4% 的含 Webhook 範本（2,647；占全部 19.0%） | `webhook:no-auth`（護欄，warning） | 只看 Webhook 節點的認證設定；不看 IP 白名單、路徑強度，也不看同範本有沒有高風險節點 |
| Form Trigger 無認證 | 97.2% 的含 Form 範本（1,589；占全部 11.4%） | `form:no-auth`（護欄，warning） | 表單常設計成給一般人填寫，使用者可用 `guardrail-ack` 表示已知悉 |
| MCP Trigger、公開 Chat 無認證 | MCP 96.8%、公開 Chat 95.8% | 尚無 | 尚未實作，見 §5 |
| `Authorization` 標頭寫死 | 3.7% 的全部範本、7.1% 的 HTTP 範本；約 94% 像佔位字串 | `header:hardcoded-authorization`（護欄，warning） | 只對 `Bearer`／`Basic`／`Token` 開頭且不像佔位字串的值提出建議，所以命中 21 個範本（0.2%），遠少於字面值的 512 個 |
| 其他金鑰類標頭、查詢參數寫死 | 標頭 2.1%、查詢參數 1.8% | 尚無 | 名稱與值分開存放，`credential:plaintext` 看不到；尚未實作 |
| 具體格式的機密 | 節點參數 0.1%（16），含 `pinData` 共 0.2%（25）；不像佔位字串的另計 | `secret:*` 8 條（偵測，error），含 `pinData` | 缺少 Bearer 字面值、Slack／Discord Webhook、Telegram 權杖與新版金鑰格式，見 §5 |
| 明文密碼鍵名 | 0.3%（43），皆像佔位字串 | `credential:plaintext`（偵測，error） | |
| 明文 `http://` | 0.9%（121）；連同以 `=` 開頭的運算式共 166（1.2%） | `network:http-cleartext`（護欄，warning） | 以 `=` 開頭的運算式不在範圍內（多出 45 個範本） |
| 略過 TLS 憑證檢查 | 0.8%（118） | `tls:allow-unauthorized-certs`（護欄，warning） | 只看 `allowUnauthorizedCerts`（105 個範本）；`ignoreSSL`、`rejectUnauthorized` 為 false 這類寫法不在範圍內 |
| `executeCommand`、`ssh`、檔案讀寫節點 | 三類合計 2.3%（325）；`executeCommand` 命令含運算式 75.0% | `exec:execute-command`（84）、`exec:ssh`（59）、`file:rw-access`（246，含 `localFileTrigger`）（護欄，warning） | 「命令含運算式」的另外標示沒有做 |
| Code 節點的 `child_process`、`eval`、整包 `process.env` 等 | ≤0.1% | `jscode:*` error 級（偵測，error） | 範圍含 Code、Function、Function Item、`toolCode`、LangChain Code 的 JavaScript |
| Code 節點的子行程呼叫 | 改版前誤報偏多（243 個範本，519／523 個節點只因 `.exec(` 命中） | `jscode:process-spawn`（偵測，warning） | 已收斂，目前 3 個範本（4 個節點） |
| Code 或運算式讀取 `$env`、`process.env` 單一變數 | 1.5%（211） | 尚無（`jscode:env-dump` 只抓整包傾印） | 尚未實作 |
| Python Code 節點 | 0.6%（83）；含高風險樣式的 3 個 | 尚無 | 目前只讀 JavaScript，不讀 `pythonCode` |
| 運算式拼進 SQL 查詢 | 28.1% 的 SQL 範本（115） | 尚無 | 尚未實作 |
| 自行呼叫 n8n API／自己的實例 | 0.1%（14）；使用 n8n 節點 1.3%（180） | 尚無（字面值 `X-N8N-API-KEY` 屬於「其他金鑰類標頭」） | 暫不考慮 |
| `pinData` 內的機密與個資 | 機密 9 個範本、電子郵件形狀 318 個範本 | 機密：`secret:*`（偵測，error）；個資：尚無 | 電子郵件形狀不在範圍內，見 §5 |
| 對外入口接 AI Agent | 34.2% 的 Agent 範本（1,485）；面對外部輸入的 Agent 範本只有 0.7%（17／2,542）有 Guardrails | `ai:agent-no-guardrails`（護欄，warning）：2,644 個範本（19.0%） | 以「同一個 workflow 內有外部觸發器」判斷，不看連線，也不分有沒有動作類工具或 `sendAndWait` 人工核准 |
| Agent 接 `toolCode` | 連到 Agent 的占 Agent 範本 2.2%（95） | `ai:agent-code-tool`（護欄，warning）：99 個範本（0.7%） | 以「同一個 workflow 內有 Agent 與 `toolCode`」判斷；`toolCode` 的程式碼另由 `jscode:*` 掃描 |
| 外部呼叫缺少錯誤處理 | 本檔 §2 未單獨統計 | `error:no-handling`（護欄，warning）：8,633 個範本（61.9%） | 粗略判斷，詳見 §4.1；範本多為示範，比例偏高 |
| `maxIterations`、人工核准（`sendAndWait`） | 5.1%、3.5% 的 Agent 範本 | 尚無（對應 `approval:destructive-needs-gate`，靠 AI 與人工檢查） | 尚未實作 |
| 個資最小化 | 見 §2.8 | 尚無（對應 `data:pii-minimization`，靠 AI 與人工檢查） | 尚未實作 |
| 使用憑證機制（正向指標） | 49.4% 的 HTTP 範本至少一個節點 | 不適用 | 產生 workflow 的預設做法 |

---

## 5. 規則涵蓋現況與後續想法

本檔先前列過 14 項規則提案（編號 R1–R14）。下表逐項對照目前的掃描器，說明哪些已經實作、實作的形狀與原提案有什麼不同。「R 編號」只是本檔先前的提案編號，**實際的規則編號以 §4 為準**。

### 5.1 已實作

| 原提案 | 目前的規則（類別，嚴重度） | 與原提案的差異 |
|---|---|---|
| R3 `Authorization` 標頭寫死 | `header:hardcoded-authorization`（護欄，warning） | 只對 `Bearer`／`Basic`／`Token` 開頭、長度足夠且不像佔位字串的值提出建議，所以命中 21 個範本，而不是原提案估的 512 個；嚴重度固定為 warning，沒有「像真實值時升為 error」 |
| R5 略過 TLS 檢查 | `tls:allow-unauthorized-certs`（護欄，warning） | 只涵蓋 `allowUnauthorizedCerts`，105 個範本，原提案估 118 個 |
| R6 高風險節點 | `exec:execute-command`、`exec:ssh`、`file:rw-access`（護欄，warning） | 拆成三條；檔案類 246 個範本（含 `localFileTrigger`）；「命令含運算式」的另外標示沒有做 |
| R2 的 Form 部分 | `form:no-auth`（護欄，warning） | 原提案建議 Form 只在收尾揭露；目前改成與 Webhook 相同的建議式 warning，使用者可用 `guardrail-ack` 表示已知悉 |
| R9 的 `pinData` 部分 | `secret:*` 也掃 `pinData`（偵測，error） | 新增 9 個範本命中；`pinData` 內的電子郵件形狀沒有做 |
| R12 `process-spawn` 調校 | `jscode:process-spawn`（偵測，warning） | 已改成只認真正的子行程呼叫；523 個節點（243 個範本）降為 4 個節點（3 個範本） |
| R13 Agent 缺少 Guardrails | `ai:agent-no-guardrails`（護欄，warning） | 以「同一個 workflow 內有外部觸發器」判斷，不看連線，2,644 個範本，原提案（沿 `main` 連線可到達）估 2,424 個；不另外標示動作類工具與 `sendAndWait` |
| R14 Agent 接 `toolCode`，並擴大 `jscode:*` 掃描範圍 | `ai:agent-code-tool`（護欄，warning）；`jscode:*` 補掃 `toolCode` 與 LangChain Code | 以「同一個 workflow 內有 Agent 與 `toolCode`」判斷，99 個範本，原提案（以連線判斷）估 95 個；補掃後新增 1 個 `jscode:dynamic-eval` 命中 |

不在原提案內、但目前版本新增的護欄類規則：`error:no-handling`（外部呼叫缺少錯誤處理，8,633 個範本）。

### 5.2 尚未實作，僅供討論

下列項目目前的掃描器沒有對應規則，是否實作、怎麼實作都還在討論。若日後實作，建議也歸入護欄類（建議式 warning）；「社群基準」是以本資料集模擬該規則時的命中範本數，可用來預估提醒量。

| 原提案 | 想法 | 社群基準（範本） | 可能的誤報來源 |
|---|---|---|---|
| R1 | 同一個 workflow 內，有無認證的 Webhook，又有 `executeCommand`、`ssh`、檔案讀寫節點或 Code 內的 `eval`；最好再用 `connections` 判斷是否真的相連 | 29（占無認證 Webhook 範本的 1.1%）；Code `eval` 另 2 | 同範本的元素不一定相連 |
| R2 的 MCP 與公開 Chat 部分 | `mcpTrigger` 未設定認證；`chatTrigger` 為 `public: true` 且無認證 | MCP 299；公開 Chat 184 | 公開對話本來就是設計成公開 |
| R4 | 標頭名稱含 key／token／secret／auth（排除 `Authorization`），或 URL／查詢參數欄位的 token、apikey、key、secret、password 值為字面值 | 標頭 290、查詢參數 251；與 R3 合計 961（6.9%） | `key` 可能是非機密的識別碼 |
| R7 | Code 或任何節點的運算式讀取 `$env`、`process.env` 單一變數 | 211（1.5%） | 以環境變數放設定是常見做法；能否讀取依 n8n 版本與部署設定而定 |
| R8 | SQL 節點 `executeQuery` 的查詢字串含 `{{ }}`，且未設定 `queryReplacement` | 115（占 SQL 範本 28.1%；扣除已設 `queryReplacement` 者會較少） | 常數、表名、數字都會命中 |
| R9 的補充樣式 | 字面 `Bearer` 權杖、Slack／Discord Webhook URL、Telegram Bot 權杖、含連字號的新版 OpenAI／Anthropic 金鑰等；`pinData` 內電子郵件形狀另列 | 補充樣式 48（其中不像佔位字串 16）；`pinData` 電子郵件 318 | 電子郵件形狀偏高（示範資料很常見） |
| R10 | 讀取 `pythonCode`，比對 `import os`、`subprocess`、`os.system`、`eval(`、`exec(` 等 | 3（共 83 個 Python 範本） | 低 |
| R11 | `=http://` 開頭的運算式也納入 `network:http-cleartext` | 多出 45（121 增為 166） | 低 |
| 迭代上限與人工核准 | `maxIterations`、`sendAndWait` 等；對應規格的 `approval:destructive-needs-gate` | 見 §2.10 | 很難只從節點類型判斷哪些動作是破壞性或金流動作 |
| 個資最小化 | 對應規格的 `data:pii-minimization` | 見 §2.8 | 要看資料內容，不適合規則式比對 |

補充：目前的掃描器只做規則式的靜態比對，不是 AI 稽核；沒有對應規則的項目，由 AI 在產生時依本檔提出建議，並在收尾說明哪些是人工檢視。

---

## 6. 預設建議式帶來的影響

這一節用本資料集的數字，說明為什麼護欄類規則採用建議式（warning，預設執行不會失敗）。以下是描述性的推算，不是對任何範本或作者的評價；範本多為示範，數字反映的是社群的慣例，不是使用者私有 workflow 的狀況。

**假設情境**：若把規則改成「任何護欄類發現都使掃描失敗」，對本資料集全部 13,947 個範本會是：

| 情境 | 範本數 | 占比（13,947） |
|---|---|---|
| 至少有一項護欄類發現 | 10,910 | 78.2% |
| 　其中沒有任何偵測類 error（僅因護欄類而失敗） | 10,830 | 77.7% |
| 護欄類加偵測類 error，合計失敗 | 10,921 | 78.3% |
| 維持通過（無護欄類發現、無 error） | 3,026 | 21.7% |
| 至少命中 2 條護欄類規則 | 4,254 | 30.5% |
| 至少命中 3 條護欄類規則 | 1,007 | 7.2% |

換個角度看，如果把最常見的幾條拿掉再算：

| 計入的護欄類規則 | 至少命中一條的範本數 | 占比（13,947） |
|---|---|---|
| 全部 11 條 | 10,910 | 78.2% |
| 扣掉 `error:no-handling` | 5,931 | 42.5% |
| 再扣掉 `ai:agent-no-guardrails` | 4,646 | 33.3% |
| 再扣掉 `webhook:no-auth`、`form:no-auth` | 649 | 4.7% |

幾點觀察：

- 護欄類發現在社群範本裡是常態，不是少數例外。若以失敗為預設，絕大多數範本（約四分之三以上）都要先逐一處理或逐一標註，這會明顯增加使用者在交付前的處理量。
- 護欄類規則涉及的做法，多半有正當用途：給一般人填的公開表單、內網的自簽憑證、自架環境的本機檔案與 SSH、示範用的 Webhook。使用者最了解自己的環境，由使用者決定比由規則一概判斷更貼近實況。
- 偵測類（機密樣式、惡意程式碼樣式）的命中只有 0.7%（91 個範本），這類樣式的意義比較單純，因此保留為 error，供 Pack 自己的 CI 檢查 repo 內的檔案。
- 採用建議式的做法是：AI 主動提出建議並說明理由、使用者決定要不要採用、選擇不採用時在註解標註（`guardrail-ack`）。掃描器的 warning 是提醒清單，不是通關條件；`--strict` 保留為選用旗標，想要更嚴格的使用者或團隊自行啟用。

---

## 7. 如何使用這些知識

這份統計的用途是讓 Skill 這個「大腦」知道**哪些做法在社群範本裡很普遍**，以便產生 workflow 時主動提出較穩妥的建議，而不是照抄。社群普遍不等於適合，也不代表每個使用者都該照單全收。

**AI 產生 workflow 時，主動提出建議**，並把建議寫進 workflow 的註解：整體的建議寫在 Layer 3 說明便條的「建議事項」，與單一節點相關的寫在該節點的 notes。使用者選擇不採用時，AI 照使用者的決定處理，並在註解標註（節點 notes 的 `guardrail-ack: <規則編號>`，可附 ` -- 說明`）。以下是依本檔數字整理出的建議方向：

1. **對外入口**：建議 Webhook 設定認證機制（`headerAuth`、`basicAuth`、`jwtAuth` 擇一）；MCP Trigger、公開的 Chat Trigger 同理。確實需要公開的入口（例如給一般人填的表單），建議在說明便條記錄原因；也可以一併設定來源限制（IP 白名單、CORS 允許來源），並避免用短字串或常見字當路徑。
2. **機密**：金鑰、權杖、密碼、`Authorization` 標頭建議用 n8n 的憑證機制（`predefinedCredentialType` 或 `genericCredentialType`），避免寫進標頭、查詢參數、URL 或 Code 節點，連「YOUR_API_KEY」這種佔位字串也建議避開，因為社群範本的 `Authorization` 字面值約 94% 是這種佔位，而它正是讓使用者貼上真金鑰的入口。
3. **TLS 憑證檢查**：建議保持開啟；使用者說明是內網自簽憑證時，照使用者的決定處理，並寫進便條。
4. **高風險節點**：除非使用者需要，建議不要用 `executeCommand`、`ssh`、讀寫檔案類節點；外部輸入（尤其來自無認證入口的資料）建議不要直接拼進命令字串或 SQL 查詢，SQL 建議用查詢參數。
5. **Code 節點**：建議避開 `eval`、`new Function`、`child_process`；需要設定值時建議用 n8n 的憑證或變數機制，而不是讀 `$env`／`process.env`。
6. **匯出時不帶真實資料**：建議不要把含真實個資或機密的 `pinData` 一起匯出。
7. **面對外部輸入的 AI Agent**：Agent 接聊天、Webhook、訊息平台或表單這類外部輸入時，建議考慮加上 Guardrails 節點（或同等的輸入檢查）、設定 `maxIterations`，並只給完成任務所需的最少工具；會寫入、刪除、寄信、對外呼叫的工具，建議加上 `sendAndWait` 之類的人工核准，或在說明便條中寫明為什麼不需要。社群範本中只有 0.7% 的外部入口 Agent 有 Guardrails、5.1% 設了 `maxIterations`，這是普遍的做法，但不是值得照抄的慣例。`toolCode` 內的輸入來自模型，建議當成不可信資料處理。
8. **外部呼叫的錯誤處理**：建議設定 `onError`、`retryOnFail` 或 `settings.errorWorkflow`，讓失敗時有人知道。

**完成後，在收尾說明掃描結果**：

- 執行 `scripts/security-scan.mjs`，把結果（error 與 warning 的數量、規則名稱）如實告訴使用者；沒有發現就寫「沒有發現」，不要灌水，也不要把掃描結果說成「沒有問題」的保證。護欄類的 warning 是建議，由使用者決定是否處理；偵測類的 error 表示發現了機密或惡意程式碼的樣式，建議優先處理。
- §4.3 與 §5.2 列出「尚無規則」的項目（MCP 與公開 Chat 入口、其他金鑰類標頭、`$env`、SQL 拼接、Python、`pinData` 個資、人工核准、個資最小化等），由 AI 自行依本檔提出建議，並說明哪些是人工檢視、哪些是掃描器的結果。
- 規則編號、已知悉行與收尾檢查表的寫法見 [`../spec/security-guardrails.md`](../spec/security-guardrails.md)；掃描結果與參考資料的揭露方式見 [`../spec/references-disclosure.md`](../spec/references-disclosure.md)。若本檔的統計影響了設計決策（例如「因為社群範本多半不設認證，所以這裡額外提出了認證建議」），也列入「這次參考了哪些資料」。

---

## 8. 無法確定之處

- 命中範本是否真有風險（佔位字串判斷是啟發式；`jscode:net-exfil-pattern` 的 15 個範本也未逐一人工判讀）。
- 無認證入口在實際部署時，是否有反向代理、網路限制或其他防護，範本資料看不到。
- 環境變數能否被節點讀取、較新版 n8n 是否預設停用部分高風險節點，依版本與設定而定，本檔未查證。
- §2.10 的「外部觸發器」清單是人為界定的（不含排程、手動、Google 雲端硬碟、試算表等觸發器）；清單換了，比例會跟著變。Guardrails 的有無只看節點存在，不判斷它被設定成檢查什麼、是否真的接在輸入路徑上。
- 目前掃描器的護欄類規則（尤其 `error:no-handling`、`ai:agent-no-guardrails`）是粗略判斷，不看 `connections`；它們在範本上的高命中率，不代表在使用者實際 workflow 上也一樣。§6 的情境推算只描述本資料集。
- 關於 n8n.io 對公開範本是否有收錄篩選，本檔不推測；它可能讓機密命中比私有 workflow 更少。
