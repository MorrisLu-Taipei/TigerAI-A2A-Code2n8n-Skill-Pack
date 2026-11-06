# 資安護欄建議 v1.1

> 🌐 [English](security-guardrails.en.md) | **繁體中文**

> **適用對象**：所有會產生或修改 n8n workflow 的 Skill、使用本 Skill Pack 的 AI Agent、審查 workflow 的整合工程師
> **定位**：「護欄」在本 Pack 指的是 **AI 主動提出的建議與風險提醒**。AI 建 workflow 時預設採用合理的安全做法並說明理由；使用者想用不同做法，AI 照使用者的決定處理。本規格只提供建議，最終決定與責任在使用者
> **收尾項目**：資安建議以規則編號寫進 Layer 3 便條的「建議事項」區塊與相關節點 `notes`，格式與順序一律依 [`references-disclosure.md`](references-disclosure.md) 第 4 章的統一定義（第 5 章只列本規格特有的判斷提示）

---

## 1. 目的與原則

### 1.1 要解決的問題

只在交付後掃描，等於讓有疑慮的設定先被做出來、再靠人事後挑出來。掃描只能抓到「看得出樣式」的問題，例如金鑰長得像金鑰、Webhook 沒設認證；它看不出「這個 AI Agent 會不會被外部文字牽著走」「這個刪除動作有沒有人確認過」。所以建議要往前移：**AI 在建節點的當下，就把較安全的做法當作預設，並把理由講清楚。**

n8n 本身已提供原生的 Guardrails 節點（type：`@n8n/n8n-nodes-langchain.guardrails`），可以檢查提示注入、個資、機密金鑰等。但在本 Pack 彙整的 n8n.io 公開範本中，4,336 個含 AI Agent 的範本只有 19 個（約 0.4%）使用它。這是描述性統計，不是對任何作者的評價；它說明的是：如果產生時不主動提出，社群的慣例多半不會替使用者想到。統計的取得方式與限制見 [`../research/n8n-templates-security.md`](../research/n8n-templates-security.md)。

### 1.2 三個環節

| 環節 | 時機 | 做什麼 | 本檔章節 |
|---|---|---|---|
| ① 產生時建議 | AI 建立或修改 workflow 時 | 依規則編號，預設採用較安全的做法並說明理由；使用者選別的做法就照辦 | 第 2、3 章 |
| ② 掃描提醒 | 交付前 | 對實際要交付的 JSON 跑 `node scripts/security-scan.mjs`，把結果如實轉告使用者並附建議 | 第 4 章 |
| ③ 註解記錄 | 交付當下 | 把每項建議的狀態寫進 Layer 3 便條的「建議事項」區塊與相關節點 `notes`，包含使用者選擇不採用與尚未能自動檢查的項目；對話只放摘要，以註解為正式紀錄 | 第 5 章 |

三個環節互相補位：沒有第一個，掃描只是事後提醒；沒有第二個，AI 的自我說明沒有對照；沒有第三個，使用者之後不知道當初哪些建議沒採用（註解會跟著 workflow 一起被匯出與交接，對話不會）。

### 1.3 AI 的行為準則

- **預設採用，使用者可以不採用。** 使用者沒特別說明時，AI 照本檔的建議做，並用一兩句話講理由。
- **使用者要求不同做法時，照使用者的決定處理。** AI 不拒絕、不阻擋、不要求使用者補理由，也不反覆勸說。
- **AI 要做的三件事**：把風險講清楚、給出替代做法、把使用者的選擇記進註解（見第 3、5 章）。
- **不隱瞞、不代替使用者關掉提醒。** 所有護欄只是建議：沒有任何一項是強制規定，也沒有任何一項會讓 Skill 拒絕交付。風險說明要在使用者做決定之前講，不是事後補；也不由 AI 自行判斷「這個提醒不重要」而省略。
- 護欄管的是 workflow 的設計與設定，不取代使用者自己的網路、權限與營運管理。

---

## 2. 產生時建議

下列規則編號固定，不更名；掃描器、便條的「建議事項」、節點 notes 與已知悉行都用同一組編號。

| 規則編號 | 一句話建議 | 掃描規則 |
|---|---|---|
| `secret:hardcoded` | 機密只走 n8n 憑證機制 | 有：`secret:*`、`credential:plaintext`（偵測類，error，含 `pinData`；`guardrail-ack:` 對它無效） |
| `webhook:no-auth` | Webhook 設定認證 | 有：`webhook:no-auth`（建議提醒） |
| `form:no-auth` | 對外的 Form Trigger 設定認證 | 有：`form:no-auth`（建議提醒） |
| `tls:allow-unauthorized-certs` | 保持 TLS 憑證檢查開啟 | 有：`tls:allow-unauthorized-certs`（建議提醒）；非本機 `http://` 另有 `network:http-cleartext`（建議提醒） |
| `exec:execute-command` | 預設不使用 Execute Command | 有：`exec:execute-command`（建議提醒） |
| `exec:ssh` | 預設不使用 SSH 節點 | 有：`exec:ssh`（建議提醒） |
| `file:rw-access` | 預設不使用讀寫本機檔案節點 | 有：`file:rw-access`（建議提醒） |
| `header:hardcoded-authorization` | HTTP 標頭的 Authorization 改用憑證 | 有：`header:hardcoded-authorization`（建議提醒） |
| `approval:destructive-needs-gate` | 破壞性或金流動作加人工核准步驟 | 尚無掃描規則，靠 AI 與人工檢查 |
| `error:no-handling` | 外部呼叫加錯誤處理 | 有（粗略）：`error:no-handling`（建議提醒） |
| `ai:agent-no-guardrails` | 對外 AI Agent 的輸入與輸出過原生 Guardrails | 有（粗略）：`ai:agent-no-guardrails`（建議提醒） |
| `ai:agent-code-tool` | Agent 預設不接可執行任意程式的工具 | 有（局部）：`ai:agent-code-tool`（建議提醒） |
| `data:pii-minimization` | 個資最小化 | 尚無掃描規則，靠 AI 與人工檢查（`pinData` 內的機密樣式由 `secret:*` 涵蓋） |

**提醒類規則（ADR-014 新增，三條，只提醒）**：除了上面的 13 項建議，掃描器另有三條「提醒類」規則。它們不是要 AI 在建的時候去採用的做法，而是把「核准人該特別看一眼的地方」標出來；詳細說明見 2.13 至 2.15。

| 規則編號 | 一句話提醒 | 掃描規則 |
|---|---|---|
| `egress:external-domain` | 列出會連到的外部網域，請核准人確認是否在允許清單內 | 有：`egress:external-domain`（提醒，severity 為 `info`） |
| `impact:high-impact-node` | 標出寄信、寫入或刪除資料庫、HTTP 寫入方法、執行系統指令的節點 | 有：`impact:high-impact-node`（提醒，severity 為 `info`） |
| `notes:missing-change-log` | Layer 3 說明便條要有「修改記錄」段 | 有：`notes:missing-change-log`（提醒，severity 為 `info`） |

提醒類規則的共通行為：**只提醒，不強制**。severity 標為 `info`，掃描輸出以 `INFO` 行呈現、彙總行另計 `reminder` 數量；不計入 `warning`，**預設與 `--strict` 都不會讓退出碼變成失敗**，在 CI 只進「建議項」，不新增任何阻擋碼。使用者已知悉時，用同一個 `guardrail-ack: <規則編號>` 標記確認（第 3 章），掃描器改輸出 `ACK` 行。提醒類規則不要求逐條寫進 Layer 3 便條的「建議事項」；掃描有命中時，照第 5 章寫進「資安掃描結果」區塊，狀態寫「提醒」。

> **關於「掃描規則」欄**：本欄記錄撰寫本規格時掃描器的實作狀況，實際行為以 `scripts/security-scan.mjs` 的輸出為準。護欄類規則一律是「建議提醒」（掃描器內部標為 warning），預設執行不會因為它們失敗；只有偵測類規則（`secret:*`、`jscode:*`、`credential:plaintext`，以及讀檔或 JSON 解析失敗）會標為 error，供 Pack 自己的 CI 檢查 repo 檔案，Skill 流程只把結果告知使用者。掃描器的標示不是決定能否交付的門檻。「粗略」「局部」表示掃描器只涵蓋該項建議的一部分，所以沒命中不等於整項都做到。掃描器沒有對應規則的項目，收尾歸入「尚未能自動檢查」（第 5 章）。掃描器日後調整時，同步更新本表。

每項建議的寫法相同：**觸發情境**、**建議做法**、**為什麼**、**風險**（不採用時）、**使用者不採用時 AI 怎麼做**、**掃描規則**。

所有規則共通的「使用者不採用時 AI 怎麼做」：照使用者的決定處理；先把風險與替代做法講清楚；在 Layer 3 便條的「建議事項」區塊標註「使用者選擇不採用」（不需要使用者附理由）；在該節點 notes 寫一行建議行（格式見 [`references-disclosure.md`](references-disclosure.md) §4.4）；使用者同意的話，另留一行已知悉紀錄（第 3 章）。以下各條只補充該規則特有的做法。

### 2.1 `secret:hardcoded`：機密只走憑證機制

- **觸發情境**：任何節點需要金鑰、權杖、密碼、私鑰、連線字串、簽章密鑰等機密。
- **建議做法**：
  1. 使用 n8n 憑證（Credentials）機制，節點只引用憑證，不出現機密本身。
  2. 避免把機密寫在：節點參數、HTTP 標頭或查詢參數、網址（含 `https://user:pass@` 這種寫法）、Code 節點、Set 節點、`pinData`、說明便條、節點 notes。
  3. 先查使用者是否已有符合的憑證可綁定；沒有，就告訴使用者要在介面建立哪一種憑證類型，由使用者自己建立。
  4. 使用者在對話中貼出機密時，建議不要寫進 workflow，並提醒把那組機密視為已外洩、盡快更換（原廠 Skill `n8n-credentials-and-security-official` 的做法一致）。
  5. 範例與測試資料用明顯的假值，AI 不自行編造看起來像真的金鑰。
- **為什麼**：workflow JSON 會被匯出、複製、截圖、放進版本控制；寫在裡面的機密就跟著散出去。憑證機制只在匯出檔留下「引用」，不留機密。
- **風險**：機密隨 JSON 外流，且外流後難以追查範圍。
- **使用者不採用時**：例如使用者希望先把金鑰直接填進節點，AI 說明上述風險並示範憑證做法；使用者仍選擇直接填入，就照辦，同時提醒該金鑰已出現在對話與 JSON 中，建議之後更換。掃描器會提醒（偵測類 error，是資訊而不是阻擋），AI 如實轉告並建議處理，由使用者決定。
- **掃描規則**：`secret:*`（金鑰樣式，節點參數與 `pinData` 都掃）、`credential:plaintext`（敏感欄位名稱下的明文）。掃描只能抓樣式，抓不到自創格式的密碼。

### 2.2 `webhook:no-auth`：Webhook 設定認證

- **觸發情境**：workflow 含 Webhook 節點（`n8n-nodes-base.webhook`）。
- **建議做法**：
  1. 設定 Header Auth、Basic Auth 或 JWT 其中之一，對應的憑證用憑證機制建立。
  2. 可行時加上 IP 白名單（Webhook 節點的選項），呼叫來源已知時尤其合適。
  3. 路徑使用隨機且夠長的字串，不用 `/test`、`/webhook`、`/api` 這類好猜的路徑。這只是降低被掃到的機率，**不能取代認證**。
  4. 對方是第三方服務且採用簽章（例如事件簽章標頭）時，在流程中比對簽章，或改用該服務的原生 Trigger 節點。
- **為什麼**：未設認證的 Webhook，任何知道網址的人都能觸發 workflow；而 workflow 後面常接著寫資料庫、寄信、呼叫付費 API。
- **風險**：被陌生人或機器人觸發，造成垃圾資料、費用或未授權的動作。
- **使用者不採用時**：例如僅供內網健康檢查、來源已由防火牆或反向代理限制，AI 照使用者的決定建立，並提醒「這個入口目前靠網路層保護」。
- **掃描規則**：`webhook:no-auth`（建議提醒；`authentication` 為空或 `none` 時命中）。

### 2.3 `form:no-auth`：對外表單設定認證

- **觸發情境**：workflow 含 Form Trigger（`n8n-nodes-base.formTrigger`），且表單網址會給 n8n 使用者以外的人。
- **建議做法**：
  1. 對外使用的表單，啟用 Form Trigger 提供的認證選項（例如 Basic Auth，實際選項依 n8n 版本），或把表單放在有登入保護的反向代理之後。
  2. 純內部使用（只在內網、只給團隊成員）可以不設；建議在該節點 notes 寫一句「僅限內部使用」與限制來源的方式。
  3. 表單送出的內容視為不可信輸入，後面接資料庫、檔案或 AI 時，照 `ai:agent-code-tool` 與一般輸入檢查處理。
- **為什麼**：開放表單等於開放一個可以對 workflow 灌資料的入口，常被拿來灌垃圾資料、探測內部欄位或觸發付費動作。
- **風險**：垃圾資料、費用暴增、內部欄位被探測。
- **使用者不採用時**：照使用者的決定處理，並在註解（「建議事項」與該節點 notes）記下表單目前沒有認證。
- **掃描規則**：`form:no-auth`（建議提醒；Form Trigger 的 `authentication` 為空或 `none` 時命中）。

### 2.4 `tls:allow-unauthorized-certs`：保持 TLS 憑證檢查開啟

- **觸發情境**：HTTP Request 節點的 `allowUnauthorizedCerts`（選項名稱為「忽略 SSL 問題」）設為 `true`，或任何憑證／節點有關閉憑證檢查的選項；或網址使用非本機的 `http://`。
- **建議做法**：
  1. 遇到自簽憑證，建議讓 n8n 所在環境信任該根憑證，而不是關掉檢查。
  2. 非本機位址使用 `https://`。
  3. 本機（`localhost`、`127.0.0.1`）測試可以用 `http://`，建議在 Layer 3 便條的「已知限制」寫明。
- **為什麼**：關掉憑證檢查之後，連線可以被中間人冒充，傳輸中的機密與資料就失去保護；這類設定也常被遺忘在長期執行的環境。
- **風險**：連線被竊聽或竄改，帳號與資料外洩。
- **使用者不採用時**：例如內部測試機只有自簽憑證，使用者選擇關閉檢查，AI 照辦，並提醒限定在可信網段、日後換成受信任的憑證。
- **掃描規則**：`tls:allow-unauthorized-certs`（建議提醒；`allowUnauthorizedCerts` 為 true 時命中）、`network:http-cleartext`（建議提醒）。

### 2.5 `exec:execute-command`、`exec:ssh`：預設不使用

- **觸發情境**：設計上會用到 Execute Command 節點（`n8n-nodes-base.executeCommand`）或 SSH 節點（`n8n-nodes-base.ssh`），包含它們的工具版本。
- **建議做法**：
  1. 預設先找替代：原生節點、HTTP Request、子 workflow、使用者既有的 API。
  2. 使用者確實需要時，AI 照辦，並建議在該節點 notes 寫一句理由（為什麼沒有替代、指令內容由誰控制）。
  3. 避免把外部輸入（網址、使用者文字、AI 輸出）串進指令；需要代入變數時，建議用白名單檢查格式並加引號處理。
  4. SSH 使用憑證機制；目標主機與帳號權限盡量縮小。
- **為什麼**：這兩個節點能在 n8n 主機或遠端主機上執行任意指令，一旦輸入被污染，就等於遠端程式碼執行。
- **風險**：主機被接管、資料外洩、橫向擴散。
- **使用者不採用時**：照使用者的決定建立，並提醒指令內容的來源與主機權限。
- **掃描規則**：`exec:execute-command`、`exec:ssh`（皆為建議提醒，偵測節點本身；工具版本與其他等效做法靠人工檢查）。

### 2.6 `file:rw-access`：預設不使用讀寫本機檔案節點

- **觸發情境**：使用讀寫 n8n 主機檔案系統的節點，例如 Read/Write Files from Disk（`n8n-nodes-base.readWriteFile`）及舊版的 Read/Write Binary File 節點。
- **建議做法**：
  1. 預設先考慮資料表、物件儲存、雲端硬碟節點，或 n8n 內部的 binary 資料。
  2. 使用者確實需要時，建議把路徑限制在專用目錄，不用外部輸入組路徑（避免路徑穿越），並在 notes 寫一句理由。
  3. 避免讀取 n8n 設定檔、憑證檔、使用者家目錄與系統目錄。
- **為什麼**：檔案節點能碰到 n8n 主機上的任何檔案，包含設定與機密；路徑若來自外部輸入，就可能讀到或覆寫不該動的檔案。
- **風險**：機密檔案外洩、系統檔案被覆寫。
- **使用者不採用時**：照使用者的決定建立，並提醒目錄範圍與檔案權限。
- **掃描規則**：`file:rw-access`（建議提醒；偵測讀寫檔案類節點，不判斷路徑是否安全）。

### 2.7 `header:hardcoded-authorization`：Authorization 標頭改用憑證

- **觸發情境**：HTTP Request 節點（或任何自訂標頭）出現 `Authorization`、`X-API-Key` 這類認證用標頭，且值是字面文字。
- **建議做法**：
  1. 改用節點的認證選項搭配憑證（Bearer Auth、Header Auth、Basic Auth、OAuth2 等）。
  2. 需要多個標頭，或標頭加查詢參數的組合時，用自訂認證憑證類型。
  3. 避免用 Set 節點、`$vars` 或環境變數轉手機密再填進標頭。
- **為什麼**：標頭值寫在節點參數裡，等同把機密寫進 workflow JSON；轉手一層並沒有改變它以明文存放的事實。
- **風險**：同 `secret:hardcoded`。
- **使用者不採用時**：同 `secret:hardcoded`：說明風險、示範憑證做法，使用者仍選擇寫入就照辦並提醒更換金鑰。值不含憑證內容的固定標頭本來就不會被掃描器標出。
- **掃描規則**：`header:hardcoded-authorization`（建議提醒；偵測 HTTP Request 節點中 `Bearer`、`Basic`、`Token` 開頭的字面值，運算式與明顯的佔位字不算）。

### 2.8 `approval:destructive-needs-gate`：破壞性或金流動作加人工核准步驟

- **觸發情境**：workflow 含刪除資料、覆寫資料、批次更新、對外大量寄送、轉帳、退款、扣款、下單、授權或權限變更等動作。
- **建議做法**：
  1. 在動作前加人工核准步驟：Wait 節點以 Webhook 方式恢復，核准人從通知中點選核准或拒絕；逾時走拒絕分支。可參考 [`../examples/templates/human-approval-gate.workflow.json`](../examples/templates/human-approval-gate.workflow.json) 的模式。
  2. 核准與拒絕都留下紀錄（誰、何時、決定）。
  3. 動作若由 AI Agent 的工具執行，建議用 n8n 的人工審核（Human Review）工具節點包住該工具，經核准後工具才會執行。
  4. 核准人建議不是動作的發起人自己。
- **為什麼**：破壞性動作做錯了通常無法復原；AI 與自動化會把小錯放大成大事故。人確認的那一下，是最後一道可靠的煞車。
- **風險**：誤刪、誤付、誤發而無法回復。
- **使用者不採用時**：例如使用者說明下游系統本身有核准或可回復機制，或希望全自動執行，AI 照辦，並在註解記下「這個動作不會經過人工確認」。
- **掃描規則**：尚無掃描規則，靠 AI 與人工檢查。

### 2.9 `error:no-handling`：外部呼叫加錯誤處理

- **觸發情境**：任何會呼叫外部系統的節點（HTTP Request、資料庫、雲端服務、通訊軟體、AI 模型等）。
- **建議做法**：
  1. 至少做到其一：節點的 `onError` 設定（例如把錯誤導向錯誤輸出分支處理），或整個 workflow 設定 Error Workflow（以 Error Trigger 節點起頭的流程）負責通知。
  2. 需要重試時，建議用退避：每次等待加長，並設上限次數。節點內建重試的等待時間是固定的，要遞增可參考 [`../examples/templates/retry-with-backoff.workflow.json`](../examples/templates/retry-with-backoff.workflow.json) 的模式。
  3. 避免靜默失敗：不要設成「失敗就繼續、什麼都不記」；錯誤至少通知到負責的人或留下紀錄。
  4. 錯誤訊息與通知內容避免夾帶機密與個資。
- **為什麼**：靜默失敗等於沒人知道出了事：資料少了、帳沒對上、授權過期。沒有退避的重試還可能在對方故障時放大流量。
- **風險**：問題被發現得很晚，或自動重試加重對方負擔。
- **使用者不採用時**：例如一次性的手動工具、失敗時使用者當場就看得到，AI 照辦。
- **掃描規則**：`error:no-handling`（建議提醒，整個 workflow 層級）。偵測方式很粗：有外部呼叫節點，卻找不到任何 `onError` 設定、`retryOnFail`、Error Trigger 或 Error Workflow 時才命中；找到任何一處就不命中，所以不代表每個外部呼叫都有處理，也看不出重試有沒有退避。

### 2.10 `ai:agent-no-guardrails`：對外 AI Agent 的輸入與輸出過原生 Guardrails

- **觸發情境**：workflow 含 AI Agent，且輸入來自外部使用者或外部內容（聊天視窗、公開表單、對外 Webhook、電子郵件、讀取外部網頁或文件）。
- **建議做法**：
  1. **輸入端**：外部文字進入 Agent 之前，先過 n8n 原生 Guardrails 節點（`@n8n/n8n-nodes-langchain.guardrails`），檢查項目建議考慮：提示注入／越獄、個資、機密金鑰、不當內容、惡意網址。可用的檢查項目與接線方式依 n8n 版本與節點實際提供為準。
  2. **輸出端**：Agent 的回應送給使用者或寫入下游系統之前，再過一次 Guardrails（至少檢查機密金鑰與個資）。
  3. 檢查未通過時，建議走明確的分支：拒絕、轉人工，或回固定訊息，而不是讓內容繼續往下流。
  4. 建議用 n8n 原生節點，而不是自寫 Code 節點用規則運算式擋。理由與 [`native-first.md`](native-first.md) 一致：原生節點接手的人看得懂、由官方維護；自寫的規則運算式容易被繞過，也容易過期。
  5. 部分檢查需要接聊天模型，會增加成本與延遲，AI 要在「建議事項」的說明裡告知。
  6. Guardrails 是降低風險的一層，不是全部；建議搭配 `ai:agent-code-tool` 的最小權限與人工核准。
- **為什麼**：對外 Agent 會直接讀陌生人的文字，提示注入、越獄與資料外洩都從這個入口進來。本 Pack 彙整的公開範本中，4,336 個含 AI Agent 的範本只有 19 個使用原生 Guardrails（約 0.4%），所以 AI 不主動提，使用者多半不會知道有這個選項。
- **風險**：Agent 被誘導洩漏資料、執行不該做的動作，或輸出不當內容。
- **使用者不採用時**：例如 Agent 只處理 workflow 內部產生、使用者信任的資料，或只在內部使用，AI 照辦，並提醒「這個 Agent 的輸入輸出目前沒有檢查」。
- **掃描規則**：`ai:agent-no-guardrails`（建議提醒，整個 workflow 層級）。偵測方式：有 AI Agent、有對外觸發節點，而 workflow 內找不到 Guardrails 節點時命中。它不看 Guardrails 有沒有接在 Agent 的前後、檢查項目夠不夠，這些靠人工檢查。

### 2.11 `ai:agent-code-tool`：Agent 的工具權限最小化

- **觸發情境**：workflow 含 AI Agent 並接上工具（`ai_tool` 連線）。
- **建議做法**：
  1. 預設不接可執行任意程式的工具：Code Tool（`@n8n/n8n-nodes-langchain.toolCode`）、Execute Command 與 SSH 的工具版本，以及其他等同執行任意程式的工具。
  2. 工具權限盡量縮小：只開放完成任務需要的工具；資料庫工具用唯讀帳號、限定資料表；HTTP 類工具限定網域與方法。
  3. 有副作用的工具動作（寫入、刪除、寄信、付款、改權限）建議加人工核准：用 Human Review 工具節點包住，經核准後才執行（見 `approval:destructive-needs-gate`）。
  4. 外部文字視為**不可信輸入**，以防間接提示注入：網頁、郵件、文件、搜尋結果與工具回傳內容，可能夾帶「忽略先前指示」之類的指令。建議這些內容只放在資料區，不放進系統提示；不讓它們直接決定有副作用的工具參數；同一個 Agent 盡量不同時具備「讀取私有資料」與「向外傳送」兩種能力，除非中間有人工核准。
  5. 限制迭代次數與成本：AI Agent 節點設定最大迭代次數；模型呼叫量大時設預算或用量上限。若使用 n8n Agents，預算設定見原廠 Skill `n8n-agents-official`；該 Skill 對最大迭代次數的建議是未經使用者要求就不設，所以那個介面以使用者的決定為準。
  6. 需要自訂邏輯時，建議包成子 workflow 當工具，並在子 workflow 內做輸入檢查，而不是給 Agent 一個能執行任意程式的口子。
- **為什麼**：Agent 的行為由模型依文字決定，而文字可以被外部污染。工具權限就是出事時的影響範圍；給得越少，被誘導時能造成的損害越小。
- **風險**：Agent 被劫持後執行任意程式、外洩資料、產生大量費用。
- **使用者不採用時**：例如使用者明確要一個能執行程式碼的工具，AI 照辦，並提醒程式內容的來源、Agent 能傳入什麼，以及建議搭配人工核准。
- **掃描規則**：`ai:agent-code-tool`（建議提醒）。只偵測「workflow 有 AI Agent 且含 Code Tool」；工具權限是否最小化、有副作用的工具有沒有核准、迭代次數與成本上限，掃描器看不到，靠人工檢查。

### 2.12 `data:pii-minimization`：個資最小化

- **觸發情境**：workflow 處理姓名、電話、電子郵件、地址、證號、帳號、健康或財務資料等個人資料，或會留下紀錄、寫入 `pinData`、寫進便條。
- **建議做法**：
  1. 只取任務需要的欄位；用不到的欄位在早期用 Edit Fields 等節點丟掉。
  2. 避免把真實資料寫進 `pinData` 或說明便條；示範資料用明顯的假資料。
  3. 紀錄、錯誤通知與稽核紀錄不記機密與個資，必要時只記識別碼或遮罩後的值。
  4. 送進外部 AI 模型的資料先評估必要性，能去識別化就去識別化。
  5. 資料保存期限與刪除方式，建議寫進 Layer 3 便條的「已知限制」或前提假設。
- **為什麼**：資料存放的地方越多，外洩點就越多。`pinData` 與便條會跟著 workflow 一起被匯出、分享，常常被忽略。
- **風險**：個資外洩，或因保存過久而增加合規負擔。
- **使用者不採用時**：例如使用者要保留完整欄位或把自己的真實資料放進 `pinData`，AI 照辦，並提醒匯出或分享前先清掉。
- **掃描規則**：尚無掃描規則，靠 AI 與人工檢查（`pinData` 內的機密樣式由 `secret:*` 涵蓋）。

### 2.13 `egress:external-domain`：外連網域提醒（只提醒）

- **觸發情境**：HTTP Request 節點（含工具版與舊版）、LangChain 的 HTTP Request 工具、GraphQL 節點的網址參數（`url`、`endpoint`、`baseUrl`、`nextURL`，巢狀選項裡的也算），指向非內網的網域。運算式裡的字面網址（例如 `={{ 'https://api.example.invalid/x' }}`、或運算式中的備用網址）也會讀。
- **建議做法**：
  1. 請核准人確認這些網域是否在組織的外連允許清單內；不在清單內的，先確認用途與送出的資料內容。
  2. 有允許清單時交給掃描器：`--egress-allow <逗號分隔網域>`、`--egress-allow-file <檔案>`（一行一個或逗號分隔，`#` 開頭為註解），或環境變數 `SKILLPACK_EGRESS_ALLOW`；旗標優先於環境變數。CI 的 `scripts/ci/check-workflows.mjs` 也接受前兩個旗標，並會把環境變數一併傳給掃描器。清單內的網域不再提醒；**沒有提供清單時只列出網域、不做判斷**。
  3. 比對規則：不分大小寫；`api.example.invalid` 只符合該網域；`*.example.invalid` 符合它的任何層級的子網域，**不含** `example.invalid` 本身；埠號、路徑與查詢字串不納入比對。
  4. 網址由運算式組出、掃描器無法判斷目的地時（例如 `={{ $json.target }}`、`=https://{{ $json.host }}/v1`），會提醒「無法靜態判斷」，**不會**誤報成某個固定網域；請人工確認實際會連到哪裡。網域固定、只有路徑用運算式（`=https://api.example.invalid/items/{{ $json.id }}`）則視為固定網域。
  5. 能固定的網域盡量寫成固定網址，讓核准人看得到。
- **不算外連的位址**：`localhost` 與迴路位址、私有網段（RFC 1918）、link-local、CGNAT 共享位址、IPv6 的 `::1` 與 `fc00::/7`、`fe80::/10`、以 `.local`、`.internal`、`.lan`、`.intranet`、`.corp`、`.home.arpa`、`.svc`、`.cluster.local` 結尾的名稱、沒有點的單一名稱（例如 Docker Compose 的服務名稱），以及 n8n 自己的位址（`$execution.resumeUrl`、`$execution.resumeFormUrl`、`$env.WEBHOOK_URL`、`$env.N8N_EDITOR_BASE_URL`）。公開的 IP 位址則會列出。
- **為什麼**：外連是資料離開組織的路徑；網域在節點參數裡，核准人不必讀懂每個節點也能一次看到。
- **風險**：資料被送到沒有核准過的網域。
- **使用者不採用時**：照使用者的決定處理；已知悉的節點，在該節點 notes 寫 `guardrail-ack: egress:external-domain -- 說明`，掃描器改輸出 `ACK`。
- **掃描規則**：`egress:external-domain`（提醒，節點層級）。只讀上述網址參數；請求內容（body）裡的網址、Code 節點程式碼裡的網址、憑證裡的位址、以及子 workflow 內的呼叫都看不到，所以沒提醒不等於沒有外連。輸出只寫網域，不寫路徑與查詢字串，主機名稱含特殊字元時不照原文輸出。

### 2.14 `impact:high-impact-node`：高影響動作提醒（只提醒）

- **觸發情境**（每個節點最多提醒一次，說明裡寫明是哪一類）：
  1. **寄信**：Email Send（SMTP）、Mailgun 每次都算；Gmail、Microsoft Outlook、SendGrid、Mailjet、Mandrill、Brevo（`sendInBlue`）在 `operation` 為 `send`、`reply`、`forward` 開頭（含 `sendAndWait`）時算。
  2. **寫入或刪除資料庫**：Postgres、MySQL、MongoDB、Redis、Microsoft SQL、Oracle Database、Snowflake、CrateDB、QuestDB、TimescaleDB、Supabase、Elasticsearch、NocoDB、Baserow、DynamoDB（含有工具版的 `…Tool`），`operation` 不是讀取時算：`executeQuery`（可執行任意 SQL，不論實際語句）、`insert`、`update`、`upsert`、`delete…`、`create`、`set`、`push`、`pop`、`publish` 等。`select`、`find`、`get`、`getAll` 這類讀取不算。
  3. **HTTP 寫入方法**：HTTP Request（含工具版與舊版的 `requestMethod`）與 LangChain 的 HTTP Request 工具，`method` 為 POST、PUT、PATCH、DELETE。**不論目的地是內網或外部**都算（對內部服務的 POST 一樣可能改變資料）。
  4. **執行系統指令**：Execute Command、SSH。
  5. `operation` 或 `method` 是運算式、無法靜態判斷時，也提醒並註明「無法靜態判斷」。
- **不列入**：沒有寫 `operation` 或 `method` 的節點（匯出檔不會記錄預設值，掃描器看不出實際動作）；Human Review 的工具版（`…HitlTool`，本身已含人工核准）；GraphQL 節點（沒有可判斷的方法欄位）；Slack、Google Sheets 這類雲端服務節點的寫入動作；向量資料庫與記憶體節點。這些要靠人工與 `approval:destructive-needs-gate`。
- **建議做法**：核准人在工單上針對這些節點特別確認：動作對象是否正確、資料來源是否可信、是否需要先加人工核准步驟（見 `approval:destructive-needs-gate`）。
- **為什麼**：這些動作做錯了通常難以復原（寄出的信、被改寫的資料、已送出的請求）；把它們集中標出來，核准人不用逐節點找。
- **使用者不採用時**：照使用者的決定處理；已知悉的節點，在該節點 notes 寫 `guardrail-ack: impact:high-impact-node -- 說明`。
- **節點分類出處**：節點名稱查自 `docs/node-versions/` 的節點目錄（2.37.3、2.44.6、2.46.6 三份都查得到）；`n8n-nodes-base.executeCommand` 在預設目錄查不到（預設實例不提供），沿用既有 `exec:execute-command` 規則使用的名稱。節點目錄沒有「操作值」資料，操作值取自原廠 Skill 的說明（`skills/_vendor/n8n-node-configuration-official/references/DATABASE_NODES.md` 等）加上一般動詞比對；認不得的操作名稱**不列入**，所以這條寧可漏報，不求全面。
- **掃描規則**：`impact:high-impact-node`（提醒，節點層級）。

### 2.15 `notes:missing-change-log`：Layer 3 便條的修改記錄（只提醒）

- **觸發情境**：workflow 有 Layer 3 說明便條（`color` 為 5 的便條），但便條裡沒有「修改記錄」段，或有標題卻沒有任何一列資料。
- **建議做法**：依 [`sticky-note-three-layer.md`](sticky-note-three-layer.md) §4.4，在 Layer 3 便條加上「修改記錄」段：每列有日期（YYYY-MM-DD）、變更摘要、提出者（使用者或 AI）、原因；新建的 workflow 第一列為「建立」；修改既有 workflow 就新增一列；不寫入機密。
- **辨識方式**：標題為「修改記錄」（或「修改紀錄」）、`Change log`、`Changelog`，且該段落內至少有一列（表格列或清單項目）含 `YYYY-MM-DD` 格式的日期。有多張 Layer 3 便條時，任一張符合即可。
- **完全沒有 Layer 3 便條時**：本規則**不重複提醒**，沿用既有的便條相關提醒（Skill 流程要求每個 workflow 附 Layer 3 便條）。
- **掃描器看不到的部分**：修改記錄寫的內容與實際變更是否相符，需要與前一版比對，Pack 內無法判斷；由管線在 PR 層級比對（AI 審查者提出建議，見 [`agent-reviewer-mode.md`](agent-reviewer-mode.md)），不在本規則範圍。
- **為什麼**：workflow 匯出後會與 Git 分離，正式環境的人只看得到 workflow 本身；便條上的歷程讓核准人與日後維護者不必另外找紀錄。
- **使用者不採用時**：照使用者的決定處理；在任一節點的 notes（建議在觸發節點）寫 `guardrail-ack: notes:missing-change-log -- 說明`。
- **掃描規則**：`notes:missing-change-log`（提醒，workflow 層級）。

---

## 3. 使用者已知悉（acknowledge）

### 3.1 這是做什麼的

使用者選擇不採用某項建議後，AI 可以建議在該節點的 `notes` 留一行已知悉紀錄，讓之後再掃描或接手的人看得出「這是使用者知道並選擇的做法」，掃描也不必重複提醒同一件事。**這一行是選用的**：使用者不想寫就不寫，不影響交付，AI 也照樣把狀態記進 Layer 3 便條的「建議事項」。

### 3.2 格式

```text
guardrail-ack: <規則編號> -- <使用者的說明，可省略>
```

例如：

```text
guardrail-ack: webhook:no-auth -- 僅供內網健康檢查，由防火牆限制來源
```

沒有說明也可以：

```text
guardrail-ack: webhook:no-auth
```

- 說明沒有長度要求，也沒有一定要寫；寫了對日後接手的人有幫助。
- 一行對應一個規則編號；要記多項，寫多行。
- 只對該節點、該規則有意義；不會順帶涵蓋其他節點或其他規則。
- 屬於整個 workflow 的規則（例如 `error:no-handling`、`ai:agent-no-guardrails`、`data:pii-minimization`），建議寫在觸發節點（第一個節點）的 notes。
- 行內避免放機密、內網位址或個資。

> **與掃描器的關係**（對應 `scripts/security-scan.mjs` 目前的行為）：
>
> - **輸出 ACK 行**：節點 notes 中符合 `guardrail-ack: <規則編號>`（行首可有空白，可附 ` -- 說明`，說明可省略、沒有最短長度）的行，會被掃描器讀取；對應的提醒改以 `ACK` 行輸出（含規則編號、節點名稱與說明），**不計入提醒數**，彙總行另列已知悉的數量。
> - **只對護欄類建議提醒有效**：節點層級的規則（例如 `webhook:no-auth`、`form:no-auth`、`exec:*`、`file:rw-access`、`egress:external-domain`、`impact:high-impact-node`）要寫在**該節點**的 notes；整個 workflow 層級的規則（`error:no-handling`、`ai:agent-no-guardrails`、`notes:missing-change-log`）寫在任一節點的 notes 都可以，建議寫在觸發節點。提醒類規則（severity `info`）同樣可以用 `guardrail-ack:` 確認。
> - **對偵測類 error 無效**：`secret:*`、`jscode:*`、`credential:plaintext` 等偵測類規則不是建議，寫 `guardrail-ack:` 不會讓它消失；掃描器會輸出 `NOTE` 行說明「這個已知悉被忽略」。規則編號寫錯、或根本沒有對應的提醒時，也會有 `NOTE` 行。
> - **`--strict` 是選用旗標**：加上之後，未被知悉的建議提醒（`warning`）也會讓退出碼為 1；提醒類規則（`info`）**不計入**，永遠不會讓退出碼為 1。Pack 的 Skill 流程**不使用，也不要求使用**；使用者或 CI 想要更嚴格時才用。
> - 掃描器沒有對應規則的項目（例如 `approval:destructive-needs-gate`、`data:pii-minimization`），這一行只是紀錄，掃描器不會處理。
> - 掃描器目前只讀 `guardrail-ack:`，不讀較早的 `guardrail-waiver:` 寫法。

### 3.3 節點 notes 的寫法

節點 notes 本身是 JSON 字串，所以已知悉行要用 `\n` 與其他說明隔開，不放真正的換行字元：

```json
{
  "name": "Health check",
  "type": "n8n-nodes-base.webhook",
  "notes": "內網健康檢查入口。\nguardrail-ack: webhook:no-auth -- 僅供內網健康檢查，由防火牆限制來源"
}
```

節點 notes 的一般寫法仍照 [`references-disclosure.md`](references-disclosure.md) 第 7 章：短、寫「為什麼」。

### 3.4 已知悉不等於修好

使用者不採用的項目仍然是風險。它在這幾處應該看得見：

- 該節點的 notes（建議行，以及使用者同意時的已知悉行）；
- Layer 3 便條的「建議事項」區塊，狀態寫「使用者選擇不採用」（第 5 章）；
- 掃描輸出的 `ACK` 行（使用者留了已知悉行時）。

「建議事項」區塊與掃描輸出對不起來（例如掃描有提醒、區塊沒列），表示記錄不完整，AI 要補上。

---

## 4. 掃描：資訊與建議

### 4.1 怎麼掃

交付前，對**實際要交付的 workflow JSON** 執行（在 Pack 根目錄）：

```bash
node scripts/security-scan.mjs <workflow.json>
```

預設模式就是建議模式。掃描器另有選用的 `--strict` 旗標（把未被知悉的建議提醒也算入退出碼），**Pack 的 Skill 流程不使用，也不要求使用**；使用者或 CI 想要更嚴格的行為時才用。

### 4.2 怎麼看結果

- 掃描輸出是**資訊與建議**。AI 把結果如實告訴使用者，說明每一項代表什麼風險，並提出建議的處理方式；**由使用者決定要不要處理**。
- 掃描輸出有三種層級：`ERROR`（偵測類）、`WARNING`（護欄類建議）、`INFO`（提醒類：`egress:external-domain`、`impact:high-impact-node`、`notes:missing-change-log`）。`INFO` 要照實寫進「資安掃描結果」區塊（狀態寫「提醒」），特別是外連網域與高影響動作，目的就是讓核准人看到。
- 掃描有命中，不因此拒絕交付。退出碼為 1 只表示有偵測類的提醒（例如疑似機密樣式），不代表不能交付。
- 使用者決定處理的，修改後對最終那一份 JSON 重掃，結果以最後一次為準；使用者決定不處理的，照實記入 Layer 3 便條的「建議事項」區塊（第 5 章）。
- 之後只要又改了 JSON（包含把建議事項寫進便條、加上已知悉行），就對最終那一份重掃。
- 掃描器沒有對應規則的項目，「掃描沒命中」不代表做到了；它們在「建議事項」歸入「尚未能自動檢查」。
- 沒有 Node.js 環境、腳本不存在或退出碼為 2（沒掃到任何檔案）時，視為**未執行**，照實寫「未執行資安掃描」與原因，不假稱通過。

---

## 5. 收尾記錄：引用統一定義

資安建議的收尾**不在本規格另訂格式**。順序、位置、狀態與便條格式，一律依 [`references-disclosure.md`](references-disclosure.md) 第 4 章的統一定義：

- 三個區塊固定順序為「參考來源 → 建議事項 → 資安掃描結果」。
- 13 項資安建議用本規格第 2 章的規則編號，寫在 Layer 3 便條的「建議事項」區塊，每條一行，附狀態（已採用／使用者選擇不採用／不適用／尚未能自動檢查）。「使用者選擇不採用」不需要附理由。
- 針對特定節點的建議（例如 Webhook 的認證、Agent 的 Guardrails），另寫成該節點 `notes` 的簡短一行，格式見同規格 §4.4。
- 掃描結果的寫法見同規格第 8 章；對話只放 3–5 行摘要並指向註解，以註解為正式紀錄。

### 5.1 本規格特有的判斷提示

- **不確定時，不要選「已採用」**：選「尚未能自動檢查」並寫明哪裡不確定。
- **掃描沒命中不等於做到**：掃描器沒有對應規則的項目（`approval:destructive-needs-gate`、`data:pii-minimization`），以及只涵蓋局部的項目（「粗略」「局部」），狀態寫「尚未能自動檢查」，或在「已採用」的說明註明人工要確認的部分。
- **整個 workflow 層級的建議**（`error:no-handling`、`ai:agent-no-guardrails`、`data:pii-minimization`）只寫在 Layer 3 便條；使用者要留已知悉行時，寫在觸發節點的 notes（第 3 章）。
- **對非技術使用者**（例如問答模式），對話摘要可把規則編號換成白話說明（例如「Webhook 有沒有設認證」）；註解裡仍用規則編號。
- 規則編號、狀態名稱與註解內容，**不在本規格重複列表**；需要範本時看 [`references-disclosure.md`](references-disclosure.md) §4.3。

---

## 6. 誠實規則

1. **護欄不等於安全。** 採用本檔的建議，只是把已知的常見風險在設計階段先處理；不保證沒有其他風險，也不保證擋得住所有攻擊。
2. **掃描只能抓樣式。** 機密長得不像金鑰、Webhook 的認證設定是假的、Agent 被誘導做了不該做的事，掃描都看不出來。
3. **避免宣稱「已確保安全」之類的字眼。** 不寫「已確保安全」「安全無虞」「已完成資安把關」等；只寫做了什麼、掃描結果是什麼、哪些沒檢查。
4. **未檢查的項目要明寫。** 掃描器沒有對應規則的，就是「尚未能自動檢查」；不因為掃描沒命中，就寫成「已採用」。
5. **Guardrails 節點也有漏網與誤判。** 它降低風險，不是保證；檢查項目、門檻與模型要在「建議事項」說明，讓使用者知道它處理什麼、不處理什麼。
6. **使用者不採用的項目要照實列出。** 不藏在其他描述之中，也不寫成「已處理」。
7. **不確定就說不確定。** 對 n8n 版本差異、節點選項名稱不確定時，寫明「請依你的 n8n 版本確認」，而不是猜一個說法。
8. **「建議事項」區塊和實際 JSON 一致。** 寫「已採用」的項目，JSON 裡找得到對應設定；交付前自己對照一遍。
9. **本規格只提供建議，最終決定與責任在使用者。** AI 的工作是把風險講清楚、給替代做法、把選擇記下來，不是替使用者做決定。

---

## 7. 正例與反例

### 正例 1：對外客服 Agent，AI 主動提出並採用

使用者要一個接收聊天訊息、由 AI 回答商品問題的 workflow。AI 建立時主動套用建議：Webhook 設 Header 認證並用隨機路徑；Agent 前面接原生 Guardrails 節點檢查提示注入與個資，後面再接一個檢查機密金鑰與個資；Agent 只掛唯讀的商品查詢工具，並設定迭代次數上限；外部呼叫設錯誤輸出並接 Error Workflow。AI 用幾句話說明每一項為什麼這樣做，使用者沒有異議。交付前執行掃描並把結果轉告使用者。AI 把各項建議的狀態寫進 Layer 3 便條的「建議事項」，Agent 相關各項標「已採用」並註明掃描只涵蓋局部，Agent 節點的 notes 另有一行建議行，對話只放摘要並指向註解，最後提醒 Guardrails 也會有漏網。

**為什麼是正例**：建議在建的時候就提出並說明；每一項都有交代；沒有被掃描涵蓋的部分沒有被包裝成已通過。

### 正例 2：使用者選擇不設認證，AI 提醒後照辦並記錄

使用者要一個給內網監控系統呼叫的健康檢查 Webhook，並說不想設認證。AI 先說明未設認證的風險，並提出替代做法（至少加 IP 白名單）；使用者說防火牆已限制來源，仍選擇不設。AI 照使用者的決定建立，詢問是否要在節點 notes 留一行 `guardrail-ack: webhook:no-auth -- 僅供內網健康檢查，由防火牆限制來源`，使用者同意後寫入。掃描輸出一行 `ACK`，AI 轉告使用者；便條「建議事項」該條寫「使用者選擇不採用」並附同一句說明。

**為什麼是正例**：風險在使用者決定前講清楚；使用者的選擇被尊重也被如實記下；沒有把它說成已修好。

### 反例 1：AI 擅自拒絕或擅自關掉提醒

使用者說要先用自簽憑證的內部測試機，想把憑證檢查關掉。AI 回答「這樣不行」並拒絕建立；或者相反，AI 為了讓畫面乾淨，悄悄把掃描輸出中的提醒省略，註解裡也沒有列出這一項。

**錯在哪裡**：前者把建議變成阻擋，沒有尊重使用者的決定；後者替使用者關掉重要提醒，讓使用者在不知情下承擔風險。正確做法是講清楚風險、提出替代做法（例如讓環境信任該根憑證），使用者仍要關閉就照辦，註解標註「使用者選擇不採用」。

### 反例 2：隱瞞風險、宣稱已確保安全

AI 為了讓使用者馬上看到結果，把 API 金鑰直接填進 HTTP Request 的 Authorization 標頭，沒有告訴使用者，也沒有提供憑證做法；交付時沒有掃描，註解與摘要寫「已確保安全」。

**錯在哪裡**：使用者沒有機會做決定，因為風險根本沒被提出；沒有掃描卻暗示通過；用語違反誠實規則。正確做法是主動說明並示範憑證做法，讓使用者選擇；如果使用者已把金鑰貼在對話裡，提醒更換。

---

## 8. 參考

- [`../research/n8n-templates-security.md`](../research/n8n-templates-security.md)：n8n.io 公開範本的資安面統計（描述性，不是漏洞清單）。
- [`references-disclosure.md`](references-disclosure.md)：收尾區塊的統一定義（第 4 章）與掃描結果寫法（第 8 章）；建議事項寫進註解，以註解為正式紀錄。
- [`native-first.md`](native-first.md)：原生節點優先規範；Guardrails 用原生節點的依據。
- [`../skills/tigerai/n8n-security-governance/SKILL.md`](../skills/tigerai/n8n-security-governance/SKILL.md)：n8n 資安與變更治理 Skill，審查與產生時以本檔的規則編號為準。
- [`../skills/_vendor/n8n-credentials-and-security-official/SKILL.md`](../skills/_vendor/n8n-credentials-and-security-official/SKILL.md)：原廠的憑證與機密處理做法。
- [`../skills/_vendor/n8n-ai-nodes-official/references/HUMAN_REVIEW.md`](../skills/_vendor/n8n-ai-nodes-official/references/HUMAN_REVIEW.md)：Agent 工具的人工審核接線方式。
- [`../examples/templates/human-approval-gate.workflow.json`](../examples/templates/human-approval-gate.workflow.json)、[`../examples/templates/retry-with-backoff.workflow.json`](../examples/templates/retry-with-backoff.workflow.json)：人工核准與退避重試的模式範本。
- `scripts/security-scan.mjs`：規則式掃描器；實際支援的旗標與規則以其輸出為準。

---

**版本**：v1.1
**狀態**：規範草案。第 2 章「掃描規則」欄與第 3.2 節對掃描器的描述，隨 `scripts/security-scan.mjs` 的調整更新；與掃描器實際輸出不一致時，以掃描器為準。2.13 至 2.15 為 ADR-014 後新增的提醒類規則（只提醒、不強制）。
