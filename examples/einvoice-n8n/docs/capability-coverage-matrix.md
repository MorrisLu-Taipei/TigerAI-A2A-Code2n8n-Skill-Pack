# einvoice 案例 — 11/11 SDK capability 完整覆蓋對照

> **目的**：說明 Pack 的 einvoice 案例如何 100% 覆蓋 [`@paid-tw/einvoice`](https://github.com/paid-tw/einvoice) SDK 宣告的 11 個 capability，以及每個 capability 對應的 n8n workflow / svc 介面。
>
> **狀態**：v0.35.0 起完整覆蓋（先前 v0.27.0 ~ v0.34.x 僅覆蓋 5/11 核心 op）。

---

## 1. capability 對照（11 個 capability × 5 個 provider × 對應 workflow）

| 能力 | Amego | ECPay | ezPay | ezPay 跨境 | ezReceipt | Amego runtime（v0.40.0）| n8n workflow（本 Pack） | svc endpoint |
| --- | :---: | :---: | :---: | :---: | :---: | --- | --- | --- |
| **ISSUE** — 開立 | ✅ | ✅ | ✅ | ✅ | ✅ | 🟢 PASS `AA26515011` | [`einvoice-issue-from-order`](../workflows/einvoice-issue-from-order.workflow.json) | `POST /v1/issue` |
| **VOID** — 作廢 | ✅ | ✅ | ✅ | ✅ | ✅ | 🟢 PASS `AA26515012` voided | [`einvoice-void-with-approval` v1/v2/v3](../workflows/einvoice-void-with-approval.workflow.json) | `POST /v1/void` |
| **ALLOWANCE** — 折讓 | ✅ | ✅ | ✅ | ✅ | ✅ | 🟢 PASS `A1781885120033` | [`einvoice-allowance`](../workflows/einvoice-allowance.workflow.json) | `POST /v1/allowance` |
| **VOID_ALLOWANCE** — 折讓作廢 | ✅ | ✅ | ✅ | ✅ | ✅ | 🟢 PASS（A3 allowance 後 void） | [`einvoice-void-allowance`](../workflows/einvoice-void-allowance.workflow.json) ★ v0.35.0 | `POST /v1/void-allowance` |
| **QUERY** — 查詢 | ✅ | ✅ | ✅ | ✅ | ✅ | 🟢 PASS by invoiceNumber match | 嵌在 [`einvoice-daily-reconcile`](../workflows/einvoice-daily-reconcile.workflow.json) 內 | `POST /v1/query` |
| **B2B** — 統一編號買受人 | ✅ | ✅ | ✅ | — | ✅ | 🟢 PASS `AA26515015` UBN confirmed | [`einvoice-issue-b2b-with-modifiers`](../workflows/einvoice-issue-b2b-with-modifiers.workflow.json) ★ v0.35.0 | （透過 `/v1/issue` body 帶 `buyer.ubn`） |
| **MIXED_TAX** — 混合稅率發票 | ✅ | ✅ | ✅ | — | ✅ | 🟢 PASS `AA26515016` + MIG ZeroTax fields | 同上 `einvoice-issue-b2b-with-modifiers` ★ v0.35.0 | （透過 `/v1/issue` body 每 item 帶獨立 `taxType` + `providerOptions.CustomsClearanceMark/ZeroTaxRateReason`） |
| **QUERY_BY_ORDER_ID** — 以訂單編號查詢 | ✅ | ✅ | ✅ | ✅ | — | 🟢 PASS orderId roundtrip match | [`einvoice-query-by-order-id`](../workflows/einvoice-query-by-order-id.workflow.json) ★ v0.35.0 | （透過 `/v1/query` body 帶 `orderId` 替代 `invoiceNumber`） |
| **SCHEDULED_ISSUE** — 預約未來開立 | — | ✅ | ✅ | ✅ | — | 🔴 SDK gap：Amego 接受並開立（應拒）— 詳見 [`tests/v0.40-amego-full-coverage-report.md`](../tests/v0.40-amego-full-coverage-report.md) §4 + SECURITY-REVIEW SEC-021 | [`einvoice-scheduled-issue`](../workflows/einvoice-scheduled-issue.workflow.json) ★ v0.35.0 | （透過 `/v1/issue` body 帶 `scheduledAt`） |
| **CARRIER_VALIDATION** — 手機條碼 / 愛心碼 | ✅ | ✅ | ✅ | — | ✅ | 🟢 PASS wire-path（手機條碼 via Amego registry reject）/ 🟡 PARTIAL（捐贈愛心碼 Amego 不 echo） | 同 `einvoice-issue-b2b-with-modifiers` 內 B2C 分支 ★ v0.35.0 | （透過 `/v1/issue` body 帶 top-level `carrier: { type, code }` 或 `donation: { npoban }`） |
| **FOREIGN_CURRENCY** — `currency` + `exchangeRate` 外幣註記 | ✅ | — | — | ✅ | — | 🟢 PASS `AA26515019` USD@32.5 | [`einvoice-foreign-currency`](../workflows/einvoice-foreign-currency.workflow.json) ★ v0.35.0 | （透過 `/v1/issue` body 帶 `currency` + `exchangeRate`） |

**覆蓋率**：
- workflow 檔案覆蓋：11/11（100%）★ 為 v0.35.0 新增
- **Amego runtime 實測**（v0.40.0）：10 capability 真實 Amego sandbox PASS、1 capability PARTIAL（DONATION 不可從 response 驗證）、1 capability 揭露 SDK gap（SCHEDULED_ISSUE）
- 其他 4 provider 真實 sandbox runtime：**未驗** — 沒有公開測試環境帳號；本地 sandbox stub 可作結構層驗，非 ground truth

---

## 2. 兩種 capability 類型

從 SDK 介面層看，11 個 capability 分兩類：

### 2.1 獨立 op（5 個）

各自有獨立 svc endpoint + 獨立 workflow：

- `ISSUE` → `/v1/issue` → `einvoice-issue-from-order`
- `VOID` → `/v1/void` → `einvoice-void-with-approval` (v1/v2/v3)
- `ALLOWANCE` → `/v1/allowance` → `einvoice-allowance`
- `VOID_ALLOWANCE` → `/v1/void-allowance` → `einvoice-void-allowance`
- `QUERY` → `/v1/query` → 嵌在 `einvoice-daily-reconcile` / `einvoice-query-by-order-id`

### 2.2 Modifier 欄位（6 個）

**不需要新增 endpoint** — 透過 op 的 body 欄位觸發。svc 對 input 純 pass-through，SDK adapter 內部判斷 + 驗證：

| Capability | 觸發欄位 | 哪個 op |
| --- | --- | --- |
| `B2B` | `input.buyer.taxId` + `input.buyer.name` | `issue` |
| `MIXED_TAX` | `input.items[].taxType` 多種混合（`TAXABLE` / `ZERO` / `TAX_FREE`）+ `input.taxType: 'MIXED'` | `issue` |
| `QUERY_BY_ORDER_ID` | `input.orderId`（替代 `input.invoiceNumber`）| `query` |
| `SCHEDULED_ISSUE` | `input.scheduledAt`（ISO 8601 未來時戳）| `issue` |
| `CARRIER_VALIDATION` | `input.buyer.carrier`（手機條碼）或 `input.buyer.loveCode`（愛心碼）| `issue` |
| `FOREIGN_CURRENCY` | `input.currency`（非 'TWD' ISO 4217）+ `input.exchangeRate` | `issue` |

**為何 svc 不用為 modifier 各加 endpoint**：SDK adapter 已經做完所有 schema 驗證 + 跨 provider 差異 mapping。svc 的 5 個 op 已涵蓋。**新增 capability 屬於 SDK 層升級**，svc 不需配合改 — 這是 SDK 架構設計上的優勢。

---

## 3. SDK 不支援的 capability 怎麼處理

例：呼叫 ezReceipt 做 SCHEDULED_ISSUE → SDK adapter 回 `InvoiceError { code: 'UNSUPPORTED' }`。svc 把它轉為 HTTP 400 + `{ error: { code: 'UNSUPPORTED', ... } }`。

**Pack 提供兩種上游應對模式**：

### 3.1 Capability-aware gate（單一 provider，先驗再用）

→ [`einvoice-capability-aware-gate`](../workflows/einvoice-capability-aware-gate.workflow.json) — 先 GET `/v1/capabilities/:provider` 確認支援，再 dispatch 到對應 svc op。

```
caller → gate workflow → GET capabilities → 支援? → 是 → dispatch /v1/<op> → result
                                              └→ 否 → return UNSUPPORTED_CAPABILITY + 建議換 provider
```

### 3.2 Capability-aware routing（多 provider，自動切換）

→ [`einvoice-provider-failover`](../workflows/einvoice-provider-failover.workflow.json)（呼叫 svc `/v1/route`）— 給一組候選 provider，svc 依序試到第一個支援該 capability 且呼叫成功的。

```
caller → failover workflow → svc /v1/route(capability, candidates[], op, input)
                              └→ svc 依序試 candidates，回第一個成功者
                                 全失敗 → ALL_FAILED + 各家錯誤明細
```

---

## 4. 該用 gate 還是 routing？

| 情境 | 建議 |
| --- | --- |
| Provider 是上游決定（如「就用 Amego」）| Gate — 先驗再用，錯誤回給上游讓上游選 |
| Provider 是 Pack 決定（如「外幣要 Amego 或 ezPay 跨境，挑能用的」）| Routing |
| 高頻 op（issue / query）| **不過 gate**（多一次 HTTP roundtrip），快取 capabilities 在 caller 端 |
| 低頻 / 高風險 op（SCHEDULED_ISSUE / FOREIGN_CURRENCY / VOID_ALLOWANCE）| **過 gate**（錯了難回） |

---

## 5. v0.27.0 → v0.35.0 capability 覆蓋演進

| 版本 | 已覆蓋 | 新增 | 覆蓋率 |
| --- | --- | --- | --- |
| v0.27.0 | ISSUE / VOID / ALLOWANCE / QUERY | (初版 6 個 workflow) | 4/11 |
| v0.28.0 | + V&V hardening on 6 workflow | (無新 capability) | 4/11 |
| v0.30.x | + SEC-014/015/016 修補 + sandbox 引入 | (無新 capability) | 4/11 |
| v0.32.0 | + twin-node test injection | (無新 capability) | 4/11 |
| v0.33.0 | + VOID v2 Slack native | (無新 capability) | 4/11 |
| v0.34.0 | + VOID v3 Form native（v0.34.1 Codex 救援後 runtime 通） | (無新 capability) | 4/11 |
| **v0.35.0** | **+ 5 個新 workflow + 1 個 gate sub-workflow** | **VOID_ALLOWANCE / QUERY_BY_ORDER_ID / SCHEDULED_ISSUE / B2B / MIXED_TAX / CARRIER_VALIDATION / FOREIGN_CURRENCY** | **11/11 ✅** |

---

## 6. 上線前 production checklist（每 capability 都過）

按 `n8n-security-governance` Skill：

- [ ] 5 家 provider credentials 在 svc 的 `.env`，**不散在 n8n**
- [ ] `EINVOICE_SVC_TOKEN` 設好；n8n HTTP 節點掛 `httpHeaderAuth` credential
- [ ] webhook 進入點前置 reverse proxy + HMAC 驗簽（scanner `webhook:no-auth` warning 是故意的）
- [ ] `__REPLACE_ME__*` 全部替換
- [ ] Google Sheet `Audit` tab 結構含 `op` / `capability` / `modifiers` 欄位（v0.35.0 後）
- [ ] PII / 商業會計法 10 年留存策略
- [ ] `MockProvider` 在 `EINVOICE_MODE=PRODUCTION` 時拒絕
- [ ] 高風險 capability（VOID_ALLOWANCE / SCHEDULED_ISSUE / FOREIGN_CURRENCY）建議過 `einvoice-capability-aware-gate`

---

## 7. 真實 Amego sandbox vs 本地模擬器

詳見 [sandbox README](../sandbox/README.md) — 簡述：

- **Amego happy path 測試**：用真實 Amego sandbox（ground truth）
- **其他 4 provider**（ECPay / ezPay / ezPay 跨境 / ezReceipt）：本地 stub 是唯一辦法（無公開測試環境帳號）
- **故障注入 / 負面測試**：本地 sandbox 才能注入錯誤回應
- **Sheet / Slack / Email**：本地模擬器避免需要真 OAuth / SMTP / Slack workspace
