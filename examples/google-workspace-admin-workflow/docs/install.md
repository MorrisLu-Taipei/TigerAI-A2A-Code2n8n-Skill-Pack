# 安裝與設定 / Install Guide

> 中英對照。Steps in 中文 first, English summary at the end of each section.

## 前置需求

- 一個能存取 Google APIs 的 Google 帳號（Workspace 或一般 Gmail 都可）。
- 一個運作中的 n8n 實例（self-hosted 或 cloud），版本 ≥ 1.50。
- 五個 Google API 已啟用（OAuth 同意畫面 + Cloud Console）：
  - Drive API
  - Sheets API
  - Docs API
  - Calendar API
  - Gmail API
- 一個 Google Drive 資料夾，作為這套系統的「總資料夾」。記下它的 Folder ID（URL 中 `folders/` 後面那一串）。

## 步驟 1 — 建立 Google credentials（v2 需要 6 份）

由於 v2 改成原生節點優先，n8n 端需要 6 份 credential（同一個 Google Cloud OAuth client 即可，但 n8n 端要分別建）：

| n8n credential type | 用在哪 |
| --- | --- |
| `googleDriveOAuth2Api` | 所有 Drive 操作（folder create / move / search） |
| `googleSheetsOAuth2Api` | 所有 Sheets 原生操作（create / append / lookup） |
| `googleDocsOAuth2Api` | Doc 建立 |
| `googleCalendarOAuth2Api` | Calendar event 建立 |
| `gmailOAuth2` | 通知信 |
| `googleApi` (generic OAuth2) | 3 個 HTTP fallback（Doc heading、Sheets dropdown 驗證、Sheets header 格式化） |

完整建立流程見 [google-credentials.md](google-credentials.md)。簡版：在 GCP 建一個 OAuth client → 在 n8n 用同一組 Client ID/Secret 建這 6 份 credential → 每份 connect 一次。

## 步驟 2 — 匯入 workflow

1. n8n 介面右上角 **Workflows → Import from file**，依序匯入：

   ```text
   core/core-setup.workflow.json
   core/core-project-starter.workflow.json
   core/core-milestone.workflow.json
   entry-n8n-form/entry-project-starter.workflow.json
   entry-n8n-form/entry-milestone.workflow.json
   entry-google-forms/entry-project-starter.workflow.json
   entry-google-forms/entry-milestone.workflow.json
   ```

2. 在每個 HTTP Request / Gmail 節點點開 **Credential to connect with**，選你剛建的 Google credential。所有節點要選同一份。

## 步驟 3 — 跑一次 setup

1. 開啟 `GW-Admin / Core / One-time Setup`。
2. 點 **Config** 節點，把 `ROOT_FOLDER_ID` 改成你在前置需求記下的 Folder ID。
3. **Execute Workflow**。執行完看 `Return setup result` 的輸出，記下：
   - `CONTROL_SHEET_ID`
   - 五個 `rootSubfolderIds`（其中 `03_專案資料夾` 之後 starter workflow 會用到）

## 步驟 4 — 設定入口 workflow（n8n Form Trigger 版）

開啟 `GW-Admin / Entry (n8n Form) / Project Starter`：

1. **Config + normalize** 節點 → 把 `ROOT_FOLDER_ID`、`CONTROL_SHEET_ID`、`ADMIN_EMAIL` 都填好。
2. **Call core** 節點 → `workflowId` 改成 `GW-Admin / Core / Project Starter` 的 workflow ID（左側列表那串）。
3. 點右上角 **Active** 啟用。
4. 點 **公文專案啟動表** 表單節點 → 複製 Production URL，交給承辦人填寫。

對 `GW-Admin / Entry (n8n Form) / Milestone` 做同樣的事。

## 步驟 5 —（可選）設定 Google Forms 版本

如果要繼續用 Google Forms 而不是 n8n Form：

1. 手動在 Google Forms 建立兩張表單（欄位對照 `field-mapping.md`），或匯入原版 Apps Script 跑 `setupAdminWorkflow()` 一次。
2. 開啟「表單回應」試算表 → **Extensions → Apps Script**。
3. 把 `entry-google-forms/apps-script-bridge.gs` 整份貼入。
4. 改 `BRIDGE_CONFIG`：
   - `flow`: `starter` 或 `milestone`
   - `webhookUrl`: n8n entry workflow 的 webhook Production URL
   - `token`: 跟 n8n entry workflow `Config + normalize` 中的 `expected` 對應的 shared secret
5. 執行一次 `installBridgeTrigger`，授權。
6. 啟用 n8n 端 `GW-Admin / Entry (Google Forms) / *` workflow。

## 步驟 6 — 試跑

1. 用啟動表填入一筆假資料（例如 `專案名稱 = 測試專案-001`）。
2. 預期幾秒內：
   - Drive 出現 `03_專案資料夾/115_教務處_測試專案-001/`（11 子資料夾）
   - `99_系統產生文件` 內有 Doc + 兩張 Sheet
   - 行政專案總控表多一列
   - Calendar 有對應提醒（若你填了活動日期 / 期限）
   - 你的 Email 收到通知

## 疑難排解

| 症狀 | 可能原因 / 解法 |
| --- | --- |
| `找不到「03_專案資料夾」子資料夾` | 先跑 `core-setup`，或手動建立 |
| `Insufficient Permission` (Drive/Sheets/Docs) | OAuth scope 漏掉，重新建 credential 把五個 scope 都加進去 |
| Calendar 事件沒建出來 | `CALENDAR_ID` 拼錯；用 `primary` 是最保險的測試值 |
| Gmail 寄不出 | scope 漏 `gmail.send`；或 Workspace 帳號限制外寄需要管理員開啟 |
| `documents.batchUpdate` 400 錯誤 | 確認 Doc id 有抓到（`Carry Doc id` 節點輸出非空） |

---

## English summary

1. Set up a Google OAuth2 credential in n8n with scopes for Drive, Sheets, Docs, Calendar, and `gmail.send`.
2. Import all 7 workflow JSON files. Assign the credential to every HTTP Request and Gmail node.
3. Run `core-setup` once with your Google Drive root folder ID — note the returned `CONTROL_SHEET_ID`.
4. In each entry workflow's `Config + normalize` Code node, paste in `ROOT_FOLDER_ID`, `CONTROL_SHEET_ID`, `ADMIN_EMAIL`. In the `Call core` Execute Workflow node, set `workflowId` to the corresponding core workflow's ID.
5. (Optional) For Google Forms support, paste `apps-script-bridge.gs` into the Form response spreadsheet's Apps Script, edit `BRIDGE_CONFIG` with your webhook URL + token, and run `installBridgeTrigger`.
6. Test with a dummy form submission and verify Drive / Sheets / Calendar / Gmail outputs.
