# Enterprise pattern templates — drop-in importable

> 🌐 **English** · 中文段落見下方

Three minimal n8n workflows that demonstrate the canonical enterprise patterns referenced in `skills/tigerai/tigerai-enterprise-patterns/`. Each file is **importable as-is** via n8n's "Import from File" — no credentials required to import; replace placeholder strings before activating.

| File | Pattern | When to use |
| --- | --- | --- |
| [`retry-with-backoff.workflow.json`](retry-with-backoff.workflow.json) | **Retry with exponential backoff + dead-letter** | Outbound HTTP / API call that can transiently fail. Retries 3× with 2 s / 4 s / 8 s backoff, then routes to a dead-letter sink for human follow-up. |
| [`human-approval-gate.workflow.json`](human-approval-gate.workflow.json) | **Human approval gate** | Workflow with a destructive or financially material step. Pauses on a `Wait → Resume on webhook` node; approver clicks an approve / reject link in a notification. |
| [`handover-trace.workflow.json`](handover-trace.workflow.json) | **Cross-system handover with correlation ID** | Workflow that hands work off to another system (queue, API, sub-workflow) and needs an audit-able correlation ID baked into every step's output. |

Each template ships with **structured sticky notes** explaining (1) what the pattern is, (2) which nodes implement it, (3) what you must customise before activating, and (4) which `n8n-security-governance` rules it satisfies.

Scan with the deterministic security scanner:

```bash
node scripts/security-scan.mjs --glob "examples/templates/*.workflow.json" --format markdown
```

All three pass the v0.26.0 scanner with 0 errors / 0 warnings.

---

## 中文

三個可直接 import 的 n8n workflow，示範 `tigerai-enterprise-patterns` skill 講的三個經典企業模式。每個檔案都是「Import from File」就能讀入；上線前把 placeholder 字串換成你自家的 endpoint / credential 名稱再 activate 即可。

| 檔案 | 模式 | 用在哪 |
| --- | --- | --- |
| `retry-with-backoff.workflow.json` | 指數退避 retry + dead-letter | 對外 API call 會有暫時性失敗。重試 3 次（2 s / 4 s / 8 s），失敗後送 dead-letter 等人介入。 |
| `human-approval-gate.workflow.json` | 人工核可關卡 | 流程裡有破壞性或金錢相關的動作。`Wait → 等 webhook resume` 停住流程；通知收到核可 / 拒絕後再繼續。 |
| `handover-trace.workflow.json` | 跨系統交接 + correlation ID | 工作要交接到另一個系統，每一步都要帶可稽核的 correlation ID。 |

每個 template 內含**結構化 sticky note**，說明：模式是什麼、哪幾個 node 實作它、你上線前要改什麼、滿足 `n8n-security-governance` 的哪幾條規則。
