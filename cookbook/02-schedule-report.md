# Cookbook 02 — 定時抓資料 → Email 報表

> 🌐 [English](02-schedule-report.en.md) | **繁體中文**

## 使用情境
每天 / 每週固定時間，從某個 API 撈資料、加工、寄出 Email 報表。

---

## Sticky Note 內容

### 🌱 自然語言版（推薦）

**【中文】**

```text
每天早上 8 點，
從 https://api.example.com/sales 抓昨天的銷售資料，
算出總金額、訂單數、賣得最好的前 3 個商品，
套成 HTML 報表寄到 sales@example.com，
主旨寫「銷售日報 - 昨天日期」。
失敗就在 #ops-alert 通知。
```

**【English】**

```text
Every morning at 8 AM,
fetch yesterday's sales data from https://api.example.com/sales,
calculate total amount, order count, top 3 products,
format as HTML and email to sales@example.com,
subject "Sales Daily - <yesterday>".
On failure, notify Slack #ops-alert.
```

<details>
<summary>📐 進階：DSL 嚴謹寫法</summary>

```markdown
## 需求：每日銷售日報

@trigger: schedule cron "0 8 * * *" (每日 08:00)
@step: 呼叫 API GET https://api.example.com/sales?date=yesterday
@step: 計算總額、訂單數、Top 3 商品
@step: 套 HTML 模板產生報表
@output: gmail to sales@example.com, subject "銷售日報 - {昨日日期}"
@on-error: slack #ops-alert "日報失敗: {error}"
```

</details>

---

## 預期 Layer 2

```
[Schedule Trigger 08:00]
        ↓
[HTTP Request: GET sales]
        ↓
[Code: 統計 + Top3]
        ↓
[Set: 套 HTML 模板]
        ↓
[Gmail: 寄送]
```

錯誤路徑：每個節點 `continueOnFail=false` + 全 workflow 配 Error Trigger workflow → Slack。

| 節點 | type | 關鍵參數 |
|---|---|---|
| Schedule | `n8n-nodes-base.scheduleTrigger` | cronExpression=`0 8 * * *` |
| HTTP | `n8n-nodes-base.httpRequest` | URL 用 expression 帶昨日日期 `={{ $now.minus({days:1}).toFormat('yyyy-MM-dd') }}` |
| Code 統計 | `n8n-nodes-base.code` | JS：reduce 算總額、sort 取 Top3 |
| Set HTML | `n8n-nodes-base.set` | template literal 組 HTML |
| Gmail | `n8n-nodes-base.gmail` | resource=`message`, operation=`send` |

---

## 預期 Layer 3

```markdown
### 🤖 AI 實作說明 — 銷售日報

**節點選型**
- `scheduleTrigger`：比 cron 節點新（cron 在 2.37.3、2.44.6、2.46.6 的節點目錄都標為隱藏）且支援多種頻率定義
- `code`：統計邏輯用 JS 一次寫完，比多個 `set` + `aggregate` 簡潔
- `gmail`：原生節點，自動處理 OAuth refresh

**所需 Credentials**
- [ ] HTTP API token（若 API 需要 auth，請改用 Header Auth credential）
- [ ] Gmail OAuth2

**前提假設**
- 伺服器時區 = 業務時區（否則 cron 觸發時間會偏差）
- API 回傳 JSON 格式為 `{ orders: [...] }`（若不同需修改 Code 節點）

**測試建議**
1. 手動觸發 workflow，檢查 Code 節點輸出是否含 totalAmount / topProducts
2. 暫時改寄到自己信箱驗證 HTML 渲染
3. 故意把 API URL 改錯，驗證 Error workflow 是否發 Slack

**已知限制**
- 未對 API 失敗做 retry（建議搭配 Cookbook 06）
- HTML 模板硬編碼於 Set 節點，未來如要換樣式需改 workflow

**對應使用者需求**
- @trigger → Schedule
- @step 三步 → HTTP / Code / Set
- @output → Gmail
- @on-error → Error Trigger workflow（另一個 workflow，需另建）
```
