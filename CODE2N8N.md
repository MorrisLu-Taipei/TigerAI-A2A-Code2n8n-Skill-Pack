# Code2n8n — 宣言 / Manifesto

> 為什麼這個 Skill Pack 從 v0.21.0 起改名為 **TigerAI Code2n8n Skill Pack**？
> 因為 n8n 在 AI Coding 時代的價值，已經從「No-Code 工具」升級成「企業可治理的工作流層」。
> *by n8n Taipei Ambassador Morris Lu*

---

## n8n 還是 No-Code 工具嗎？

在 Claude Code、Codex、Antigravity 出現之後，我認為世界上已經沒有真正的 No-Code。

使用者只要畫一張圖、講一個故事，AI 就能完成系統設計、API 串接、Agent、自動化腳本。

既然 AI 都會寫程式了，企業為什麼還需要 n8n？

有趣的是：**我的客戶不但沒有放棄 n8n，反而更願意使用它。**

不是他們不會寫程式，也不是 n8n 比 AI 更聰明。而是因為企業真正需要的，從來就不只是「把程式寫出來」。

## 程式寫完，企業的問題才剛開始

- 使用者要怎麼登入？
- 每次執行品質怎麼確認？
- 出錯時，問題出在哪一步？
- 參數要修改？修改後會影響哪些系統？
- 怎麼版本控制？怎麼回到上一個穩定版本？
- 誰在什麼時間做了什麼，留得下紀錄嗎？
- IT、營運、主管能不能看同一張圖談話？
- 同事離開後，下一個人接得住嗎？

AI 很會把程式寫出來。

但企業需要的不是一段「今天能跑」的程式，而是一套**明天仍然能登入、能管理、能修改、能稽核、能交接**的系統。

## 我們客戶的做法

先用 Claude Code 把需求快速變成可執行的程式。

接著用 **TigerAI Code2n8n Skill Pack** 把程式系統轉成 n8n 工作流。

```text
業務需求
  → 圖片 / 故事 / 自然語言
  → Claude Code 寫出程式
  → Code2n8n 分析系統
  → 轉成 n8n Workflow
  → 接入企業身份、權限、資料、治理
```

Code2n8n 不是把每一行 Python 翻成 n8n 節點。它幫企業重新分派：**哪些留在程式（最會跑邏輯）、哪些上升成流程節點（最會被看與管）**。

## n8n 也是異質系統的整合層

企業裡從來不會只有一套系統：ERP、CRM、MES、HR、各種 DB、Email、Sheets、SaaS、地端 LLM、雲端 AI、自家 Python 服務……

AI 寫得出個別模組，但**模組之間怎麼安全地交談**才是企業真正的挑戰。

n8n 把每個程式、每個 Agent、每套系統視為可重複使用的模組，靠 API / Webhook / DB / Queue 編排在一起 — 順序、觸發、重試、逾時、通知、人工核准、執行紀錄，全部變成可看見的節點。

```text
ERP ─┐
CRM ─┤
MES ─┤
DB  ─┼→ n8n Workflow → AI Agent / LLM → 結果回寫
API ─┤
SaaS─┘
```

## AI Coding 與 n8n 的新分工

| 維度 | Claude Code / Codex / Antigravity | Code2n8n + n8n |
| --- | --- | --- |
| 自然語言需求 → 程式 | 強 | 輔助 |
| 複雜演算法 | 強 | 呼叫既有服務 |
| 視覺化流程 | 弱 | 強 |
| 修改執行參數 | 改程式 | 流程節點直接調 |
| 執行紀錄 / 重試 / 通知 | 自行開發 | 內建 |
| 跨系統串接 | 可開發 | 可視化編排 |
| 營運交接 | 靠工程文件 | 流程本身就是交接介面 |
| 企業治理 | 額外建設 | 接身份 / 權限 / 紀錄 / 政策 |

## 在這個 Pack 裡，Code2n8n 怎麼落地？

**Marquee skill**：
- **[`skills/tigerai/code-to-workflow/`](skills/tigerai/code-to-workflow/SKILL.md)** — Code → n8n Workflow 的方法論主腦：7 步驟（盤點 → 分區 → core+entry → 前端決策樹 → workflow 設計 → 3 層驗證漏斗 → 文件範本）+ 真實雷點清單 + 三個實證案例導讀

**配套 skill**：
- **[`skills/tigerai/n8n-code-to-native/`](skills/tigerai/n8n-code-to-native/SKILL.md)** — Code 節點微觀去 JS 化（marquee skill 的下游）
- **[`skills/tigerai/sticky-note-to-workflow/`](skills/tigerai/sticky-note-to-workflow/SKILL.md)** — 從零意圖（非既有程式碼）→ workflow
- **[`skills/tigerai/tigerai-enterprise-patterns/`](skills/tigerai/tigerai-enterprise-patterns/SKILL.md)** — 4 大企業治理模式

**三大實證案例**（marquee skill 從這三份案例的真實踩坑經驗中淬煉而成）：
- **[`examples/google-workspace-admin-workflow/`](examples/google-workspace-admin-workflow/)** — 1,373 行 Apps Script → n8n 完整移植，含逐行出處 `PROVENANCE.md`
- **[`examples/line-ai-customer-service/`](examples/line-ai-customer-service/)** — Netlify + Supabase 雲端版 → n8n + approach C 自托管後台
- **[`examples/line-ai-customer-service-onprem/`](examples/line-ai-customer-service-onprem/)** — **同一系統的地端 Docker 演化版**（MIT 練習案例，⚠️ **不可上線**，安全層有重大缺陷見其 [`SECURITY-CAVEATS.md`](examples/line-ai-customer-service-onprem/SECURITY-CAVEATS.md)）：Postgres + Redis + Qdrant + Ollama + RAG，37 節點 n8n 動態大腦，含 5 階段 V&V 與 5 個實戰雷點 + 安全缺陷揭露。對照另一個雲端版，可以看「同一程式可以走不同 Code2n8n 路徑」

- **[`examples/tigerai-flagship/`](examples/tigerai-flagship/)** — 三大旗艦範例：原子化編排、Universal Worker、Skill-Driven 整合

## 結論

**以前**我們用 n8n 來避免寫程式。

**現在**我們用 AI 寫程式，再用 Code2n8n 與 n8n，讓程式真正進入企業。

> **AI Coding 解決「功能怎麼做」；Code2n8n 解決「功能如何模組化」；n8n 解決「模組如何與整個企業協作」。**

---

## English

### Is n8n still a No-Code tool?

After Claude Code, Codex, and Antigravity, there is no real No-Code anymore. AI can write the system, the API integration, the Agent, the script — from a picture, a story, a paragraph of intent.

**So why do my customers want n8n *more*, not less?**

Because what enterprises need was never just "code that runs today." They need code that can be **logged into, audited, parameter-tweaked, version-controlled, rolled back, handed off, governed across systems, and read by IT + ops + managers on the same canvas** — tomorrow, next quarter, next succession.

### The Code2n8n workflow

```text
business need
  → picture / story / natural language
  → Claude Code generates the program
  → Code2n8n analyzes the system
  → emits an n8n Workflow
  → plugged into enterprise identity, permission, data, governance
```

Code2n8n doesn't translate every Python line into n8n nodes. It re-partitions the system: **what stays as code (best at logic), what becomes a workflow node (best at being seen and managed)**.

### n8n as the heterogeneous integration layer

Enterprises run ERP + CRM + MES + HR + DBs + Email + Sheets + SaaS + on-prem LLMs + cloud AI + bespoke Python services. AI writes individual modules. n8n is **how those modules talk safely to each other** — orchestrated by API / Webhook / DB / Queue, with order, triggers, retries, timeouts, alerts, human approvals, and execution history rendered as visible nodes.

### The new division of labour

| Dimension | Claude Code / Codex / Antigravity | Code2n8n + n8n |
| --- | --- | --- |
| Natural language → code | Strong | Assists |
| Complex algorithms | Strong | Calls existing services |
| Visual workflow | Weak | Strong |
| Tweaking runtime params | Edit code | Adjust a node |
| Execution log / retry / alert | DIY | Built-in |
| Cross-system wiring | Possible | Visual orchestration |
| Handover | Engineering docs | The workflow *is* the handover |
| Governance | Extra build | Identity / permission / history / policy connectors |

### Closing line

> **AI Coding solves "how is the function built"; Code2n8n solves "how is the capability modularized"; n8n solves "how the modules cooperate across the whole enterprise."**
