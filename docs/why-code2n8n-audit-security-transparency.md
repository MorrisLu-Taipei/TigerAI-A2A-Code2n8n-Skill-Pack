# 為什麼 Code2n8n 能補足 AI Coding 的稽核 / 安全 / 透明可控性

> **本文起源**：2026-06-19 v3 Form HITL 案例。Claude（本 Pack 維運 AI）連卡 4 輪沒跑通；使用者轉求 Codex；Codex 一輪解；事後 ship v0.34.1。這個故事剛好把 Code2n8n 比純 AI Coding 多出的價值講透 — 本文以此為背景拆解。
>
> **適合誰看**：考慮用 AI Coding 但又擔心「AI 寫的東西怎麼治理」的工程主管 / 稽核窗口 / 法遵 / 客戶決策者。

---

## 1. 過程 — 6 月 19 日這天到底發生什麼

### 1.1 開場：v0.34.0「ship 完」

我（Claude，主筆 AI）為 einvoice 案例做出第 3 版作廢核可 workflow — 用 n8n 內建 HTML Form 取代 Slack（台灣不愛 Slack）。**Layer 1 V&V 全綠**：

```
JSON parse: PASS (1 file)
security-scan.mjs: 0 error / 1 warning（webhook:no-auth 已 documented）
live-roundtrip.mjs: 1/1 ok（n8n 接受該 JSON）
```

v0.34.0 commit + push 出去：[`einvoice-void-with-approval-v3-form-native.workflow.json`](../examples/einvoice-n8n/workflows/einvoice-void-with-approval-v3-form-native.workflow.json)。

### 1.2 我嘗試 Layer 2 runtime smoke — 連卡 4 輪

| 輪 | 我做了什麼 | 症狀 |
| --- | --- | --- |
| 1 | trigger webhook → 拿 form URL → 提交表單 | n8n 報 `Node 'Stamp correlation' hasn't been executed` |
| 2 | 改用 `$execution.customData.set/get` 持久化 state | n8n 報 `voidState not in customData` |
| 3 | 改用 `$getWorkflowStaticData('global')` + 用戶手動 copy correlationId | n8n 報 `Unused Respond to Webhook node found in the workflow` |
| 4 | 刪掉 Respond to Webhook 節點 + Webhook 改 `responseMode: lastNode` | n8n 報 `Problem submitting response — Please try again or contact support` |

每一輪都比上一輪更深入「Wait form mode 把 state 丟掉」這個錯誤假設。我已準備寫 briefing 建議「Wait form 是死路，應改用 Form Trigger 子 workflow」。

### 1.3 使用者轉手給 Codex

> 「A 先試。如果不行 你寫完整的報告 我請 codex 幫你查」

我寫了一份[完整 briefing](../examples/einvoice-n8n/tests/v0.34-form-hitl-codex-briefing.md)（5 個假設、4 輪症狀、2 個 exec 的完整 runData、6 個關鍵檔案路徑、5 個給 Codex 的具體問題）。

### 1.4 Codex 一輪解

Codex 一查 docker container access log 看到 POST 路徑 `/webhook-waiting/525`，立刻認出 root cause：

> **n8n Wait `resume:webhook` 用 `$execution.resumeUrl` → `/webhook-waiting/{id}`**
> **n8n Wait `resume:form` 用 `$execution.resumeFormUrl` → `/form-waiting/{id}`**
>
> 兩條走不同 controller，互不接受對方 payload。我從 v2 Slack 版本拷貝 `$execution.resumeUrl` 到 v3 Form 的 Email 連結 — POST 跑去 `/webhook-waiting/`，但 form session 註冊在 `/form-waiting/`，form 提交永遠失敗。
>
> **我前 4 輪繞 state 持久化全是繞錯問題**。Wait form mode 本身會自動把 upstream runData 寫到 DB 並在 resume 時 reload，根本不需要 customData / staticData。

Codex 給的 7 點修法 + 我 ship v0.34.1：n8n 2.10.3 實機跑 **approve + reject 兩條分支 end-to-end finished:true**，svc /v1/void 該被呼叫的呼叫、該被跳過的跳過。

### 1.5 收尾 — 教訓寫入持久層

- **CHANGELOG v0.34.1** 完整紀錄：Codex 救援、我 6 項錯誤盤點、最關鍵教訓「反覆失敗時先檢查 transport，再檢查 logic」
- **SECURITY-REVIEW SEC-9 v3 status**：🟡 DRAFTED（v0.34.0，當時未跑通）→ ✅ FIXED via v3 Form native pattern (Codex-rescued)（v0.34.1）
- **Codex briefing** 加 RESOLVED 頂端區塊 + 保留原始撞牆紀錄供參考
- **Memory feedback `feedback_n8n_resume_url_variables`**：跨 session 規則寫入

---

## 2. WHY — 這個故事為什麼能證明 Code2n8n 的價值

純 AI Coding 的世界裡，這 4 輪繞路會怎樣？

### 2.1 假設這是純程式碼專案，不是 n8n workflow

那就是一段 Node.js / Python / Go 程式碼裡有個 `fetch(resumeUrl, ...)` 呼叫。Bug 一樣會發生 — AI coder 拷貝錯變數 — 但**沒有以下 7 樣東西**：

| 項目 | n8n 給的 | 純程式碼專案沒有 |
| --- | --- | --- |
| **節點層 runData** | n8n `/api/v1/executions/{id}?includeData=true` 直接回每個節點的 input/output JSON | 要自己塞 log，跑完就沒，重現失敗要重跑整個 service |
| **transport access log** | n8n 在 docker container stdout 印每筆 webhook/form POST 的路徑 | 要自己加 middleware，預設沒有 |
| **執行 trace 可視覺化** | n8n UI 在 workflow 圖上把成功/失敗節點直接著色，點下去看 input/output | 看 stack trace，看 line number |
| **state 跨 boundary 機制** | n8n 內建 Wait form 自動 reload upstream runData | 自己 implement persistence layer，自己處理 race condition |
| **HITL（人在迴圈）一級公民** | Wait node 內建支援 form/webhook/timer | 要自己接 webhook、自己驗 signature、自己處理 resume |
| **可逐節點重跑** | n8n UI 右鍵單一節點「Execute Node」 | 要 mock 上下文 + 重跑函式 |
| **JSON schema 共通標準** | 整個 workflow 就一個 JSON 檔，跨 AI 看得懂 | 跨 AI 要解釋專案結構、build 系統、執行入口 |

### 2.2 跨 AI 救援這件事

本案我（Claude）→ Codex 的救援能在**幾分鐘內完成**，靠的是 4 個東西：

1. **n8n executions API** — Codex 不需要看 Claude 的 console.log，直接抓 runData
2. **docker container access log** — Codex 不需要看 Claude 的程式碼，直接 grep POST 路徑
3. **workflow JSON** — Codex 不需要建環境跑 build，直接讀 schema
4. **共通的 n8n docs** — Codex 跟 Claude 都在同一個官方 docs site 上找 `$execution.*` 變數

**這 4 樣東西純程式碼專案都沒有等價物**。純程式碼換手要傳 repo、傳環境、傳 build 指令、傳測試帳號 — 跨 AI 不會這麼乾淨。

### 2.3 v0.34.0 我自己 push 卻沒跑通 — 為什麼這不是大災難

關鍵：**Pack 內已有兩層治理機制硬擋我**。

- **§1.6 lexical schema-before-claim rule**：提出通過或可部署的主張前，須先填 V&V evidence schema。v0.34.0 的 SECURITY-REVIEW SEC-9 v3 因此標為 **🟡 DRAFTED，尚未跑通**，不是 ✅ FIXED。
- **§10 V&V two-layer gate** 把 Layer 1（structural）跟 Layer 2（runtime）分開 — Layer 1 過≠ runtime 過。v0.34.0 我承認「Layer 1 過、Layer 2 PENDING tracked-as v0.34.x」

**結論**：Pack 的規則設計，**即便維運 AI 自己撞牆，外界仍能從 SECURITY-REVIEW 文件看出「這版 v3 還沒 runtime 驗證」**。下游 user 不會誤把 v0.34.0 當「可生產」用。等 v0.34.1 跑通才升 ✅ FIXED。

---

## 3. 優勢 — Code2n8n 比純 AI Coding 多出什麼

整理成決策者可以拿去跟內部說的 4 條：

### 3.1 ✅ 稽核（Audit）

| 面向 | Code2n8n + n8n stack | 純 AI Coding |
| --- | --- | --- |
| 執行 trace | n8n executions API 永久存，每節點 input/output 全 JSON 可回查 | log 滾沒了；要重現故障要重跑整個 service |
| 安全狀態變遷 | SECURITY-REVIEW.md 每個 SEC-NNN 三個欄位（v0.27.0 status、v0.28.0 status、…）形成 timeline | git log 找 commit + 跨 file diff，沒有系統化的「這個風險的狀態演進」表 |
| 跨版本 traceability | workflow name 含 `[Claude #N v0.X.Y YYYY-MM-DD]`（SKILL §1.5.2）— 在 n8n UI 一眼對得回 SECURITY-REVIEW 該版本 status | 沒這個標準 |
| 人/AI 行為 audit | CHANGELOG 寫「Claude 撞 4 輪 / Codex 一輪解 / 我 6 項錯誤盤點」是社會學 audit trail | 通常被「fix typo」這種 commit message 掩蓋 |

**本案實證**：v0.34.0 → v0.34.1 整個過程 — 我的錯誤假設、4 輪繞路、Codex 介入、修法、雙分支 runtime 驗證 — 全部留 trace。任何人事後想稽核「為什麼這支 workflow 寫成這樣」可以從 [Codex briefing RESOLVED 區](../examples/einvoice-n8n/tests/v0.34-form-hitl-codex-briefing.md) + [CHANGELOG v0.34.1](../CHANGELOG.md) + [memory feedback](../../../memory/feedback_n8n_resume_url_variables.md) 三層回讀完整故事。

### 3.2 ✅ 安全檢查（Security）

| 面向 | Code2n8n + n8n stack | 純 AI Coding |
| --- | --- | --- |
| Pre-commit 結構掃描 | `scripts/security-scan.mjs` 抓 webhook 無 auth、hardcoded 密鑰、`$execution.resumeUrl` 出現在外部訊息等模式 | 看人自己有沒有掛 lint / SAST |
| 兩層 V&V 把關 | Layer 1（structural：parse + scanner + roundtrip）+ Layer 2（runtime：tsc/負面測試/端到端 smoke）— 強制兩層都過才能宣稱 validated（§1.6）| 通常是「CI 綠 = 可上」 |
| 變數使用安全 | scanner 與 SKILL 對「Wait resume URL 用對變數」有明文規則（v0.34.1 後寫入 memory + briefing）| 沒類似清單 |
| 人在迴圈核可 | n8n 內建 Wait + Form / Slack sendAndWait / Email sendAndWait — 三條官方路徑，security review 對每條都有 SEC-NNN trace | 自己接 webhook + 自己驗 signature + 自己接 audit DB — 每家寫法不同 |

**本案實證**：
- v0.34.0 我自己 push「修好」但實際沒跑 runtime — **§1.6 lexical rule 把我擋下**，SECURITY-REVIEW 強制標 🟡 DRAFTED，外界看得出來
- v3 三條 HITL 寫法（v1 DIY / v2 Slack native / v3 Form native）各自有對應 SEC-9 status block，**user 可依其 IM 環境挑** — 不用憑感覺
- 真實人在迴圈跑通：approve 走 svc /v1/void、reject 跳過 svc，audit row 兩條分支都寫，**符合「作廢不可逆 → 必須有真人 approver」的法遵設計**

### 3.3 ✅ 透明可控性（Transparency & Controllability）

| 面向 | Code2n8n + n8n stack | 純 AI Coding |
| --- | --- | --- |
| 視覺化 | n8n UI 把 workflow 畫成節點圖，每個節點點下去看設定、看 input/output。**非工程的稽核 / 主管能讀** | 看程式碼。非工程讀不懂 |
| 改動 | 改某個節點不需要重 deploy 整個 service。可以視覺化「先 disable 這個節點看看」 | 改一行要重 build、重 deploy、重跑 CI |
| 暫停 / 恢復 | Wait node 一級公民。可以做「等 4 小時、等真人按按鈕、等外部 event」 | 自己接 queue / Temporal / step functions |
| HITL 嵌入 | 3 套官方寫法（Slack sendAndWait / Form / Email sendAndWait）+ Pack 內 3 個案例 workflow + V&V 雙分支實測 | 從 0 開始接 |
| 跨節點重跑 | n8n UI 「Execute Node」單跑 + 「Pin Data」固定上游輸出 | mock + 單元測試自己寫 |

**本案實證**：v3 workflow 12 個節點，user 在 n8n UI 看得到每個節點的位置 + 連線。修 Code 節點 jsCode 是「點開 → 改 → save」幾秒鐘的事，不用重 deploy 任何東西。docker container access log 是免費附贈的 transport 透明度。

### 3.4 ✅ 跨 AI Coder 互通（Inter-AI Handoff）

這是本案最戲劇性的證明。**我 → Codex 救援過程**靠 4 樣標準介面：

1. **workflow JSON**（傳給 Codex 看 schema）
2. **n8n executions API runData**（Codex 看每節點輸出）
3. **docker container access log**（Codex 一眼看到 POST 路徑錯）
4. **n8n 官方 docs**（兩個 AI 都查同一個 source）

純程式碼專案傳給另一個 AI 看，要 setup repo + 跑 build + 跑 test + 提供測試 credential — 換手成本高，常常另一個 AI 看一眼就決定「重寫」而非「修」。**n8n 場景的換手成本是分鐘級**。

對企業意義：**「下游 vendor 鎖死特定 AI 廠商」的風險小很多**。今天 Claude 寫的，明天 Codex 可以接；後天 Gemini 也可以接。

---

## 4. 總結 — Code2n8n 在 AI Coding 時代的定位

### 4.1 我們不是「替代 AI coding」

Pack 名字叫 **Code2n8n** 不叫 **Anti-Code** 是有原因的。AI Coder 該寫程式的地方繼續寫（svc 業務邏輯、SDK、複雜演算法）。Code2n8n 處理的是**程式邊界**：

- 進入點：API webhook / schedule / chat trigger
- 流程編排：retry、容錯、A/B 路由、HITL 核可
- 出口：寫 Sheet / 寫 DB / 發 IM / 寄信
- 稽核：每筆 execution 留 trace
- 治理：SECURITY-REVIEW + V&V gate

這些邊界事務塞回程式碼裡會散落、會被「重構」掉、會被新人/新 AI 看不懂。塞到 n8n 裡是**單一可視 / 可稽核 / 可治理的層**。

### 4.2 我們證明的是「AI Coding 需要一個可治理底盤」

本案故事最關鍵的一句：**即使維運 AI 沒跑通，使用者仍能從 SECURITY-REVIEW 看出當時的版本沒有執行證據**。

- AI 會犯錯（我 6 項假設全錯）
- AI 會自我合理化（我準備寫 briefing 推「改 Form Trigger」是錯誤結構性轉向）
- AI 換手要乾淨介面（執行 trace / transport log / schema）

**Pack 的 §1.6 lexical rule、§10 V&V two-layer gate、SECURITY-REVIEW 三欄位、Codex briefing 模板、memory feedback 系統** — 這套機制不是「相信 AI 不會犯錯」，而是「假設 AI 一定會犯某種錯，先把治理機制架好，犯錯時被擋下、被外界看見、留下教訓」。

### 4.3 給決策者的一句話

> 「給 AI Coder 一支筆，沒人會反對。但**請給它一個可稽核的執行底盤**。本案故事證明：底盤架對了，AI 自己撞牆都能被擋下 + 被救援 + 變成下次的教訓。底盤沒架對，AI 一個拷錯變數就能把『核可路徑』壞掉而沒人發現。」
>
> Code2n8n 提供的就是這個底盤。

---

## 5. 延伸閱讀

- [v0.34.1 CHANGELOG](../CHANGELOG.md) — 本案 release notes（誠實版）
- [Codex briefing RESOLVED](../examples/einvoice-n8n/tests/v0.34-form-hitl-codex-briefing.md) — 本案完整撞牆紀錄 + Codex 修法 + 教訓
- [SECURITY-REVIEW SEC-9](../examples/einvoice-n8n/SECURITY-REVIEW.md) — 同一個 risk 在 v0.27.0 → v0.34.1 的 5 次 status 變遷
- [SKILL §1.6 lexical schema-before-claim rule](../skills/tigerai/code2n8n-pipeline/SKILL.md) — 強制 evidence 寫在 claim 之前的 lexical regulation
- [v1 / v2 / v3 三套 HITL workflow](../examples/einvoice-n8n/workflows/) — 同一個風險 3 種對應做法
- [memory feedback_n8n_resume_url_variables](../../../memory/feedback_n8n_resume_url_variables.md) — 跨 session 鎖入的教訓
