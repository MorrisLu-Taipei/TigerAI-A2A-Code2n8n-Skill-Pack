# Sticky Note DSL Spec v1.2

> 🌐 **English** | [繁體中文](sticky-note-dsl.md)

> **Purpose**: define Layer 1 (user input) tag syntax so AI can reliably parse user intent.
> **Design principle**: lenient input, strict output. Users may mix natural language + Chinese/English; AI must handle every `@`-prefixed tag.

---

## 1. Basic syntax

### 1.1 Tag format
```
@<keyword>: <value>
```
- `@` followed by lowercase English keyword (no space)
- `:` may be followed by any whitespace
- `<value>` may span multiple lines (continuation = 2+ space indent)

### 1.2 Blocks and comments
- Plain text outside tags = human comments; AI ignores **but preserves** in Layer 3 "Mapped to user requirements"
- Markdown headings `##`, `###` are treated as "logical block separators"; multiple blocks may compose multiple workflows (rare)

### 1.3 Order semantics
- `@trigger` is the start; **exactly one** per workflow
- `@step` follows in declaration order to form the main chain
- `@on-error` regardless of position is the error path
- `@output` is alias for the final step ("output / notify externally")

---

## 2. Standard tags

### 2.1 Required tags
| Tag | Required | Count | Use |
|---|---|---|---|
| `@trigger` | ✅ | exactly 1 | workflow start condition |
| `@step` | ✅ | 1+ | main chain steps |

### 2.2 Optional tags
| Tag | Count | Use |
|---|---|---|
| `@flow` | 0–1 | one-line summary |
| `@input` | 0–1 | trigger input schema (single-line inline OR YAML-like indented list, see §2.2.1) |
| `@form-fields` | 0–1 | when `@trigger: form`, list fields (YAML-like indent) |
| `@output` | 0–1 | external output (alias for final step) |
| `@on-error` | 0–1 | error handling path |
| `@assume` | 0+ | user-stated assumptions (AI writes into Layer 3) |
| `@credential` | 0+ | known credential name |
| `@retry` | 0–1 | workflow-default retry behavior |
| `@batch` | 0–1 | batch params (size, wait) |

### 2.2.1 `@input` / `@form-fields` two writing styles

**Style A — single-line inline** (for simple schemas):
```text
@input: { order_id, customer_email, amount, ip, items[] }
```

**Style B — indented list** (when type/required/notes are needed):
```text
@input: Google Sheet "Cram School Students" / sheet "Payment Records"
  - A: name (string)
  - B: phone (string, required)
  - C: next_payment_date (date YYYY-MM-DD)
```

**Rules**:
- Indent ≥ 2 spaces = continuation belonging to previous `@input` / `@form-fields`
- Each row format: `- <field>: <description> (<type>[, <flags>])`
- `<type>` = JSON primitives + `date` / `email` / `url` / `binary`
- `<flags>` optional: `required` / `optional` / `default=<value>`
- AI parses into node schema / formFields and preserves entire block in Layer 3 "Assumptions"

### 2.3 Inline modifiers (within @step)

`@step` may carry sub-modifiers, on the same line or indented below:
```text
@step: call API GET /data
  - retry: 3
  - timeout: 30s
  - parallel: false
```

### 2.4 `@branch` — strict routing syntax

For switch / multi-way routing, **avoid stuffing natural language into @step**. Use `@branch` block:

```text
@branch: <branch-name> when <condition>
  - <action 1>
  - <action 2>
```

**Example** (from Test 5 order risk routing):

```text
@step: AI risk score → returns {score, reason}
@branch: high when score > 70
  - jira project=FRAUD create issue
  - slack #fraud-alert
@branch: medium when score >= 30 and score <= 70
  - postgres insert review_queue
@branch: low when score < 30
  - postgres insert orders
@branch: fallback when otherwise
  - slack #ops-alert "unknown score: {score}"
```

**Rules**:
- `@branch` must come after the `@step` that produces the routing key
- `<condition>` uses human-readable expressions (`>`, `>=`, `==`, `contains`, `and`, `or`)
- AI maps to `n8n-nodes-base.switch` rules
- **If `@branch: fallback when otherwise` is missing, AI MUST auto-add and note in Layer 3**

### 2.4.1 `@before-branch` / `@after-branch` (v1.2 enhancement)

Cross-branch shared steps (e.g. all paths must write audit log) — don't repeat in each `@branch`. Use:

```text
@before-branch:
  - postgres insert audit_log (event_id, score, ts=NOW())

@branch: high when score > 70
  - jira create issue ...

@branch: low when score < 30
  - postgres insert orders ...

@after-branch:
  - slack #report-channel "Processed #{event_id}"
```

**Maps to nodes**:
- `@before-branch` actions chain **before** the `Switch` node (shared upstream)
- `@after-branch` actions chain **after** the `Merge` node (shared downstream)
- Multiple `@before-branch` / `@after-branch` chains in declaration order
- AI explains in Layer 3 "Node choices" which nodes are shared

---

## 3. `@trigger` vocabulary

| value pattern | maps to | example |
|---|---|---|
| `webhook <METHOD> /<path>` | `n8n-nodes-base.webhook` | `@trigger: webhook POST /order` |
| `schedule cron "<cron>"` | `n8n-nodes-base.scheduleTrigger` | `@trigger: schedule cron "0 8 * * *"` |
| `schedule every <N> <unit>` | same | `@trigger: schedule every 15 minutes` |
| `form` | `n8n-nodes-base.formTrigger` | `@trigger: form` (with `@form-fields`) |
| `manual` | `n8n-nodes-base.manualTrigger` | `@trigger: manual` |
| `email <address>` | `n8n-nodes-base.emailReadImap` | `@trigger: email inbox@x.com` |
| `error` | `n8n-nodes-base.errorTrigger` | `@trigger: error` (build global error workflow) |
| `telegram` | `n8n-nodes-base.telegramTrigger` | `@trigger: telegram bot receives message` |
| `slack` | `n8n-nodes-base.slackTrigger` | `@trigger: slack message event` |
| `discord` | `n8n-nodes-base.webhook` (n8n has no native Discord trigger node; see note below) | `@trigger: discord` |
| `googleDrive` | `n8n-nodes-base.googleDriveTrigger` | `@trigger: googleDrive new file` |
| `executeWorkflow` | `n8n-nodes-base.executeWorkflowTrigger` | `@trigger: executeWorkflow` (sub-workflow entry) |

> **Whether a node exists is decided by [`docs/node-versions/`](../docs/node-versions/README.md)**: every node type in the table above is present in the node catalogs of n8n 2.37.3, 2.44.6 and 2.46.6, except `discord`.
>
> **Discord trigger**: none of these three catalogs contains `n8n-nodes-base.discordTrigger`; n8n has no native Discord trigger node. For `@trigger: discord`, the AI generates `n8n-nodes-base.webhook` instead, with the user's Discord bot or a relay service forwarding events to that Webhook URL, and states in Layer 3 that "n8n has no native Discord trigger node; events must be forwarded by you". (Tried on 2.46.6: the API accepts a workflow containing `discordTrigger`, but activating it returns `Unrecognized node type`.) Trigger nodes from community packages (community templates have used `n8n-nodes-discord-trigger`) are not in the native catalog; the AI does not use them by default, and when the user explicitly asks for one, Layer 3 must flag the risk. To send messages to Discord, use `n8n-nodes-base.discord` (see §4.3).

---

## 4. `@step` action vocabulary

> AI infers nodes from verb + noun. When ambiguous, pick the first match in priority.

### 4.1 HTTP / API
| Keywords | Node |
|---|---|
| "call API", "GET/POST", "fetch data" | `httpRequest` |
| "wait", "Wait", "sleep N seconds" | `wait` |

### 4.2 Logic and shaping
| Keywords | Node |
|---|---|
| "judge", "validate", "if", "condition" | `if` |
| "route", "split by X", "switch by" | `switch` |
| "compose msg", "set field", "set" | `set` |
| "filter", "filter", "keep only" | `filter` |
| "merge", "left join" | `merge` |
| "aggregate", "stats" | `aggregate` or `code` |
| "loop", "N per batch" | `splitInBatches` |
| "custom code", "JS", "Python" | `code` |

### 4.3 Integration nodes
| Keywords | Node |
|---|---|
| "Slack", "notify Slack" | `slack` |
| "Gmail", "send email" | `gmail` (fallback `emailSend` if no credential) |
| "Google Sheet", "spreadsheet" | `googleSheets` |
| "Postgres", "DB", "database" | `postgres` (specify mysql/mongoDb otherwise) |
| "S3", "upload to cloud" | `awsS3` |
| "Jira", "open ticket" | `jira` |
| "Discord" | `discord` |
| "Telegram" | `telegram` |

### 4.4 AI / LLM
| Keywords | Node |
|---|---|
| "AI classify", "LLM", "GPT decision" | `@n8n/n8n-nodes-langchain.openAi` |
| "AI Agent", "conversation" | `@n8n/n8n-nodes-langchain.agent` |
| "embedding", "vectorize" | corresponding langchain embedding node |

### 4.5 Files
| Keywords | Node |
|---|---|
| "save temp", "write file" | `readWriteFile` (`writeBinaryFile` is marked hidden in the 2.37.3, 2.44.6 and 2.46.6 catalogs; do not use it in new workflows) |
| "FastAPI Worker", "call worker" | `httpRequest` (TigerAI convention) |

---

## 5. Complete examples

### Example A: minimum workflow

```markdown
@trigger: webhook POST /ping
@step: respond "pong"
```

→ AI generates: `webhook` → `respondToWebhook(text="pong")`

### Example B: with all optional tags

```markdown
## Flow intent
@flow: Daily sales report

@trigger: schedule cron "0 8 * * *"
@input: none

@step: call API GET https://api.example.com/sales
  - retry: 3
  - timeout: 30s
@step: compute total + Top3 (use code node)
@step: render HTML template

@output: gmail to sales@x.com, subject "Daily Report"
@on-error: slack #ops "Daily failed: {error}"

@assume: API returns JSON `{orders: []}`
@credential: gmail-prod
```

→ AI generates the workflow and writes `@assume` / `@credential` into Layer 3 "Assumptions" and "Required credentials".

---

## 6. Parser behavior spec (for engineers implementing the Skill)

1. **Tokenize**: regex `\n@(\w+):\s*(.*?)(?=\n@|\n##|\Z)`; multi-line continuation by indent
2. **Validate**: missing `@trigger` or `@step` → reject and request
3. **Resolve**: map values to node types via §3 / §4 vocabularies
4. **Disambiguate**: ambiguity → pick first match in vocabulary; record alternatives in Layer 3 "Node choices"
5. **Generate**: build nodes + connections; apply `position.y` zones (see `sticky-note-three-layer.en.md`)
6. **Annotate**: write Layer 3 sticky note

### 6.1 Cross-node variable reference gotcha (**most common pitfall**)

n8n's `$json` is **overwritten by every node's previous output**. When a downstream node needs to reference "earlier upstream" data, must use `$('NodeName').item.json` instead of `$json`:

| Scenario | Wrong | Right |
|---|---|---|
| After Webhook → OpenAI, Slack reads webhook user.id | `$json.body.user.id` | `$('Webhook').item.json.body.user.id` |
| Form data, after IF/Set, still need original body | `$json.body` | `$('Form Trigger').item.json` |
| Telegram trigger, final reply chat.id | `$json.message.chat.id` | `$('Telegram Trigger').item.json.message.chat.id` |

**AI generation rule**:
- Any node referencing "non-immediate-prior node" data → must use `$('NodeName').item.json`
- Trigger payload used in multiple downstream nodes → all use `$('<TriggerNodeName>').item.json`

### 6.1.1 Chinese / special-char field header expression gotcha

When data source field headers contain **Chinese, spaces, hyphens, or `.`**, **don't use dot notation**:

| Scenario | Wrong | Right |
|---|---|---|
| Chinese header "姓名" | `$json.姓名` | `$json['姓名']` |
| Header with space "Order ID" | `$json.Order ID` | `$json['Order ID']` |
| Hyphenated "customer-email" | `$json.customer-email` (parsed as subtraction) | `$json['customer-email']` |
| Leading digit "1stName" | `$json.1stName` | `$json['1stName']` |
| Header containing dot "user.email" as single field | `$json.user.email` (mistaken for nested) | `$json['user.email']` |

**AI generation rule**:
- If header is not pure ASCII letters+digits+underscore, **enforce bracket notation**
- Cross-node refs apply same: `$('Sheet').item.json['姓名']`
- Layer 3 must note "field header contains X, uses bracket notation" so future maintainers remember when changing schema

### 6.2 "No matching node" downgrade rule

When user-described action has no native node, AI must downgrade in this order:

| Action description | Downgrade to |
|---|---|
| "log to console", "print log" | `noOp` + Layer 3 "n8n has no console; check execution log" |
| "ignore error", "fail silently" | `continueOnFail=true` on the failing node |
| "cleanup file", "rm -rf", "delete temp" | None of the three catalogs contains `executeCommand`, so do not generate it. State in Layer 3 "build a separate cleanup mechanism", or call the Worker's cleanup endpoint with `httpRequest`; the `ssh` node exists but is high-risk, so assess it against [`security-guardrails.en.md`](security-guardrails.en.md) first |
| "wait N minutes then redo" | `wait` + same node re-execute |
| "send system notification" (no service specified) | `slack` default; no credential → `gmail`; none → `httpRequest` to any webhook |
| Nothing matches | **Refuse** + list "ambiguous actions" for user clarification |

**Core principle**: downgrade always noted in Layer 3, **no silent substitution**.

---

## 7. Anti-patterns (users avoid)

- ❌ Don't pack multi-action in one `@step`: `@step: call API and write DB and notify` → split into 3 `@step`s
- ❌ Don't omit `@trigger`; AI rejects directly
- ❌ Don't draw ASCII flow charts in Layer 1; AI doesn't parse graphics, only `@` tags
- ❌ Don't use two `@trigger`s; multi-trigger needs multiple workflows

---

**Version**: v1.2 (v1.1 + §2.2.1 `@input` styles / §2.4.1 `@before-branch`/`@after-branch` / §6.1.1 Chinese-header gotcha)
**Status**: DSL locked. Phase 3 `sticky-note-to-workflow` Skill implements per this file.
