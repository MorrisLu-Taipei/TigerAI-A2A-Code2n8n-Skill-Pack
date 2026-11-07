---
name: tigerai-qa-mode
description: Activates a 5-stage guided Q&A interview to help users describe their automation in plain natural language when they don't know how to start. Use when the user says "啟用問答模式", "Q&A mode", "問答模式", "我不會寫便利貼", "請帶我寫流程", "我不知道怎麼描述", or asks for guided help building an n8n workflow. Drives the conversation stage-by-stage in everyday language (no technical jargon shown to the user) until enough info is collected to generate a workflow.
---

# TigerAI Q&A Mode — 引導式需求收集

> 🌐 [English](SKILL.en.md) | **繁體中文**

## 1. 觸發條件

**精確觸發詞**（使用者明示）：
- 「啟用問答模式」 / 「進入問答模式」 / 「Q&A mode」 / 「問答模式」
- 「我不會寫便利貼」 / 「請帶我寫流程」 / 「一步步問我」 / 「我不知道怎麼描述」

**隱式觸發**（AI 主動建議）：
當使用者描述需求 < 20 字、或缺關鍵資訊（不知何時觸發 / 要做什麼 / 結果送哪）時，AI 應主動詢問：
> 「要不要進入問答模式，我帶你一步步寫？」

> 💬 **整段對話中 AI 不講技術術語**：不講 webhook / cron / DSL / Layer / @trigger 等字眼，全用使用者聽得懂的話（「外部系統送資料來」「固定時間跑」「填表單」）。

---

## 2. 五階段提問流程

每階段有**最大提問題數**，避免疲勞轟炸。回答模糊時提供範例選項。

### 階段 1：觸發（最多 2 題）

**Q1.1**：這個流程什麼時候要執行？
- A. 收到外部系統的請求（webhook）
- B. 固定時間執行（每天、每週、每小時）
- C. 我手動點 Run
- D. 使用者填表單
- E. 收到 Email

**Q1.2**（依 A 答）：請告訴我這個 webhook 的路徑名稱（例：`/order`、`/github-event`）。
**Q1.2**（依 B 答）：多久跑一次？例：每天 08:00 / 每 15 分鐘。
**Q1.2**（依 D 答）：表單需要哪些欄位？

→ 完成後 AI 回顯：`@trigger: webhook POST /order`

---

### 階段 2：輸入資料（最多 2 題）

**Q2.1**：觸發後會帶進來哪些資料？
- 若 webhook：請給範例 JSON（或敘述欄位）
- 若 schedule：通常無輸入，可跳過
- 若 form：直接用上一階段欄位

**Q2.2**（選做）：這些資料中哪些是必要的？哪些可空？

→ AI 回顯：`@input: { order_id, amount, customer_email }`

---

### 階段 3：步驟（**最多 7 步**，每次只問 1 個下一步）

採**循環提問**。AI 重複以下迴圈直到使用者說「沒了」：

```
AI: 收到資料後，第 1 步要做什麼？
使用者: 驗證金額大於 0
AI: [紀錄 @step] 然後呢？
使用者: 寫到資料庫
AI: 哪個資料庫？哪張表？需要寫哪些欄位？
使用者: Postgres，orders 表，整筆寫進去
AI: [紀錄 @step] 還有下一步嗎？
使用者: 沒了
```

**重要規則**：
- 每記一個 `@step`，AI 用一句話複述「目前我理解的流程」
- 使用者隨時可說「上一步改成 X」、「插入一步在第 2 步前」

**步數上限與處置**：
- **第 5 步起**：AI 主動詢問「目前已 5 步，剩下還有多少？要不要先把目前 5 步整理成主 workflow，剩下放 sub-workflow？」
- **第 7 步硬上限**：AI 強制建議拆 sub-workflow：
  > 「已達 7 步建議的上限。複雜流程拆成多個 workflow 比較好維護。我建議：
  >  - 主 workflow：保留前 N 步（你決定）
  >  - sub-workflow：剩下用 `executeWorkflowTrigger` 串接
  >  你希望怎麼拆？」
- 使用者堅持單一 workflow → AI 服從但 Layer 3 必標「節點數預期 > 25，不利維護」

**原生節點優先（設計階段提醒）**：規劃與複述步驟時，先想 n8n 有沒有原生節點能做（例如彙總用 Summarize、排序加取前幾名用 Sort 與 Limit、合併兩份資料用 Merge），不要預設「這一步寫程式」。這是 AI 內部的規劃原則，**不要**對使用者提 Code 節點、原生節點等術語；使用者描述的步驟若看起來需要自訂程式，用白話問清楚實際要的結果即可。依據與判斷順序見 [`spec/native-first.md`](../../../spec/native-first.md)，閘門與揭露由交棒後的 `sticky-note-to-workflow` 執行。

---

### 階段 4：輸出（最多 2 題）

**Q4.1**：處理完成後要把結果送去哪？
- A. Slack 通知
- B. 寄 Email
- C. 寫回 webhook 回應
- D. 不需要對外輸出（已經在 step 寫 DB 了）

**Q4.2**（依答）細節：channel 名 / 收件人 / 訊息模板

→ AI 回顯：`@output: slack #ops "..."`

---

### 階段 5：錯誤處理（最多 1 題）

**Q5.1**：執行失敗時怎麼辦？
- A. 忽略，下一次再說（適合非關鍵）
- B. 通知我（Slack / Email）
- C. 自動重試 N 次後再通知
- D. 我不確定 → AI 採「通知 + 重試 3 次」預設

→ AI 回顯：`@on-error: slack #ops-alert + retry 3`

---

## 3. 結束階段：產出便利貼草稿並請使用者確認

5 階段完成後，AI **不立即產 workflow**，而是先給出**自然語言便利貼草稿**並請使用者確認。**草稿一律用使用者聽得懂的話**，不可出現 `@trigger` / `@step` 等技術標籤：

```text
## 【AI 整理你的需求】請確認

[一句話總結你想做的事]

什麼時候跑：[時間 / 事件]
要做什麼：
  1. ...
  2. ...
  3. ...
結果送到哪：[Email / Slack / DB / ...]
失敗怎辦：[忽略 / 通知 / 重試]

==========
✅ 確認無誤 → 我立即幫你產出完整 workflow
✏️ 要修改哪裡？告訴我即可（用你的話講就好）
```

確認後才呼叫 `sticky-note-to-workflow` Skill 產出 workflow。後者會在內部把這段自然語言轉成嚴謹技術格式（DSL），但**整個過程使用者完全不會看到 DSL**。

### 完成後：參考來源、建議事項與掃描結果

本 Skill 自己不產生 workflow，這一段分成兩部分：

- **在哪個步驟做**：問答過程中，若曾參考任何資料來給選項或建議（例如拿某個 cookbook 範例說明、經使用者同意查了 n8n.io 範本），記進「參考紀錄」；沒有參考就不記，不補。使用者確認草稿、交棒給 `sticky-note-to-workflow` 時，把參考紀錄一併交出。
- 把參考來源、建議事項與掃描結果寫進 Layer 3 便條與相關節點 notes，對話只放摘要，這一步由 `sticky-note-to-workflow` 的 Step 8 負責；本 Skill 不重複掃描。順序、格式與誠實規則依 [`spec/references-disclosure.md`](../../../spec/references-disclosure.md) 第 4 章。
- 使用者中途離開（例如「我自己寫」）而沒有產出 workflow 時，不需要這一段。給使用者看的摘要用白話，不講技術術語（維持第 1 章的原則）。

---

## 4. 對話準則

1. **一次只問一題**（除非高度相關，最多兩題）
2. **提供選項時用 A/B/C/D**，使用者回 "B" 即可，降低打字成本
3. **隨時可回頭**：使用者說「上一題改 X」就改
4. **隨時可跳出**：使用者說「我自己寫」→ AI 退出問答模式
5. **不要假設**：使用者沒說的就問，不要腦補預設值
6. **語言一致**：使用者用中文就用中文，用英文就用英文

---

## 5. 結合其他 Skill

問答模式產出 Layer 1 後，自動鏈接：
- `n8n-node-configuration`：填節點參數
- `sticky-note-to-workflow`（Phase 3 待實作）：產生三層結構 JSON
- `n8n-validation-expert`：驗證輸出

---

## 6. 反模式（避免）

- ❌ 一口氣問完 5 階段（會嚇跑使用者）
- ❌ 收完答案就直接產 workflow（沒給確認機會）
- ❌ 用技術術語問（「你要用 webhook 還是 IMAP？」→ 改問「外部系統怎麼通知你？」）
- ❌ 問答中途擅自啟動其他模式
