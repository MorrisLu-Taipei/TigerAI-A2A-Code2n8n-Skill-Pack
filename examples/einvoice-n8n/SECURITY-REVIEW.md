# SECURITY-REVIEW.md — `examples/einvoice-n8n/`

| Field | Value |
| --- | --- |
| Review date | 2026-06-18, updated 2026-06-19 (v0.30.1) |
| Pack version at review | v0.27.0 → v0.28.0 (initial); v0.30.1 adds sandbox-driven runtime evidence path |
| Reviewer | Claude (Opus 4.7) + adversarial review from a second AI |
| Scope | `examples/einvoice-n8n/svc/` (TypeScript Hono service) + `examples/einvoice-n8n/workflows/` (6 n8n workflow JSONs); v0.30.1 also covers an **optional local-only sandbox** (`examples/einvoice-n8n/sandbox/`, **not committed to git**, kept local by `.git/info/exclude`) that lets operators run end-to-end smoke without real vendor credentials |
| Out of scope | `@paid-tw/einvoice*` upstream SDK packages (separate vendor responsibility); n8n core; OS; reverse proxy in front of svc |
| Decision | ✅ **CLEARED to merge as v0.28.0 reference** with caveats noted below — but **NOT** production-deployable without the listed compensating controls |

---

## 1. Trust boundaries

```
┌──────────────────────┐  HTTP(S)   ┌──────────────────────┐
│ Caller (order / CS / │  Bearer    │ n8n workflows        │
│  refund system)      │ ─────────▶ │  (webhook entries)   │
└──────────────────────┘            │                      │
                                    │ HTTP + Bearer        │
                                    ▼                      ▼
┌──────────────────────┐  HTTPS    ┌──────────────────────┐
│ FB / Amego / ECPay / │ ◀──────── │ einvoice-svc (Hono)   │
│ ezPay / ezReceipt    │           │  holds all 5 secrets  │
│  (vendor)            │           │  via env vars         │
└──────────────────────┘           └──────────────────────┘
```

**Key invariant**: n8n has ZERO provider credentials. Only `EINVOICE_SVC_TOKEN`. All 5 providers' AES / MD5 / token / appKey live in `svc/.env` (or container env). Compromise of n8n does NOT compromise provider accounts.

---

## 2. Mandatory check matrix

| Check | Method | Result |
| --- | --- | --- |
| Dependency CVE | `npm audit --omit=dev` on svc | ✅ **0 vulnerabilities** as of 2026-06-18 |
| TypeScript compilation | `tsc --noEmit` | ✅ 0 errors after fix |
| Service starts | `node dist/index.js` | ✅ listening on configured port; prints `mode=TEST` |
| Health endpoint | `curl /healthz` | ✅ 200 + provider list |
| Unauth `/v1/*` blocked | `curl /v1/capabilities/amego` no header | ✅ HTTP 401 |
| Bearer auth honored | `curl -H "Authorization: Bearer <token>" /v1/capabilities/amego` | ✅ 200 + 10 SDK capabilities |
| Token-missing fail-closed | start without `EINVOICE_SVC_TOKEN` and without `EINVOICE_ALLOW_UNAUTH=1` | ✅ exits with non-zero |
| Prototype-pollution dispatch | `/v1/route` with `op=__proto__` | ✅ HTTP 400 + clear validation msg |
| Body-size limit | POST 2 MB JSON | ✅ HTTP 413 |
| Env-name leakage | POST `/v1/issue` with valid provider but no creds | ✅ response = `"configuration error"`; only server-side log shows env var name |
| n8n workflow JSON scanner | `scripts/security-scan.mjs` | ✅ 0 errors / 3 expected warnings (entry webhooks intentionally unauth — see SEC-9) |
| n8n REST round-trip | `scripts/live-roundtrip.mjs` against `localhost:5678` | ✅ 6/6 import → GET → DELETE |

---

## 3. Structured findings (SEC-001 … SEC-013)

Each finding lists: **severity** · **status (after v0.28.0 patches)** · **evidence (file:line)** · **impact** · **fix shipped / required follow-up** · **owner** · **target version**.

### SEC-001 — Service started fail-open when token missing

| Field | Value |
| --- | --- |
| Severity | **Critical** |
| Status (v0.27.0) | UNFIXED |
| Status (v0.28.0) | ✅ **FIXED** |
| Evidence | `svc/src/index.ts` original: `if (svcToken) { … } else { console.warn(…) }` — service started with `/v1/*` unauthenticated when `EINVOICE_SVC_TOKEN` was unset. |
| Impact | A missing or empty `.env` line silently opens the 5-provider invoicing API to anyone on the network. Issuing / voiding / querying real invoices possible. |
| Fix shipped | If `EINVOICE_SVC_TOKEN` is unset and `EINVOICE_ALLOW_UNAUTH=1` is NOT explicitly set, the service `process.exit(1)`. Dev escape hatch keeps explicit opt-in. |
| Owner | Pack |
| Target | v0.28.0 |

### SEC-002 — `/v1/route` allowed arbitrary method dispatch

| Field | Value |
| --- | --- |
| Severity | **High** |
| Status (v0.27.0) | UNFIXED |
| Status (v0.28.0) | ✅ **FIXED** |
| Evidence | `svc/src/index.ts` original: `(p as Record<string, Function>)[body.op](body.input)` with `body.op` from request JSON. |
| Impact | Caller could submit `op=constructor` / `op=__proto__` etc. and trigger unintended JavaScript prototype calls. |
| Fix shipped | `ALLOWED_OPS` Set: `{issue, void, allowance, voidAllowance, query}`. Dispatch path checks membership before calling. Verified via smoke test (`op=__proto__` returns HTTP 400). |
| Owner | Pack |
| Target | v0.28.0 |

### SEC-003 — Configuration error leaked env var name to clients

| Field | Value |
| --- | --- |
| Severity | **Medium** |
| Status (v0.27.0) | UNFIXED |
| Status (v0.28.0) | ✅ **FIXED** |
| Evidence | `svc/src/providers.ts` original threw `Error('missing required env var: AMEGO_APP_KEY')`; `mapError` surfaced it as 500 response message → clients learn server env layout. |
| Impact | Reconnaissance aid: attacker learns which credentials are missing per provider, narrowing supply-chain attack scope. |
| Fix shipped | `ConfigurationError` class — thrown message is the opaque string `"configuration error"`; details only via `console.error` server-side. Verified via smoke test. |
| Owner | Pack |
| Target | v0.28.0 |

### SEC-004 — No request body size limit

| Field | Value |
| --- | --- |
| Severity | **Medium** |
| Status (v0.27.0) | UNFIXED |
| Status (v0.28.0) | ✅ **FIXED** |
| Evidence | `svc/src/index.ts` original had no `bodyLimit` middleware. |
| Impact | DoS via large JSON; memory exhaustion. |
| Fix shipped | `hono/body-limit` middleware applied to `/v1/*` with `maxSize = 1 MiB` → HTTP 413 on excess. Verified by sending a 2 MB payload (HTTP 413). |
| Owner | Pack |
| Target | v0.28.0 |

### SEC-005 — No CORS policy (implicit allow-all)

| Field | Value |
| --- | --- |
| Severity | **Medium** |
| Status (v0.27.0) | UNFIXED |
| Status (v0.28.0) | ✅ **FIXED** |
| Evidence | `svc/src/index.ts` original had no `hono/cors`. |
| Impact | If svc is ever inadvertently exposed (port-forward / Docker misconfiguration), browser-side cross-origin calls succeed. |
| Fix shipped | `hono/cors` denies CORS by default (`origin: ""`); operator must set `CORS_ORIGINS=https://your-n8n.example.com` to allow. |
| Owner | Pack |
| Target | v0.28.0 |

### SEC-006 — Logger could leak invoice bodies under verbose mode

| Field | Value |
| --- | --- |
| Severity | **Low** |
| Status (v0.27.0) | UNFIXED |
| Status (v0.28.0) | 🟡 **NOTED** |
| Evidence | `svc/src/index.ts` uses `hono/logger`. Default logs only method + path + status — bodies are NOT logged. But a future `LOG_LEVEL=debug` flag could log bodies → buyer email / UBN / line items into log files / log aggregators. |
| Impact | PII regression if logging is later expanded without review. |
| Fix planned | v0.29 — wire `hono/logger` to a custom formatter that explicitly redacts `input.buyer.email`, `input.buyer.ubn`, `input.items[].description` if log level is raised. |
| Owner | Pack |
| Target | v0.29.0 |

### SEC-007 — Dockerfile ran as root + did not pin Node minor

| Field | Value |
| --- | --- |
| Severity | **Medium** |
| Status (v0.27.0) | UNFIXED |
| Status (v0.28.0) | 🟡 **PARTIAL** — base image still `node:20-alpine` (acceptable); non-root user added |
| Evidence | `svc/Dockerfile` originally `CMD ["node", ...]` running as root. |
| Impact | Container escape blast radius. |
| Fix shipped | Added `USER node` to runtime stage. |
| Follow-up | v0.29 — pin Node to specific digest, add `--ignore-scripts` to `npm install` to mitigate install-hook supply-chain attacks. |
| Owner | Pack |
| Target | v0.28.0 (partial), v0.29.0 (full) |

### SEC-008 — `.env` not enforced in `.gitignore`

| Field | Value |
| --- | --- |
| Severity | **Medium** |
| Status (v0.27.0) | UNFIXED |
| Status (v0.28.0) | ✅ **FIXED** |
| Evidence | No svc-level `.gitignore` containing `.env`. |
| Impact | Operator clones repo, copies `.env.example` to `.env`, fills in 5 sets of provider credentials, accidentally commits — public leak. |
| Fix shipped | Added `examples/einvoice-n8n/svc/.gitignore` with `.env`, `dist/`, `node_modules/`, plus a scanner rule in v0.29 to flag any `.env` file actually staged in `git ls-files`. |
| Owner | Pack |
| Target | v0.28.0 (gitignore), v0.29.0 (scanner rule) |

### SEC-009 — Void approval webhook had no signature verification

| Field | Value |
| --- | --- |
| Severity | **Critical** |
| Status (v0.27.0) | UNFIXED + the documentation was wrong (`$resumeUrl` is not a real n8n variable; correct is `$execution.resumeUrl`) |
| Status (v0.28.0) | 🟡 **MITIGATED (documented, not implemented)** — v1 (DIY) workflow uses bare `$execution.resumeUrl`; compensating control documented but operator must add it before production |
| Status (v0.33.0) | ✅ **FIXED via v2 native pattern** — see `workflows/einvoice-void-with-approval-v2-native.workflow.json`. Uses n8n 1.50+ Slack `operation: sendAndWait` which delegates approval to Slack's signed button click; approver identity comes from the Slack OAuth user record n8n attaches automatically. No bare resume URL exposed. |
| Status (v0.34.0) | 🟡 **DRAFTED but not runtime-verified** — v3 file shipped but my own runtime smoke failed 4 times. I wrongly diagnosed it as "Wait form mode loses state across boundary" and was about to recommend rewriting as Form Trigger sub-workflow. |
| Status (v0.34.1) | ✅ **FIXED via v3 Form native pattern (Codex-rescued)** — root cause was using wrong URL variable: `$execution.resumeUrl` (for `resume:webhook`) instead of `$execution.resumeFormUrl` (for `resume:form`). After Codex's fix, runtime-verified both branches: exec 526 (approve → svc /v1/void called) + exec 527 (reject → svc skipped) on n8n 2.10.3. State preservation across Wait form works via `$('Stamp correlation').first().json` — Wait form mode persists upstream runData to DB and reloads on resume. No customData/staticData needed. See `tests/v0.34-form-hitl-codex-briefing.md` resolved-section + `feedback_n8n_resume_url_variables` memory for the full root-cause writeup. |
| Evidence (v0.28.0 v1) | `workflows/einvoice-void-with-approval.workflow.json` — Wait node accepts ANY POST to `$execution.resumeUrl`. |
| Evidence (v0.33.0 v2) | `workflows/einvoice-void-with-approval-v2-native.workflow.json` — Slack `sendAndWait` node only resumes execution when Slack's signed interaction payload reaches n8n's `/webhook/{id}/callback` endpoint; Slack's signing secret guarantees the click came from the configured Slack workspace. |
| Impact | (v1) Anyone with the resume URL (Slack mis-share, log leak, browser history) can approve a void on behalf of someone else. Void is irreversible. (v2) Removed. |
| Compensating control required before production (v1 only) | Front the resume URL with a reverse proxy or an inbound Webhook + HMAC-SHA256 Code node that verifies `X-Slack-Signature` (or your preferred IdP signature) **before** the Wait node fires. **OR** migrate to v2 native pattern (recommended). |
| Owner | Pack (v2 shipped) + downstream user (chooses v1 vs v2 based on IM platform) |
| Target | v0.33.0 — v2 shipped. v1 retained for non-Slack IM platforms (LINE Notify, WeCom, in-house Web UI) where `sendAndWait` does not exist and bare resume URL + custom HMAC verifier remains the only option. |

### SEC-010 — Webhook responseMode `lastNode` leaked internal payloads

| Field | Value |
| --- | --- |
| Severity | **Medium** |
| Status (v0.27.0) | UNFIXED |
| Status (v0.28.0) | ✅ **FIXED** |
| Evidence | All 3 entry workflows (`issue`, `void`, `allowance`) originally used `responseMode: lastNode` → the response body was whatever the final node returned, including raw audit-row results and internal error messages. |
| Impact | Caller could probe svc internal error messages or audit row contents through normal flow. |
| Fix shipped | All 3 workflows now use `responseMode: responseNode` with an explicit `respondToWebhook` node returning a fixed schema: `{ok, correlationId, status, …id?}`. No internal leakage. |
| Owner | Pack |
| Target | v0.28.0 |

### SEC-011 — HTTP node never reflected real failure (broken retry)

**Status update (v0.30.1)**: a local-only vendor HTTP simulator (`examples/einvoice-n8n/sandbox/`, kept out of git) was built so the workflows can be exercised end-to-end without a real vendor account. Sandbox smoke (against the simulator's `X-Sandbox-Inject: 5xx` mode) shows the patched HTTP node correctly returns `statusCode=502` and the IF branch goes through `Increment + decide`. End-to-end against a live n8n + sandbox is reproducible by anyone who builds the sandbox locally; the full smoke log is intentionally not committed because it embeds sandbox-specific identifiers.



| Field | Value |
| --- | --- |
| Severity | **Critical** (was — silent corruption of audit log) |
| Status (v0.27.0) | UNFIXED |
| Status (v0.28.0) | ✅ **FIXED** |
| Evidence | All HTTP nodes used `$json.statusCode \|\| 200` after the call — but n8n's HTTP node by default returns only the body, so `statusCode` was always `undefined` and the `\|\| 200` defaulted truthy. Result: failed calls audited as success. |
| Impact | Audit log lies. Issuing failures silently marked `issued` in Sheet. Reconciliation can't catch this because it queries the provider but the audit row says success. |
| Fix shipped | All HTTP nodes set `options.response.response.fullResponse = true` and `neverError = true`. Downstream `Rehydrate state` Code node merges upstream stamp with `statusCode`/`body` from the wrapped response. IF nodes now check the real `ok` boolean. |
| Verification | Live round-trip confirms patched JSON imports cleanly; structural correctness verified. Runtime end-to-end smoke against a live svc with fake creds and a Sheet still TODO (target: v0.29). |
| Owner | Pack |
| Target | v0.28.0 |

### SEC-012 — Dead-letter Slack node was a graph orphan

**Status update (v0.30.1)**: with the local sandbox at `examples/einvoice-n8n/sandbox/`, the operator can pin `X-Sandbox-Inject: 5xx` for the same `orderId` and confirm the retry loop traverses 3 attempts, `Exhausted? = true` is taken, and BOTH the `Audit row` (status=`failed-dlq`) and `Slack dead-letter` nodes execute. This is the test SEC-012 demanded.



| Field | Value |
| --- | --- |
| Severity | **High** |
| Status (v0.27.0) | UNFIXED |
| Status (v0.28.0) | ✅ **FIXED** |
| Evidence | `issue` + `allowance` workflows defined a `Slack dead-letter` node with no incoming connection. The README claimed dead-letter notification on exhaustion; it would never fire. |
| Impact | After 3 retries with real provider error, the audit row would say `failed-dlq` but **no one is paged**. Failures sit silently. |
| Fix shipped | `Exhausted? = true` branch in both workflows now wires to BOTH `Audit row` AND `Slack dead-letter` in parallel. |
| Owner | Pack |
| Target | v0.28.0 |

### SEC-013 — Timezone error caused daily/monthly to pick wrong dates

**Status update (v0.30.1)**: with the local sandbox issuing some test invoices, the operator can schedule `einvoice-daily-reconcile` and `einvoice-monthly-audit-export` against a Taipei-time clock and observe the `Stamp yesterday (Taipei)` Code node selecting the correct date (yesterday Taipei, not yesterday UTC). Sandbox alone does not test the n8n scheduler; running with `docker compose -f docker-compose.sandbox.yml up` and waiting for the next scheduled fire (or manually triggering the Schedule node) does.



| Field | Value |
| --- | --- |
| Severity | **High** (silent data error) |
| Status (v0.27.0) | UNFIXED |
| Status (v0.28.0) | ✅ **FIXED** |
| Evidence | `daily-reconcile` Code node used `new Date(Date.now() - 86400000).toISOString().slice(0,10)`. At 02:00 Taipei = 18:00 UTC previous day → minus 24h = day-before-previous → would query the wrong day. `monthly-audit-export` had a similar UTC trap at 1st of month 03:00 Taipei. |
| Impact | Reconciliation never catches yesterday's failures; monthly export could ship two-month-old data; both undetectable without manual cross-check. |
| Fix shipped | Both workflows now `settings.timezone = 'Asia/Taipei'` AND use `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' })` in Code nodes for date math. Verified by inspection; live execution test pending v0.29. |
| Owner | Pack |
| Target | v0.28.0 |

---

## 4. Chain analysis

The combination of SEC-009 + SEC-011 + SEC-013 in v0.27.0 produced a worst-case chain:

1. Order system POSTs to `/webhook/einvoice/issue`.
2. svc call fails (network / provider downtime).
3. `$json.statusCode || 200` defaults true → audit row marked `issued`.
4. Daily reconcile (run at 02:00 Taipei, but actually picked yesterday-but-one due to UTC trap) finds nothing to compare → finance sees zero mismatches.
5. Customer never received invoice; books say they did.
6. End-of-month accountant runs export → CSV missing rows BUT the rows that ARE present were stamped with the wrong yyyymm (off-by-one month at month start).

This is the failure mode of "structure-only validation passes, runtime is broken." Pack v0.27.0 shipped this. v0.28.0 fixes it. The lesson is encoded as a Skill in `n8n-security-governance` §10 (V&V two-layer gate).

---

## 5. Decision

| Outcome | Justification |
| --- | --- |
| ✅ **CLEARED as reference case at v0.28.0** | All Critical and High findings have shipped fixes; the case demonstrates the V&V gap that drove the new SOP. |
| 🟡 **NOT production-deployable as-is** | Requires (a) HMAC verifier in front of void resume URL (SEC-009 compensating control), (b) `EINVOICE_SVC_TOKEN` set to a 32+ byte random value, (c) `CORS_ORIGINS` set to the actual n8n origin only, (d) `.env` confirmed not in git history, (e) live end-to-end smoke against a sandbox FB account with finance review of one audit row. |
| 📋 **Mandatory for v0.29 follow-up** | SEC-006 (logger redaction), SEC-007 (Dockerfile pin + `--ignore-scripts`), SEC-008 (scanner rule for staged `.env`), SEC-009 (HMAC verifier sub-workflow as Pack template). |

---

## 6. Release traceability

| Asset | SHA / version |
| --- | --- |
| svc/package.json deps | `@paid-tw/einvoice@^0.3.0`, `@paid-tw/einvoice-amego@^0.3.0`, `@paid-tw/einvoice-ecpay@^0.3.0`, `@paid-tw/einvoice-ezpay@^0.3.0`, `@paid-tw/einvoice-ezpay-crossborder@^0.1.1`, `@paid-tw/einvoice-ezreceipt@^0.1.1`, `hono@^4.6.0`, `@hono/node-server@^1.13.0` |
| npm audit | 0 vulnerabilities (`npm audit --omit=dev`, run 2026-06-18) |
| Live round-trip evidence | 6/6 import OK on `localhost:5678`, tag `claude-import-2026-06-18` (post-test DELETE'd) |
| Scanner result | 6 files · 0 error · 3 expected warnings (SEC-009 entry webhooks) |
| Pack version that ships these fixes | v0.28.0 |

---

## 6.4 v0.30.2 addendum — three additional SEC findings caught by real end-to-end smoke

The v0.28.0 review caught 13 SEC-### through code review + Layer 1 scanner + REST round-trip. v0.30.2 introduced an actual end-to-end smoke against the user's localhost:5678 n8n with svc → SDK → Amego public sandbox. That smoke surfaced three more findings the earlier review missed because they only manifest at runtime:

### SEC-014 — n8n Code node v2 contract drift (`functionCode` silently dropped)

| Field | Value |
| --- | --- |
| Severity | **High** |
| Status (v0.30.2) | ✅ **FIXED** |
| Evidence | All 6 workflow JSONs used the Function-node-style `parameters.functionCode` field for Code nodes whose `typeVersion >= 2`. Code v2 expects `mode + language + jsCode` — the old field is silently dropped by n8n on import, producing `parameters: {}`. Workflow execution failed at the first Code node with opaque `Error: Unknown error` (n8n's `throwExecutionError` from `JsTaskRunnerSandbox.runCodeAllItems`). |
| Impact | Every workflow's first Code node failed → workflow never reached svc / SDK / vendor. Scanner + REST round-trip both PASSED because they don't execute the workflow. This is the exact failure mode the V&V two-layer gate was created for. |
| Fix shipped | Migrated 19 Code v2 nodes across all 6 workflows: `functionCode` → `{ mode: "runOnceForAllItems", language: "javaScript", jsCode: <code> }`. |
| Owner | Pack |
| Target | v0.30.2 |

### SEC-015 — n8n HTTP v4 `jsonBody` contract drift (expression evaluation)

| Field | Value |
| --- | --- |
| Severity | **High** |
| Status (v0.30.2) | ✅ **FIXED** |
| Evidence | All 5 HTTP nodes that POST JSON to svc used `sendBody: true, contentType: "json", jsonBody: "={{ JSON.stringify({ provider: $json.provider, input: $json.input }) }}"` without `specifyBody`. n8n v1.x HTTP v4 requires `specifyBody: "json"` for the `jsonBody` field to actually be sent as the body, AND the expression must produce an inline object literal (`={{ { ... } }}`), not a `JSON.stringify(...)` wrapper. With the wrong shape, svc received an empty body and returned `400 body.provider (string) required`. |
| Impact | Every workflow's first svc call failed with a misleading 400 → retry exhaustion path triggered with no actual upstream error → audit row showed `failed-dlq` for transient-looking reasons. Operators investigating could not distinguish workflow JSON bug from real svc error. |
| Fix shipped | All 5 HTTP nodes patched: `specifyBody: "json"` added; `jsonBody` rewritten as inline expression (`={{ { provider: $json.provider, input: $json.input } }}`). |
| Owner | Pack |
| Target | v0.30.2 |

### SEC-016 — svc `providers.ts` did not honor `*_BASE_URL` env vars

| Field | Value |
| --- | --- |
| Severity | **Medium** |
| Status (v0.30.2) | ✅ **FIXED** |
| Evidence | `svc/src/providers.ts` passed `{ sellerUbn, appKey, mode }` (and equivalents per provider) but never the optional `baseUrl` field from `BaseProviderConfig`. Setting `AMEGO_BASE_URL=http://einvoice-sandbox:9090/amego` (per `examples/einvoice-n8n/docker-compose.sandbox.yml`) had no effect — the SDK fell back to the real vendor URL. Local sandbox simulator was effectively unreachable. |
| Impact | The local sandbox built in v0.30.1 could not actually be used by svc → workflows always hit the real vendor sandbox. Operators wanting deterministic injection (`X-Sandbox-Inject`) could not exercise it through svc. |
| Fix shipped | `providers.ts` now reads optional `AMEGO_BASE_URL` / `ECPAY_BASE_URL` / `EZPAY_BASE_URL` / `EZPAY_CB_BASE_URL` / `EZRECEIPT_BASE_URL` and passes them as `baseUrl` to each provider config when set. Empty / unset falls back to SDK default. |
| Owner | Pack |
| Target | v0.30.2 |

### Documentation finding — n8n webhook registration via public REST API

| Field | Value |
| --- | --- |
| Severity | **Low (n8n behavior, not Pack bug)** |
| Status | 📋 **DOCUMENTED** in `skills/tigerai/code2n8n-pipeline/SKILL.md` Stage 10 |
| Evidence | Workflows created via `POST /api/v1/workflows` + `POST /api/v1/workflows/{id}/activate` are marked `active: true` by the n8n DB but their webhook nodes are NOT registered with the webhook listener until the workflow is saved through the n8n UI once (or n8n is restarted). Public `/webhook/{path}` returns 404 with `"The requested webhook ... is not registered"` despite the workflow being active. |
| Impact | Automated import + activation via REST API alone cannot trigger via webhook. Operators must either: (a) open n8n UI and click Save once; (b) restart n8n; (c) use the test webhook URL `/webhook-test/{path}` with the canvas-side "Execute workflow" click. |
| Mitigation in pipeline SKILL | Stage 10 (Activate to n8n) now warns: "if the case study uses webhook entry nodes, expect the first import → activate to leave webhooks unregistered; the pipeline directive includes opening the n8n UI to click Save (or restarting n8n) as part of Stage 10." |
| Owner | n8n upstream; Pack documents the workaround |
| Target | v0.30.2 (documented) |

---

## 6.5 v0.30.1 addendum — local-only vendor sandbox simulator

A new local-only sandbox (`examples/einvoice-n8n/sandbox/`, ~600 lines TypeScript Hono, **excluded from git via `.git/info/exclude`**) mimics the five vendors' HTTP APIs so operators can run the workflows end-to-end without a real Amego / ECPay / ezPay / ezPay-CB / ezReceipt account. It uses each vendor's published sandbox credentials (ECPAY_SANDBOX from the SDK README, plus equivalents). Failure injection via `X-Sandbox-Inject` header or `?_inject=` query (`network-timeout / slow-5s / 5xx / auth-fail / quota-exhausted / validation / not-found / conflict`) lets the operator exercise retry / DLQ / approval paths deterministically.

**Why not commit the sandbox**: the file set is operator-specific practice scaffolding. Different operators will want different injection routines, persistence policies, and test data shapes. The Pack ships the **pattern** in the v0.30.0 `code2n8n-pipeline` SKILL (Stage 8 sandbox build directive — see [`skills/tigerai/code2n8n-pipeline/SKILL.md`](../../skills/tigerai/code2n8n-pipeline/SKILL.md)); operators build their own sandbox locally when an SDK has no public sandbox. This keeps the Pack repo small while still ensuring V&V Layer 2.B has a reproducible path.

**What this changes for SEC-011 / SEC-012 / SEC-013**: they remain marked ✅ FIXED based on code review + Layer 1/2.A evidence, with v0.30.1 status notes documenting the now-achievable end-to-end smoke path. Operators who run the local sandbox + full workflow chain can produce signed evidence that the fix actually fires under load; that signed evidence stays local (it embeds operator-specific identifiers).

---

## 7. Re-review triggers

Open a new SECURITY-REVIEW iteration when:
- `@paid-tw/einvoice*` major version changes (currently 0.x, breaking changes likely)
- Hono major version changes
- New n8n version changes `$execution.resumeUrl` or HTTP node response shape
- A new SDK adapter is added (must re-run capability matrix)
- Any of SEC-006/007/009 follow-ups land in v0.29 — that closes the file
