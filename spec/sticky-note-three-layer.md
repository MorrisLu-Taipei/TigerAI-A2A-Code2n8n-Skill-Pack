# Sticky Note 三層結構規範 v1.1

> 🌐 [English](sticky-note-three-layer.en.md) | **繁體中文**

> **適用對象**：使用本 Skill Pack 的終端使用者、AI Agent、整合工程師
> **核心約束**：每一個由 AI 產生的 n8n workflow 必須符合本規範的三層結構

---

## 1. 三層結構總覽

每個 workflow 在 n8n 畫布上由**三條垂直軌道（lanes）**構成，以 `position.y` 區分：

```
┌────────────────────────────────────────────────────────────────┐
│  Layer 1 — USER INTENT (上方)            y ≈   -300 ~  -50    │
│  使用者親手寫下的 sticky notes           顏色：黃色 (color=4)  │
│  AI 視為「需求規格」，不得修改                                │
├────────────────────────────────────────────────────────────────┤
│  Layer 2 — WORKFLOW NODES (中間)         y ≈     0  ~  500    │
│  AI 產生的真實 nodes 與 connections                           │
│  所有 Trigger / Logic / Action / Output 節點皆在此            │
├────────────────────────────────────────────────────────────────┤
│  Layer 3 — AI COMMENTARY (下方)          y ≈   600  ~  900    │
│  AI 回寫的 sticky notes                  顏色：藍色 (color=5) │
│  紀錄：節點選型理由、credential 需求、測試建議、限制          │
└────────────────────────────────────────────────────────────────┘
```

### 為什麼三層？
- **可審查**：人類審閱者可一眼分辨「需求 vs 實作 vs AI 註記」。
- **可追溯**：當 workflow 出問題時，能比對「使用者原意」與「AI 詮釋」是否一致。
- **可迭代**：使用者只需更新 Layer 1，重跑 AI 即可重生 Layer 2/3，Layer 1 永遠是 source of truth。

---

## 2. Layer 1 — USER INTENT（使用者寫）

### 2.1 技術定義
- Node type：`n8n-nodes-base.stickyNote`
- `parameters.color = 4`（黃色）
- `position.y` 介於 `-300` 至 `-50`
- **AI 看到 color=4 即知道這是使用者輸入，禁止修改或移動**

### 2.2 內容規範（DSL，詳見 `sticky-note-dsl.md`）

每張 Layer 1 sticky note 必須包含至少 1 個 DSL 區塊。最小可解析範例：

```markdown
## 流程意圖
@flow: 收訂單 → 驗證 → 通知

@trigger: webhook POST /order
@step: 驗證 amount > 0
@step: 寫入 Google Sheet
@step: 發 Slack 通知 #ops
@on-error: 寄信給 admin@example.com
```

### 2.3 多張 sticky note 的順序
- 多張 Layer 1 sticky note 依 `position.x`（由左至右）依序解讀。
- AI 視為單一連續需求文件。

---

## 3. Layer 2 — WORKFLOW NODES（AI 寫）

### 3.1 規範
- 所有非 sticky-note 節點皆屬此層。
- `position.y` 介於 `0` 至 `500`。
- 節點的 `notes` 欄位**只在非顯而易見的設定才寫**，內容是「為什麼這樣設定」（寫法見 [`references-disclosure.md`](references-disclosure.md) 第 7 章）；顯而易見的節點留空。
- **針對該節點的建議也寫在這裡**（資安建議、原生節點優先、Code 節點為什麼不用原生節點等），簡短一行，用規則編號；寫法見 [`references-disclosure.md`](references-disclosure.md) §4.4。同樣只在需要提醒時寫。
- 節點與 Layer 1 `@step` / `@trigger` 的對應，不靠逐節點的 `notes`，而是由 Layer 3 便條的「節點選型」與「對應使用者需求」承擔（見 §4.2）。若某個節點的 `notes` 剛好需要說明它對應哪個 `@step`，可順帶註明。
- `connections` 必須完整、無孤立節點。

### 3.2 對應規則
| Layer 1 DSL | Layer 2 推論 |
|---|---|
| `@trigger: webhook ...` | `n8n-nodes-base.webhook` |
| `@trigger: schedule ...` | `n8n-nodes-base.scheduleTrigger` |
| `@trigger: form ...` | `n8n-nodes-base.formTrigger` |
| `@step: 驗證 X` | `n8n-nodes-base.if` 或 `code` 節點 |
| `@step: 寫入 Google Sheet` | `n8n-nodes-base.googleSheets` |
| `@step: 發 Slack ...` | `n8n-nodes-base.slack` |
| `@step: 呼叫 API ...` | `n8n-nodes-base.httpRequest` |
| `@step: AI 分類 ...` | `@n8n/n8n-nodes-langchain.agent` 或 OpenAI 節點 |
| `@on-error: ...` | Error Trigger workflow 或節點層級 `continueOnFail` |

> 完整對應表見 `sticky-note-dsl.md` 第 4 章。

---

## 4. Layer 3 — AI COMMENTARY（AI 寫）

### 4.1 技術定義
- Node type：`n8n-nodes-base.stickyNote`
- `parameters.color = 5`（藍色）
- `position.y` 介於 `600` 至 `900`
- 每個 workflow **至少一張**，建議按 Layer 2 區段對齊位置擺放多張

### 4.2 必含內容（Markdown 模板）

```markdown
### 🤖 AI 實作說明 — <對應 Layer 1 區塊名稱>

**參考來源**
- <逐類列出，格式與「沒有參考外部範本」的寫法見 references-disclosure.md §4.3>

**建議事項**
- `<規則編號>`：<已採用／使用者選擇不採用／尚未能自動檢查>（<一句話說明，可省略>）
- 不適用：`<規則編號>`、`<規則編號>`
- （沒有任何建議時整個區塊寫「建議事項：無」）

**資安掃描結果**
- <規則名稱> @ <節點名稱>（<error／warning／已知悉>）；沒有命中寫「未發現規則命中」；格式見 references-disclosure.md §8.3

**節點選型**
- `<node-type>`：選用原因（為何不選 alternatives）

**所需 Credentials**
- [ ] <credential-name>：<說明此 credential 在哪個節點使用>

**前提假設**
- 假設 1：<例如：Google Sheet 的 columns 已存在>
- 假設 2：<例如：Slack channel #ops 已建立並授權給 bot>

**測試建議**
1. <最小可驗證測試案例>
2. <錯誤路徑測試案例>

**已知限制**
- <例如：未實作 rate-limit retry，若 API 超量會直接失敗>

**對應使用者需求**
- 逐條列出 Layer 1 的每個 `@trigger` / `@step` / `@on-error`，並標明由哪個節點（以節點名稱）實作：`@step: ...` → `<節點名稱>`

**修改記錄**
| 日期 | 變更摘要 | 提出者 | 原因 |
|---|---|---|---|
| <YYYY-MM-DD> | 建立 | <使用者或 AI> | <原因> |
```

「參考來源」「建議事項」「資安掃描結果」三個區塊緊接在標題之後，順序固定；內容規則、狀態名稱、便條精簡規則與 JSON 字串規則，**一律依 [`references-disclosure.md`](references-disclosure.md) 第 4 章**，本檔不重複。這三個區塊是建議與資訊的**正式紀錄**，對話只放摘要。多張 Layer 3 便條時，放在最左邊那張。模板最後的「修改記錄」是必備段落，規則見 §4.4。

### 4.3 為何強制？
- 使用者可在不看程式碼的情況下，理解 AI 做了什麼決策。
- 後續維運者（不一定是 AI）有交接文件。
- 出事時可區分「AI 誤解需求」vs「需求本身有缺陷」。

### 4.4 修改記錄（必備段落，缺少只提醒）

Layer 3 說明便條新增必備段落「**修改記錄**」，放在模板最後（多張 Layer 3 便條時，與「參考來源」「建議事項」「資安掃描結果」同一張，也就是最左邊那張）。它讓核准人與日後維護者在 workflow 本身就看得到歷程；workflow 匯出後會與 Git 分離，所以不能只放在 Git 歷史。

格式：表格或清單皆可，每列含四項。

| 欄位 | 內容 |
|---|---|
| 日期 | `YYYY-MM-DD` |
| 變更摘要 | 一句話說做了什麼；新建 workflow 的第一列固定寫「建立」 |
| 提出者 | 「使用者」或「AI」 |
| 原因 | 為什麼要改（一句話） |

範例（表格；清單寫法例如 `- 2026-11-07 建立（AI，依需求產生初版）` 也可以）：

```markdown
**修改記錄**
| 日期 | 變更摘要 | 提出者 | 原因 |
|---|---|---|---|
| 2026-11-07 | 建立 | AI | 依 Layer 1 需求產生初版 |
| 2026-11-08 | 新增錯誤處理分支 | 使用者 | 失敗時需要通知維運 |
```

使用規則：

1. **新建 workflow**：第一列為「建立」。
2. **修改既有 workflow**（不論是使用者要求或 AI 主動修正）：**必須新增一列**；只新增，不改寫、不刪除舊列，最新的放最下面。同一 workflow 已有 Layer 3 便條時（§7 第 3 點），覆寫後也保留既有的修改記錄，再新增一列。
3. **不得寫入機密**：不寫金鑰、權杖、密碼、內網位址、個資或完整指令內容；變更摘要寫「改了什麼」，不貼參數值。
4. **提出者**只寫「使用者」或「AI」；使用者要求 AI 修改的，寫「使用者」。
5. 日期取修改當天；不確定當天日期時，向使用者確認，不自行編造。
6. **這只是建議**：缺少「修改記錄」段，或有標題卻沒有任何一列資料，掃描器只提醒（`notes:missing-change-log`，severity `info`，見 [`security-guardrails.md`](security-guardrails.md) 2.15），不阻擋、不使檢查失敗。使用者不想要時，照使用者的決定，可在節點 notes 以 `guardrail-ack: notes:missing-change-log` 表示知悉。
7. **掃描器怎麼辨識**：標題為「修改記錄」（或「修改紀錄」）、`Change log`、`Changelog`，且該段落內至少一列含 `YYYY-MM-DD` 日期。完全沒有 Layer 3 便條時，這條不重複提醒。
8. **與實際變更是否相符**，Pack 內無法判斷（需要與前一版比對），由管線在 PR 層級比對（之後的工作）；因此 AI 寫記錄要如實，不要為了通過提醒而補一列與實際變更不符的內容。

---

## 5. 顏色語意總表

| color 值 | 用途 | 誰可寫 |
|---|---|---|
| 4 (黃) | Layer 1 — 使用者需求 | 使用者 |
| 5 (藍) | Layer 3 — AI 說明 | AI |
| 7 (綠) | （保留）人類維運者後續補充 | 人類維運者 |
| 6 (紅) | （保留）標示已知 BUG / 待辦 | 任何人 |
| 1–3 | 不使用，避免歧義 | — |

---

## 6. `@on-error` 兩種實作模式

n8n 有兩種錯誤處理機制。AI 必須依 Layer 1 描述選對：

### 模式 A：節點層級 `continueOnFail`（同一 workflow 內）
- **適用**：單一節點失敗不應中斷，後續分支自行處理（如 Test 3 Telegram bot）
- **實作**：在會失敗的節點設 `"continueOnFail": true`，後接 `if` 判斷 `$json.error` 分流
- **限制**：只處理該節點失敗，不能 catch 整 workflow 例外

### 模式 B：Error Trigger workflow（跨 workflow）
- **適用**：整 workflow 任何節點失敗都要通報（如 Test 2 排程任務）
- **實作**：另建一個 workflow，trigger 使用 `n8n-nodes-base.errorTrigger`，在「Settings → Error Workflow」綁定到主 workflow
- **限制**：是獨立 workflow，無法在同一 JSON 內表達；AI 必須在 Layer 3「已知限制」明示「請另建 Error Trigger workflow」

### AI 選擇規則
| Layer 1 描述 | 用模式 |
|---|---|
| 「失敗時 fallback 回某動作」「失敗回預設值」 | A |
| 「失敗時通知 oncall」「整個流程失敗就警示」 | B |
| 「失敗時重試 N 次」 | 節點 retry config（與 A 結合） |
| 模糊（只寫 `@on-error: slack ...`）| A 嘗試；無對應失敗節點則改 B 並標註 |

---

## 7. 違反規範的處置

AI 在解析 workflow 時，若遇到下列情境**必須拒絕生成並回報**：

1. 找不到任何 color=4 的 sticky note → 「沒有需求輸入」
2. Layer 1 DSL 解析失敗（無任何 `@trigger`）→ 「需求格式不正確」
3. 同一 workflow 內已存在 color=5 的 sticky note → 「workflow 已被 AI 處理過，是否要覆寫？」（需使用者確認；覆寫時保留既有的「修改記錄」並新增一列，見 §4.4）

---

## 8. JSON 片段範例

### Layer 1（使用者寫）
```json
{
  "id": "sticky-user-1",
  "name": "使用者需求",
  "type": "n8n-nodes-base.stickyNote",
  "typeVersion": 1,
  "position": [0, -200],
  "parameters": {
    "color": 4,
    "width": 400,
    "height": 200,
    "content": "## 流程意圖\n@trigger: webhook POST /order\n@step: 驗證 amount > 0\n@step: 寫入 Google Sheet"
  }
}
```

### Layer 3（AI 回寫）
```json
{
  "id": "sticky-ai-1",
  "name": "AI 實作說明",
  "type": "n8n-nodes-base.stickyNote",
  "typeVersion": 1,
  "position": [0, 700],
  "parameters": {
    "color": 5,
    "width": 400,
    "height": 420,
    "content": "### 🤖 AI 實作說明\n\n**參考來源**\n- 沒有參考外部範本，依需求與 Pack 內建規格設計\n- 骨架與統計知識：research/patterns.md §2.1 webhook-api\n- 原廠／社群 Skill：無\n- 目標 n8n 版本：未指定（依 docs/n8n-version-compat.md 的實測範圍）\n\n**建議事項**\n- `secret:hardcoded`：已採用（Google Sheets 憑證由 n8n 憑證機制引用）\n- `webhook:no-auth`：使用者選擇不採用\n- `native-first:code-node`：已採用（未使用 Code 節點）\n- 不適用：form:no-auth、exec:ssh\n\n**資安掃描結果**\n- 規則式掃描（不代表沒有其他風險）：0 項命中，1 項已知悉\n  - `webhook:no-auth` @ Webhook（已知悉）\n\n**節點選型**\n- `webhook`：對應 @trigger\n- `if`：檢查 amount\n- `googleSheets`：append 模式\n\n**所需 Credentials**\n- [ ] Google Sheets OAuth2\n\n**測試建議**\n1. POST 合法 amount → 應寫入\n2. POST amount=-1 → 應被 if 擋下\n\n**修改記錄**\n| 日期 | 變更摘要 | 提出者 | 原因 |\n|---|---|---|---|\n| 2026-11-07 | 建立 | AI | 依 Layer 1 需求產生初版 |"
  }
}
```

---

**版本**：v1.1
**狀態**：規範鎖定，後續 cookbook、DSL、Skill 皆以本檔為準。v1.1 的 Layer 3 模板新增「參考來源」「建議事項」「資安掃描結果」三個區塊，定義在 [`references-disclosure.md`](references-disclosure.md) 第 4 章。後續增補（ADR-014）：Layer 3 模板新增必備段落「修改記錄」（§4.4），缺少只提醒。
