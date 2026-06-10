---
name: code-to-workflow
description: Convert an existing program / system into an n8n workflow that preserves enterprise governance — login, audit, version control, handover, cross-system orchestration. Use when the user asks to "把這個程式 / 專案 / 系統移到 n8n", "Code2n8n this repo", "port this codebase to n8n", "convert this serverless function / web app / script into n8n", or anytime the input is a running codebase and the desired output is an n8n workflow plus the docs/validation that go with it.
---

# Code2n8n — Code → n8n Workflow

The marquee Code2n8n skill. **Input**: an existing program or system (Python / TypeScript / Apps Script / Netlify Functions / Express / Flask / shell pipelines / Lambda). **Output**: an n8n workflow (or set of workflows) that performs the same behaviour, plus the SDD / FIELD-MAPPING / PROVENANCE / CREDITS / install docs that make it deployable, auditable, and handover-ready.

This skill encodes the methodology proven by the three case studies in this pack:

| Case | Upstream | What was ported |
| --- | --- | --- |
| [`examples/google-workspace-admin-workflow/`](../../../examples/google-workspace-admin-workflow/) | 1,373-line Google Apps Script | 7 n8n workflows (setup + 2 cores + 4 entries) + 11-subfolder Drive structure + 9-section Doc + dual Sheets with dropdowns + Calendar events + Gmail notify |
| [`examples/line-ai-customer-service/`](../../../examples/line-ai-customer-service/) | Netlify Functions + Supabase + React | `core-message-router` + `entry-line` + approach-C admin UI (4 admin workflows) |
| [`examples/line-ai-customer-service-onprem/`](../../../examples/line-ai-customer-service-onprem/) | Same system, but Docker on-prem | 37-node "dynamic-brain" workflow + Qdrant RAG + Ollama integration + 5-phase V&V |

Read at least one before using this skill — they are the empirical ground truth behind every step below.

## When to trigger

| The user says... | Means trigger this skill |
| --- | --- |
| "把這個 repo / 程式 / 系統移到 n8n" | ✅ |
| "Code2n8n 一下" / "幫我做 Code2n8n" | ✅ |
| "this codebase to n8n" / "port to n8n" | ✅ |
| "把這個 serverless function 改寫成 workflow" | ✅ |
| "我的 Python 腳本想丟給營運維護" | ✅ (means: turn it into n8n so non-engineers can manage it) |
| "把這個 Lambda / Apps Script / Express app 視覺化" | ✅ |
| "原生化" / "改成 n8n 原生 node" | ❌ — that's the sibling skill [`n8n-code-to-native`](../n8n-code-to-native/SKILL.md), node-level refactor inside an *existing* workflow |
| "幫我用便利貼描述需求然後產 workflow" | ❌ — that's [`sticky-note-to-workflow`](../sticky-note-to-workflow/SKILL.md), starts from intent, not from code |

## Hard rules

1. **Never strip the upstream license / attribution.** Code2n8n is a derivative-work pattern. Always copy LICENSE, write a CREDITS.md, and record the attribution chain (upstream → derivative changes → this pack). The MIT case study (line-ai-customer-service-onprem) is the template.
2. **Scrub secrets before commit.** Real API keys, JWTs, OAuth tokens, hard-coded passwords in `.env*` / `docker-compose.yml` / `config.*.json` / source code must be replaced with env-var placeholders. Do a `grep -rn "sk-[a-zA-Z0-9]\{20,\}\|ghp_\|AIza\|password.*=.*[a-zA-Z0-9]\{8,\}"` pass before staging.
3. **Don't claim n8n can replace a UI.** If the input has a React SPA / admin dashboard / interactive console, n8n cannot host that natively. Use the **frontend portability decision tree** (Step 4 below) and document the choice honestly in the SDD.
4. **Preserve fidelity.** If the upstream has "10 default tasks" / "14 dropdown choices" / "5 reminder offsets", the port keeps those exactly — and `PROVENANCE.md` maps each preserved item to the upstream line number, pinned to a specific commit SHA.
5. **Always validate before declaring done.** Run the 3-layer funnel (Step 6 below) — *especially* the local n8n REST import. Lint passing alone is not enough.
6. **Tag local imports.** Any workflow imported into the user's local n8n must carry `[Claude YYYY-MM-DD]` name prefix + `claude-import-YYYY-MM-DD` tag + `active: false`. See the memory note `n8n-local-import-marking`.

## The 7-step methodology

### Step 1 — Source inventory

Read the upstream repo and list:

| Inventory item | What to write down |
| --- | --- |
| **Entry points** | webhook paths, cron schedules, CLI args, form submissions, queue consumers |
| **Side effects** | DB writes, file IO, emails, push notifications, external API POSTs |
| **External calls** | every `fetch` / `request` / SDK call (LINE / OpenAI / Gemini / Supabase / Slack / …) |
| **Data stores** | DB schema tables + columns, Redis keys, S3 buckets, vector DBs |
| **UI vs backend** | which files are HTML/JSX/SPA (UI), which are server-side (logic). UI does **not** port to n8n. |
| **Sensitive config** | which env vars / secrets the app needs at runtime. Plan how to feed them to n8n. |

For a small repo (<2000 lines) this fits in one Python snippet:

```python
import json, glob, re
for f in sorted(glob.glob("src/**/*.*", recursive=True)):
    body = open(f, encoding="utf-8", errors="ignore").read()
    entries = re.findall(r"(app|router)\.(get|post|put|delete)\(['\"]([^'\"]+)", body)
    fetches = re.findall(r"fetch\(['\"]([^'\"]+)", body)
    if entries or fetches:
        print(f, "::", entries, "::", fetches[:3])
```

Output: a markdown table that becomes the basis of `docs/field-mapping.md`.

### Step 2 — Partition decision (the rubric)

For each piece of logic, decide one of three fates:

| Pattern | Fate | Why |
| --- | --- | --- |
| Algorithm-heavy, pure (a parser, math, SHA, JWT verify, AI inference) | **Stay as code-as-service** — keep in Python / Node, expose as HTTP endpoint, n8n calls it via HTTP Request node | n8n is bad at dense logic; trying to visualise it makes the workflow unreadable |
| Routing / orchestration / "what happens next based on X" | **Becomes a node + connections** | This is exactly what n8n is for — visible, configurable, auditable |
| External API call (LINE reply, Supabase write, Gmail send) | **Becomes a native node** (Google Sheets, Gmail, Supabase) **or HTTP Request** when no native exists | Compose declaratively; non-JS engineers can read it |
| LLM call with structured prompt + retry | **Becomes a node**, prompt content lives in a Set node so ops can edit it without touching code | Prompts are the ops surface, not the engineering surface |
| Per-item branching on data shape (`if Array.isArray(x.data) ...`) | **Stay as code** in a Code node | IF node branches the whole stream, not per-item; sibling skill `n8n-code-to-native` explains when this is true |
| File building (PDF / CSV / structured Doc) | **Hybrid**: Set node builds content, Convert to File node emits the file | Both halves are visible |

Write the decisions into the SDD before opening n8n. Don't decide on the canvas.

### Step 3 — Architecture: core + entry pattern

For systems with **one logical "do the work" path that may be triggered by multiple sources** (LINE webhook today, WhatsApp tomorrow, Telegram next quarter, CLI for testing), split:

```
[Entry / LINE]      ←┐
[Entry / WhatsApp]  ←┼→  [Core / Message Router]  → [shared business logic]
[Entry / Web Form]  ←┘
```

- **Entries** are thin adapters: they receive the platform-specific payload, **verify signature**, **respond fast** (2xx within the platform's timeout), normalize the message into `{userId, text, eventId, replyToken, channel}`, and call the core via Execute Workflow.
- **Core** is the heavy logic, invoked by `Execute Workflow Trigger`. It does dedup, state, AI calls, side effects, reply dispatch. **The core does not know which channel it came from**.

This is proven in both LINE CS examples (cloud + on-prem). Adding a new channel is one new entry workflow, zero changes to the core. The Google Workspace example used the same core + entry split: 2 core sub-workflows × 4 entries (Form Trigger × 2 + Google Forms webhook × 2).

### Step 4 — Frontend portability decision tree

n8n is not a web framework. If the upstream has a SPA / admin dashboard / interactive console, pick **one of three paths** and document it:

| Path | When to choose | Trade-off |
| --- | --- | --- |
| **A. Keep the original frontend** as-is, talking to the same DB | The upstream UI is already good, the user values UX, and the same DB is reachable from both UI and n8n | Zero frontend work. UI stays separately hosted; "n8n-hosted" claim is partial. *Used in the cloud LINE CS example* |
| **B. Keep the React UI but point it at n8n webhooks** instead of Supabase | The user wants n8n as single backend but still wants polished UI | Real port work: rewrite the API layer of the React app to fetch n8n webhooks |
| **C. n8n-hosted spartan UI**: a Webhook node returns a single-file HTML+JS dashboard, sibling `/admin/api/*` webhooks act as the CRUD API | Marketing material that says "the *whole* system runs in n8n"; small teams; demo scenarios | UI is necessarily spartan — vanilla JS, no React. *Used in cloud LINE CS example's `admin/` folder.* The on-prem example kept the original React UI (path A) because it needed real auth + agent live-chat |

**Document the choice explicitly in `FRONTEND-SDD.md` or the main `SDD.md`**, including which UI features didn't survive (e.g., conversation history needs a `messages` DB table the on-prem version has but the cloud one didn't).

### Step 5 — Workflow design (native first)

Build the workflow with **n8n native nodes by default**, HTTP Request only when the native node doesn't expose what you need. The sibling skill [`n8n-code-to-native`](../n8n-code-to-native/SKILL.md) has the in-place rubric. Three places it's legitimate to fall back to HTTP Request:

1. Operations the native node literally doesn't support (e.g., `setDataValidation` for Google Sheets dropdowns, paragraph styles for Google Docs headings, batchUpdate-only formats).
2. APIs with no native n8n node at all (LINE Messaging API, Google Gemini at the moment).
3. Multi-resource batch operations where the native node would require 5+ chained nodes when 1 HTTP call does the same.

**Mark every HTTP fallback with a 🟡 sticky note explaining why** — it's the difference between "I lazily reached for HTTP" and "this is the only correct path." The Google Workspace example has 3 sticky-noted HTTP fallbacks; everything else is native.

### Step 6 — 3-layer validation funnel

```
Layer 1  ──  Static lint (JSON structure, JS in Code nodes parses, expression syntax, IF-operator
            sanitisation, Gmail required fields, connections, orphan check)
            └─ _audit.mjs                                                          ✅ Tier
Layer 2  ──  Local n8n REST import roundtrip — POST each workflow to /api/v1/workflows;
            n8n's own schema validator runs; DELETE on success
            └─ _n8n_import_test.mjs                                                ✅ Tier
Layer 3  ──  Live execution — real credentials, real LINE/Supabase/AI; run all the
            test cases listed in the SDD
            └─ Manual (you can prep the script; user runs it)                      🟡 Tier (needs creds)
```

Copy `_audit.mjs` and `_n8n_import_test.mjs` from any existing example. Update `ALLOWED_NODE_TYPES` if you introduce a new node type (e.g., `n8n-nodes-base.supabase`, `n8n-nodes-base.crypto`).

**Do not declare done until Layer 1 + 2 both pass 0/0. Mention explicitly in the README that Layer 3 is pending user credentials.**

### Step 7 — Documentation outputs (the recipe)

Every Code2n8n port ships with these documents. They are not optional — they are the deliverable.

| File | Purpose | Template / example |
| --- | --- | --- |
| `README.md` (+ `README.en.md` if zh-primary) | Overall guide, 1-screen overview, quick start | See any of the 3 case studies |
| `SDD.md` | System Design Document: portability verdict, architecture, mapping table, frontend choice, known caveats | LINE CS examples have the cleanest version |
| `FRONTEND-SDD.md` *(if frontend)* | Approach A/B/C decision + scope | LINE CS cloud's `FRONTEND-SDD.md` |
| `CREDITS.md` | Upstream attribution chain | All 3 examples; LINE CS on-prem has the most rigorous (MIT chain) |
| `docs/field-mapping.md` | Function-level upstream ↔ n8n node mapping | LINE CS cloud is concise; Google Workspace is exhaustive |
| `docs/install.md` | Credentials needed, env vars, step-by-step | LINE CS cloud |
| `docs/{platform}-setup.md` | Platform-specific setup (LINE, Google OAuth, Supabase) | LINE CS cloud's `line-setup.md`, `supabase-setup.md` |
| `PROVENANCE.md` *(optional, for high-fidelity ports)* | Line-by-line "this data comes from upstream Code.gs:Lxxx" | Google Workspace example |
| `TODO.md` | What was *not* finished, decision points, scope deferrals | LINE CS cloud has the model TODO |

Every preserved data item (subfolder names, sheet headers, default rows, dropdown choices) **goes into PROVENANCE.md with the upstream line number**, pinned to a specific commit SHA. This is the difference between "we ported it" and "we ported it and can prove it."

## Real-world gotchas catalogue

Every Code2n8n port has encountered some subset of these. Check them off as you go.

### Network / deployment

| Gotcha | Source | Fix |
| --- | --- | --- |
| **Port collision** with another service already using your default port (e.g., 3000 collides with Open-WebUI) | LINE CS on-prem `LESSON_LEARNED.md` | Always check `docker ps` first; build a project-level port-mapping table |
| **Shared infrastructure credentials** mismatch (`postgres/postgres` default vs deployed `adm/tigerai`) | LINE CS on-prem | `docker inspect <container>` before assuming credentials |
| **Global vs per-project Redis** | LINE CS on-prem | Treat Redis/Postgres/Qdrant as a global stack at the host level; n8n + your service connect to it |

### Node / build

| Gotcha | Source | Fix |
| --- | --- | --- |
| **Express v5 wildcard routes** require `:splat*` or regex; bare `*` crashes | LINE CS on-prem | Use `/.*/` regex for SPA fallback in v5 |
| **`ts-node` + ESM modules + `"type": "module"`** → `ERR_UNKNOWN_FILE_EXTENSION` | LINE CS on-prem | Migrate to `tsx` for both prod and dev |
| **Code node JS in n8n** is sandboxed: `require('crypto')` blocked unless `NODE_FUNCTION_ALLOW_BUILTIN=crypto` (or `*`) | LINE CS cloud, signature verification | Document this env var in the install guide |

### LINE / messaging

| Gotcha | Source | Fix |
| --- | --- | --- |
| **LINE signature requires raw body** — n8n Webhook node defaults to JSON-parsed | LINE CS cloud | Set Webhook → Raw Body ON; Code node grabs raw bytes from `$('Webhook').first().binary.data` |
| **Reply token ~1 minute TTL** | LINE CS cloud | Entry workflow responds 200 *immediately*, then invokes core async; core's AI call must finish before token expires (or switch to push) |
| **`n8n-backup/creds_backup.json` etc.** in upstream repo | LINE CS on-prem | NEVER copy to public repo; secret scan everything before commit |
| **One webhook event = many LINE events** | LINE CS cloud | Entry workflow fans out events; core dedupes via `processed_events` PK |
| **n8n has no native LINE node** | both LINE CS examples | All LINE reply / push / getProfile via HTTP Request with `Authorization: Bearer {access_token}` from settings DB |

### Google Workspace

| Gotcha | Source | Fix |
| --- | --- | --- |
| **Native Google Docs node** has no paragraph-style operation | GW example | HTTP fallback to `documents.batchUpdate` with `updateParagraphStyle` |
| **Native Google Sheets node** has no `setDataValidation` / `repeatCell` / `updateSheetProperties` | GW example | HTTP fallback to `spreadsheets.batchUpdate` |
| **Frozen row + bold header + bg colour** for sheets needs sheetId numerics — must `GET /spreadsheets/{id}?fields=sheets(properties(sheetId,title))` first | GW setup workflow | Two HTTP calls (lookup sheetIds, then batchUpdate) |

### AI / RAG

| Gotcha | Source | Fix |
| --- | --- | --- |
| **OpenAI GPT-5 uses `/v1/responses`** (different shape from chat completions) | LINE CS cloud `callGPT` | Build endpoint URL + body in a Code node based on `model.includes('gpt-5')` |
| **Native Gemini support absent in n8n** | LINE CS cloud | HTTP Request to `generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key=...` |
| **Vector RAG**: switch by `active_ai` → different embedding model → different Qdrant collection | LINE CS on-prem workflow (37 nodes!) | Switch node with three paths; each path has its own Embedding node + Qdrant lookup + LLM |
| **Ollama in Docker**: from a n8n container the host is `http://ollama:11434` (Docker network name), not `localhost` | LINE CS on-prem `WALKTHROUGH_N8N.md` | Always parametrise; never hard-code |

## Companion skills

This skill is the orchestrator. Lean on these siblings when their specific domain comes up:

- **[`n8n-code-to-native`](../n8n-code-to-native/SKILL.md)** — once the Code → Workflow translation produces Code nodes inside the n8n workflow, run this skill to declarativise them where it's safe and helpful
- **[`sticky-note-to-workflow`](../sticky-note-to-workflow/SKILL.md)** — for the rare case where the input is *intent* (not code), use this instead
- **[`tigerai-enterprise-patterns`](../tigerai-enterprise-patterns/SKILL.md)** — for the governance overlay (login, audit trail, version, handover, cross-system) once the workflow exists
- **[`n8n-api-bridge`](../n8n-api-bridge/SKILL.md)** — for the REST-only path: import / validate / activate / list / delete workflows programmatically (used by the `_n8n_import_test.mjs` Layer 2 validation)

## Closing line

> AI Coding solves "how is the function built";
> **Code2n8n** (this skill) solves "how is the capability modularised";
> n8n solves "how the modules cooperate across the whole enterprise."

Read [`CODE2N8N.md`](../../../CODE2N8N.md) for the full thesis.
