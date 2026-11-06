# References and Closing Block Spec v1.1

> 🌐 **English** | [繁體中文](references-disclosure.md)

> **Audience**: every Skill that generates or modifies n8n workflows, AI agents using this Skill Pack, integration engineers
> **Core constraint**: after delivering a workflow, tell the user "which materials this run actually drew on", and only tell the truth; the recommendations and scan results we provide are advice and information, and the user decides
> **Closing block (single authoritative definition in Chapter 4)**: fixed order 1. References, 2. Recommendations, 3. Security scan result; the Layer 3 description note and the relevant node `notes` are the official record, and the conversation carries only a short summary
> **Related specs**: reference categories (Sections 3 and 5), node notes (Section 7), security scan (Section 8); the content rules of the recommendations are in [`security-guardrails.en.md`](security-guardrails.en.md) and [`native-first.en.md`](native-first.en.md)

---

## 1. Purpose and principles

The Pack's position is that **a Skill is only the "brain"**, not a template warehouse. Five principles follow from it, and this spec turns them into a fixed behavior:

1. **Output is always current and correct**: a workflow generated for the user is built from scratch with the nodes and parameters currently available in the user's environment. No deprecated nodes, and no assumption that an old template's parameters still hold.
2. **References are digested, not used directly**: templates, statistics and Skills supply approaches and judgment, and are never copied into the output.
3. **When the work is done, tell the user which materials were consulted**: users are entitled to know where a workflow's design basis came from, so they can decide whether to trust it and whether to trace the original.
4. **Disclosure must not become a new source of error**: write "none" rather than invent or pad (see Section 5).

5. **Annotations are the official record**: references, recommendations and scan results live inside the workflow, so they travel with it when it is exported, handed over or put under version control; the conversation carries only a summary and is not the only record.

`tigerai-example-finder` already names the reference templates during example selection. This spec extends the same practice to the whole Pack and fixes where it is written: the workflow's own annotations (the Layer 3 description note and node `notes`).

---

## 2. When it applies

- **Applies to**: any Skill that generates or modifies a workflow. **When writing the Layer 3 note**, write the closing block (Chapter 4) into the note and the relevant node `notes`; **when delivering the result**, add a summary to the conversation.
- **Currently wired in**: `sticky-note-to-workflow`, `tigerai-qa-mode` (hands its record to the former), `code-to-workflow`, `tigerai-enterprise-patterns`, `tigerai-example-finder`, `n8n-code-to-native`, `code2n8n-pipeline` (in the pipeline's last stage), `n8n-security-governance` (source of the generation-time recommendations; content rules in [`security-guardrails.en.md`](security-guardrails.en.md)). Any other Skill that generates or modifies workflows follows the same rule.
- **Does not apply to**: actions that neither generate nor modify a workflow (for example listing workflows or reading execution logs).
- **Log as you go**: while working, the AI keeps an internal "reference log". Each time it reads something that affects the design, it records the category, the source, and what it influenced. The note's References block and the conversation summary are both produced from this log and should match. If more material is consulted after the note was written, go back and add it to the note; do not pretend it was there from the start.
- **Modifying an existing workflow**: when updating an existing Layer 3 note, make the References block reflect the materials used in this modification and keep the earlier entries; rewrite the "Recommendations" and "Security scan result" blocks from the final modified JSON. Do not rewrite the blocks so they look like a single pass.

---

## 3. Categories of disclosed content

Six categories. **Every category appears**; if there is nothing, write "none" explicitly and never omit the line.

### 1. Local examples

- **Content**: `cookbook/xx` and `examples/xx` inside this Pack.
- **Format**: `- Local examples: <path> (<what was adopted>)`
- **Example**: `- Local examples: cookbook/01-webhook-to-slack.md (adopted the webhook + set + notify three-part skeleton)`
- **None**: `- Local examples: none`

### 2. Statistics and skeleton knowledge

- **Content**: documents under `research/`, cited down to the section.
- **Format**: `- Skeleton and statistics knowledge: research/<file> §<section> <topic>`, several entries separated by commas or on separate lines.
- **Example**: `- Skeleton and statistics knowledge: research/patterns.md §2.3 schedule skeleton, §3 anti-pattern 2 (missing error handling)`
- **None**: `- Skeleton and statistics knowledge: none`
- **Note**: seeing a template listed as a "representative template" in `research/patterns.md` does not mean it was read. That counts as category 2 only and must **not** be promoted to category 3.

### 3. Official public n8n.io templates

- **Content**: official public templates actually looked up on n8n.io. **This category exists only if the user agreed to the lookup.**
- **Format**: `- n8n.io official templates: #<ID> "<title>" https://n8n.io/workflows/<ID>`, followed by "approach only; rebuilt with current-version nodes".
- **Example**: `- n8n.io official templates: #<ID> "<title>" https://n8n.io/workflows/<ID> (approach only; rebuilt with current-version nodes)`
- **None (not looked up)**: `- n8n.io official templates: none`
- **User declined**: `- n8n.io official templates: the user chose not to look up external templates`
- **ID and title**: copy them faithfully from the page that was consulted; if the template is also listed in `research/patterns.md`, the ID and title must match that file. In this spec, examples that were not actually consulted use the `#<ID>` placeholder and are marked illustrative.

### 4. Official and community Skills

- **Content**: Skills under `skills/_vendor/` (official and community) that were actually opened and affected the design.
- **Format**: `- Official/community Skills: <Skill name> (<upstream>, <pinned version>)`
- **Where the version comes from**: **per `skills/_vendor/upstream-pins.json`**; write what is there when you read it.
  - If the upstream has a pinned version: write its version tag (with the first 7 characters of the commit if useful).
  - If the upstream has no pinned version: write "unpinned"; do not guess or write "latest".
  - Field names and values are whatever the file contains at read time. **This spec hardcodes no version numbers.**
- **Example**: `- Official/community Skills: n8n-expression-syntax (czlonkowski/n8n-skills, <per upstream-pins.json>)`
- **None**: `- Official/community Skills: none`
- **Note**: the Pack's own Skills and `spec/` documents (for example `sticky-note-to-workflow` and the three-layer spec) count as "Pack built-in spec". They are used every time and are not listed one by one.

### 5. Target n8n version

- **Content**: which n8n version's nodes and parameters this run built against.
- **Format**: `- Target n8n version: <version or range> (per <source>)`
- **Order of precedence**:
  1. The user's instance version (stated by the user, or read through `n8n-api-bridge`): write that version.
  2. Not provided: write "unspecified" and say that the exercised version range in `docs/n8n-version-compat.md` was used (write the range as read; do not hardcode it in this spec).
  3. The user's version is outside the exercised range: say plainly "outside the Pack's exercised range, not exercised".
- **Example**: `- Target n8n version: <x.y.z> (provided by the user; the Pack's exercised range is in docs/n8n-version-compat.md)`
- **None**: this category cannot be "none"; at minimum write "unspecified" and the basis used.

### 6. Standard sentence when no external template was consulted

When categories 1 and 3 are both "none", those two lines may be merged into this single sentence (categories 2, 4 and 5 are still listed as usual):

> No external template was consulted; designed from the requirements and the Pack's built-in spec.

- **No invented sources**: if there is none, there is none. Do not add one just to look well-founded.
- **No padding**: do not list anything that was not read or did not influence the design.

---

## 4. Unified definition of the closing block (authoritative)

This chapter is the only definition of the closing block in the whole Pack. [`security-guardrails.en.md`](security-guardrails.en.md), [`native-first.en.md`](native-first.en.md), [`sticky-note-three-layer.en.md`](sticky-note-three-layer.en.md) and every Skill only point here and do not restate the order or the format.

**Overall principle: the recommendations, references and scan results we provide are all written into the workflow's own annotations. The annotations are the official record; the conversation carries only a short summary that points to them.** Everything about security and native-first is a **recommendation**: the AI raises it and explains why, and the user decides whether to adopt it. The AI never refuses or blocks because the user chose not to adopt something.

### 4.1 The three blocks and their fixed order

| Order | Block | Content | Where the content rules live |
|---|---|---|---|
| 1 | References | Which materials this run actually drew on | Sections 3 and 5 |
| 2 | Recommendations | Security recommendations (`security-guardrails`), native-first and Code node explanations (`native-first`), including items the user chose not to adopt | Section 4.3; rule IDs in Chapter 2 of [`security-guardrails.en.md`](security-guardrails.en.md) and Chapter 7 of [`native-first.en.md`](native-first.en.md) |
| 3 | Security scan result | Result of the rule-based scan | Section 8 |

The order is always 1 -> 2 -> 3, the three blocks appear together, and there is no second closing.

### 4.2 Three locations

| Location | What goes there | Role |
|---|---|---|
| Layer 3 description note (`color = 5`, `position.y` between 600 and 900) | Full content of all three blocks | **Official record** |
| `notes` of the relevant node | Only the recommendation about that node, one short line (Section 4.4) | Official record (node level) |
| Conversation close | A 3-5 line summary pointing to the two annotation locations above (Section 4.5) | Summary, not the official record |

- If a workflow has several Layer 3 notes, the three blocks go in the leftmost one, right after the title (same place and style as the "example lookup results" block in `cookbook/_runnable-Q2-order-line.json`). This supplements the template in §4.2 of [`sticky-note-three-layer.en.md`](sticky-note-three-layer.en.md); it does not replace the other blocks.
- If the conversation summary and the annotations ever differ, the annotations win; everything mentioned in the conversation must be findable in the annotations.

### 4.3 The Layer 3 note template

```markdown
**References**
- Local examples: <cookbook/xx or examples/xx (what was adopted) / none>
- Skeleton and statistics knowledge: <research/xx §n.n topic / none>
- n8n.io official templates: <#ID "title" URL / none / the user chose not to look up external templates>
- Official/community Skills: <name (upstream, version) / none>
- Target n8n version: <version, basis>
- How they were used: approach only; rebuilt with current-version nodes

**Recommendations**
- `<rule ID>`: <status> (<one-line note, optional>)
- ... one line per recommendation ...
- Not applicable: `<rule ID>`, `<rule ID>`
- All of the above are recommendations; the final decision is the user's, and recommendations are not a guarantee of safety

**Security scan result**
- <format in Section 8.3>
```

When no external template was consulted, the "References" block becomes:

```markdown
**References**
- No external template was consulted; designed from the requirements and the Pack's built-in spec.
- Skeleton and statistics knowledge: <research/xx §n.n topic / none>
- Official/community Skills: <name (upstream, version) / none>
- Target n8n version: <version, basis>
```

**Rules for the "Recommendations" block**

1. **One line per recommendation**, starting with the rule ID, then the status and an optional one-line note. Rule IDs are the 13 IDs in Chapter 2 of [`security-guardrails.en.md`](security-guardrails.en.md) plus `native-first:code-node` from [`native-first.en.md`](native-first.en.md).
2. **There are only four statuses**:

   | Status | Meaning | What the note says |
   |---|---|---|
   | Adopted | The recommendation applies and was followed | The approach in one sentence; where the scanner covers only part of it, say what a human should confirm |
   | User chose not to adopt | The user knows the recommendation and the risk and chose another approach | What the user chose, in one sentence. **No reason is needed**; write one only if the user offers it |
   | Not applicable | The workflow has no triggering situation | May be omitted; list the IDs together on the last line |
   | Cannot be checked automatically yet | The recommendation applies but the scanner has no rule for it, so only the AI checked | What was done, and what a human should confirm |

3. **When unsure, do not choose "Adopted"**; choose "Cannot be checked automatically yet" and say what is uncertain.
4. **List the "Not applicable" IDs together on one line** (for example `Not applicable: form:no-auth, exec:ssh`) rather than one line each; the other three statuses get one line per recommendation.
5. **Code node explanations** use the single rule `native-first:code-node`. No Code node: `native-first:code-node`: Adopted (no Code nodes used). Code nodes used: `native-first:code-node`: Adopted (Code nodes: N of M total nodes), followed by one indented "node name: reason" line per Code node. How to count N and M is in Chapter 7 of [`native-first.en.md`](native-first.en.md). The reason matches what that node's notes say. If the user explicitly asks for Code where a native node could do the job, the status is "User chose not to adopt".
6. **When there are no recommendations, write "Recommendations: none"**: if the workflow has nothing to recommend (every item is not applicable), the whole block is the single line `Recommendations: none`. Do not omit the block, and do not invent recommendations to make it look fuller.
7. **Match the final workflow JSON**: an item marked "Adopted" must have a corresponding setting in the JSON; when the workflow changes, update the block too.

**JSON example** (the note node; content is illustrative, no external template consulted):

```json
{
  "id": "sticky-ai-1",
  "name": "AI notes",
  "type": "n8n-nodes-base.stickyNote",
  "typeVersion": 1,
  "position": [0, 700],
  "parameters": {
    "color": 5,
    "width": 560,
    "height": 520,
    "content": "### 🤖 AI implementation notes\n\n**References**\n- No external template was consulted; designed from the requirements and the Pack's built-in spec.\n- Skeleton and statistics knowledge: research/patterns.md §2.2 webhook-fire\n- Official/community Skills: none\n- Target n8n version: unspecified (exercised range in docs/n8n-version-compat.md)\n\n**Recommendations**\n- `secret:hardcoded`: Adopted (credentials are referenced through n8n credentials)\n- `webhook:no-auth`: User chose not to adopt (internal health check only)\n- `error:no-handling`: Cannot be checked automatically yet (Error Workflow attached; please confirm who gets notified)\n- `native-first:code-node`: Adopted (no Code nodes used)\n- Not applicable: form:no-auth, exec:ssh\n- All of the above are recommendations; the final decision is the user's, and recommendations are not a guarantee of safety\n\n**Security scan result**\n- Rule-based scan (does not mean there are no other risks): 0 hits, 1 acknowledged\n  - `webhook:no-auth` @ Health check (acknowledged)\n\n**Node choices**\n- `webhook`: maps to @trigger"
  }
}
```

### 4.4 Recommendations inside node notes

A recommendation about a **specific node** goes in that node's `notes`, as one short line, using the rule IDs of Section 4.3:

```text
Recommendation <rule ID>: <one sentence> (<status>)
```

For example:

- Webhook: `Recommendation webhook:no-auth: suggest Header authentication (user chose not to adopt)`
- Code node: `Why Code: evaluated Edit Fields, <specific reason>` (this is the notes form of `native-first:code-node`; details in Chapter 5 of [`native-first.en.md`](native-first.en.md))
- AI Agent: `Recommendation ai:agent-no-guardrails: suggest passing input and output through the native Guardrails node (cannot be checked automatically yet)`

Rules:

1. Write one only when the recommendation **affects this node** and a reminder is useful: the user chose not to adopt, a human needs to confirm something that is not automatically checkable, or a non-obvious approach was taken. A setting that was adopted and is self-evident can be left out (the full status stays in the Layer 3 note).
2. Recommendations about the workflow as a whole (for example `error:no-handling`, `data:pii-minimization`) live in the Layer 3 note only; if the user wants an acknowledgement line, put it in the trigger node's notes.
3. With the user's agreement, add a separate line `guardrail-ack: <rule ID>`, which the scanner reads (details in Chapter 3 of [`security-guardrails.en.md`](security-guardrails.en.md)). This line is optional.
4. Same as Chapter 7: one to three sentences, explain "why", and do not repeat what the node already shows.

### 4.5 Conversation summary

At the end of the reply that delivers the workflow, add a 3-5 line summary that points to the annotations. For non-technical users (for example in Q&A mode), use plain language and avoid terms such as DSL, Layer or webhook.

```markdown
**Delivery summary**
- References: <one sentence, e.g. "no external template; designed from your requirements and the built-in spec">
- Recommendations: <e.g. "5 recommendations: 3 adopted, 1 you chose not to adopt, 1 cannot be checked automatically yet", or "Recommendations: none">
- Security scan: <e.g. "rule-based scan found 1 reminder", or "no rule hits", or "not run, because ...">
- The full details are in the workflow's "AI notes" sticky note and the notes on the relevant nodes; the annotations are the record.
```

The numbers in the summary must match the annotations, and the summary does not paste the annotations again.

### 4.6 Keeping notes and annotations concise

1. **One line per recommendation**; no long paragraphs. Longer explanations go in the Layer 3 "Known limits" block.
2. **The AI does not write real secrets, suspected key text, internal addresses or real data into a note or node notes.** Examples and descriptions use placeholders or obviously fake values.
3. **A scan hit is written as the rule name and node name only**; the sample field from the scan output is never pasted.
4. **Write valid JSON strings**: the note body lives in `parameters.content` and node notes in `notes`; both are a single JSON string, so:
   - Write every line break as `\n`; no literal newline or tab characters.
   - Escape double quotes as `\"` and backslashes as `\\`. Template titles often contain quotes or emoji, so handle them before writing.
   - Emoji and Traditional Chinese can be written directly (UTF-8); no `\u` escapes are needed.
5. Increase the note's `height` with the number of lines so nothing is cut off, and keep the position within the Layer 3 `y` range.
6. After writing, rescan the final JSON (Section 8.1); the last scan counts.

---

## 5. Honesty rules

1. **List only what was actually read and actually affected the design.** Material that was read but changed nothing is not listed; material never read is not listed.
2. **Templates are "digested", not copied.** Whenever a template is listed (category 3, or a category 1 example whose skeleton was adopted), state "approach only; rebuilt with current-version nodes". If the template used a deprecated node, also state "the template used <old node>; replaced with <current node>".
3. **If the user declines an n8n.io lookup, say so.** Category 3 reads "the user chose not to look up external templates". Do not rewrite it as "none", and do not look up anyway.
4. **If there is nothing, say nothing was used.** With no external template, use the standard sentence from Category 6; do not add a plausible-looking source.
5. **No inflating, no promoting.** A template ID seen only in a statistics document belongs to category 2; without reading its content it cannot be listed under category 3.
6. **Do not pose as tested.** If the target version is outside the range in `docs/n8n-version-compat.md`, say "not exercised". Do not dress up the references with any wording that implies a quality guarantee or readiness to go live.
7. **The AI does not write secrets or internal details into annotations.** References list only public sources and paths inside the Pack; the AI does not write the user's private paths, internal addresses or credential values into a note or node `notes`.
8. **Recommendations and scan results are just as honest.** Write "Cannot be checked automatically yet" for what was not checked, list what the user chose not to adopt as it is, write "Recommendations: none" when there are none (Section 4.3); do not invent recommendations and do not silently drop any.

---

## 6. Counter-examples and good examples

### Counter-example 1: "seen in a statistics file" written as "consulted the template"

The user did not agree to an n8n.io lookup. The AI only read `research/patterns.md`, yet writes this in the note's References block:

```markdown
- n8n.io official templates: #1961 "Slack chatbot powered by AI" https://n8n.io/workflows/1961
```

**What is wrong**: that template is merely a representative template in `patterns.md` §2.2. The AI never read its content and never had the user's consent to look it up. **Fix**: write "none" for category 3 and `research/patterns.md §2.2 webhook-fire` for category 2.

### Counter-example 2: padding

The AI opened only `n8n-expression-syntax`, but lists ten Skill names and the whole `cookbook/` so that it "looks thorough".

**What is wrong**: listing material that was not used makes the user believe the design had more scrutiny than it did; it misrepresents the basis. **Fix**: list only the one Skill that was read and affected the design.

### Good example 1: no external references at all

The user asks for a simple "webhook receives an order, build a message, push a notification". The AI builds it from the Pack's built-in spec and skeleton knowledge only:

The note's References block:

```markdown
**References**
- No external template was consulted; designed from the requirements and the Pack's built-in spec.
- Skeleton and statistics knowledge: research/patterns.md §2.2 webhook-fire
- Official/community Skills: none
- Target n8n version: unspecified (exercised range in docs/n8n-version-compat.md)
```

The References line of the conversation summary: "no external template; designed from your requirements and the built-in spec".

### Good example 2: several sources, with the rewrite recorded

The user agreed to an n8n.io lookup; the AI consulted one template, which used the old Function node:

The note's References block:

```markdown
**References**
- Local examples: cookbook/02-schedule-report.md (adopted the fetch, shape, send three-part schedule skeleton)
- Skeleton and statistics knowledge: research/patterns.md §2.3 schedule skeleton, §3 anti-pattern 1 (deprecated nodes)
- n8n.io official templates: #<ID> "<title>" https://n8n.io/workflows/<ID> (illustrative; the template used a Function node, replaced with a Code node)
- Official/community Skills: n8n-expression-syntax (czlonkowski/n8n-skills, <per upstream-pins.json>)
- Target n8n version: <x.y.z> (provided by the user)
- How they were used: approach only; rebuilt with current-version nodes
```

---

## 7. Node-level notes

Besides disclosing references, the `notes` field on nodes needs a consistent convention. This chapter aligns with the guidance in the official n8n Skills and does not introduce a separate one.

### 7.1 Rules

1. **Write node notes only for non-obvious settings.** For example: a workaround for some limitation, why this node was chosen over another, or which source a setting draws on.
2. **Write the "why", not the "what".** Anything the node name and parameters already show does not need repeating.
3. **Leave obvious nodes empty.** For example, a Webhook whose name already states its purpose, or a plain field-mapping Set.
4. **Indent multi-line expressions and Code nodes, and comment them**, so a maintainer who does not write code can still read the intent.
5. **Keep it short.** One to three sentences; longer explanations go in the Layer 3 note or the workflow's description field.
6. **Relation to references.** If a setting comes directly from a reference, the note may mention it briefly (for example "skeleton from cookbook/01"). The complete list still lives in the References block of the Layer 3 note (Chapter 4); node notes do not replace it.
7. **Recommendations about the node are written here too.** Security and native-first explanations (for example a Webhook's authentication, which native node a Code node was weighed against, an Agent's Guardrails) that affect this node become one short line; the form is in Section 4.4. Such a line is a recommendation, not a checklist item.

### 7.2 Relation to the official approach

The official n8n Skills (the "Readability" section of `n8n-workflow-lifecycle-official` and its `references/STICKY_NOTES.md`, plus `n8n-expressions-official`) already give guidance in the same direction: reserve node notes for non-obvious settings and explain why rather than annotating every node; use sticky notes to annotate, not to group; indent and comment multi-line expressions. On these principles the Pack agrees with the official guidance.

What the Pack adds is three things:

- **A formal note spec**: Layer 1 / 2 / 3 have fixed positions, colors and required blocks (see [`sticky-note-three-layer.en.md`](sticky-note-three-layer.en.md)). The official advice is to skip sticky notes when a workflow has very few nodes; the Pack still requires at least one Layer 3 note per workflow, because it also carries the credential list, assumptions, known limits and references.
- **Notes as requirement input**: the Layer 1 note written by the user is a parseable requirement spec, not just a comment for human readers.
- **After completion, references, recommendations and scan results are written into the annotations**: Sections 3 to 5 and Section 8 of this spec, with the unified definition in Chapter 4.

### 7.3 Supporting statistics

Among the 13,947 public n8n.io templates the Pack digested, 93.1% have a sticky note, but only about 10.1% of templates put notes on their nodes; counted by node, only 3.3% of nodes carry notes. In other words, community templates routinely include sticky notes but rarely explain why an individual node is configured as it is. This is descriptive statistics, not a quality rating; it only shows which gap this guidance fills. (Source of the figures: §9.6 "Annotations and explanations" of [`../research/node-frequency.en.md`](../research/node-frequency.en.md).)

### 7.4 Relation to the three-layer spec

`sticky-note-three-layer.en.md` §3.1 now agrees with this chapter: node `notes` are written only for non-obvious settings and say why. The trace to "which Layer 1 `@step`" that per-node `notes` used to carry is now carried by the Layer 3 note's "Node choices" and "Mapped to user requirements" blocks (which list, for every `@trigger` / `@step` / `@on-error`, the node that implements it). The Layer 3 template in §4.2 now includes the three blocks of Chapter 4 of this spec; a recommendation about a specific node goes in that node's `notes` (Section 4.4).

---

## 8. Security scan result

After every generate or modify action, the third item (3) of the closing block is the **security scan result**. The scan result is **information and recommendations**: the AI reports it honestly, explains what each item means as a risk, and suggests how to handle it, and **the user decides whether to act on it**. A Skill does not refuse delivery because the scan found something.

### 8.1 How to scan

- **When**: before delivery, scan **the workflow JSON that will actually be delivered**. If the workflow exists only in the conversation, save it to a temporary file first. If the JSON changes afterwards (including writing the scan result into the note), rescan the final version; the last scan counts.
- **Command** (run from the Pack root):

  ```bash
  node scripts/security-scan.mjs <workflow.json>
  ```

  Several files can be passed at once, or use `--glob`; `--format json` gives machine-readable output. `--strict` is an optional scanner flag (it also counts warnings in the exit code); **the Skills do not use it and do not require it**.
- **Nature**: this is a **rule-based scan** (secret patterns, malicious patterns in Code nodes, plaintext password fields, Webhooks with no authentication, non-local `http://` addresses), **not an AI audit**. Deep review still belongs to the `n8n-security-governance` Skill and human reviewers.
- **Coverage limits**: for Code nodes only the `jsCode` and `functionCode` fields are scanned, not Python code; the rules are pattern matches, so no hit does not mean no other risk.

### 8.2 Reading the result (matches the script's actual behavior)

The scanner's rules fall into two kinds:

- **Guardrail rules** (matching the recommendations in [`security-guardrails.en.md`](security-guardrails.en.md), for example `webhook:no-auth`): always warnings, always recommendations; a default run does not fail because of them. If a node's notes contain `guardrail-ack: <rule ID>`, the user has acknowledged it, and the scanner prints an `ACK` line that does not count as a warning.
- **Detection rules** (`secret:*`, `jscode:*`, `credential:plaintext` and similar): errors, meant for the Pack's own CI checking files in the repo. `guardrail-ack:` has no effect on them.

| Exit code | Meaning |
|---|---|
| `0` | No detection-rule errors. **Warnings or ACK lines may still exist**, so do not rely on the exit code alone; read the output: only a file with no findings and no ACK prints `OK <file>` |
| `1` | At least one detection-rule error; an unreadable file or invalid JSON also counts as an error and also returns 1. This is **information**, not a verdict that delivery is impossible |
| `2` | No file was given, or `--glob` matched nothing, so nothing was scanned; treat as **not run** |

- **Errors and warnings are reported alike**: tell the user the rule name and node name of each hit, explain the risk and suggest how to handle it. If the user decides to handle it, rescan the final version afterwards; if the user decides not to, record it honestly without hiding it and without deciding for the user.
- **Detection-rule errors are also only reported and recommended on**: for example a suspected secret-leak pattern or a malicious-code pattern. The AI alerts the user and suggests handling (for example moving the secret to the credential mechanism, or confirming where the Code node came from); the Skill does not refuse delivery because of it.
- **ACK lines**: record them honestly as "acknowledged"; do not treat them as fixed, and do not raise the same item again.
- The sample field in the output can contain suspected secret text or internal addresses (for example for `secret:*` and `network:http-cleartext`). **When disclosing, give only the rule name and the node name; never paste the sample text** (Section 4.6).

### 8.3 Disclosure format

Written in the "**Security scan result**" block of the Layer 3 note (the third closing item, after "Recommendations"); the conversation carries only a one-line summary (Section 4.5).

No findings at all (the output is `OK`):

```markdown
**Security scan result**
- Rule-based scan: no rule hits found (does not mean there are no other risks)
```

With findings or acknowledged items:

```markdown
**Security scan result**
- Rule-based scan (does not mean there are no other risks): <N> hit(s), <K> acknowledged
  - <rule name> @ <node name> (<error/warning>): <suggested handling, or the user's decision>
  - <rule name> @ <node name> (acknowledged)
```

Could not run (for example no Node.js environment, the script is missing, or exit code 2):

```markdown
**Security scan result**
- Security scan not run: <reason>
```

- **Never omit it and never claim a pass.** If nothing was scanned, write "Security scan not run". If the scan ran but there were hits, do not write "no rule hits found".
- **In the conversation summary**, use plain language for non-technical users; a rule name may be replaced by a short description (for example "the Webhook has no authentication"). The full rule and node names are in the note.
- **In the note**, write it as a valid JSON string under the rules of Section 4.6.

### 8.4 Where the Code node explanation lives

The Code node explanation (N of M, a reason per node, or "no Code nodes used") belongs to the **Recommendations** block and no longer forms a closing item of its own: it is written on the `native-first:code-node` line of Section 4.3, and each Code node's reason is also written in that node's `notes` (Section 4.4). Format and counting rules are in Chapters 5-7 of [`native-first.en.md`](native-first.en.md). Go by the final workflow JSON; never omit it, never undercount.

---

**Version**: v1.1
**Status**: draft spec. The unified definition of the closing block is Chapter 4; the template in §4.2 of [`sticky-note-three-layer.en.md`](sticky-note-three-layer.en.md) now includes the "References", "Recommendations" and "Security scan result" blocks.
