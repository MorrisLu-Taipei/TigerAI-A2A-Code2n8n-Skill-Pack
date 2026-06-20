# Upstream issue draft — paid-tw/einvoice

> **Target repo**: https://github.com/paid-tw/einvoice
> **Issue type**: Bug / Design proposal
> **Related to**: SDK `capabilities[]` declaration vs `issue()` runtime behavior consistency
> **Pack reference**: [SEC-021 in einvoice case SECURITY-REVIEW](../../examples/einvoice-n8n/SECURITY-REVIEW.md)

---

## Title

`capabilities[]` is declarative-only — `provider.issue()` doesn't enforce it for marker fields (e.g. `scheduledAt` on Amego accepted despite SCHEDULED_ISSUE not listed)

## Summary

SDK declares per-provider capability matrix via `provider.capabilities[]` and provides `supports(provider, cap)` / `assertSupports(provider, cap)` for active checks. However, `provider.issue(input)` does **not** passively enforce capability constraints when the caller omits an explicit `assertSupports()` call. This means input fields that should trigger unsupported errors (e.g. `scheduledAt` on a provider lacking `SCHEDULED_ISSUE`) are silently accepted and passed through to the vendor, which may then process them successfully — contradicting the published capability matrix.

## Reproducer

Confirmed against real Amego public sandbox on 2026-06-19:

```ts
import { createAmegoProvider } from "@paid-tw/einvoice-amego";

const invoices = createAmegoProvider({
  sellerTaxId: "<your-sandbox-ubn>",
  appKey: "<your-sandbox-key>",
  mode: "SANDBOX",
});

// Capabilities declaration: SCHEDULED_ISSUE is NOT in this list per README
console.log(invoices.capabilities);
// → ["ISSUE", "VOID", "ALLOWANCE", "VOID_ALLOWANCE", "QUERY", "B2B", "MIXED_TAX",
//    "QUERY_BY_ORDER_ID", "CARRIER_VALIDATION", "FOREIGN_CURRENCY"]

const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

// Expected: throws UnsupportedCapabilityError or InvoiceError code: 'UNSUPPORTED'
// Actual:   issues a real invoice (e.g. AA26515020); no error thrown
const result = await invoices.issue({
  orderId: "reproducer-001",
  buyer: { email: "qa@example.com" },
  items: [{ description: "test", quantity: 1, unitPrice: 100, amount: 100 }],
  amount: { salesAmount: 95, taxAmount: 5, totalAmount: 100 },
  taxType: "TAXABLE",
  priceMode: "TAX_INCLUSIVE",
  scheduledAt: future,  // ← Amego doesn't support SCHEDULED_ISSUE per capabilities[]
});
console.log(result.invoiceNumber);  // → "AA26515020" — issued immediately, scheduledAt ignored
```

## Why this matters

The SDK README explicitly states:

> 不具 `FOREIGN_CURRENCY` 能力的供應商，收到非 TWD 的 `currency` 會拋出 `UNSUPPORTED` 錯誤，而非靜默丟棄該註記。

This same expectation arguably extends to other marker fields:

- `scheduledAt` → `SCHEDULED_ISSUE`
- `donation: { npoban }` → `CARRIER_VALIDATION` (or a separate `DONATION` capability)
- `buyer.ubn` for B2B → `B2B`
- `items[].taxType` mix → `MIXED_TAX`
- `input.orderId` in `query()` → `QUERY_BY_ORDER_ID`

When `assertSupports()` is not called by the consumer, the silent-acceptance behavior leads to business-logic errors. In our case: a subscription-model caller assumed "scheduled for 2026-07-01" but Amego immediately issued the invoice — a serious operational/financial discrepancy.

## Proposed fix

Each adapter's `issue()` / `query()` / etc. entry should detect capability-marker fields in the input and call `assertSupports(this, <inferred-cap>)` automatically. Suggested mapping:

| Input field present | Required capability to assert |
| --- | --- |
| `scheduledAt` (future timestamp) | `SCHEDULED_ISSUE` |
| `currency` not `'TWD'` | `FOREIGN_CURRENCY` |
| `buyer.ubn` (8-digit Taiwan UBN) | `B2B` |
| `items[].taxType` heterogeneous OR `taxType === 'MIXED'` | `MIXED_TAX` |
| `donation: { npoban }` | `CARRIER_VALIDATION` (or split into `DONATION`) |
| `carrier: { type, code }` | `CARRIER_VALIDATION` |
| `query()` called with `input.orderId` instead of `input.invoiceNumber` | `QUERY_BY_ORDER_ID` |

This makes `capabilities[]` enforceable contract, not just documentation.

## Alternative: consumer-side workflow gate (interim)

Pending upstream fix, consumers can put a capability-aware gate in front of the SDK. Our Pack ships [`einvoice-capability-aware-gate`](../../examples/einvoice-n8n/workflows/einvoice-capability-aware-gate.workflow.json) as a workflow-level pattern:

```
caller → gate workflow → GET /v1/capabilities/:provider → if not in list → reject UNSUPPORTED_CAPABILITY
                                                       → else → dispatch /v1/<op>
```

But this is consumer responsibility every time; an SDK-level enforcement would be more reliable.

## Related context

- Pack runtime verification report: [v0.40 Amego full coverage report](../../examples/einvoice-n8n/tests/v0.40-amego-full-coverage-report.md) §4 documents this finding alongside other process-level lessons
- Pack SEC-021 entry: [SECURITY-REVIEW.md](../../examples/einvoice-n8n/SECURITY-REVIEW.md)
- Pack version where discovered: v0.40.0
- Pack version where mitigation shipped: v0.35.0 (capability-aware-gate workflow predates the discovery; SEC-021 entry documented the gap in v0.40.0)

---

## Filing checklist

When user is ready to file this upstream:

- [ ] Copy this content into a new GitHub issue at https://github.com/paid-tw/einvoice/issues/new
- [ ] Adjust title to remove brackets
- [ ] Optionally remove the "Pack reference" lines (or convert to link)
- [ ] Add `bug` and `proposal` labels if available
- [ ] Tag related PRs/discussions if discovered
- [ ] Subscribe to issue for notifications

After SDK upstream ships fix: update Pack [SEC-021](../../examples/einvoice-n8n/SECURITY-REVIEW.md) status from "OPEN (mitigated)" to "FIXED (upstream)".
