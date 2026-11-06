---
name: n8n-code-to-native
description: Convert n8n Code (JS) nodes into native declarative nodes (Set / Filter / Merge / Crypto / Aggregate / ConvertToFile) so the workflow is readable by n8n-experts who don't know JavaScript. Use when the user asks to "原生化", "改成 n8n 原生 node", "reduce Code nodes", or refactor an n8n workflow JSON to remove JS where possible.
---

# n8n Code → Native node refactor

The audience for these workflows is **n8n experts who read the canvas but cannot read JavaScript**. A Code node is opaque to them. Replacing it with declarative native nodes — even if the result has more nodes — is the right trade-off.

## Restricted Agent mode (Portal)

> Check for the host marker `[PORTAL-RESTRICTED-AGENT-MODE v1]` (system prompt or session context; rules in [`spec/agent-restricted-mode.en.md`](../../../spec/agent-restricted-mode.en.md)). **No marker: this Skill applies as written. Marker present: the adjustments below override the steps they name.** This text is only a hint; real enforcement is the host's tool allowlist.

- **Input and output**: the workflow JSON comes from the user's paste or a host read-only tool (names per the host); the result is JSON only. The Step 1 helper script is not run (no shell); do the inventory by reading the JSON.
- **Credentials of existing nodes**: keep them exactly as they are. Converting Code nodes never adds, renames or "fixes" a credential; no `STUB-` fake credentials and no invented names. If an existing credential reference is not in the host's `credentialMap`, do not change it; list it under "Credentials to be added" in the Layer 3 note and tell the user.
- **Step 5 (pre-commit check)**: the manual n8n import and test run are **not available**; use the host's static check tool (at most N rounds, set by the host) and report its result as it is. Never say the converted workflow "passed", is "safe", or is "ready to deploy".
- **Interaction step 5 (commit and push)**: not available; no Git writes. The Step 4 change-history line in the sticky note still applies, and the before/after Code node counts go into the `native-first:code-node` line as usual.
- **Closing blocks**: the security scan result is a faithful restatement of the host's check result, or "Security scan not run: <reason>".

## Hard rules

1. **Every conversion bumps the workflow's sticky note** with a `v<N> <date>: ...` change-history line. The first sticky note in the file is the change log. Do not skip this — it is the audit trail.
2. **Never break in-place semantics without confirming with the user.** If a single Code node becomes 1 native node → safe (swap-in-place, no connection edits). If it becomes 2+ nodes → confirm scope first (connections must be re-wired).
3. **Connections in n8n JSON are by node *name*.** Keep the node name identical when swapping types in-place; connections will survive automatically.
4. **n8n expressions support array methods.** `.map`, `.reduce`, `.filter`, `.includes`, regex `.match`, `Math.max(...arr)`, ternaries, optional chaining `?.`, nullish `??`, spread `...` — all work inside `={{ ... }}`. Use them. They are NOT "code" — they are expressions inside declarative nodes.
5. **Do NOT introduce IIFE `(() => { ... })()` in expressions.** That is JS in disguise and defeats the purpose. If the logic needs IIFE, either (a) split into two sequential Set nodes so each step is one expression, or (b) keep it as a Code node.
6. **Keep what genuinely belongs in code.** See "Keep as Code" below. Forcing every Code node into native makes things worse.

## Native-first

This Skill is not only for "convert when the user asks". It is also the **self-check step after generating** a workflow, under [`spec/native-first.en.md`](../../../spec/native-first.en.md):

- **After any Skill generates or modifies a workflow**, if the result contains Code nodes (`n8n-nodes-base.code`, or the legacy `function` / `functionItem`), first run the gate in Section 6 of that spec on each one: expression -> Edit Fields -> native node -> Code (the job-to-node table is in its Section 3). Only then decide whether to convert.
- **A Code node that passes the gate stays**, with a "Why Code" line in its `notes` and short comments in its code. A Code node with no specific reason is converted using the rubric in Step 2 below.
- **Without a user request**, converting in place (one Code node becoming one native node) is allowed as part of the self-check; anything that adds nodes or re-wires connections (rule 2 above) still needs the user's go-ahead.
- This does not change the rules below; it only adds a second entry point. The "Keep as Code" list below and Section 4 of the spec describe the same kind of cases.

## Process

### Step 1 — Inventory

For each workflow JSON, list every `n8n-nodes-base.code` node with its name and JS body. Group by intent (callback builder, parser, aggregator, file builder, …). Useful Python:

```python
import json, glob
for f in sorted(glob.glob("*.json")):
    d = json.load(open(f, encoding="utf-8"))
    codes = [n for n in d["nodes"] if n["type"] == "n8n-nodes-base.code"]
    for n in codes:
        print(f, "::", n["name"], "::", n["parameters"]["jsCode"][:120])
```

### Step 2 — Classify each Code node

| Pattern | Action |
|---|---|
| Returns one item with field assignments (constants + expressions) | **Set (swap-in-place)** |
| Reduces array → scalar (sum/count/max/avg) for fields | **Set with `.reduce/.map/Math.max` expression** |
| Filters items by criteria | **Filter node** (in-place) |
| Pairs items from two upstream nodes by index | **Merge (mode: combine, combineBy: position)** + Set (structural, 2 nodes) |
| Writes file from string | **Set (build content)** + **Convert to File** (structural, 2 nodes) |
| Parses LLM JSON with multi-shape fallback (try/catch over Ollama/OpenAI shapes, regex extract on parse failure) | **Keep as Code** — fallback logic is too branchy for expressions |
| Pure-JS crypto polyfill (SHA-1, UUID v5) | **Crypto node** (n8n native) for SHA-1; UUID v5 needs Crypto + Set + bit-twiddling expressions — feasible but separate effort. Default: keep |
| Dynamic nested object/filter assembly with conditional branches (e.g. Qdrant filter built from for-loops) | **Keep as Code** |

### Step 3 — Convert in-place (Set node)

The Set node (v3 family) shape used in these workflows. Take `typeVersion` from the target n8n version's lookup table in [`docs/node-versions/`](../../../docs/node-versions/README.md) (the `default` of `n8n-nodes-base.set` is 3.5 in 2.37.3, 2.44.6 and 2.46.6; the lookup table is authoritative):

```json
{
  "name": "Build Callback",
  "type": "n8n-nodes-base.set",
  "typeVersion": 3.5,
  "parameters": {
    "assignments": {
      "assignments": [
        { "id": "a1", "name": "folder_path",  "value": "={{ $('Extract Payload').first().json.folder_path }}", "type": "string" },
        { "id": "a2", "name": "chunk_count",  "value": "={{ $input.all().reduce((s, x) => s + (x.json.chunk_count || 0), 0) }}", "type": "number" },
        { "id": "a3", "name": "results",      "value": "={{ $input.all().map(i => i.json).filter(r => r.file_name) }}", "type": "array" },
        { "id": "a4", "name": "status",       "value": "Step 03 進行中", "type": "string" }
      ]
    },
    "options": {}
  }
}
```

- `value` starting with `=` is treated as an expression. Otherwise it is a literal.
- `type` must match the expression's actual return: `string`, `number`, `boolean`, `array`, `object`.
- For empty literal arrays/objects, use `={{ [] }}` / `={{ {} }}` (expression returning the value) with `type: "array"` / `"object"`.
- Newlines inside expression-built strings: use `\\n` in the JSON source (which encodes to `\n` in the actual string value).
- Preserve every other field on the node (`id`, `position`, `credentials`, `disabled`, `notes`, `webhookId`, …) — only change `type`, `typeVersion`, and `parameters`. Conversions are surgical.

### Step 4 — Update the sticky note (MANDATORY)

The first sticky note in the workflow is the change log. Append a line like:

```
--- v1.0.2 2026-05-30: Code -> Set (Build Callback x5 + Build Exclude Request + Build RAG Context, native expressions with .reduce/.map/.filter)
```

Format: `v<file-internal-version> <YYYY-MM-DD>: <what changed in plain language>`. Do **not** rename the workflow file (filename version stays — internal patch bump only). If the file has no sticky note, create one — that file was non-conformant.

### Step 5 — Verify before committing

- Re-read the node JSON: type is `n8n-nodes-base.set`, typeVersion matches the lookup table's `default` for the target version, parameters has `assignments.assignments[]`.
- Node count and connections unchanged for in-place swaps (count by `n['type']` before/after; connections map is by name → still valid).
- Manually import one converted workflow into n8n and run an execution if the user can spare the time; otherwise list the converted nodes in the commit message so the user can spot-check.

### Step 6 — After completion: references, recommendations and scan result

- **Where this happens**: after Step 5, before delivering the converted workflow. Log as you go from Step 1: record what you actually read that affected the conversion (for example the "Keep as Code" list, an official Skill under `skills/_vendor/`, the target n8n version). Run the security scan on the final workflow JSON (after the Step 4 change-log edit), not on an earlier copy.
- Write the references, recommendations and scan result into the Layer 3 note (if the workflow has one, keep earlier entries) and the relevant node notes, and put only a summary in the conversation. Order, format, statuses and honesty rules follow Chapter 4 of [`spec/references-disclosure.md`](../../../spec/references-disclosure.md) (scan in Chapter 8) and are not repeated here.
- **Conversion-specific detail**: the `native-first:code-node` line in the recommendations ([`spec/native-first.md`](../../../spec/native-first.md) Chapter 7) is the place to state the before/after count of `n8n-nodes-base.code` nodes (the Step 1 inventory gives "before", the Step 5 count gives "after") and how many were deliberately kept as Code, with a reason per kept node in that node's `notes`.

## What to KEEP as Code (do not convert)

1. **LLM output parsers** with multi-shape fallback. Example pattern:
   ```js
   const raw = r.message?.content || r.choices?.[0]?.message?.content || r.response || '';
   let s = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
   let parsed; try { parsed = JSON.parse(s); } catch (e) { const m = s.match(/\[[\s\S]*\]/); ... }
   ```
   The branchy try/catch + regex-extract fallback is unreadable as a chain of native nodes.

2. **Pure-JS crypto polyfills.** n8n sandbox blocks `require('crypto')`. SHA-1 and UUID v5 implementations are long but they belong in Code (or can be replaced by the native `Crypto` node — separate, deeper refactor).

3. **Dynamic nested object assembly.** Building something like a Qdrant `filter: { should: [...] }` where the `should` array is built from a for-loop over field names × keywords is genuinely loop-shaped. Native node doesn't model this naturally.

4. **Per-item branching on shape detection.** e.g. `if Array.isArray(item.json) ... else if Array.isArray(item.json.data) ... else if (item.json.text) ... else continue`. An IF node only branches the whole stream, not per-item.

## n8n expression cheat sheet

- Current item: `{{ $json.x }}` (NOT `$.x`)
- All items from current input: `{{ $input.all() }}` → returns `[{json,binary}, ...]`
- First item: `{{ $input.first().json.x }}`
- Reference another node by name: `{{ $('Node Name').first().json.x }}` or `{{ $('Node Name').all() }}`
- Array methods: `{{ $input.all().map(i => i.json.x) }}`, `{{ ... .filter(x => x > 0) }}`, `{{ ... .reduce((s, x) => s + x.json.n, 0) }}`
- Conditionals: `{{ x > 0 ? 'pos' : 'neg' }}`, `{{ x?.y ?? 0 }}`
- Math: `{{ Math.max(...arr) }}`, `{{ Math.round(n) }}`
- String building: `{{ 'Got ' + n + ' items' }}` or backticks via `{{ \`Got ${n} items\` }}` (works in expressions)

## Common pitfalls

- **`includeOtherFields` semantics**: by default the Set v3 family (3.4 and later) returns ONLY the assigned fields. To preserve input fields and add new ones, set `parameters.includeOtherFields: true` at the parameter level (NOT inside `options`). Verify in the n8n UI after import.
- **`$('NodeName').first()` errors** if the referenced node hasn't run on this execution path. Wrap with `?.`: `{{ $('X')?.first()?.json?.y ?? 0 }}`. If the original Code wrapped this in try/catch, that's a signal the node may be optional — preserve safety.
- **Sticky note encoding**: workflow JSONs are UTF-8. When editing via Python, open with `encoding='utf-8'` and dump with `ensure_ascii=False` to keep Chinese readable in the JSON.
- **Don't rename nodes.** Connections key by node name. Renaming requires also updating `d['connections']`. Not worth it.
- **`Math.max(...[])` returns `-Infinity`.** Guard with `(arr.length ? Math.max(...arr) : 0)`.

## When user asks "原生化" — recommended interaction

1. Inventory all Code nodes; classify by the table above.
2. Report counts: how many fall in each category (in-place Set / structural / keep).
3. Recommend doing in-place swaps first as Phase 1 (safe, no connection edits, fast).
4. For structural (Phase 2) and complex (Phase 3), get explicit go-ahead per node — they involve adding nodes or non-trivial expression chains.
5. After each phase: commit with a clear message listing what converted, what stayed and why; push.
