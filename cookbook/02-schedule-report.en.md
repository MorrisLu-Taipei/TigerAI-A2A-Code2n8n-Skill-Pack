# Cookbook 02 — Scheduled fetch → Email report

> 🌐 **English** | [繁體中文](02-schedule-report.md)

## Use case
Daily / weekly at a fixed time, fetch data from an API, transform, and email a report.

---

## Sticky note content

### 🌱 Plain-language version (recommended)

**【English】**

```text
Every morning at 8 AM,
fetch yesterday's sales data from https://api.example.com/sales,
calculate total amount, order count, top 3 products,
format as HTML and email to sales@example.com,
subject "Sales Daily - <yesterday>".
On failure, notify Slack #ops-alert.
```

**【繁體中文】**

```text
每天早上 8 點，
從 https://api.example.com/sales 抓昨天的銷售資料，
算出總金額、訂單數、賣得最好的前 3 個商品，
套成 HTML 報表寄到 sales@example.com，
主旨寫「銷售日報 - 昨天日期」。
失敗就在 #ops-alert 通知。
```

<details>
<summary>📐 Advanced: DSL strict syntax</summary>

```markdown
## Need: Daily sales report

@trigger: schedule cron "0 8 * * *" (daily 08:00)
@step: call API GET https://api.example.com/sales?date=yesterday
@step: compute total, count, top 3 products
@step: render HTML template
@output: gmail to sales@example.com, subject "Sales Daily - {yesterday}"
@on-error: slack #ops-alert "daily report failed: {error}"
```

</details>

---

## Layer 2 nodes

```text
[Schedule Trigger 08:00]
        ↓
[HTTP Request: GET sales]
        ↓
[Code: stats + Top3]
        ↓
[Set: HTML template]
        ↓
[Gmail: send]
```

Error path: each node `continueOnFail=false` + a separate Error Trigger workflow → Slack.

| Node | type | Key params |
|---|---|---|
| Schedule | `n8n-nodes-base.scheduleTrigger` | cronExpression=`0 8 * * *` |
| HTTP | `n8n-nodes-base.httpRequest` | URL with expression for yesterday: `={{ $now.minus({days:1}).toFormat('yyyy-MM-dd') }}` |
| Code stats | `n8n-nodes-base.code` | JS: reduce for total, sort for Top3 |
| Set HTML | `n8n-nodes-base.set` | template literal for HTML |
| Gmail | `n8n-nodes-base.gmail` | resource=`message`, operation=`send` |

---

## Layer 3

```markdown
### 🤖 AI implementation notes — Daily sales report

**Node choices**
- `scheduleTrigger`: newer than the `cron` node (marked hidden in the 2.37.3, 2.44.6 and 2.46.6 node catalogs)
- `code`: stats logic in one JS block, cleaner than chained `set` + `aggregate`
- `gmail`: native node handles OAuth refresh

**Required credentials**
- [ ] HTTP API token (use Header Auth credential if needed)
- [ ] Gmail OAuth2

**Assumptions**
- Server timezone = business timezone (otherwise cron firing time will drift)
- API returns JSON `{ orders: [...] }` (modify Code node if different)

**Test recipe**
1. Manually trigger; verify Code node output has totalAmount / topProducts
2. Send to your own inbox first to verify HTML rendering
3. Break the API URL on purpose; verify the Error workflow fires Slack

**Known limits**
- No API retry (combine with Cookbook 06 if needed)
- HTML template hardcoded in Set node; styling change requires editing the workflow

**Mapped to user requirements**
- @trigger → Schedule
- @step ×3 → HTTP / Code / Set
- @output → Gmail
- @on-error → separate Error Trigger workflow (must build separately)
```
