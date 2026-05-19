# Google Workspace 行政專案半自動工作流（n8n 版）

> 🌐 [English](README.en.md) | **繁體中文**

從 [mihozip/google-workspace-admin-project-workflow](https://github.com/mihozip/google-workspace-admin-project-workflow) 的 Google Apps Script 版本完整移植到 n8n。

原版是一個給學校教育人員與行政承辦的「半自動行政專案啟動器」：填一張表單，自動建立專案資料夾、專案紀錄文件、待辦追蹤表、成果檢核表、Calendar 提醒，並寫入總控表、寄信通知。本目錄把這套邏輯 1:1 在 n8n 重做。

---

## 兩條流程

| # | 名稱 | 觸發時機 | 自動產出 |
| --- | --- | --- | --- |
| 1 | **公文專案啟動表**（Project Starter） | 收到新公文/任務時填寫 | Drive 專案資料夾（11 個子資料夾）＋ Docs 專案紀錄 ＋ Sheets 待辦追蹤表 ＋ 成果檢核表 ＋ Calendar 提醒（活動日 / 成果期限 / 經費期限）＋ 寫入總控表 ＋ Gmail 通知 |
| 2 | **專案階段日期新增表**（Milestone） | 既有專案需要新增階段日期時 | 寫入該專案的待辦追蹤表 ＋ Calendar 多次提醒（當天 / 前 1, 3, 7, 14 天）＋ 寫入階段紀錄表 ＋ Gmail 通知 |

---

## 兩種入口（同一份核心邏輯）

| 入口 | 適合 | 檔案 |
| --- | --- | --- |
| **n8n Form Trigger** | 純 n8n 部署、不想動 Google Forms | `entry-n8n-form/` |
| **Google Forms + Webhook 橋接** | 想保留 Google Forms 原始體驗、有承辦人員已習慣 GF | `entry-google-forms/` |

兩個入口都呼叫同一份 `core/` sub-workflow，邏輯完全一致。

---

## 目錄結構

```text
google-workspace-admin-workflow/
├── README.md / README.en.md      本文件
├── CREDITS.md                    原始 Apps Script 作者標示
├── core/
│   ├── core-project-starter.workflow.json   公文專案啟動表 — 核心邏輯
│   └── core-milestone.workflow.json         專案階段日期新增表 — 核心邏輯
├── entry-n8n-form/
│   ├── entry-project-starter.workflow.json  n8n Form Trigger 入口
│   └── entry-milestone.workflow.json
├── entry-google-forms/
│   ├── entry-project-starter.workflow.json  Webhook 入口
│   ├── entry-milestone.workflow.json
│   └── apps-script-bridge.gs                Google Forms onFormSubmit → 打 webhook 的橋接片段
└── docs/
    ├── install.md                安裝、credential 設定、設定變數
    ├── google-credentials.md     Google OAuth scope 與設定步驟
    └── field-mapping.md          原 Apps Script 欄位 ↔ n8n 節點對照表
```

---

## 快速上手（n8n Form Trigger 版本）

1. 在 n8n 建立 **Google OAuth2 credential**，授權 Drive、Sheets、Docs、Calendar、Gmail 五個 scope（詳見 `docs/google-credentials.md`）。
2. 在 Google Drive 建立一個「總資料夾」，記下它的 Folder ID。
3. Import：
   - `core/core-project-starter.workflow.json`
   - `core/core-milestone.workflow.json`
   - `entry-n8n-form/entry-project-starter.workflow.json`
   - `entry-n8n-form/entry-milestone.workflow.json`
4. 開啟每張 workflow，在最上方 **Config** 節點填入：
   - `ROOT_FOLDER_ID` — 步驟 2 的資料夾 ID
   - `CONTROL_SHEET_ID` — 第一次跑時留空，會自動建立；之後填回去
   - `CALENDAR_ID` — `primary` 或指定行事曆 ID
   - `ADMIN_EMAIL` — 錯誤通知收件人
   - `TIMEZONE` — 預設 `Asia/Taipei`
5. 啟用 Form Trigger workflow，取得公開 URL，把連結給承辦人填寫。

完整步驟見 `docs/install.md`。

---

## 節點策略：原生優先 + 3 個註解清楚的 HTTP fallback

絕大多數操作用 n8n 原生 Google 節點（Drive / Sheets / Docs / Calendar / Gmail）。只有 3 件事在原生節點裡找不到對應操作、必須走 `httpRequest` 節點呼叫 Google REST API：

| 操作 | 為何要 HTTP | 在哪 |
| --- | --- | --- |
| Docs heading / TITLE 段落樣式 | Google Docs 原生節點只支援 `insertText` / `replaceText`，沒有 paragraph style | `core-project-starter` → `Doc batchUpdate (HTTP — heading styles)` |
| Sheets dropdown 資料驗證（待辦表 I 欄、檢核表 C 欄） | Google Sheets 原生節點沒有 `setDataValidation` 操作 | `core-project-starter` → `Task sheet batchUpdate`, `Checklist batchUpdate` |
| Sheets 標題列粗體 + 淺藍背景 + 凍結列 | 同上，沒有 `repeatCell` / `updateSheetProperties` 操作 | `core-setup` → `Apply header formatting (HTTP)`，`core-project-starter` 的兩個 batchUpdate 順便做 |

每個 HTTP 節點旁邊都有一張 🟡 Sticky Note 解釋為什麼。連 n8n 官方論壇也建議這 3 件事走 HTTP Request。

## 與原版的差異

| 項目 | Apps Script 原版 | n8n 版 |
| --- | --- | --- |
| 表單建立 | 程式呼叫 `FormApp.create()` 自動產生 | n8n Form Trigger（內建）或保留 Google Forms（用 Apps Script bridge 推送到 webhook） |
| Docs 段落標題 | `DocumentApp` API 直接設定 | n8n Google Docs 節點 + 1 個 HTTP Request 呼叫 `documents.batchUpdate` |
| Sheets 欄位驗證下拉 | `newDataValidation().requireValueInList()` | n8n Google Sheets 節點 + 1 個 HTTP Request 呼叫 `spreadsheets.batchUpdate` |
| Script Properties 儲存 ID | `PropertiesService` | n8n workflow static data / 環境變數 |
| 觸發器安裝 | `ScriptApp.newTrigger()` | n8n workflow 本身就是觸發器 |
| 錯誤通知 | `GmailApp.sendEmail` | Gmail 節點 + n8n Error Trigger workflow |

行為（產出檔案、欄位、提醒邏輯）與原版完全相同。

---

## 看不懂 workflow 名字在做什麼？

讀 [SCENARIO.md](SCENARIO.md) — 用「王老師收到公文 → 系統替她做了什麼」的真實故事把 7 個 workflow 串起來，附速查表把 n8n UI 上看到的名字對應到一句話用途。

## 致謝

原始 Google Apps Script 專案：[mihozip/google-workspace-admin-project-workflow](https://github.com/mihozip/google-workspace-admin-project-workflow)。詳見 [CREDITS.md](CREDITS.md)。

授權沿用原專案授權條款；本目錄為衍生作品（移植自原 Apps Script）。
