---
name: sticky-note-to-workflow
description: Core skill that converts a Layer 1 Sticky Note (DSL-formatted user requirement) into a complete three-layer n8n workflow JSON — Layer 1 preserved, Layer 2 nodes generated, Layer 3 AI commentary auto-written. Use when the user pastes a sticky note draft, references an existing workflow ID containing user sticky notes, or asks to "generate the workflow" / "build it" / "產 workflow" / "build the workflow" after providing a DSL spec. This is the central executor — it orchestrates the n8n-mcp tools, validates output, and emits a JSON ready for n8n import.
---

# sticky-note-to-workflow — Core Skill

> 🌐 **English** | [繁體中文](SKILL.md)

## Restricted Agent mode (Portal)

> First check whether the host placed the marker `[PORTAL-RESTRICTED-AGENT-MODE v1]` (in the system prompt or session context; format and full rules in [`spec/agent-restricted-mode.en.md`](../../../spec/agent-restricted-mode.en.md)). **No marker: this Skill applies as written (single-machine mode). Marker present: the adjustments below apply and override the rest of this file.** This text is only a hint; real enforcement is the host's tool allowlist, and in this mode the Skill's behavior is "comply with the host's restrictions".

| Where | Adjustment in restricted mode |
|---|---|
| §2 input (existing workflow ID) | Do not go through `n8n-api-bridge`; read only with read-only tools provided by the host (names per the host); if none, ask the user to paste the JSON |
| Step 4 (top-level fields) | `active` is always `false` |
| **Step 4.2** | **Becomes "reference the credentialMap only"**: use only credential names from the host's `credentialMap`, copied character for character; a node writes only `{ "<type>": { "name": "<name>" } }` and **never `credentials.id`** (the host fills in the id server-side from the name, and flags a credential as missing and reports it when no match is found); **`STUB-` fake credentials and any invented name are forbidden**; for a needed credential that is not in the map, the node gets no `credentials` field, and its `notes` and the Layer 3 "Credentials to be added" state "Administrator must create: type=..., suggested name=...". Connection-type triggers are handled the same way, with a reminder that only an administrator activates |
| Step 6 (Layer 3) | Add a "Credentials to be added" list beside "Required credentials" and tell the user that CI will fail until the credentials exist, which is expected and correct |
| **Step 7** | **Becomes "do not write to n8n, output JSON only"**: no PUT, no activation; call the host's static check tool instead, apply legitimate fixes for blocking codes, at most N rounds (set by the host, starting at 3); if it still fails, hand the reasons to the user faithfully |
| Step 8 (closing blocks) | "Security scan result" is a faithful restatement of the host's check result (rule names and node names only); if it did not run, write "Security scan not run: <reason>" |
| §5 output format, §7 conversation rules | Do not put `passed` in `metadata.validation`; use the host precheck's own wording (for example "no blocking codes", "not prechecked"); never say "passed", "safe", "ready to deploy", "activated" or "imported" |
| §8 chaining | No write-back through `n8n-api-bridge`; the product goes to the host's draft flow |

## 1. Trigger conditions

**Explicit triggers**:
- "build the workflow" / "generate it" / "產 workflow" / "produce workflow"
- User pastes a sticky note draft containing `@trigger:` `@step:` etc. OR plain natural language

**Implicit triggers**:
- Q&A mode (`tigerai-qa-mode`) finished 5 stages and user confirmed → auto-chain into this Skill
- Example finder mode user picked A (use example) → auto-chain

---

## 2. Input contract

Accept any of:

| Form | Source |
|---|---|
| Plain text Layer 1 (with DSL tags OR natural language) | Pasted in conversation |
| n8n workflow ID + existing Layer 1 sticky | n8n REST API (via `n8n-api-bridge` Skill) |
| Structured JSON `{ layer1: "..." }` | Programmatic call |

---

## 3. Seven-step generation flow

### Step 0: Detect input as "natural language" or "DSL" (v0.10.0 mandatory)

User stickies come in two flavors; AI must detect first:

| Signal | Decision |
|---|---|
| Contains `@trigger:` / `@step:` / `@branch:` etc. | DSL → straight to Step 1 |
| Pure natural language (Chinese / English / mixed) | Run **Step 0.1 NL→DSL translation** then Step 1 |
| Mixed | Treat as natural language (more lenient) |

#### Step 0.1: Natural language → DSL internal translation

LLM maps user description to `@`-tagged structure (**not shown to user**, internal only):

| Natural-language signal | Maps to |
|---|---|
| "every morning at 9" / "every Monday" | `@trigger: schedule cron "..."` |
| "someone calls webhook" / "external system sends data" | `@trigger: webhook POST /...` |
| "I want a form for users" | `@trigger: form` + `@form-fields:` |
| "Telegram bot receives message" | `@trigger: telegram` |
| 1, 2, 3 / step / then | multiple `@step:` |
| "split into X / Y / Z" | multiple `@branch:` |
| "on failure ..." | `@on-error:` |
| "assume ..." / "⚠️ ..." | `@assume:` |
| "send to" / "notify" / "respond" | `@output:` |

**After translation, AI must echo "My understanding: ..." for user confirmation** (avoid mistranslation).
Echo in user's original language (don't show DSL).

### Step 1: Parse DSL
- Apply `spec/sticky-note-dsl.md` §6 parser spec
- Tokenize → extract `@trigger` / `@step` / `@branch` / `@output` / `@on-error` / `@assume` / `@form-fields` / `@credential` / `@retry` / `@batch`
- **Failure**: missing `@trigger` or `@step` → if NL path, return to Step 0.1 to retranslate (warn user); if DSL path, refuse and ask for completion

### Step 2: Pick skeleton
- Compare against the 14 skeletons in `research/patterns.md` §2 (`webhook-api`, `schedule`, `batch-loop`, ...; names are in that section's overview table); the decision flow is in §5 of that file
- Highest match wins; ties → simpler one
- Record "why X over Y" → write to Layer 3 "Node choices"

### Step 3: Resolve nodes
- For each `@step`:
  1. Apply DSL §4 vocabulary mapping
  2. If not found → check `research/node-frequency.md` Top 30 + AI knowledge base
  3. Still not found → DSL §6.2 "downgrade rule"
- For `@trigger`: apply DSL §3 dictionary (v1.1+ has telegram/slack/googleDrive; `discord` has no native trigger node, so the dictionary maps it to Webhook, see the note in DSL §3)
- For `@branch`: produce `switch` node + multiple outputs; auto-add fallback if missing

### Step 3.5: Native-first

Before creating nodes (Step 4), run the gate in Section 6 of [`spec/native-first.en.md`](../../../spec/native-first.en.md); do not leave it until afterwards:

- List the steps you plan to do with Code, run each through the decision order (expression -> Edit Fields -> native node -> Code), and go native wherever possible; the job-to-node table is in Section 3 of that spec.
- The DSL §4 vocabulary table maps "aggregate, statistics" and "custom code" to `code`; do not adopt that blindly, run the gate first.
- For each Code node that remains, write one "Why Code" line in `notes` and add short comments in the code (Section 5 of that spec).

### Step 4: Generate nodes array
- Each node fields:
  ```json
  {
    "id": "<unique>",
    "name": "<ASCII-only-PascalCase>",
    "type": "<typeFromMapping>",
    "typeVersion": <target version's default; latest when default is null>,
    "position": [x, y],
    "parameters": { ... },
    "notes": "<write only for non-obvious settings, explaining why they are set this way; leave obvious nodes empty>"
  }
  ```
- Always look up `type` and `typeVersion` in the lookup tables of [`docs/node-versions/`](../../../docs/node-versions/README.md) for the target n8n version: a `type` missing from the catalog cannot be used, nodes with `deprecated` or `hidden` set to `true` are not used in new workflows, and the version number is `default` (`latest` when `default` is null); never carry over numbers from another version
- Write node `notes` per Chapter 7 of [`spec/references-disclosure.en.md`](../../../spec/references-disclosure.en.md); a recommendation about that node (security, native-first) is also written here as one short line (§4.4); the trace back to Layer 1 is carried by the Layer 3 "Mapping to user requirements" block
- `position.y` strictly enforces three-layer zones: Layer 1 sticky < 0; Layer 2 nodes ∈ [0, 500]; Layer 3 sticky > 600
- `position.x` increments 220–260px per node by execution order

### Step 4.1: n8n actual import required fields (R3 acceptance enforced)

n8n CLI `import:workflow` and REST API have additional JSON requirements; AI MUST produce:

| Position | Field | Rule | R3 error if missing |
|---|---|---|---|
| Top-level workflow | `id` | 16-char nanoid ([A-Za-z0-9]) | `null value in column "id" of relation "workflow_entity"` |
| webhook trigger node | `webhookId` | UUID v4 | webhook URL falls back to node name → URL unusable |
| webhook trigger node | `name` | **ASCII only / no spaces / no `/`** | with `/` or Chinese, webhook URL becomes `<workflowId>/<encoded-name>/<path>` unreachable |

**Generation code**:
```js
function newWorkflowId() {
  const a='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s=''; for (let i=0;i<16;i++) s+=a[Math.floor(Math.random()*a.length)];
  return s;
}
function newWebhookId() { return crypto.randomUUID(); }
function safeWebhookNodeName(s) { return s.replace(/[^A-Za-z0-9]/g, ''); }
```

**Layer 3 must note**:
- "`webhookId` auto-generated as `<uuid>`; webhook URL is `https://<n8n>/webhook/<configured-path>`"
- If node was renamed, list before/after for human maintainers

> **Restricted Agent mode (Portal)**: with the marker, this whole step does not apply; it becomes "reference the credentialMap only, write the name and never `credentials.id`, no `STUB-`". See "Restricted Agent mode (Portal)" above.

### Step 4.2: Activation-friendly design (v0.9.0 R3 enforced)

n8n has two-tier credential validation: activate checks ref exists; execute checks DB. To allow immediate activation (even before user configures real credentials), AI MUST add stub credentials for **non-connection action nodes**:

```json
"credentials": {
  "<credName>": { "id": "stub-<random8>", "name": "STUB-<credName>" }
}
```

**Action node → credential map**:
| node type | credential name |
|---|---|
| `n8n-nodes-base.slack` | `slackApi` |
| `n8n-nodes-base.gmail` | `gmailOAuth2` |
| `n8n-nodes-base.googleSheets` | `googleSheetsOAuth2Api` |
| `n8n-nodes-base.postgres` | `postgres` |
| `n8n-nodes-base.jira` | `jiraSoftwareCloudApi` |
| `n8n-nodes-base.awsS3` | `aws` |
| `@n8n/n8n-nodes-langchain.openAi` | `openAiApi` |
| `n8n-nodes-base.telegram` (action) | `telegramApi` |

**Connection-type triggers (CANNOT use stubs)**:
- `telegramTrigger`, `emailReadImap`, `slackTrigger`, etc. (n8n has no native `discordTrigger`; see the note in DSL §3)
- AI MUST use ⚠️ red-flagged warning in Layer 3: "real credential required in n8n before activate"
- Stubs cause activate to fail (n8n calls real API to verify token)

### Step 4.3: Avoid webhook path conflict (v0.9.0 rule)

Same n8n instance can't have 2 active workflows sharing `webhook + path`. When generating webhook nodes:
- If Layer 1 says `@trigger: webhook POST /order` → default path to `order-<workflow-tag>`
- workflow-tag inferred from workflow name (e.g. `Order-Risk-Routing` → `risk` or `order-risk`)
- Layer 3 lists final path with reminder "must be unique within instance"

### Step 5: Generate connections
- Main chain linear: trigger → step1 → step2 → ... → output
- `if` / `switch`: connect branches per output index
- `splitInBatches`: output[0]→loop body, output[1]→aggregate
- Multi-branch tail: must connect via `merge` (mode=append) → single output
- Auto-add structural nodes: noOp after if; aggregate after splitInBatches; respondToWebhook for webhook trigger

### Step 6: Generate Layer 3 sticky note
- Mandatory 5 sections (per `spec/sticky-note-three-layer.md` §4.2 template):
  1. Node choices (with rationale vs alternatives)
  2. Required Credentials (checklist `- [ ] xxx`)
  3. Assumptions (including `@assume` content)
  4. Test recipe (≥ 2 cases: golden + error)
  5. Known limits
  6. Mapping to user requirements (each @trigger / @step / @output / @on-error)
  7. **Change log** (last; rules under "Using the change log" below; a missing one only draws a scanner reminder and never blocks)
- Apply anti-pattern check (`research/patterns.md` §3) — if any triggers, add to "Known limits"
- Per Chapter 4 of [`spec/references-disclosure.en.md`](../../../spec/references-disclosure.en.md), add the "References", "Recommendations" and "Security scan result" blocks right after the title (see Step 8); these three blocks are the official record of recommendations and information

**Using the change log** (full spec in [`spec/sticky-note-three-layer.en.md`](../../../spec/sticky-note-three-layer.en.md) §4.4; a recommendation, not a requirement):

- Format: a table or a list; each row has a date (`YYYY-MM-DD`), a change summary, who proposed it ("User" or "AI") and the reason.
- **New workflow**: the first row reads "Created".
- **Changing an existing workflow** (whether the user asked or the AI fixed something on its own): **add one row** to the change log of the existing Layer 3 note; only add, never rewrite or delete older rows. If an older note has no change log, add the "Change log" section first and then this row; do not invent earlier history.
- **No secrets**: no keys, tokens, passwords, internal addresses, personal data or full commands; say what changed, without pasting parameter values.
- The date is the day of the change; ask the user if unsure instead of inventing one. Keep the log honest: do not write something that does not match the real change just to avoid the reminder.
- The scanner's `notes:missing-change-log` only reminds (severity `info`); if the user does not want it, follow that, optionally with `guardrail-ack: notes:missing-change-log` in node notes. Whether the log matches the real change cannot be judged inside the Pack; the pipeline compares at pull-request level (later work).

> **Restricted Agent mode (Portal)**: with the marker, this step does not write to n8n and only outputs JSON. See "Restricted Agent mode (Portal)" above.

### Step 7: Validate
- Via `n8n-api-bridge` Skill, PUT JSON back to n8n (n8n runs built-in schema validation)
- 422 → AI self-fixes per error message → re-PUT
- Still fails → report to user with specific issues

### Step 8: After completion: references, recommendations and scan result

- **Log as you go**: from Step 0 on, record every source that was actually read and affected the design in the "reference log" (Step 2 skeleton choice and Step 3 node resolution add the most).
- **Where this happens**: write it into the Layer 3 note in Step 6; after Step 7 and before delivery, run the security scan on the final workflow JSON and update the note with the result (if the JSON changes again, rescan the final version).
- Write the references, recommendations and scan result into the Layer 3 note and the relevant node notes, and put only a summary in the conversation. Order, format, statuses and honesty rules follow Chapter 4 of [`spec/references-disclosure.en.md`](../../../spec/references-disclosure.en.md) (scan in Chapter 8) and are not repeated here; the content rules of the recommendations are in [`spec/security-guardrails.en.md`](../../../spec/security-guardrails.en.md) and [`spec/native-first.en.md`](../../../spec/native-first.en.md).

---

## 4. Integration with enterprise branch

When input triggers `tigerai-enterprise-patterns` (e.g. PDF/MP3/sensitive data), Step 4 applies its rules:

- Heavy logic → `httpRequest` to worker (no code node)
- loop → force `batchSize=1`
- Layer 3 adds "Security risk" / "Data retention" sections
- Suggest user create SDD `specification.md`

---

## 5. Output format

Returns JSON:

```json
{
  "success": true,
  "workflow": { "name": "...", "nodes": [...], "connections": {...}, "settings": {...} },
  "metadata": {
    "skeleton_pattern": "webhook-api",
    "node_count": 11,
    "layer3_warnings": ["missing @on-error; suggested mode B"],
    "downgraded_actions": [],
    "validation": "passed"
  }
}
```

Caller can:
- PUT `workflow` back to n8n via `n8n-api-bridge`
- Hand JSON to user for direct import

---

## 6. Failure modes and handling

| Failure | Handling |
|---|---|
| Missing @trigger | Refuse, ask user to fill; or suggest Q&A mode |
| Action has no node match | List ambiguities, ask for clarification; no silent substitution |
| Validation fails twice | Mark `success=false`; report specific errors + partial JSON |
| Node count > 25 (branched) / 15 (linear) | Mark warning, suggest sub-workflow split, but produce |

---

## 7. Conversation guidelines

- **Echo intent first**: "My understanding: <one line>. If correct, I'll generate."
- **Show JSON after generation**, no long explanation (explanation is in Layer 3)
- **Note caveats**: "Workflow has three-layer structure. Layer 3 lists N credentials and M assumptions to confirm."
- **Don't fake**: missing things → say missing; uncertain → mark in "Known limits"

---

## 8. Chains with other Skills

```
tigerai-qa-mode (5-stage Q&A) ─┐
tigerai-example-finder         ─┼─→  sticky-note-to-workflow (this Skill)
direct sticky paste            ─┘            │
                                              ▼
                              n8n REST API PUT (with schema validation)
                                              ▼
                              n8n-api-bridge (write back to n8n)
                                              ▼
                              user sees three-layer result on n8n canvas
```
