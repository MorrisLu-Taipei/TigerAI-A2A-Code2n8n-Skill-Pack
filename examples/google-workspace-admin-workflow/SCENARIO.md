# 情境故事 / Scenario Stories

> 看到 n8n 裡 7 個 `[Claude ...] GW-Admin / ...` 卡片不知道哪張負責什麼？這份文件用「王老師收到公文 → 系統替她做了什麼」的真實情境把每個 workflow 串起來。

---

## 速查表 — n8n 看到的 workflow 名字 vs 一句話用途

| n8n 上看到的名字 | 角色 | 一句話用途 |
| --- | --- | --- |
| `GW-Admin / Core / One-time Setup` | **核心邏輯** | 全校第一次裝這套系統時，**IT 主任手動跑一次**，建立 Drive 目錄與總控表 |
| `GW-Admin / Core / Project Starter` | **核心邏輯** | 「收到公文 → 自動建專案資料夾」的完整邏輯。**不被人工觸發**，由兩個 entry 之一呼叫 |
| `GW-Admin / Core / Milestone` | **核心邏輯** | 「給既有專案加一個關鍵日期」的完整邏輯。**不被人工觸發**，由兩個 entry 之一呼叫 |
| `GW-Admin / Entry (n8n Form) / Project Starter` | **入口** | 把 n8n 內建的「公文專案啟動表」公開網址給承辦人填，送出後呼叫 core/Project Starter |
| `GW-Admin / Entry (n8n Form) / Milestone` | **入口** | 把 n8n 內建的「專案階段日期新增表」公開網址給承辦人填，送出後呼叫 core/Milestone |
| `GW-Admin / Entry (Google Forms) / Project Starter` | **入口** | 走 Google Forms：表單送出 → Apps Script 推 webhook → 這條 workflow 接收 → 呼叫 core/Project Starter |
| `GW-Admin / Entry (Google Forms) / Milestone` | **入口** | 同上，但走的是「專案階段日期新增表」 |

**Core / Entry 拆兩層** — Entry 是「人怎麼把資料送進來」，Core 是「進來後系統做了什麼」。同一個 core 被多個 entry 共用，邏輯只寫一份。

---

## 主角

**王老師** — 國中教務處資訊組長，負責研習、評鑑、AI 教育推廣等行政專案。一年大概要辦 10–20 個專案，每個都有公文、簽到、照片、成果報告、經費核銷要管。
**林主任** — 學校資訊主任。本系統的「管理員」，負責一開始把 n8n 與 Google Workspace 串起來。
**陳會計** — 出納兼會計，會看總控表來核對經費期限。

---

## 情境 A — 校內第一次安裝（一輩子做一次）

### 故事

> 4 月初。林主任剛裝好校內 n8n、辦好 Google Cloud Console，要開始用這套半自動系統。她開啟 Drive，建了一個資料夾 `學校行政專案`，記下它的 folder ID。

### 觸發

**林主任** 開 n8n → 找到 `[Claude 2026-05-19] GW-Admin / Core / One-time Setup` → 在 `Config` 節點貼上 folder ID → 按 **Execute Workflow**。

### Workflow 跑什麼

```
Manual
  ↓
Config                  ← 林主任填的 ROOT_FOLDER_ID 進入流程
  ↓
Explode subfolders      ← 把 5 個根層子資料夾名稱攤成 5 個 items
  ↓
Search subfolder        ← Google Drive：找 root 下這個名字的資料夾在不在
  ↓
If missing?
  ├ true  → Create missing folder    ← 不在就建一個（Drive node）
  └ false → (skip)
  ↓
Collect root folders                  ← 5 個 id 收成 name→id map
  ↓
Create 行政專案總控表                 ← Google Sheets：建一份新試算表
                                       含兩個分頁：行政專案總控表 / 專案階段日期紀錄
  ↓
Carry control sheet id
  ↓
Feed 總控表 header data
  ↓
Write 總控表 header row              ← Sheets append：第 1 列寫入 20 欄 header
  ↓
Feed 階段紀錄 header data
  ↓
Write 階段紀錄 header row            ← Sheets append：第 1 列寫入 17 欄 header
  ↓
Get sheet numeric ids                 ← ⚠️ HTTP：取得分頁的內部 sheetId
                                          （後續 batchUpdate 需要）
  ↓
Build format batchUpdate body
  ↓
Apply header formatting              ← ⚠️ HTTP：對兩個分頁的第 1 列套用
                                         粗體 + 淺藍背景 + 凍結列
                                         （原生節點不支援這個操作）
  ↓
Move control sheet to 02             ← Drive：把總控表搬進 02_專案總控表 資料夾
  ↓
Return setup result                   ← 印出 CONTROL_SHEET_ID 給林主任記下
```

### 林主任看到的成果

打開 Drive，原本只有空資料夾 `學校行政專案`，現在裡面多了：

```
學校行政專案/
├── 01_公文專案啟動表/          (空，留給之後手動或自動放 Google Forms)
├── 02_專案總控表/              ← 內含「行政專案總控表」試算表
├── 03_專案資料夾/              (空，之後每個專案會在這建一個子資料夾)
├── 04_專案階段日期新增表/      (空)
└── 06_Apps Script/             (空，留給 Apps Script bridge 部署檔)
```

點開「行政專案總控表」，已經有兩個分頁、header 都填好、第 1 列粗體淺藍底、凍結。

林主任把 `CONTROL_SHEET_ID` 複製下來，貼到接下來要設定的 4 個 entry workflow 的 Config 節點裡，並啟用其中她需要的兩個（例如 n8n Form 版的兩個）。

**接下來這份 workflow 一輩子不再跑**。

---

## 情境 B — 王老師收到公文，建立新專案

### 故事

> 5 月 1 日上午。王老師桌上躺著一份新公文：「教育部辦理 AI 融入教學研習，請各校於 6 月 20 日前完成校內培訓並繳交成果」。承辦人是她。

她不再像以前那樣手動建資料夾、複製範本、設行事曆 — 而是打開林主任給她的網址：

```
https://n8n.school.local/form/gw-admin-project-starter
```

填寫：

| 欄位 | 她填的值 |
| --- | --- |
| 專案年度 | 115 |
| 承辦處室 | 教務處 |
| 專案名稱 | AI融入教學研習 |
| 承辦人 | 王怡君 |
| 承辦人Email | <wang@school.local> |
| 公文主旨 | 教育部 AI 融入教學研習 |
| 來文單位 | 教育部 |
| 公文文號 | 教研字第 1150512 號 |
| 活動日期 | 2026-06-10 |
| 成果繳交期限 | 2026-06-20 |
| 經費核銷期限 | 2026-07-15 |
| 是否有經費 | 是 |
| 核定或預估金額 | 30000 |

按送出。

### 觸發

n8n Form Trigger（這就是 `Entry (n8n Form) / Project Starter` workflow 的觸發點）。

### Workflow 跑什麼

#### 第一段：在 `[Claude ...] GW-Admin / Entry (n8n Form) / Project Starter`

```
公文專案啟動表 (n8n Form Trigger)   ← 王老師按送出
  ↓
Config + normalize                    ← 把表單欄位 + 林主任預填的
                                        ROOT_FOLDER_ID / CONTROL_SHEET_ID
                                        包成 {data, config} 物件
  ↓
Call core                              ← Execute Workflow：呼叫下面那條
  ↓
Done                                   ← 回 200 給瀏覽器
```

王老師看到的瀏覽器：「✅ Form submitted」。然後她去泡了杯咖啡。

#### 第二段：背景跑 `[Claude ...] GW-Admin / Core / Project Starter`

```
When Called                              ← 接到 {data, config}
  ↓
Prepare                                  ← Code 節點，計算所有衍生值
                                            - projectCode = 115-教務處-0501093045
                                            - folderName  = 115_教務處_AI融入教學研習
                                            - docName     = …_專案紀錄
                                            - 11 個子資料夾名稱
                                            - Doc 9 段 heading 索引
                                            - 待辦表 10 列預設任務
                                            - 檢核表 10 列預設項目
                                            - 5 個 Calendar events 規格
                                            - 總控表新列模板
  ↓
Find 03_專案資料夾                       ← Drive：找出 03_專案資料夾 的 id
  ↓
Resolve 03 folder id
  ↓
Create project folder                    ← Drive：建立 115_教務處_AI融入教學研習/
  ↓
Carry project folder
  ↓
Explode subfolder list                   ← 11 個子資料夾名稱 fan out
  ↓
Create subfolder                         ← Drive：跑 11 次，建 00_~99_
  ↓
Collect subfolder ids
  ↓
Create project Doc                       ← Docs：建一份空 Doc「..._專案紀錄」
  ↓
Carry Doc id
  ↓
Doc batchUpdate (HTTP — heading styles)  ← ⚠️ HTTP：把 9 段 heading + TITLE
                                              + 所有正文一次寫進去
                                              （原生節點做不到 paragraph style）
  ↓
Move Doc to 99_系統產生文件              ← Drive：把 Doc 搬進 99 子資料夾
  ↓
Carry Doc URL
  ↓
Create 待辦追蹤表                        ← Sheets：建一份新試算表
  ↓
Carry task sheet id
  ↓
Fan out task rows                        ← 11 列 (header + 10 task) fan out
  ↓
Append task rows                         ← Sheets：一口氣 append 11 列
  ↓
Task sheet batchUpdate (HTTP)            ← ⚠️ HTTP：套用 I 欄狀態 dropdown
                                              + 標題列粗體 + 凍結列
  ↓
Move task sheet to 99                    ← Drive：搬進 99 子資料夾
  ↓
Create 成果檢核表                        ← Sheets：建另一份試算表
  ↓
Carry checklist sheet id
  ↓
Fan out checklist rows
  ↓
Append checklist rows                    ← Sheets：append 11 列 (header + 10)
  ↓
Checklist batchUpdate (HTTP)             ← ⚠️ HTTP：套用 C 欄狀態 dropdown + 格式
  ↓
Move checklist to 99
  ↓
Expand calendar events                   ← 5 個 event spec fan out
  ↓
Create Calendar event                    ← Calendar：跑 5 次建 all-day event
                                            - 【活動日】… (6/10)
                                            - 【成果期限】… (6/20)
                                            - 【成果前7天提醒】… (6/13)
                                            - 【經費核銷期限】… (7/15)
                                            - 【經費前7天提醒】… (7/8)
  ↓
Collect event ids
  ↓
Build control row                        ← 組好總控表新列（含所有剛建的 URL）
  ↓
Append to 總控表                         ← Sheets：寫進總控表
  ↓
Notify 承辦人                            ← Gmail：寄信給 wang@school.local
  ↓
Return summary                           ← 回傳 {projectCode, urls...} 給 entry
```

### 王老師看到的成果（咖啡喝完回到桌上）

**Gmail 收件夾** — 一封新郵件「【行政專案已建立】AI融入教學研習」：

```
王怡君 老師您好：

系統已建立行政專案工作資料夾。

專案編號：115-教務處-0501093045
專案名稱：AI融入教學研習
承辦處室：教務處
成果繳交期限：2026-06-20
經費核銷期限：2026-07-15

Drive 專案資料夾：
https://drive.google.com/drive/folders/...

專案紀錄 Docs：
https://docs.google.com/document/d/.../edit

待辦追蹤表：
https://docs.google.com/spreadsheets/d/.../edit

成果檢核表：
https://docs.google.com/spreadsheets/d/.../edit

建議下一步：
1. 將公文與附件上傳到專案資料夾中的「00_原始公文與附件」。
2. 若本案重要，手動建立 NotebookLM 筆記本。
…
```

**Drive** — 在 `學校行政專案/03_專案資料夾/115_教務處_AI融入教學研習/` 下：

```
115_教務處_AI融入教學研習/
├── 00_原始公文與附件/    ← 王老師等下要把公文 PDF 拖進這
├── 01_計畫書與核定資料/
├── 02_工作分工與會議紀錄/
├── 03_表單與回覆資料/
├── 04_經費與採購核銷/
├── 05_活動照片與照片說明/
├── 06_成果資料與成果報告/
├── 07_公告通知與對外文字/
├── 08_簡報與成果展示/
├── 09_檢討與下次改進/
└── 99_系統產生文件/
    ├── 115_教務處_AI融入教學研習_專案紀錄 (Doc)
    │   ├─ 標題: 行政專案紀錄文件
    │   ├─ 一、基本資料        (含她剛填的所有欄位)
    │   ├─ 二、重要期限
    │   ├─ 三、經費資訊
    │   ├─ 四、公文要求摘要
    │   ├─ 五、執行紀錄
    │   ├─ 六、成果資料
    │   ├─ 七、缺漏檢查
    │   ├─ 八、檢討與下次建議
    │   └─ 九、NotebookLM 建議提問
    ├── 115_教務處_AI融入教學研習_待辦追蹤表 (Sheet)
    │   ├─ T001 整理公文要求           狀態:未開始
    │   ├─ T002 建立 NotebookLM 筆記本  狀態:未開始
    │   ├─ T003 撰寫或修正計畫書        狀態:未開始
    │   ├─ ...
    │   └─ T010 建立下次改進建議        狀態:未開始
    └── 115_教務處_AI融入教學研習_成果檢核表 (Sheet)
        ├─ 原始公文               是          待整理
        ├─ 計畫書或核定資料       建議        待整理
        ├─ ...
        └─ 檢討與下次改進         建議        待整理
```

**Google Calendar** — 接下來兩個月內她會看到 5 個全天提醒事件。

**行政專案總控表** — 多了一列，林主任、陳會計都看得到這個新專案。

### 王老師接著做

1. 把公文 PDF 拖進 `00_原始公文與附件/`。
2. 點專案紀錄 Doc，補充第四段「公文要求摘要」（用 NotebookLM 整理過的）。
3. 開始打勾 T001、T002…

---

## 情境 C — 5 月 15 日，活動規劃會議後，加幾個關鍵日期

### 故事

> 王老師跟教務組長開完會，決定 5/25 報名開始、6/3 報名截止、6/8 校內協調會。她希望這 3 個日期都進她的行事曆，而且讓她在前 7 天就被提醒（不要當天才急）。

她打開另一個 n8n form 網址：

```
https://n8n.school.local/form/gw-admin-milestone
```

填寫第一筆（5/25 報名開始）：

| 欄位 | 值 |
| --- | --- |
| 專案編號 | 115-教務處-0501093045 (從總控表複製) |
| 專案名稱 | AI融入教學研習 |
| 日期類型 | 報名開始日 |
| 日期 | 2026-05-25 |
| 提醒設定 | 當天提醒, 前7天提醒 (多選) |
| 負責人 | 王怡君 |
| 負責人Email | <wang@school.local> |
| 是否寫入待辦追蹤表 | 是 |
| 是否建立Calendar提醒 | 是 |
| 說明 | 校內 Google 表單公告 |

按送出。然後重複填 6/3 報名截止、6/8 校內協調會。

### 觸發

n8n Form Trigger → `[Claude ...] GW-Admin / Entry (n8n Form) / Milestone`。

### Workflow 跑什麼（每次送出都跑一輪）

#### 第一段：`Entry (n8n Form) / Milestone`

跟啟動表類似，把表單欄位包成 `{data, config}` 後 `Call core` 呼叫核心。

#### 第二段：`Core / Milestone`

```
When Called
  ↓
Prepare                          ← 解析「報名開始日」→ stage="表單收件"
                                    解析「當天提醒, 前7天提醒」→ 兩個 reminder offsets
                                    最早提醒日期 = 5/18（5/25 - 7 天）
  ↓
Lookup project in 總控表         ← Sheets lookup：用「專案編號」反查
                                    AI融入教學研習 的列 → 拿到該專案的
                                    Drive URL、待辦追蹤表 URL …
  ↓
Resolve project                  ← 把 URL 解析成 spreadsheet id
  ↓
Write to 待辦追蹤表?             ← IF：本次表單選「是」→ 走上線
  ├ true → Build task row → Append to 待辦追蹤表
  │         ← Sheets：在 AI融入教學研習_待辦追蹤表 多寫一列
  │           任務編號:M0515093045
  │           階段:表單收件
  │           任務名稱:【報名開始日】AI融入教學研習
  │           期限:2026/05/25
  │           提醒日期:2026/05/18    ← 最早提醒日期
  │
  └ false (略過)
  ↓
After task branch
  ↓
Create Calendar?                 ← IF：表單選「是」→ 走上線
  ├ true → Expand reminders → Create Calendar event (兩次)
  │         ← Calendar：建立 2 個 event
  │           【當天提醒｜報名開始日】AI融入教學研習 (5/25)
  │           【前7天提醒｜報名開始日】AI融入教學研習 (5/18)
  │
  └ false (略過)
  ↓
Collect event ids
  ↓
Build 階段紀錄 row
  ↓
Append to 階段日期紀錄          ← Sheets：總控表的「專案階段日期紀錄」
                                    分頁多一列，留下這次新增的稽核紀錄
  ↓
Notify 負責人                    ← Gmail：寄信給 wang@school.local
                                    「【專案階段日期已新增】AI融入教學研習」
  ↓
Return summary
```

### 王老師看到的成果（送 3 次後）

- **待辦追蹤表** 從原本 10 列任務，現在多了 3 列：報名開始日 / 報名截止日 / 校內協調會。
- **Calendar** 多了 6 個 all-day event（每個日期 × 2 個提醒）。
- **總控表的「專案階段日期紀錄」分頁** 多了 3 列稽核資料，看得出誰、什麼時候、加了什麼日期。
- **Gmail** 收到 3 封確認信。

### 為什麼這個 workflow 跟「Project Starter」分開？

| 啟動表 (Project Starter) | 階段日期新增表 (Milestone) |
| --- | --- |
| **一次性** — 一個專案只跑一次 | **多次** — 同一個專案可以跑很多次 |
| 建立全部結構（資料夾、Doc、Sheet、Calendar） | 只在「既有」結構上加東西 |
| 沒有「專案編號」欄位 — 它就是建立者 | **必填「專案編號」** — 它依賴 Project Starter 寫進總控表的那串 ID |

---

## 全生命週期序列圖

```
Time →

林主任             王老師                  陳會計
─────              ─────                   ─────
│                  │                       │
[Setup workflow]                            │  ← 一輩子一次
│                  │                       │
├─→ Drive 目錄結構建立                      │
├─→ 行政專案總控表建立                      │
│                  │                       │
│                  │                       │
│             [Entry / Project Starter]    │
│                  │  填表 (4 月底)        │
│                  ▼                       │
│             [Core / Project Starter]     │
│                  │                       │
│                  ├─→ 11 子資料夾         │
│                  ├─→ 專案紀錄 Doc        │
│                  ├─→ 待辦表 + dropdown   │
│                  ├─→ 檢核表 + dropdown   │
│                  ├─→ 5 個 Calendar 提醒  │
│                  ├─→ 寫總控表 → 全校看到 ─→  陳會計打開總控表
│                  └─→ Gmail 通知          │   看到「經費期限 7/15」
│                  │                       │
│                  │                       │
│                  ▼  (5/15 規劃會議後)    │
│             [Entry / Milestone] x 3      │
│                  │                       │
│                  ▼                       │
│             [Core / Milestone] x 3        │
│                  │                       │
│                  ├─→ 待辦表 + 3 列任務   │
│                  ├─→ Calendar + 6 個提醒 │
│                  ├─→ 階段紀錄 + 3 列稽核 │
│                  └─→ Gmail x 3           │
│                  │                       │
│                  ▼                       │
│            (活動辦完 6/10)                │
│            (繳交成果 6/20，王老師手動完成 │
│             待辦表 T008–T009)             │
│                  │                       │
│                  ▼                       │
│            (核銷經費 7/15) ───────────────→  陳會計按總控表追進度
```

---

## 看不懂哪條 workflow 時的回頭路

| 狀況 | 開哪一條 |
| --- | --- |
| 第一次裝這套系統 | `Core / One-time Setup` |
| 想自己手動觸發 starter 流程做測試 | `Core / Project Starter` — 點 Execute Workflow，但要手動餵 `{data, config}` 給 trigger |
| 同上對 milestone | `Core / Milestone` |
| 想看「人怎麼把資料丟進來」 | `Entry (n8n Form) / *` 或 `Entry (Google Forms) / *` |
| 改表單欄位 / UI 文字 | `Entry (n8n Form) / *`，動 Form Trigger 節點 |
| 改業務邏輯（要建幾個資料夾、寄什麼信） | `Core / *`，動裡面的 Code 與下游節點 |
| 加新的觸發來源（Slack 指令、API 呼叫） | 新增一個 `Entry (Slack) / *` 之類的 workflow，呼叫同一個 core |

---

## English summary

This document maps workflow names (visible in the n8n UI as `[Claude DATE] GW-Admin / Core / X` and `… / Entry (Y) / X`) to **real-world scenarios** so you can tell at a glance what each one does.

The system has a 3-tier mental model:

- **One-time Setup** runs *exactly once* per school: it creates the Drive folder tree (`01_…` through `06_…`) and the master control sheet. Triggered manually by an admin (林主任 in the story).
- **Core / Project Starter** is the heavy logic for "received a new official document → spin up a project workspace." Not triggered directly — invoked by one of two entry workflows.
- **Core / Milestone** is the heavy logic for "add another important date to an existing project." Also not triggered directly.

The two **Entry** flavours (`n8n Form` / `Google Forms`) are *thin adapters* — they receive form submissions and forward `{data, config}` to the core. Adding a third trigger (Slack, CLI, IFTTT) means writing a new Entry, not touching the Core.

The persona-driven walkthroughs:

- **A — Setup** (林主任, the IT lead): runs once on 4/1, creates Drive structure + control sheet.
- **B — New project** (王老師, the educator): on 5/1 fills the starter form; gets back a Drive folder with 11 subfolders, a Doc with 9 headings, two Sheets with dropdowns, 5 Calendar reminders, and a notification email.
- **C — Adding milestone dates** (same 王老師): on 5/15 fills the milestone form three times (registration open, registration close, planning meeting); each submission appends to her task sheet, creates 2 Calendar events (same-day + 7-day-before), and logs an audit row.

Refer back to this doc whenever the workflow names alone don't tell you what's happening.
