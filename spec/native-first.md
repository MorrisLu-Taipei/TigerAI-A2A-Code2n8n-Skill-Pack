# 原生節點優先規範 v1.1

> 🌐 [English](native-first.en.md) | **繁體中文**

> **適用對象**：所有會產生或修改 n8n workflow 的 Skill、使用本 Skill Pack 的 AI Agent、整合工程師
> **核心做法**：能用 n8n 原生節點完成的事，AI 預設不寫成 Code 節點；真的要用 Code 節點，就在節點的 `notes` 寫明理由，並把用了幾個寫進 Layer 3 便條的「建議事項」。這是建議：使用者要求用 Code，AI 照使用者的決定處理
> **收尾項目**：Code 節點說明屬於「建議事項」區塊（第 7 章），位置、順序與格式一律依 [`references-disclosure.md`](references-disclosure.md) 第 4 章的統一定義

---

## 1. 目的與原則

### 1.1 要解決的問題

使用者提出的要求是「原生節點優先」。背後的問題是：AI 產生 workflow 時，太愛用 Code 節點把邏輯寫成程式，而不是用 n8n 原廠提供的原生節點。結果是接手的人看不懂畫布上那一格在做什麼，要讀程式才知道；偏偏 workflow 的接手者常常是會看畫布、但不寫程式的人。

### 1.2 官方已有的原則

n8n 官方 Skill（`skills/_vendor/n8n-code-nodes-official/SKILL.md`）已經明講：

- **Code 節點是最後手段**。決策順序是「運算式 → Edit Fields 的箭頭函式 → Code 節點」。
- 為了「有原生節點的事情」寫 Code，是常犯的錯誤（官方舉的例子是雜湊與 HMAC 應該用 Crypto 節點、XML 解析應該用 XML 節點）。
- 社群 Skill 的 `skills/_vendor/n8n-node-configuration/NATIVE_NODES.md` 逐項示範各種資料工作該用哪個原生節點、怎麼設定。

本 Pack 在這些原則上與官方一致，不另立一套判準。

### 1.3 本 Pack 多做的事

| 項目 | 官方 Skill | 本 Pack |
|---|---|---|
| 原則 | 有（Code 是最後手段） | 沿用 |
| 實證 | 無 | 用 13,947 個 n8n.io 公開範本統計 Code 節點實際用在哪裡（第 8 章） |
| 閘門 | 建議性質 | **產生前自我檢查**：列出、逐項過決策順序、能原生就原生（第 6 章） |
| 理由 | 無固定位置 | **Code 節點在 notes 寫一行理由**（第 5 章） |
| 揭露 | 無 | **把 Code 節點數量與理由寫進便條的建議事項與節點 notes**（第 7 章） |

---

## 2. 決策順序

每當準備用程式處理資料，依序問下面四個問題，**第一個答「可以」的就是答案**，不往後走。

| 順序 | 做法 | 判斷問題 | 答「可以」時 |
|---|---|---|---|
| 1 | 運算式（`{{ ... }}`） | 這件事能用一個運算式完成嗎？（只動一兩個欄位、字串處理、陣列的 `map` / `filter` / `join`、日期的 Luxon 運算） | 直接寫在需要該值的欄位裡 |
| 2 | Edit Fields（含箭頭函式） | 要多行、要中間變數，但仍是「對這一筆資料整形」嗎？ | 用 Edit Fields，值欄位寫運算式；需要多行時再用箭頭函式 |
| 3 | 原生節點 | n8n 有沒有專門處理這件事的節點？（分組統計、合併、比對、去重、排序、分頁、雜湊、檔案與標記語言轉換等，見第 3 章） | 用該節點，依 `NATIVE_NODES.md` 的設定 |
| 4 | Code 節點 | 以上都不行，而且屬於第 4 章的正當情境嗎？ | 才用 Code，並依第 5 章寫理由 |

補充：

- **第 3 步不確定時**，用 `search_nodes` 查，不要憑印象斷定「沒有」。官方 Skill 的提醒是：n8n 的原生節點比多數人以為的多。
- **官方的快速自測**：能不能把這個 Code 節點的工作描述成「拿這一筆資料，然後……」？如果可以，就是用錯工具。
- **箭頭函式要克制**：官方允許在 Edit Fields 用箭頭函式；但本 Pack 的 `n8n-code-to-native` 對「立即執行函式」較保守（認為那是換了形式的程式碼）。兩者取較保守者：先試著拆成兩個 Edit Fields，各放一個單行運算式；拆開仍很勉強，才用箭頭函式。判準是接手的人看不看得懂。
- **兩個節點湊在一起做一件事**（例如 Set 組輸入、Code 轉換），官方的建議是併成一個 Edit Fields；反過來，兩件不相干的轉換不要塞進同一個 Code。

---

## 3. 「工作 → 原生節點」速查表

**依據**：`skills/_vendor/n8n-node-configuration/NATIVE_NODES.md`（社群 Skill，各節點的設定範例）與 `skills/_vendor/n8n-code-nodes-official/SKILL.md`（官方，Crypto、XML 等）。節點 type 字串照這兩份檔寫的抄；typeVersion 改以 n8n 2.46.6 節點目錄的最新版本為準（見下方說明）。實際建構前要在使用者的 n8n 版本上核對（見第 9 章）。表中沒有 typeVersion 的列（例如 RSS），原本就未標。

> **版本欄位說明**：版本欄位為 n8n 2.46.6 的最新版本，僅供參考；實際以 [`docs/node-versions/<目標版本>.json`](../docs/node-versions/README.md) 為準，節點在該版本不存在時不得使用。

| 常見資料工作 | 原生節點 | type（typeVersion） | 依據 |
|---|---|---|---|
| 單一欄位轉換（大小寫、串接、取值） | 運算式 / Edit Fields | `n8n-nodes-base.set`（3.5；本 Pack 的 `n8n-code-to-native` 範例用 3.4） | 官方 code-nodes SKILL.md |
| 多行資料整形（`map`、`filter`、`reduce`、條件） | Edit Fields + 箭頭函式 | 同上 | 官方 code-nodes SKILL.md 與其 `references/ARROW_FUNCTIONS_IN_EDIT_FIELDS.md` |
| 分組統計、小計、計數（類似 `GROUP BY`） | Summarize | `n8n-nodes-base.summarize`（1.1） | NATIVE_NODES.md「Summarize」 |
| 把多筆資料收成一個陣列（組批次 API 內容、一則彙整訊息） | Aggregate | `n8n-nodes-base.aggregate`（1） | NATIVE_NODES.md「Aggregate」 |
| 把陣列欄位拆成一筆一筆 | Split Out | `n8n-nodes-base.splitOut`（1.1） | NATIVE_NODES.md「Split Out」 |
| 兩份資料合併、依欄位 join、多於兩路輸入 | Merge（`combine` 或 `combineBySql`） | `n8n-nodes-base.merge`（3.2） | NATIVE_NODES.md「Merge」 |
| 兩份資料比對差異、同步（新增／略過／更新／刪除） | Compare Datasets | `n8n-nodes-base.compareDatasets`（2.3） | NATIVE_NODES.md「Compare Datasets」 |
| 去重；輪詢時「只處理新資料」（跨執行） | Remove Duplicates | `n8n-nodes-base.removeDuplicates`（2；跨執行模式需要 v2） | NATIVE_NODES.md「Remove Duplicates」 |
| 排序、取前 N 筆 | Sort + Limit | `n8n-nodes-base.sort`（1）、`n8n-nodes-base.limit`（1） | NATIVE_NODES.md「Sort + Limit」 |
| 依條件過濾資料 | Filter | `n8n-nodes-base.filter`（2.4） | NATIVE_NODES.md「Filter, IF, Switch」 |
| 兩條分支 | IF | `n8n-nodes-base.if`（2.4） | 同上 |
| 多條分支 | Switch | `n8n-nodes-base.switch`（3.5） | 同上 |
| 日期加減、格式化、取區段、兩日期差 | Date & Time（或 Luxon 運算式） | `n8n-nodes-base.dateTime`（2） | NATIVE_NODES.md「Date & Time」；官方 code-nodes SKILL.md |
| 雜湊、HMAC、UUID、簽章（含雜湊二進位檔） | Crypto | `n8n-nodes-base.crypto`（2；v1 把密鑰存在 workflow 內，不要沿用） | NATIVE_NODES.md「Webhook signature」；官方 code-nodes SKILL.md |
| Webhook 簽章核對 | Webhook（`rawBody`）+ Crypto + IF | `n8n-nodes-base.webhook`（2.2）等 | NATIVE_NODES.md「Webhook signature」 |
| XML ↔ JSON | XML | `n8n-nodes-base.xml`（1） | NATIVE_NODES.md「Files and markup」；官方 code-nodes SKILL.md |
| 擷取網頁內容、組 HTML 表格或頁面 | HTML | `n8n-nodes-base.html`（1.2） | NATIVE_NODES.md「Files and markup」 |
| Markdown ↔ HTML | Markdown | `n8n-nodes-base.markdown`（1） | 同上 |
| 檔案（CSV、XLSX、PDF、JSON 等）解析成資料 | Extract From File | `n8n-nodes-base.extractFromFile`（1.2） | 同上 |
| 資料轉成檔案（CSV、XLSX、JSON、HTML 等） | Convert to File | `n8n-nodes-base.convertToFile`（1.2） | 同上 |
| 有分頁的 API | HTTP Request 內建分頁選項（有該服務的專屬節點時，先用專屬節點） | `n8n-nodes-base.httpRequest`（4.5） | NATIVE_NODES.md「HTTP Request pagination」 |
| 取資料表最新或前幾筆 | Data Table 的 `get`，用 `orderBy` 與 `limit` | `n8n-nodes-base.dataTable`（1.1） | NATIVE_NODES.md「Data Table get」 |
| 只處理第一筆；沒資料時分支仍要繼續 | 節點設定 `executeOnce`、`alwaysOutputData` | 節點頂層設定，不是獨立節點 | NATIVE_NODES.md「Node settings」 |
| 每一筆都要呼叫一次某個節點 | 不需要迴圈：多數節點本來就逐筆執行 | — | `n8n-loops-official` SKILL.md |
| 解析 RSS | RSS Read 節點 | type 以 `search_nodes` 查到的為準 | NATIVE_NODES.md「Files and markup」 |

這張表不求窮盡。表上沒有的工作，回到第 2 章第 3 步，用 `search_nodes` 查。

---

## 4. 正當使用 Code 節點的情境

官方 Skill 的立場是「門檻高，但不是『絕對不要』」；下列情境可以用 Code，不必道歉，但仍要寫理由（第 5 章）：

1. **跨多個來源、對整批資料一次計算**：同時讀好幾個上游節點（`$('A').all()`、`$('B').all()`）、要建立查找表、累加器，再套用到第三份資料。官方指出，硬寫成運算式會變成「一行超長、無法除錯」的運算式。
2. **需要跨項目的狀態或多步驟中間結構**：單筆工具（運算式、Edit Fields）碰不到的建構。
3. **沒有原生對應的自訂邏輯**：例如多種格式包裝的 LLM 輸出、需要 try/catch 加正規式備援的解析器；由迴圈組出的巢狀物件（例如依欄位與關鍵字動態組成的過濾條件）；逐筆依資料形狀分支（IF 只能分流整批，不能逐筆判斷形狀）。這幾項取自 `n8n-code-to-native` 的「保留為 Code」清單。
4. **複雜重塑超出運算式的能力**：先確認過第 2 章前三步都試過、而且拆成兩個 Edit Fields 也不行。
5. **需要外部函式庫**：Code 節點可用有限的函式庫清單（官方 Skill 提到 `lodash`、`crypto`、`luxon`）；運算式不行。但先確認不是 Crypto 節點或 Luxon 運算式就能做的事。
6. **原生節點沒有暴露的細節**：例如官方指出的非標準簽章方式、需要「防時序攻擊」的比對（`NATIVE_NODES.md` 明講這屬於 Code 例外），且 `httpCustomAuth` 憑證也不適用。這類情形少見，要寫清楚。
7. **管線規定的測試注入節點**：`code2n8n-pipeline` §1.7 要求「從外部讀取」的節點旁並列一個預設停用的 `[TEST]` Code 節點。這是管線的設計約定，算正當用途，但仍計入 Code 節點數，理由寫「測試注入，預設停用」即可。

**不算正當的情形**：Code 在做運算式就能做的事、或原生節點已經做的事（官方列出的反模式：用 Code 轉大寫、用 Code 組 Email 內文、用 `new Date()` 格式化日期、`require('crypto')` 算雜湊、XML 節點解析完又接一個 Code 抽欄位）。

---

## 5. Code 節點的註解寫法

1. **用了 Code 節點，AI 會在該節點的 `notes` 寫一行「為什麼不能用原生節點」。** 這與 [`references-disclosure.md`](references-disclosure.md) 第 7 章一致：節點 notes 只在非顯而易見處寫、說明原因；Code 節點本身天然屬於「需要說明」的節點，所以每一個都寫，不適用「顯而易見就留空」。這一行就是 `native-first:code-node` 這條建議在節點層級的記錄（寫法同 [`references-disclosure.md`](references-disclosure.md) §4.4）。
2. **理由要具體，點出評估過哪個原生節點、為什麼不行。** 建議格式（與 `NATIVE_NODES.md` 的 `Why Code:` 寫法同方向）：

   ```text
   為什麼用 Code：已評估 <原生節點或 Edit Fields>，<不能用的具體原因>
   ```

   例如「已評估 Extract From File，檔案是固定寬度格式，沒有對應選項」。一到三句為限，同第 7.1 節第 5 點。需要時可同時設定 `notesInFlow: true`，讓理由直接顯示在畫布上。
3. **寫不出具體理由，就是沒有正當理由，AI 會退回改用原生節點。** 「比較方便」「我比較熟」「一個節點就搞定」都不是理由。使用者明確要求用 Code 時，照使用者的決定處理，在「建議事項」標「使用者選擇不採用」，不需要使用者補理由。
4. **Code 節點的程式碼本身也建議有簡短註解**：開頭用一兩行說明這個節點做什麼、輸入輸出長什麼樣；段落之間用註解分隔。對齊第 7.1 節第 4 點：不寫程式的接手者也要能讀懂意圖。AI 不會把機密或內網位址寫進註解（資安掃描會掃 `jsCode` 欄位）。
5. **notes 與 Layer 3 便條的分工不變**：節點 notes 放「為什麼用 Code」這一行；較長的說明放 Layer 3 便條的「節點選型」段。

---

## 6. 產生前閘門（給 AI 的步驟）

在**建立節點之前**，對規劃好的整份 workflow 做一次，不是做完才補：

1. **列出**：把規劃中「打算用 Code（或寫程式）」的每個步驟列成一張清單。包含「先用 Set 組資料再用 Code 轉換」這種兩個節點湊在一起的做法。
2. **逐一過決策順序**：每個步驟依第 2 章四個問題判斷，必要時用 `search_nodes` 與第 3 章速查表。
3. **能原生就原生**：能用運算式、Edit Fields 或原生節點的，改掉，並依 `NATIVE_NODES.md` 設定（設定前用 `get_node` 在目標版本核對參數）。
4. **剩下的才用 Code**：對照第 4 章；每個寫 notes 理由與程式註解（第 5 章）。
5. **建完重新計數**：可用 `scripts/native-first-check.mjs` 對最終的 workflow JSON 產生 N／M 與建議（建議式，不影響退出碼，見 6.1）；也可自行從 JSON 數出 Code 類節點（`n8n-nodes-base.code`，以及舊的 `n8n-nodes-base.function`、`n8n-nodes-base.functionItem`）的個數 N 與全部節點數 M（不含 sticky note）。逐一確認每個 Code 節點都有 notes。
6. **記進註解**：依第 7 章，把 Code 節點說明寫進 Layer 3 便條的「建議事項」。

建置途中若又新增了 Code 節點，回到第 2 步補過一次。計數與核對可用 `scripts/native-first-check.mjs` 產生（建議式，不影響退出碼）；沒有腳本可用時，才由 AI 自行依 JSON 手算。

### 6.1 檢查腳本（建議式）

```bash
node scripts/native-first-check.mjs [--format text|json] <workflow.json> [...]
node scripts/native-first-check.mjs --glob "examples/**/*.workflow.json"
```

- **輸出**：Code 節點數 N、全部節點數 M（分母不含便條，另列含便條的總數供參考）、有程式碼文字的數量、有 notes 的數量；N 為 0 時輸出「未使用 Code 節點」。每個 Code 節點一行，標示 `reason: noted`（notes 已有內容，視為已說明理由，不再提醒）或 `reason: missing`（僅資訊）。
- **建議**：只有符合保守規則的節點，才多一行 `suggest: ... 可能可改用 <原生節點>（<type>）`。跨執行狀態、讀環境變數、含迴圈或錯誤處理、Python、行數較長的節點一律不給建議。
- **不影響退出碼**：檔案可讀、可解析就退出 0；只有讀不到、不是合法 JSON、或沒有符合的檔案時退出 2。沒有 error 或 warning，只有 `info` 與 `suggest`；不認得的旗標會被忽略，沒有會讓它失敗的旗標。
- **不印程式碼**：只印節點名稱與建議。

範例（夾具 `scripts/__test__/native-first-rename.workflow.json`）：

```text
== scripts/__test__/native-first-rename.workflow.json
info:    節點 3 個（不含便條；含便條共 4 個）
info:    Code 節點：1 個／全部 3 個（有程式碼文字 1 個、有 notes 0 個）
info:    [Rename Fields] reason: missing
suggest: [Rename Fields] 可能可改用 編輯欄位 Edit Fields (Set)（n8n-nodes-base.set）；樣式比對的提醒，可能有誤，是否採用由你決定
---
Summary: 1 file(s) · Code 節點 1 個／全部 3 個（不含便條）· 有 notes 0 個 · 1 則建議
```

- **建議的精確率與限制**：腳本只用樣式比對，提出「可能可由某原生節點取代」，不宣稱主類別（研究文件 §7 的人工校驗中，「可取代」判斷合理約 95%，但主類別只吻合約 65%）。我們對 13,947 個範本的實測：27,074 個有程式碼文字的 Code 節點中有 3,055 個（約 11.3%）符合規則（其中 135 個已寫 notes，不再提醒），約為研究文件嚴格估計（9,449 個，34.9%）的三分之一，因為腳本另加了行數、控制流程等限制，寧可少提醒。從建議中隨機抽 60 個由一人讀程式碼判斷，合理 58 個（約 97%）；另抽專用節點類 24 個，合理 22 個（約 92%）。樣本小、判斷者只有一人，誤差至少數個百分點，請當作提醒而非判決。腳本看不到上下游節點，也不執行程式碼；是否採用仍依第 2 章與第 5 章。

---

## 7. 建議事項裡的 Code 節點說明

Code 節點的說明是**建議事項**的一條，不是獨立的收尾項目。位置、順序、狀態名稱與便條格式，一律依 [`references-disclosure.md`](references-disclosure.md) 第 4 章（§4.3、§4.4），本章只定義這一條的內容。

### 7.1 規則編號與內容

這一條的規則編號是 `native-first:code-node`，寫在 Layer 3 便條「建議事項」區塊，與資安建議同樣一條一行：

用了 Code 節點：

```markdown
- `native-first:code-node`：已採用（Code 節點：<N> 個／全部節點 <M> 個）
  - <節點名稱>：<理由>
```

沒有用：

```markdown
- `native-first:code-node`：已採用（未使用 Code 節點）
```

- **狀態**：已評估原生節點並寫了理由，記「已採用」；使用者明確要求在可由原生節點完成的地方用 Code，記「使用者選擇不採用」。
- **N 與 M 的算法**：N 是 Code 類節點（`n8n-nodes-base.code`、`n8n-nodes-base.function`、`n8n-nodes-base.functionItem`）的個數；M 是全部節點數，不含 sticky note。停用中的節點仍計入，並在理由寫明「預設停用」。
- **理由**要與該節點 notes 寫的一致，不另編一套。
- **對話摘要**用白話。對非技術使用者可寫成「有 2 個步驟是用程式寫的（共 14 個節點），原因寫在便條與節點備註裡」；完整的節點名稱與理由以註解為準。
- 為了讓 N 看起來少而把一個 Code 節點拆成幾個、或換成其他節點類型來包裝同樣的程式碼，並不會讓 workflow 更好懂，也會讓註解失真；計數以最終 JSON 為準。

### 7.2 與其他區塊的關係

「建議事項」區塊同時承載資安建議與本條，順序與其他區塊（參考來源、資安掃描結果）見 [`references-disclosure.md`](references-disclosure.md) §4.1。若 workflow 經修改又重掃，Code 節點計數也要以最後一次為準重數。

---

## 8. 實證參考

本 Pack 彙整的 13,947 個 n8n.io 公開範本中（數字出處：[`../research/node-frequency.md`](../research/node-frequency.md) 的 §1、§4）：

- Code 是第 2 常用的節點，出現在 60.4% 的範本（8,423 / 13,947）。
- 共有 29,882 個 Code 節點，約占全部節點的 9.6%（占非便條節點的 13.0%）。其中 27,074 個帶有程式碼文字，是用途分類的分母。

這說明 Code 節點在社群範本中非常普遍。至於這些 Code 節點實際在做什麼、有多少可以改用原生節點，請見 [`../research/n8n-templates-code-vs-native.md`](../research/n8n-templates-code-vs-native.md)。該文件將提供「社群範本中 Code 節點的用途分布與可由原生節點取代的估計區間」。**本規格不引用該文件的比例數字**；需要時請直接讀該文件，並照它寫的方法與限制引用。

這些都是描述性統計與估計，不是品質評分，也不是「社群範本寫錯了」的結論：公開範本是寫給別人看的，成因很多（舊版本當時沒有對應節點、作者習慣、快速示範等）。

---

## 9. 限制

1. **原生節點依 n8n 版本而異。** 目標版本沒有該節點、或沒有需要的選項時，要照實說明，並退回 Code；理由寫進 notes（例如「目標版本沒有 Compare Datasets」）。第 3 章的 typeVersion 是 n8n 2.46.6 的值，建構前以 `docs/node-versions/<目標版本>.json` 為準，並以 `get_node` 在使用者版本核對（查表的用法與重產方式見 [`../docs/node-versions/README.md`](../docs/node-versions/README.md)）；使用者的版本資訊依 [`references-disclosure.md`](references-disclosure.md) 第 3 章 ⑤ 取得。
2. **樣式比對只是提醒，不是禁止。** 即使 AI 或腳本認為某個 Code 節點「看起來可以改用原生節點」，最後仍由第 2 章的判斷與第 5 章的理由為準；有具體理由的 Code 節點是合法的。
3. **不要為了避開 Code，把簡單邏輯拆成十幾個節點。** 可讀性優先。如果改成原生節點要接近十個節點、而一段十行的註解清楚的 Code 比較好懂，就在 notes 寫明這個取捨，保留 Code。節點數過多本身也不利維護（見 `tigerai-qa-mode` 對 workflow 規模的提醒）。
4. **本規格不改變既有轉換流程。** 「使用者要求把 Code 轉成原生節點」仍走 `n8n-code-to-native`；本規格管的是產生時的預設，以及產生後的自我檢查。
5. **Execute Command 節點在 n8n 2.x 預設不載入。** 我們在 2.37.3、2.44.6、2.46.6 三個預設設定的全新實例的節點目錄中都查不到它（見 [`../docs/node-versions/DIFF-2.37.3-to-2.46.6.md`](../docs/node-versions/DIFF-2.37.3-to-2.46.6.md)），但舊範本可能仍會用到；遇到時照第 1 點處理，不要照抄進新 workflow。
6. **不處理 AI 代理節點中的工具型 Code**：本規格針對一般資料處理的 Code 節點；LangChain 系列節點的自訂工具程式，另依 AI 節點的官方 Skill 判斷，不在本規格計數範圍內。

---

## 10. 正例與反例

### 正例 1：整段都能用原生節點

需求是「每天把訂單依客戶加總金額，通知前 10 名」。AI 規劃時一度想用一個 Code 節點迴圈累加後排序。過了閘門：分組加總是 Summarize、排序加取前 10 是 Sort 加 Limit，三個原生節點完成，沒有任何程式碼。便條的「建議事項」寫「`native-first:code-node`：已採用（未使用 Code 節點）」。

### 正例 2：保留 Code，並寫明理由

需求包含「解析 LLM 的回覆」，回覆有好幾種包裝格式，且失敗時要用正規式撈出 JSON 區段。AI 評估過 Edit Fields 與運算式，備援邏輯分支太多，運算式會變成難以閱讀的一行。保留一個 Code 節點，notes 寫「為什麼用 Code：已評估 Edit Fields 運算式，多種回覆格式的 try/catch 與正規式備援寫成運算式難以閱讀」，程式開頭有兩行註解說明輸入輸出。便條的「建議事項」寫「Code 節點：1 個／全部節點 12 個」，並列出該節點與同一句理由。

### 反例 1：為有原生對應的事寫 Code，又沒寫理由

收到 Webhook 後，AI 用一個 Code 節點 `require('crypto')` 計算 HMAC 來核對簽章，節點沒有 notes，程式也沒有註解。**錯在哪**：HMAC 有 Crypto 節點可用（搭配 Webhook 的 `rawBody` 與 IF），官方 Skill 把這列為最常見的誤用；而且違反第 5 章的 notes 與註解規則。**改正**：改用 Webhook（開 `rawBody`）加 Crypto 加 IF；便條的「建議事項」寫「`native-first:code-node`：已採用（未使用 Code 節點）」。

### 反例 2：矯枉過正

一段只有三行的欄位整形，AI 為了避開 Code，拆成十幾個 Set、IF 與 Merge 節點，畫布變得難以閱讀。**錯在哪**：違反第 9 章第 3 點，可讀性反而更差。**改正**：改成一個 Edit Fields，值欄位用運算式（必要時用箭頭函式）；不需要 Code，也不需要十幾個節點。

---

**版本**：v1.1
**狀態**：規範草案。第 8 章引用的 `research/n8n-templates-code-vs-native.md` 由另一份工作產出；在它定稿前，本規格只引用 `research/node-frequency.md` 已有的數字。
