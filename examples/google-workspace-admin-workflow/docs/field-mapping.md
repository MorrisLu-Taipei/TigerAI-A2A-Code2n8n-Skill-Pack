# 欄位對照表 / Field mapping

> 把原 Apps Script 的符號、函式、資料結構 一一對到 n8n 中的節點與位置。
> 用來在升級、除錯、加欄位時知道改哪裡。

## 來源檔案

- 原版：`src/Code.gs` in <https://github.com/mihozip/google-workspace-admin-project-workflow>
- 本移植：`core/core-project-starter.workflow.json`、`core/core-milestone.workflow.json`、`core/core-setup.workflow.json`

## 全域 CONFIG

| Apps Script | n8n |
| --- | --- |
| `CONFIG.ROOT_FOLDER_ID` | 每個 entry workflow 的 `Config + normalize` Code 節點內 `config.ROOT_FOLDER_ID` |
| `CONFIG.CONTROL_SHEET_ID` | 同上，`config.CONTROL_SHEET_ID`（由 `core-setup` 一次性產出） |
| `CONFIG.CALENDAR_ID` | 同上，`config.CALENDAR_ID` |
| `CONFIG.ADMIN_EMAIL` | 同上，`config.ADMIN_EMAIL` |
| `CONFIG.TIMEZONE` | 同上，`config.TIMEZONE` |
| `PropertiesService.getScriptProperties()` | 不需要 — n8n 不會「忘記」這些 ID；填一次永久使用 |

## 公文專案啟動表 / Project Starter form

原 `createProjectStarterForm()` 中每一題對應 `entry-n8n-form/entry-project-starter.workflow.json` 的 `formFields.values`：

| Apps Script field | n8n form field label | requiredField | fieldType |
| --- | --- | --- | --- |
| `專案年度` | 同 | true | text |
| `承辦處室` | 同 | true | text |
| `專案名稱` | 同 | true | text |
| `承辦人` | 同 | true | text |
| `承辦人Email` | 同 | true | email |
| `協辦人員` | 同 | false | textarea |
| `公文主旨` | 同 | false | text |
| `來文單位` | 同 | false | text |
| `公文日期` | 同 | false | date |
| `公文文號` | 同 | false | text |
| `活動日期` | 同 | false | date |
| `成果繳交期限` | 同 | false | date |
| `經費核銷期限` | 同 | false | date |
| `是否有經費` | 同 | false | dropdown (是/否/不確定) |
| `核定或預估金額` | 同 | false | text |
| `是否需要收家長或教師回覆` | 同 | false | dropdown |
| `是否需要活動照片` | 同 | false | dropdown |
| `是否需要成果報告` | 同 | false | dropdown |
| `備註` | 同 | false | textarea |

## 公文專案啟動表 — 自動產出對照

| Apps Script function | n8n node | 動作 |
| --- | --- | --- |
| `generateProjectCode(data)` | `Prepare` Code node | `projectCode = 年度-處室-MMddHHmmss` |
| `sanitizeFileName(...)` | 同上 | 把不合法字元換成 `_`，截到 180 字 |
| `getOrCreateSubFolder(rootFolder, '03_專案資料夾')` | `Find 03_專案資料夾` (HTTP GET Drive files.list) + `Resolve 03 folder id` | 找出總資料夾下 03 子資料夾 id |
| `projectFolderRoot.createFolder(folderName)` | `Create project folder` (HTTP POST Drive files) | 建立專案資料夾 |
| `createProjectSubFolders(projectFolder)` | `Explode subfolder list` → `Create subfolder` (loop) → `Collect subfolder ids` | 建 11 個子資料夾，回傳 name→id map |
| `createProjectRecordDoc(...)` + `appendKeyValue` | `Create project Doc` + `Doc batchUpdate` + `Move Doc to 99_系統產生文件` | 建 Doc、套用 9 大段落 Heading/Title 樣式、移到 99 |
| `createTaskTrackingSheet(...)` + `buildDefaultTasks` + `applyTaskValidation` + `formatSheet` | `Create 待辦追蹤表` (HTTP POST spreadsheets) + `Task sheet — validation + format` (HTTP POST :batchUpdate) + `Move task sheet to 99` | 建試算表（標題 + 10 筆任務 + 凍結列 + 標題格式）+ I 欄狀態下拉 + 移到 99 |
| `createResultChecklistSheet(...)` + `applyChecklistValidation` | `Create 成果檢核表` + `Checklist sheet — validation + format` + `Move checklist to 99` | 同上模式，C 欄狀態下拉 |
| `createCalendarReminders(...)` + `createAllDayEventSafe` + `buildCalendarDescription` | `Expand calendar events` (Code) → `Create Calendar event` (HTTP, 跑多次) → `Collect event ids` | 為活動日 / 成果期限+前7天 / 經費期限+前7天 各建一個 all-day event |
| `appendToControlSheet(...)` + `getControlSheetHeaders` | `Build control row` (Code) → `Append to 總控表` (HTTP values:append) | 寫入 20 欄總控表 |
| `sendInternalNotification(...)` | `Notify 承辦人` (Gmail node) | 寄信給承辦人 |
| `notifyAdminError(error)` | n8n Error Trigger workflow（未內建；用標準 n8n error workflow 替代） | 全 workflow 級錯誤通知 |

## 專案階段日期新增表 / Milestone form

原 `createMilestoneForm()` 各題對應 `entry-n8n-form/entry-milestone.workflow.json`：

| Apps Script field | n8n field type |
| --- | --- |
| `專案編號` | text (required) |
| `專案名稱` | text (required) |
| `日期類型` | dropdown — 14 choices |
| `日期` | date (required) |
| `提醒設定` | dropdown multi-select — 5 choices |
| `負責人` | text (required) |
| `負責人Email` | email (required) |
| `是否寫入待辦追蹤表` | dropdown 是/否 |
| `是否建立Calendar提醒` | dropdown 是/否 |
| `說明` | textarea |
| `備註` | textarea |

## 專案階段日期新增表 — 處理對照

| Apps Script function | n8n node | 動作 |
| --- | --- | --- |
| `parseFormResponse(e)` | (n8n Form Trigger 直接輸出 JSON) | 取得表單資料 |
| `validateRequiredFields` | `Prepare` (Code) | 檢查 6 個必填欄位 |
| `parseDate / offsetDate / parseReminderOptions / determineTaskStageByDateType / getEarliestReminderDate / isAffirmative` | `Prepare` (Code) — 全部 inline 重寫 | 日期解析、提醒選項解析、階段對照、最早提醒日期、判斷是否寫入 |
| `findProjectByCode(projectCode)` | `Read 總控表` (HTTP GET Sheets values) + `Find project` (Code) | 從總控表找到該專案的列，解析所有 URL/欄位 |
| `getSpreadsheetIdFromUrl(url)` | `Find project` (Code) 內 inline | 從待辦追蹤表 URL 反推試算表 id |
| `appendMilestoneToTaskSheet(project, data)` | `Write to 待辦追蹤表?` (If) → `Append to 待辦追蹤表` (HTTP values:append) | 寫入該專案待辦追蹤表新增一列 |
| `createMilestoneCalendarEvents(project, data)` | `Create Calendar?` (If) → `Expand reminders` (Code) → `Create Calendar event` (HTTP, 跑多次) → `Collect event ids` | 為每個提醒選項建一個 all-day event |
| `appendMilestoneRecord / updateMilestoneRecord` | `Append to 階段日期紀錄` (HTTP values:append) | 寫入 17 欄階段紀錄 |
| `sendMilestoneNotification(project, data, eventIds)` | `Notify 負責人` (Gmail) | 寄信給負責人 |
| `sendMilestoneErrorNotification(data, message)` | n8n Error Trigger workflow | 失敗通知（用 n8n error workflow 替代） |

## Sheet headers / Sheet 欄位

### 行政專案總控表（20 欄）

`Prepare` Code node 中的 `controlHeaders` 陣列、`core-setup` workflow 建表時硬編；與 Apps Script `getControlSheetHeaders()` 完全一致。

### 專案階段日期紀錄（17 欄）

`core-setup` workflow 建表時硬編；對應 Apps Script `getMilestoneRecordHeaders()`。

### 待辦追蹤表（12 欄）

`Prepare` 中的 `taskHeaders`；對應 Apps Script `createTaskTrackingSheet()` 內的 `headers`。

### 成果檢核表（6 欄）

`Prepare` 中的 `checklistHeaders`；對應 Apps Script `createResultChecklistSheet()` 內的 `headers`。

## 11 個專案子資料夾

`Prepare` 中的 `SUBFOLDERS` 陣列，逐字對齊 Apps Script `createProjectSubFolders()` 內的 `folderNames`：

```
00_原始公文與附件
01_計畫書與核定資料
02_工作分工與會議紀錄
03_表單與回覆資料
04_經費與採購核銷
05_活動照片與照片說明
06_成果資料與成果報告
07_公告通知與對外文字
08_簡報與成果展示
09_檢討與下次改進
99_系統產生文件
```

## 預設待辦任務 T001–T010

`Prepare` 中的 `taskRows` 陣列，逐筆對齊 Apps Script `buildDefaultTasks(data)`。

## 預設成果檢核 10 項

`Prepare` 中的 `checklistRows`，逐筆對齊 Apps Script `createResultChecklistSheet()` 中的 `rows`。

## 提醒偏移天數

`Prepare` / milestone `Prepare` 中的 `parseReminderOptions` 對照：

| 選項 | 偏移天數 |
| --- | --- |
| 當天提醒 | 0 |
| 前1天提醒 | -1 |
| 前3天提醒 | -3 |
| 前7天提醒 | -7 |
| 前14天提醒 | -14 |

## 日期類型 → 任務階段對照

`determineTaskStageByDateType(dateType)` 完整重現於 milestone `Prepare`：

| 日期類型 | 任務階段 |
| --- | --- |
| 報名開始日 / 報名截止日 / 資料回收期限 | 表單收件 |
| 採購期限 / 經費核銷期限 | 經費 |
| 正式活動日期 / 活動前檢查日 / 校內協調會 / 第一次會議 | 執行 |
| 照片與成果資料回收日 / 成果報告初稿期限 / 成果送出期限 | 成果 |
| 結案檢討日 | 結案 |
| 其他 | 其他 |
