# SDD：Google Workspace 行政專案工作流（n8n 移植版）

> 🌐 [English summary at bottom](#english-summary)
> 日期：2026-05-20｜作者：tiger.ai.tw@gmail.com + Claude (Opus 4.7 1M)
> 範圍：把 [mihozip/google-workspace-admin-project-workflow](https://github.com/mihozip/google-workspace-admin-project-workflow) 的 Google Apps Script 系統完整移植成 n8n。

---

## 0. 摘要

- **任務**：把一份原本以 Google Apps Script 寫的「半自動行政專案啟動器」1:1 重做成 n8n workflow，行為（產出檔案、欄位、提醒邏輯）零差異。
- **產出**：1 個 setup workflow + 2 個 core sub-workflow + 4 個 entry workflow（n8n Form Trigger 與 Webhook 各兩條入口共用同一份 core）+ Apps Script bridge `.gs` + 三份文件 + 兩支驗證腳本。
- **狀態**：靜態結構驗證 0 errors / 0 warnings，本機 n8n REST `POST /workflows` 7/7 接受。實際執行驗證仍需要使用者授權的 Google credential。

---

## 1. 規劃 / Planning

### 1.1 起點

使用者請求：「<https://github.com/mihozip/google-workspace-admin-project-workflow> 可以把它做成 n8n 專案嗎？全部移植過來。」

原 repo 內容（`src/Code.gs` ~960 行）：
- 兩個 form-submit 觸發器：`onFormSubmit`（公文專案啟動表）、`onMilestoneFormSubmit`（專案階段日期新增表）
- 一次性安裝 entry：`setupAdminWorkflow`，建立資料夾結構、Google Forms、總控表、觸發器
- 用到 Google 服務：Drive、Sheets、Docs、Calendar、Gmail、Forms

### 1.2 三個方向決策（用 AskUserQuestion 對齊）

| 議題 | 選項 | 使用者決定 |
| --- | --- | --- |
| 表單層 | (a) n8n Form Trigger；(b) Google Forms + Apps Script 橋接；(c) 兩種都做 | **(c) 兩種都做** |
| 移植保真度 | (a) 完全保留 9 段 Doc 標題 / 10 筆預設待辦 / 下拉選單；(b) 簡化格式；(c) 最小可用 | **(a) 完全保留** |
| 產出位置 | `examples/google-workspace-admin-workflow/` / `cookbook/` / 由我決定 | `examples/google-workspace-admin-workflow/` |

### 1.3 派生決策

由「兩種都做」加上「完全保留」，避免維護兩份 1500+ 行重複 JSON，採 **n8n sub-workflow pattern**：核心邏輯獨立成一份，n8n Form Trigger 入口與 Webhook 入口各自當薄薄的「轉接頭」呼叫 core。這也讓未來新增第三種入口（例如 CLI、Slack slash command）只要新增一個 entry，不必動 core。

由「完全保留」加上 n8n 原生 Google nodes 對 Docs heading / Sheets 資料驗證下拉不直接支援，採 **HTTP Request + Google API** 走低階管道：
- Docs heading 樣式 → `documents.batchUpdate` 的 `updateParagraphStyle`
- Sheets dropdown 驗證 → `spreadsheets.batchUpdate` 的 `setDataValidation`
- Sheets 標題列粗體背景色 → `repeatCell`

由「沒有 `FormApp.create()` 等價物」加上「保留 Google Forms 選項」，採 **Apps Script bridge `.gs`**：原 setup 跑出來的 Google Forms 不必廢，把表單回應試算表掛上一段 30 行的 Apps Script 把 `e.namedValues` POST 到 n8n webhook。

---

## 2. 研發 / Development

### 2.1 架構

```
                           ┌─────────────────────────────┐
   n8n Form Trigger ───┐   │                             │
   (Form public URL)   │   │   GW-Admin / Core /         │
                       ├──▶│   Project Starter           │
   Google Forms        │   │                             │
   → Apps Script ─────┐│   │   - 11 subfolders           │
   → POST webhook ────┘│   │   - 9-section Doc           │
                       │   │   - 待辦追蹤表 + dropdown    │
   Webhook ────────────┘   │   - 成果檢核表 + dropdown    │
                           │   - Calendar (5 events max) │
                           │   - 總控表 append            │
                           │   - Gmail 通知              │
                           └─────────────────────────────┘

                           ┌─────────────────────────────┐
   n8n Form Trigger ───┐   │                             │
                       ├──▶│   GW-Admin / Core /         │
   Webhook ───────────┘    │   Milestone                 │
                           │   - 從總控表反查專案         │
                           │   - 寫待辦追蹤表             │
                           │   - Calendar N events       │
                           │   - 階段紀錄 append          │
                           │   - Gmail 通知              │
                           └─────────────────────────────┘

                           ┌─────────────────────────────┐
                           │  GW-Admin / Core / Setup    │
   Manual ─────────────────▶│  (one-time bootstrap)       │
                           │  - 5 root subfolders        │
                           │  - 總控表 + 階段紀錄表       │
                           └─────────────────────────────┘
```

### 2.2 檔案清單

```
examples/google-workspace-admin-workflow/
├── README.md / README.en.md
├── CREDITS.md
├── SDD.md                                  ← 本文件
├── _audit.mjs                              ← 靜態 lint
├── _n8n_import_test.mjs                    ← 本機 n8n import 測試
├── core/
│   ├── core-setup.workflow.json            一次性建目錄 + 總控表
│   ├── core-project-starter.workflow.json  公文專案啟動 — 共用核心
│   └── core-milestone.workflow.json        階段日期 — 共用核心
├── entry-n8n-form/
│   ├── entry-project-starter.workflow.json   Form Trigger 入口
│   └── entry-milestone.workflow.json
├── entry-google-forms/
│   ├── entry-project-starter.workflow.json   Webhook 入口
│   ├── entry-milestone.workflow.json
│   └── apps-script-bridge.gs                 GF → webhook 橋接片段
└── docs/
    ├── install.md
    ├── google-credentials.md
    └── field-mapping.md
```

### 2.3 模組職責

| 模組 | 觸發 | 輸入 | 輸出 | 節點數 (v2 native-first) |
| --- | --- | --- | --- | --- |
| `core-setup` | Manual | 由 Config Code 節點硬編 `ROOT_FOLDER_ID` | `CONTROL_SHEET_ID`、5 個 subfolder id | 19 (含 2 個 HTTP fallback) |
| `core-project-starter` | Execute Workflow Trigger | `{data, config}` | `{ok, projectCode, folderUrl, docUrl, taskSheetUrl, checklistSheetUrl, calendarEventIds}` | 36 (含 3 個 HTTP fallback) |
| `core-milestone` | Execute Workflow Trigger | `{data, config}` | `{ok, projectCode, calendarEventIds, recordId}` | 17 (0 HTTP fallback) |
| `entry-n8n-form/project-starter` | Form Trigger v2（19 欄） | 公開表單 | `{status, ...core summary}` | 4 |
| `entry-n8n-form/milestone` | Form Trigger v2（11 欄） | 公開表單 | 同上 | 4 |
| `entry-google-forms/project-starter` | Webhook v2 | POST JSON `{token, data}` | `{status, projectCode, projectFolderUrl}` | 5 |
| `entry-google-forms/milestone` | Webhook v2 | POST JSON | 同上 | 5 |

### 2.4 關鍵設計選擇

#### 節點選擇：原生優先 + 3 個註解清楚的 HTTP fallback（v2 修訂）

第一版（v1, 2026-05-19 上午）所有 Google API 都走 `httpRequest` 節點。使用者回饋後改為 v2：原生優先。原則：

| 場景 | 用什麼 | 原因 |
| --- | --- | --- |
| Drive 找 / 建資料夾 / 搬檔 | Google Drive node | 原生支援，UI 顯示乾淨 |
| Docs 建空 Doc | Google Docs node | 原生支援 |
| Docs heading / TITLE 段落樣式 | **HTTP — `documents.batchUpdate`** | 原生節點只有 `insertText` / `replaceText`，沒有 paragraph style 操作 |
| Sheets 建空試算表（含 sheet name） | Google Sheets node | 原生支援 |
| Sheets append row（單筆或多筆） | Google Sheets node `append` | 原生支援 |
| Sheets lookup（依欄位反查） | Google Sheets node `lookup` | 原生支援，比 HTTP 簡潔 |
| Sheets dropdown 資料驗證 | **HTTP — `spreadsheets.batchUpdate`** | 原生沒有 `setDataValidation` 操作 |
| Sheets 標題列粗體+背景色+凍結列 | **HTTP — `spreadsheets.batchUpdate`** | 原生沒有 `repeatCell` / `updateSheetProperties` 操作 |
| Calendar all-day event | Google Calendar node | 原生支援 |
| Gmail send | Gmail node | 原生支援 |

**HTTP fallback 共 3 處，每處旁邊都掛 🟡 Sticky Note** 寫清楚為什麼。連 n8n 官方論壇也是建議這 3 件事走 HTTP Request。

Credential 取捨：v1 共用 1 份 `googleApi` generic credential；v2 需要 5 份 service-specific credential（Drive / Sheets / Docs / Calendar / Gmail OAuth2 各一）+ 1 份 generic 給 HTTP fallback。Setup 變麻煩，但 UI / 維護 / 新手友善度好很多。詳見 `docs/google-credentials.md`。

#### 為什麼 Code 節點集中而非分散？

每條 core workflow 都有一個 hand-built `Prepare` Code 節點，集中：
- 必填欄位驗證
- `projectCode` 生成（年度-處室-MMddHHmmss）
- 檔名 sanitize
- 11 個子資料夾名稱陣列
- Doc body 文字 + 段落樣式 span 索引
- 兩張 Sheet 的 `spreadsheets.create` request body（含 headers + rows）
- 兩張 Sheet 的 `batchUpdate` request body（dropdown + 格式）
- Calendar events spec 陣列

下游 HTTP Request 節點 `={{ JSON.stringify($json.taskSpreadsheetBody) }}` 直接消費。好處：
- 邏輯密集區只有一個 Code 節點要讀
- API request body 跟業務邏輯放一起，跟原 Apps Script 的「同檔同函式」結構對應
- 若 API 升版只動一個 Code 節點，不必到處改 jsonBody 模板

---

## 3. 轉移 / Migration

### 3.1 Apps Script ↔ n8n 函式對照

| Apps Script (`src/Code.gs`) | n8n 落腳處 |
| --- | --- |
| `setupAdminWorkflow()` | `core-setup.workflow.json` 全部 |
| `createProjectStarterForm()` | `entry-n8n-form/entry-project-starter.workflow.json` 中的 Form Trigger `formFields` |
| `createMilestoneForm()` | `entry-n8n-form/entry-milestone.workflow.json` 中的 Form Trigger `formFields` |
| `installFormSubmitTrigger`、`installMilestoneSubmitTrigger` | 不需要 — n8n workflow 自身就是觸發器 |
| `onFormSubmit(e)` | `core-project-starter.workflow.json` 全部 |
| `parseFormResponse(e)` | n8n Form Trigger 直接輸出 JSON（key 與 Apps Script `namedValues` 同名） |
| `validateRequiredFields` | `Prepare` Code 內 inline |
| `generateProjectCode` | `Prepare` Code 內 inline |
| `sanitizeFileName` | `Prepare` Code 內 inline |
| `createProjectSubFolders` | `Explode subfolder list` (Code) → `Create subfolder` (HTTP, 跑 11 次) → `Collect subfolder ids` (Code) |
| `createProjectRecordDoc` + `appendKeyValue` | `Prepare` 內 `docPlan` 陣列 → `Create project Doc` (HTTP POST docs) → `Doc batchUpdate` (HTTP batchUpdate) → `Move Doc to 99` (HTTP PATCH parents) |
| `createTaskTrackingSheet` + `buildDefaultTasks` + `applyTaskValidation` + `formatSheet` | `Create 待辦追蹤表` (HTTP POST spreadsheets) + `Task sheet — validation + format` (HTTP batchUpdate) + `Move task sheet to 99` |
| `createResultChecklistSheet` + `applyChecklistValidation` | 同上模式 |
| `createCalendarReminders` + `createAllDayEventSafe` + `buildCalendarDescription` | `Expand calendar events` (Code) → `Create Calendar event` (HTTP, 跑 N 次) → `Collect event ids` (Code) |
| `appendToControlSheet` | `Build control row` (Code) → `Append to 總控表` (HTTP `values:append`) |
| `sendInternalNotification` | `Notify 承辦人` (Gmail node) |
| `onMilestoneFormSubmit` | `core-milestone.workflow.json` 全部 |
| `findProjectByCode` | `Read 總控表` (HTTP GET) → `Find project` (Code) |
| `getSpreadsheetIdFromUrl` | `Find project` Code 內 inline |
| `appendMilestoneToTaskSheet` | `Write to 待辦追蹤表?` (If) → `Append to 待辦追蹤表` (HTTP) |
| `createMilestoneCalendarEvents` | `Create Calendar?` (If) → `Expand reminders` (Code) → `Create Calendar event` (HTTP) → `Collect event ids` |
| `appendMilestoneRecord` + `updateMilestoneRecord` | `Append to 階段日期紀錄` (HTTP) |
| `sendMilestoneNotification` / `sendMilestoneErrorNotification` | `Notify 負責人` (Gmail) + 建議搭配 n8n Error Trigger workflow |
| `parseDate / offsetDate / parseReminderOptions / determineTaskStageByDateType / getEarliestReminderDate / isAffirmative / formatDateForSheet` | core-milestone 的 `Prepare` Code 內 inline 重寫 |
| `PropertiesService.getScriptProperties()` 存 ID | 不需要 — 由使用者一次填入 entry workflow 的 `Config + normalize` Code 節點，n8n 永久保存 |
| `notifyAdminError(error)` | 建議：n8n Error Trigger workflow 配 `ADMIN_EMAIL` |

### 3.2 行為保真度逐項清單

下列項目都「逐字」對齊原始 Apps Script，無一遺漏：

- **11 個專案子資料夾**：`00_原始公文與附件` … `99_系統產生文件`
- **20 欄總控表 header**：專案編號 / 專案名稱 / 年度 / … / 是否有經費
- **17 欄階段紀錄 header**：紀錄編號 / 新增時間 / … / 備註
- **12 欄待辦表 header**：任務編號 / 階段 / … / 備註
- **6 欄檢核表 header**：項目 / 是否需要 / … / 備註
- **10 筆預設待辦任務** T001–T010：任務名稱、說明、負責人、期限映射
- **10 筆預設檢核項目**：原始公文 / 計畫書 / … / 檢討與下次改進
- **9 段 Doc 標題**：行政專案紀錄文件（TITLE）+ 一～九（HEADING_1）
- **5 個提醒偏移**：當天 / 前 1 / 前 3 / 前 7 / 前 14 天
- **14 個日期類型**：校內協調會 / … / 結案檢討日 / 其他
- **日期類型→任務階段 6 段對照**：表單收件 / 經費 / 執行 / 成果 / 結案 / 其他
- **狀態下拉**：待辦 4 項（未開始 / 進行中 / 待確認 / 完成）、檢核 5 項（待整理 / 進行中 / 已完成 / 不需要 / 需人工確認）
- **Calendar 事件命名**：`【活動日】年度_處室_專案名稱` / `【成果期限】…` / `【成果前7天提醒】…` 等
- **Calendar description 結構**：8 行 + 連結

### 3.3 已知差異（functional preserving）

| 項目 | Apps Script | n8n 版 | 對使用者的影響 |
| --- | --- | --- | --- |
| 表單建立 | `FormApp.create()` 自動產生 | (1) n8n Form Trigger UI 或 (2) 沿用原 GF + bridge | UI 樣式不同（n8n form 也支援 lightweight branding）；功能相同 |
| 觸發器安裝 | `ScriptApp.newTrigger().forSpreadsheet(...).onFormSubmit().create()` | 啟用 n8n workflow 的 Active toggle 即可 | 一鍵啟用，無需另外授權 |
| ID 持久化 | `PropertiesService.setProperty/getProperty` | 由使用者填入 Code 節點，永久保存於 workflow definition | 無 — 設定一次後行為一致 |
| 錯誤通知 | `notifyAdminError(error)` 同函式內 try/catch | 建議搭配 n8n Error Trigger workflow + Gmail | 需多匯入一個 error-handler workflow（未隨本範例提供，原文件有說明） |
| `getOrCreateSubFolder` idempotency | 內建（Apps Script 自家函式） | core-setup 用 IF 節點實作；core-project-starter 對 `03_專案資料夾` 用 Drive `files.list` 預查 | 行為一致 |

---

## 4. 測試 / Test

### 4.1 測試策略

由於本機沒有 Google API credential，採三層測試漏斗：

```
Layer 1  ──  Static lint (JSON parseable, JS in Code nodes parses, expression syntax)
            └─ _audit.mjs                                                ✅ 已執行
Layer 2  ──  Structural validation by n8n itself (REST POST /workflows)
            └─ _n8n_import_test.mjs                                      ✅ 已執行
Layer 3  ──  Live execution against Google APIs (golden-path + edges)
            └─ 需要使用者授權的 OAuth credential                          🟡 未執行
```

### 4.2 Layer 1：靜態 lint (`_audit.mjs`)

把 `skills/_vendor/n8n-validation-expert/` 與 `n8n-expression-syntax/COMMON_MISTAKES.md` 的規則編碼成本機 JS lint。涵蓋規則：

| 類別 | 檢查項 |
| --- | --- |
| STRUCT | top-level `name` / `nodes` / `connections` 必備 |
| NODE | 重複 name/id、未知 node type、typeVersion 型別、position `[x,y]` 結構 |
| CODE | 所有 Code node 的 `jsCode` 用 `new Function(code)` 解析（catches syntax error） |
| CODE-EXPR | Code node 內禁止 `{{$...}}`（COMMON_MISTAKES #8） |
| EXPR | 禁止三括號 `{{{`、空 `{{}}`、leading `=` 但無 `{{ }}` 主體（#6 / #11 / #15） |
| EXPR | template literal `${...}` 不可外洩到表達式欄位（#14） |
| IF-OP | unary operator 需 `singleValue:true`，binary 不可有（auto-sanitize 規則） |
| WEBHOOK | webhook 節點必須有 `path` |
| GMAIL | Gmail 節點必有 `sendTo` / `subject` / `message` |
| CONN | 每個 connection source/target 都對應到實際 node name |
| FLOW | 沒有孤立節點；有且只有 1 個 trigger |

**結果**：0 errors / 0 warnings（最後修掉 1 個 leading-`=` 違規）。

### 4.3 Layer 2：n8n REST import (`_n8n_import_test.mjs`)

對 `http://localhost:5678/api/v1/workflows` POST 每個 workflow，n8n 端做 schema 驗證後若接受就 DELETE 清理。重要：n8n 在 import 時驗證**節點 type、typeVersion、parameter shape**，所以這層能抓到「用了不存在的原生節點操作」「typeVersion 不對」等錯誤。

**v1 (all-HTTP) 結果**：7/7 接受。
**v2 (native-first) 結果**：7/7 接受 — 這代表 5 個原生 Google node type（`googleDrive` v3、`googleSheets` v4.5、`googleDocs` v2、`googleCalendar` v1.2、`gmail` v2.1）與其 resource/operation 都被 n8n 認可。

v2 執行日誌：
```
✅ core-milestone.workflow.json       → id=EZHXIlJk3L17frZh
✅ core-project-starter.workflow.json → id=J5ShCSlxpGyqLsYW
✅ core-setup.workflow.json           → id=bgxxr9ihpyxSmQqc
✅ entry-milestone (n8n-form)         → id=DOqwQmSV2MKvFQVA
✅ entry-project-starter (n8n-form)   → id=T0U3YfoMmzqyG9Ii
✅ entry-milestone (google-forms)     → id=FjypYdCtvmmE65Na
✅ entry-project-starter (google-forms)→ id=s4RukremgbfO1L6Z
Total: 7/7 accepted by n8n.
```

之後再用 `_n8n_import.mjs` 把 7 個都永久匯入本機 n8n（帶 `[Claude 2026-05-19]` 前綴 + `claude-import-2026-05-19` tag、active=false）給使用者在 UI 檢視。

### 4.4 Layer 3：實際執行（pending）

需要使用者完成：
1. n8n 端建立 Google API OAuth2 credential（5 個 scope，見 `docs/google-credentials.md`）。
2. 跑一次 `core-setup`，拿到 `CONTROL_SHEET_ID`。
3. 設定 entry workflow 的 `Config + normalize` 節點。
4. 啟用 Form Trigger entry，用「測試專案-001」假資料送出。

預期觀察：
- Drive：`03_專案資料夾/<sanitize(年度_處室_專案名)>/` + 11 子資料夾
- Drive `99_系統產生文件/`：Doc（9 段標題）、待辦追蹤表（10 筆任務、I 欄 dropdown）、成果檢核表（10 筆、C 欄 dropdown）
- 總控表新增 1 列（20 欄填齊 URL）
- Calendar 出現對應 all-day events
- Gmail 收件夾有 1 封通知

### 4.5 測試腳本本身

- [`_audit.mjs`](_audit.mjs) — 約 130 行 ES module，無相依
- [`_n8n_import_test.mjs`](_n8n_import_test.mjs) — 約 70 行 ES module，讀取本機 n8n API（key 可由 `N8N_API_KEY` 環境變數覆寫）

兩支腳本都不屬於範例本身的執行路徑，**生產部署可刪**，留下是為了後人在改 workflow 時能再跑一輪 regression。

---

## 5. 驗證 / Validation

### 5.1 驗證等級對應

依 `skills/_vendor/n8n-validation-expert/SKILL.md` 的 profile 分類：

| Profile | 適用 | 本範例使用 |
| --- | --- | --- |
| `minimal` | 編輯中快檢 | — |
| `runtime` | 部署前（推薦） | 我們的 `_audit.mjs` ≈ runtime profile |
| `ai-friendly` | AI 生成 workflow | — |
| `strict` | 生產關鍵 workflow | 未跑（需要 n8n MCP `validate_workflow` tool；本機無 MCP server） |

### 5.2 已知未被靜態 lint 涵蓋的風險

| 風險 | 為何靜態工具看不到 | 緩解 |
| --- | --- | --- |
| Google API rate limit | 需實際發 API 才知道 | Layer 3 試跑時觀察；core 加 `continueOnFail` |
| Sheets `setDataValidation` range 超出實際 row 數 | API 接受任何 range | range 設為 `endRowIndex: 1000` 已留 buffer |
| Drive `'parents'` 在 Shared Drive 中需要 `supportsAllDrives: true` | 已加 query 參數 | ✅ 所有 Drive 呼叫都帶 `supportsAllDrives=true` |
| OAuth scope 不足 | 跑起來才報 403 | `docs/google-credentials.md` 列出 5 個必要 scope |
| 中文檔名在 Windows / macOS Drive 客戶端同步問題 | 是 Google Drive 客戶端行為，跟 workflow 無關 | sanitize 已替掉 `\/:*?"<>|#%{}~&` |
| Calendar `CALENDAR_ID` 拼錯 | API 回 404 | install.md 建議第一次用 `primary` |
| Apps Script bridge 的 webhook 被公開呼叫 | n8n webhook 預設公開 | `apps-script-bridge.gs` 有 shared-secret token；建議加 n8n Basic Auth 或 IP allowlist |

### 5.3 安全性驗證

- ✅ Apps Script bridge `.gs` 含 `token` shared secret，entry workflow 端驗證
- ✅ OAuth client secret 不在範例檔內（README 提示由使用者建）
- ✅ 沒有 hard-code 任何個人 email / folder ID
- ⚠️ webhook entry 預設無 Basic Auth；生產環境建議加上（docs/install.md 註明）
- ⚠️ `Config + normalize` Code 節點裡的 IDs 是明文存在 workflow definition；若 n8n 多人共用，建議改用 n8n credentials 或環境變數注入

---

## 6. Deliverable 結構檢查清單

- [x] 1 個 setup workflow
- [x] 2 個 core sub-workflow（project-starter, milestone）
- [x] 4 個 entry workflow（n8n form ×2、Google Forms webhook ×2）
- [x] 1 個 Apps Script bridge `.gs`
- [x] README 中英對照
- [x] CREDITS 標示原作者 + 授權繼承
- [x] install.md（六步驟）
- [x] google-credentials.md（5 個 OAuth scope + GCP 設定）
- [x] field-mapping.md（Apps Script ↔ n8n 函式 / 欄位逐項對照）
- [x] 靜態 lint 腳本通過
- [x] n8n REST import 7/7 通過

---

## 7. 後續工作（建議）

1. **Error Trigger workflow**：用 n8n 內建 Error Trigger + Gmail node 寫一個全 workspace 共用的 error handler，把所有 GW-Admin workflow 的失敗轉成通知信，對應原 `notifyAdminError()`。
2. **Live test**：在使用者授權後跑一輪 golden path 與三個 edge case（缺必填、缺日期、無經費）並錄影結果。
3. **整合到 `examples/INDEX.md`**：本範例還沒登錄到 flagship index，建議加一列。
4. **包成 plugin export**：plugin.json 內加上 `"examples": ["google-workspace-admin-workflow"]`，讓 `claude-plugin install` 帶下來。
5. **i18n**：表單欄位目前是中文硬編；若要服務非中文使用者，把 form field labels 抽到 setup 階段選語言。

---

## English Summary

This SDD documents a port of [mihozip/google-workspace-admin-project-workflow](https://github.com/mihozip/google-workspace-admin-project-workflow) (Google Apps Script) to n8n with 1:1 behavioural fidelity. The port covers two flows (Project Starter and Milestone) plus a one-time Setup, delivered as three sub-workflow cores invoked by either n8n Form Trigger or a Google Forms webhook bridge.

Architecture: a `core/` sub-workflow contains all the Google API calls (Drive, Sheets, Docs, Calendar, Gmail) via `Execute Workflow Trigger`, and two flavors of `entry/` workflows forward `{data, config}` to it. This avoids duplicating logic across the two trigger types.

Implementation: HTTP Request nodes with a single Google API OAuth2 credential (Drive + Sheets + Docs + Calendar + gmail.send scopes), large `Prepare` Code nodes that build all request bodies upfront, and the native Gmail node for notification emails. Doc heading styles and Sheets dropdown validation — which native n8n nodes don't expose — use `documents.batchUpdate` and `spreadsheets.batchUpdate` raw API calls.

Tests: a 3-layer funnel. Layer 1 — `_audit.mjs` static lint against the rules encoded in `skills/_vendor/n8n-validation-expert/` and `n8n-expression-syntax/COMMON_MISTAKES.md`; 0 errors / 0 warnings. Layer 2 — `_n8n_import_test.mjs` POSTs each workflow to local n8n `/api/v1/workflows`; 7/7 accepted, then cleaned up. Layer 3 — live execution requires user-authorized Google credential and is not yet run.

Open items: error-handler workflow, live tests, INDEX entry, plugin packaging.
