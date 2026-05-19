# Google OAuth credential 設定 / Google credential setup

## 必要 scopes

| API | Scope | 為什麼需要 |
| --- | --- | --- |
| Drive | `https://www.googleapis.com/auth/drive` | 建立 / 搜尋 / 移動資料夾與檔案（11 個子資料夾、移動 Doc/Sheet 到 99_系統產生文件） |
| Sheets | `https://www.googleapis.com/auth/spreadsheets` | 建立試算表、appendRow、batchUpdate（設定 dropdown 驗證、格式化標題列） |
| Docs | `https://www.googleapis.com/auth/documents` | 建立 Doc、batchUpdate 套用 Heading / Title 樣式到段落 |
| Calendar | `https://www.googleapis.com/auth/calendar` | 建立 all-day events（活動日 / 成果期限 / 經費期限 / 階段日期提醒） |
| Gmail | `https://www.googleapis.com/auth/gmail.send` | 寄通知信給承辦人 |

> 若你想用「最小權限」，Drive 可以縮成 `drive.file`（只能存取本 app 建立的檔案），但這會導致 milestone workflow 無法用 URL 反查既有試算表 id。建議用 `drive` full scope。

## 在 Google Cloud Console 啟用 API

1. 開啟 [Google Cloud Console](https://console.cloud.google.com/)，建立或選擇一個 Project。
2. **APIs & Services → Library**，逐一啟用：
   - Google Drive API
   - Google Sheets API
   - Google Docs API
   - Google Calendar API
   - Gmail API
3. **APIs & Services → OAuth consent screen**：
   - User Type 選 `External`（除非你是 Workspace 內部專用）。
   - 填 App name、support email。
   - 在 **Scopes** 加入上表五個 scope。
   - **Test users** 加入會用這套系統的 Google 帳號（自己 + 承辦人 Email）。
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**：
   - Application type: `Web application`
   - Authorized redirect URIs: 加入 n8n 的 OAuth callback：
     - Self-hosted: `https://<your-n8n-host>/rest/oauth2-credential/callback`
     - n8n Cloud: `https://oauth.n8n.cloud/oauth2/callback`
   - 建立後記下 **Client ID** 與 **Client Secret**。

## 在 n8n 建立 credential（v2 native-first：6 份）

由於 v2 改成原生節點優先，需要 5 份 service-specific credential（讓原生 Drive / Sheets / Docs / Calendar / Gmail 節點認得）+ 1 份 generic credential（給 3 個 HTTP fallback 用）：

| n8n credential type | 對應的 Google scope | 用在哪 |
| --- | --- | --- |
| `googleDriveOAuth2Api` | `drive` | Find / Create folder, Move file |
| `googleSheetsOAuth2Api` | `spreadsheets` | Create spreadsheet, Append, Lookup |
| `googleDocsOAuth2Api` | `documents` | Create empty Doc |
| `googleCalendarOAuth2Api` | `calendar` | Create event |
| `gmailOAuth2` | `gmail.send` | Send notification |
| `googleApi` (generic OAuth2) | `documents`, `spreadsheets` | 3 個 HTTP fallback 節點（Doc heading、Sheets dropdown 驗證、Sheets header 格式化） |

### 為什麼要 5 份 service-specific？

n8n 原生 Google 節點預設只接受對應 service 的 credential type。`googleDriveOAuth2Api` 不能塞給 `googleSheets` 節點。**好消息**：5 份可以共用同一個 Google Cloud OAuth client（同一組 client ID / secret），只是 n8n 端要分別建。

### 步驟（每份 credential 都一樣）

1. **Credentials → New** → 選對應的 type（例：`Google Drive OAuth2 API`）。
2. 貼上同一組 Client ID / Client Secret。
3. **Connect my account** → 授權。
4. 重複 6 次。

### 第 6 份 generic Google API credential

1. **Credentials → New → Google API** (`googleApi` generic OAuth2)。
2. 填入同一組 Client ID / Client Secret。
3. **Scope**：把這兩個 scope 用 **空格** 串起來貼入（只需要 Docs + Sheets）：

   ```text
   https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/spreadsheets
   ```

4. **Connect my account** → 授權。

### 匯入 workflow 後

每個 Google 原生節點與 HTTP Request 節點點開都會看到 `REPLACE_*_CRED_ID` 佔位符 → 點 credential 欄位 → 選對應的 credential → 儲存。整份 core-project-starter 大約 18 個節點要重新指派 credential（一個一個點即可，n8n 會記住該節點之後 import 重複指派的 credential 給同 type）。

## 安全建議

- 不要把 OAuth client secret 提交到 git。
- 若多人共用一台 n8n，把這份 credential 設為 `personal` 而非 `shared`，避免別人匯出。
- Workspace 環境建議用 **service account + domain-wide delegation**（n8n 支援 `Service Account` credential 類型），這樣不需要每年 re-consent。但設定較複雜，本範例文件以 OAuth2 為主。

---

## English

This port uses a **single n8n "Google API" generic OAuth2 credential** with all five scopes (Drive, Sheets, Docs, Calendar, Gmail.send) attached. Enable each API in your Google Cloud project, configure the OAuth consent screen with the test users who will operate the system, and create an OAuth client with n8n's callback URL as an authorized redirect URI. Then in n8n create a Google API credential with the client ID/secret and the five scopes joined by spaces.

For Workspace deployments, you can use a service account with domain-wide delegation instead of OAuth2 to avoid yearly re-consent prompts.
