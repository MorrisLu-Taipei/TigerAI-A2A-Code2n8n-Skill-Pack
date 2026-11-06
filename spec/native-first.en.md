# Native-First Spec v1.1

> 🌐 **English** | [繁體中文](native-first.md)

> **Audience**: every Skill that generates or modifies n8n workflows, AI agents using this Skill Pack, integration engineers
> **Core practice**: by default the AI does not write as a Code node anything that n8n's native nodes can do; when a Code node really is needed, the reason goes in the node's `notes` and the count goes into the "Recommendations" block of the Layer 3 note. This is a recommendation: if the user asks for Code, the AI follows the user's decision
> **Closing item**: the Code node explanation belongs to the "Recommendations" block (Section 7); its location, order and format follow the unified definition in Chapter 4 of [`references-disclosure.en.md`](references-disclosure.en.md)

---

## 1. Purpose and principles

### 1.1 The problem

The user's request is "native nodes first". The problem behind it: when an AI generates a workflow, it is too fond of writing logic as a Code node instead of using the native nodes n8n ships. The result is that whoever inherits the workflow cannot tell what a box on the canvas does without reading code, and the people who inherit workflows are often people who read the canvas but do not write code.

### 1.2 What the official guidance already says

The official n8n Skill (`skills/_vendor/n8n-code-nodes-official/SKILL.md`) already states:

- **The Code node is a last resort.** The decision order is "expression → arrow function inside Edit Fields → Code node".
- Writing Code for something that has a native node is a recurring mistake (the official examples: hashing and HMAC belong in the Crypto node, XML parsing belongs in the XML node).
- The community Skill's `skills/_vendor/n8n-node-configuration/NATIVE_NODES.md` shows, job by job, which native node to use and how to configure it.

On these principles the Pack agrees with the official guidance and does not introduce a separate test.

### 1.3 What the Pack adds

| Item | Official Skill | This Pack |
|---|---|---|
| Principle | Yes (Code is a last resort) | Adopted as is |
| Evidence | None | Statistics over 13,947 public n8n.io templates on what Code nodes are actually used for (Section 8) |
| Gate | Advisory | **A pre-generation self-check**: list, run each item through the decision order, go native where possible (Section 6) |
| Reason | No fixed place | **Every Code node carries its reason in `notes`** (Section 5) |
| Disclosure | None | **The Code node count and reasons are written into the note's recommendations and the node notes** (Section 7) |

---

## 2. Decision order

Whenever you are about to process data with code, ask the four questions below in order. **The first one answered "yes" is the answer**; do not go further.

| Order | Approach | Question | If yes |
|---|---|---|---|
| 1 | Expression (`{{ ... }}`) | Can one expression do this? (one or two fields, string handling, array `map` / `filter` / `join`, date math with Luxon) | Write it directly in the field that needs the value |
| 2 | Edit Fields (including arrow functions) | Does it need several lines or intermediate variables, but is still shaping this one item? | Use Edit Fields with an expression in the value field; use an arrow function only when several lines are needed |
| 3 | A native node | Does n8n have a node dedicated to this job? (group-and-summarize, merge, compare, dedupe, sort, pagination, hashing, file and markup conversion; see Section 3) | Use that node, configured per `NATIVE_NODES.md` |
| 4 | Code node | Do all the above fail, and does it fall under a legitimate case in Section 4? | Only then use Code, with a reason per Section 5 |

Notes:

- **If you are unsure at step 3**, look it up with `search_nodes` rather than assuming there is none. The official Skill's reminder is that n8n has more native nodes than people realize.
- **The official quick test**: can you describe the Code node's job as "take this one item and..."? If yes, it is the wrong tool.
- **Be restrained with arrow functions.** The official Skill allows them in Edit Fields, but the Pack's `n8n-code-to-native` is more conservative about immediately-invoked functions (it treats them as code in another form). Follow the more conservative one: first try splitting into two Edit Fields nodes, each holding a one-line expression; use an arrow function only if the split is awkward. The test is whether the person inheriting it can read it.
- **Two nodes combined to do one job** (for example a Set that builds inputs and a Code that transforms them): the official advice is to merge them into one Edit Fields. Conversely, do not stuff two unrelated transformations into one Code node.

---

## 3. Job → native node cheat sheet

**Basis**: `skills/_vendor/n8n-node-configuration/NATIVE_NODES.md` (community Skill, configuration examples per node) and `skills/_vendor/n8n-code-nodes-official/SKILL.md` (official; Crypto, XML and so on). Node type strings are copied from these two files; typeVersions follow the n8n 2.46.6 node catalog (see the note below). Before building, confirm them on the user's n8n version (see Section 9). A row without a typeVersion (for example RSS) never had one.

> **About the version column**: the version column shows the latest versions in n8n 2.46.6 and is for reference only. What counts is [`docs/node-versions/<target version>.json`](../docs/node-versions/README.md); a node that does not exist in that version must not be used.

| Common data job | Native node | type (typeVersion) | Basis |
|---|---|---|---|
| Single-field transform (case, concatenation, lookup) | Expression / Edit Fields | `n8n-nodes-base.set` (3.5; the Pack's `n8n-code-to-native` example uses 3.4) | Official code-nodes SKILL.md |
| Multi-line data shaping (`map`, `filter`, `reduce`, conditionals) | Edit Fields + arrow function | same as above | Official code-nodes SKILL.md and its `references/ARROW_FUNCTIONS_IN_EDIT_FIELDS.md` |
| Group and summarize, subtotals, counts (like `GROUP BY`) | Summarize | `n8n-nodes-base.summarize` (1.1) | NATIVE_NODES.md "Summarize" |
| Collect many items into one array (bulk API body, one summary message) | Aggregate | `n8n-nodes-base.aggregate` (1) | NATIVE_NODES.md "Aggregate" |
| Turn an array field into one item per element | Split Out | `n8n-nodes-base.splitOut` (1.1) | NATIVE_NODES.md "Split Out" |
| Merge two lists, join on a field, more than two inputs | Merge (`combine` or `combineBySql`) | `n8n-nodes-base.merge` (3.2) | NATIVE_NODES.md "Merge" |
| Diff two datasets, sync (create / skip / update / delete) | Compare Datasets | `n8n-nodes-base.compareDatasets` (2.3) | NATIVE_NODES.md "Compare Datasets" |
| Dedupe; "only new items" for a poller (across executions) | Remove Duplicates | `n8n-nodes-base.removeDuplicates` (2; cross-execution mode needs v2) | NATIVE_NODES.md "Remove Duplicates" |
| Sort, top-N | Sort + Limit | `n8n-nodes-base.sort` (1), `n8n-nodes-base.limit` (1) | NATIVE_NODES.md "Sort + Limit" |
| Filter data by a condition | Filter | `n8n-nodes-base.filter` (2.4) | NATIVE_NODES.md "Filter, IF, Switch" |
| Two branches | IF | `n8n-nodes-base.if` (2.4) | same |
| Many branches | Switch | `n8n-nodes-base.switch` (3.5) | same |
| Date add / subtract, formatting, extract a part, difference between dates | Date & Time (or a Luxon expression) | `n8n-nodes-base.dateTime` (2) | NATIVE_NODES.md "Date & Time"; official code-nodes SKILL.md |
| Hash, HMAC, UUID, signing (including hashing binary files) | Crypto | `n8n-nodes-base.crypto` (2; v1 stores the secret in the workflow, do not copy it) | NATIVE_NODES.md "Webhook signature"; official code-nodes SKILL.md |
| Check a webhook signature | Webhook (`rawBody`) + Crypto + IF | `n8n-nodes-base.webhook` (2.2), etc. | NATIVE_NODES.md "Webhook signature" |
| XML ↔ JSON | XML | `n8n-nodes-base.xml` (1) | NATIVE_NODES.md "Files and markup"; official code-nodes SKILL.md |
| Extract web content, build an HTML table or page | HTML | `n8n-nodes-base.html` (1.2) | NATIVE_NODES.md "Files and markup" |
| Markdown ↔ HTML | Markdown | `n8n-nodes-base.markdown` (1) | same |
| Parse a file (CSV, XLSX, PDF, JSON, ...) into data | Extract From File | `n8n-nodes-base.extractFromFile` (1.2) | same |
| Turn data into a file (CSV, XLSX, JSON, HTML, ...) | Convert to File | `n8n-nodes-base.convertToFile` (1.2) | same |
| Paginated API | HTTP Request's built-in pagination option (use the service's own node first when one exists) | `n8n-nodes-base.httpRequest` (4.5) | NATIVE_NODES.md "HTTP Request pagination" |
| Latest or top rows from a data table | Data Table `get` with `orderBy` and `limit` | `n8n-nodes-base.dataTable` (1.1) | NATIVE_NODES.md "Data Table get" |
| Process only the first item; keep a branch running when there is no data | Node settings `executeOnce`, `alwaysOutputData` | Top-level node settings, not a separate node | NATIVE_NODES.md "Node settings" |
| Call a node once per item | No loop needed: most nodes already run once per item | — | `n8n-loops-official` SKILL.md |
| Parse RSS | RSS Read node | type as found by `search_nodes` | NATIVE_NODES.md "Files and markup" |

The table is not exhaustive. For a job that is not on it, go back to step 3 of Section 2 and use `search_nodes`.

---

## 4. When a Code node is legitimate

The official Skill's stance is "the bar is high, not never". The cases below may use Code without apology, but still need a reason (Section 5):

1. **Computing across several sources over the whole dataset at once**: reading several upstream nodes (`$('A').all()`, `$('B').all()`), building lookup tables or accumulators, then applying them to a third dataset. The official Skill notes that forcing this into an expression produces a one-line megaexpression that is hard to read and impossible to debug.
2. **Cross-item state or multi-step intermediate structures** that single-item tools (expressions, Edit Fields) cannot reach.
3. **Custom logic with no native counterpart**: for example an LLM-output parser for several wrapper formats with a try/catch plus regex fallback; a nested object built from loops (such as a filter assembled dynamically from field names and keywords); per-item branching on data shape (IF only splits the whole stream, not per item). These come from the "keep as Code" list in `n8n-code-to-native`.
4. **Complex reshaping beyond what expressions can do**: only after steps 1 to 3 of Section 2 were tried, including splitting into two Edit Fields.
5. **External libraries**: the Code node can use a short allowlist of libraries (the official Skill mentions `lodash`, `crypto`, `luxon`); expressions cannot. First make sure it is not something the Crypto node or a Luxon expression already does.
6. **Details a native node does not expose**: for example a non-standard signing scheme, or a timing-safe comparison (`NATIVE_NODES.md` says this one is a Code exception), where an `httpCustomAuth` credential does not fit either. These are rare; spell the reason out.
7. **Test injection nodes required by the pipeline**: `code2n8n-pipeline` §1.7 requires a `[TEST]` Code node, disabled by default, beside every node that reads from outside. This is a pipeline design convention and counts as legitimate, but it still counts toward the Code node total; a reason such as "test injection, disabled by default" is enough.

**Not legitimate**: Code doing what an expression could do, or what a native node already does (the official anti-patterns: Code to upper-case a field, Code to build an email body, `new Date()` for date formatting, `require('crypto')` for a hash, an XML node followed by another Code node to pull fields).

---

## 5. How Code nodes are annotated

1. **For a Code node, the AI writes one line in its `notes` saying why a native node cannot do the job.** This matches Chapter 7 of [`references-disclosure.en.md`](references-disclosure.en.md): node notes are written for non-obvious settings and say why. A Code node is inherently a node that "needs explaining", so every one gets a note; the "leave obvious nodes empty" rule does not apply to it. This line is the node-level record of the `native-first:code-node` recommendation (written as in §4.4 of [`references-disclosure.en.md`](references-disclosure.en.md)).
2. **The reason must be specific: name the native node you considered and why it does not work.** Suggested format (in the same direction as the `Why Code:` style in `NATIVE_NODES.md`):

   ```text
   Why Code: considered <native node or Edit Fields>; <the specific reason it cannot be used>
   ```

   For example "Why Code: considered Extract From File; the file is fixed-width and there is no matching option". One to three sentences at most, as in Section 7.1 rule 5 of the references spec. You may also set `notesInFlow: true` so the reason shows on the canvas.
3. **If no specific reason can be written, there is no legitimate reason, and the AI goes back to native nodes.** "More convenient", "I know it better" and "one node does it all" are not reasons. If the user explicitly asks for Code, the AI follows the user's decision, records "User chose not to adopt" in the recommendations, and does not ask the user for a reason.
4. **The code itself is recommended to carry short comments too**: a line or two at the top saying what the node does and what the input and output look like, and comments between sections. This matches Section 7.1 rule 4: a maintainer who does not write code must still be able to read the intent. The AI does not put secrets or internal addresses in comments (the security scan reads the `jsCode` field).
5. **The split between node notes and the Layer 3 note is unchanged**: the node note holds the one-line "why Code"; longer explanations go in the "Node choices" block of the Layer 3 note.

---

## 6. Pre-generation gate (steps for the AI)

Run this **before creating nodes**, over the whole planned workflow, not as an afterthought:

1. **List**: write down every planned step that would use Code (or would be written as a program). Include "Set builds the data, Code transforms it" combinations of two nodes.
2. **Run each through the decision order**: apply the four questions in Section 2, using `search_nodes` and the Section 3 cheat sheet where needed.
3. **Go native where possible**: replace whatever an expression, Edit Fields or a native node can do, and configure it per `NATIVE_NODES.md` (confirm parameters on the target version with `get_node` first).
4. **Only then use Code for what remains**: check Section 4; for each one, write the notes reason and the code comments (Section 5).
5. **Recount after building**: run `scripts/native-first-check.mjs` on the final workflow JSON to produce N / M and suggestions (advisory; it never affects the exit code, see 6.1). You can also count by hand from the JSON: Code-type nodes (`n8n-nodes-base.code`, plus the legacy `n8n-nodes-base.function` and `n8n-nodes-base.functionItem`) as N and all nodes, excluding sticky notes, as M. Confirm every Code node has a note.
6. **Record it in the annotations** per Section 7: write the Code node explanation into the "Recommendations" block of the Layer 3 note.

If a Code node is added during the build, go back to step 2 for it. Counting and checking can be done with `scripts/native-first-check.mjs` (advisory; it never affects the exit code); the AI counts by hand from the JSON only when the script is not available.

### 6.1 Check script (advisory)

```bash
node scripts/native-first-check.mjs [--format text|json] <workflow.json> [...]
node scripts/native-first-check.mjs --glob "examples/**/*.workflow.json"
```

- **Output**: the Code node count N, the total node count M (the denominator excludes sticky notes; the count including them is listed for reference), how many Code nodes have code text, and how many have notes. When N is 0 it prints "未使用 Code 節點" (no Code node used). Each Code node gets one line marked `reason: noted` (notes already filled in, treated as explained, no further reminder) or `reason: missing` (information only).
- **Suggestions**: only nodes that match the conservative rules get an extra `suggest: ... 可能可改用 <native node>（<type>）` line ("may be replaceable by ..."). Cross-run state, environment-variable reads, loops or error handling, Python, and longer snippets never get one.
- **Never affects the exit code**: exit 0 whenever the file is readable and parses; exit 2 only for an unreadable file, invalid JSON, or no matching file. There is no error or warning, only `info` and `suggest`; unknown flags are ignored, and no flag can make it fail.
- **No code is printed**: only node names and suggestions.

Example (fixture `scripts/__test__/native-first-rename.workflow.json`):

```text
== scripts/__test__/native-first-rename.workflow.json
info:    節點 3 個（不含便條；含便條共 4 個）
info:    Code 節點：1 個／全部 3 個（有程式碼文字 1 個、有 notes 0 個）
info:    [Rename Fields] reason: missing
suggest: [Rename Fields] 可能可改用 編輯欄位 Edit Fields (Set)（n8n-nodes-base.set）；樣式比對的提醒，可能有誤，是否採用由你決定
---
Summary: 1 file(s) · Code 節點 1 個／全部 3 個（不含便條）· 有 notes 0 個 · 1 則建議
```

- **Precision and limits of the suggestions**: the script matches patterns and only says "may be replaceable by some native node"; it does not claim a primary category (in the manual spot checks of research §7, the "replaceable" verdict held about 95% of the time, but the primary category matched only about 65%). Measured on the 13,947 templates: 3,055 of the 27,074 Code nodes with code text (about 11.3%) match a rule (135 of them already have notes and are not reminded again), roughly one third of the research document's strict estimate (9,449 nodes, 34.9%), because the script adds line-count and control-flow limits and prefers to stay quiet. A random draw of 60 suggestions, read by one person, came out reasonable for 58 (about 97%); a separate draw of 24 dedicated-node suggestions was reasonable for 22 (about 92%). The samples are small and there is a single judge, so the error is at least several percentage points: treat it as a reminder, not a verdict. The script cannot see upstream or downstream nodes and never runs the code; whether to adopt a suggestion still follows Sections 2 and 5.

---

## 7. Code node explanation inside the recommendations

The Code node explanation is **one of the recommendations**, not a closing item of its own. Its location, order, status names and note format all follow Chapter 4 of [`references-disclosure.en.md`](references-disclosure.en.md) (§4.3 and §4.4); this chapter only defines the content of this one recommendation.

### 7.1 Rule ID and content

Its rule ID is `native-first:code-node`. It is written in the "Recommendations" block of the Layer 3 note, one line like the security recommendations:

When Code nodes are used:

```markdown
- `native-first:code-node`: Adopted (Code nodes: <N> of <M> total nodes)
  - <node name>: <reason>
```

When none is used:

```markdown
- `native-first:code-node`: Adopted (no Code nodes used)
```

- **Status**: if the native nodes were considered and the reason written, record "Adopted"; if the user explicitly asks for Code where a native node could do the job, record "User chose not to adopt".
- **How N and M are counted**: N is the number of Code-type nodes (`n8n-nodes-base.code`, `n8n-nodes-base.function`, `n8n-nodes-base.functionItem`); M is all nodes, excluding sticky notes. Disabled nodes still count; say "disabled by default" in the reason.
- **The reason** must match what that node's `notes` says; do not write a different one.
- **In the conversation summary**, use plain language. For non-technical users: "2 steps are written as code (14 nodes in total); the reasons are in the note and the node remarks"; the full node names and reasons are in the annotations.
- Splitting one Code node into several, or swapping it for another node type that carries the same code, to make N look smaller does not make the workflow easier to read and makes the annotations inaccurate. The count follows the final JSON.

### 7.2 Relation to the other blocks

The "Recommendations" block carries the security recommendations and this one together; for its order relative to the other blocks (References, Security scan result) see §4.1 of [`references-disclosure.en.md`](references-disclosure.en.md). If the workflow is modified and rescanned, recount the Code nodes on the last version as well.

---

## 8. Empirical reference

Among the 13,947 public n8n.io templates the Pack digested (source of the figures: §1 and §4 of [`../research/node-frequency.en.md`](../research/node-frequency.en.md)):

- Code is the 2nd most used node, present in 60.4% of templates (8,423 / 13,947).
- There are 29,882 Code nodes in total, about 9.6% of all nodes (13.0% of non-sticky nodes). Of these, 27,074 carry code text and form the denominator for the purpose classification.

So Code nodes are very common in community templates. For what those Code nodes actually do and how many could be replaced by native nodes, see [`../research/n8n-templates-code-vs-native.en.md`](../research/n8n-templates-code-vs-native.en.md). That document will provide "the distribution of Code node uses in community templates and an estimated range of how many native nodes could replace". **This spec does not quote that document's ratios**; read it directly when needed and cite it with the method and limits it states.

These are descriptive statistics and estimates, not a quality rating and not a conclusion that community templates are wrong: public templates are written for others to read, and there are many causes (no matching node existed at the time, author habit, quick demos, and so on).

---

## 9. Limits

1. **Native nodes vary by n8n version.** If the target version lacks the node, or lacks an option you need, say so honestly and fall back to Code, putting the reason in the notes (for example "the target version has no Compare Datasets"). The typeVersions in Section 3 are the n8n 2.46.6 values; before building, rely on `docs/node-versions/<target version>.json` and confirm with `get_node` on the user's version (how to use and regenerate the lookup: [`../docs/node-versions/README.md`](../docs/node-versions/README.md)). Get the user's version as described in category 5 of Section 3 of [`references-disclosure.en.md`](references-disclosure.en.md).
2. **Pattern matching is a reminder, not a prohibition.** Even if an AI or a script thinks a Code node "looks replaceable by a native node", the judgment in Section 2 and the reason under Section 5 decide; a Code node with a specific reason is legitimate.
3. **Do not split simple logic into a dozen nodes just to avoid Code.** Readability comes first. If going native would take nearly ten nodes and ten well-commented lines of code are easier to read, record that trade-off in the notes and keep the Code node. A very high node count is itself hard to maintain (see the workflow-size reminder in `tigerai-qa-mode`).
4. **This spec does not change the existing conversion flow.** "The user asks to convert Code to native nodes" still goes through `n8n-code-to-native`; this spec governs the default when generating, and the self-check after generating.
5. **The Execute Command node is not loaded by default in n8n 2.x.** We could not find it in the node catalog of any of three default-configured fresh instances (2.37.3, 2.44.6, 2.46.6; see [`../docs/node-versions/DIFF-2.37.3-to-2.46.6.md`](../docs/node-versions/DIFF-2.37.3-to-2.46.6.md)), but older templates may still use it. When you meet one, handle it as in point 1 and do not copy it into a new workflow.
6. **Tool code inside AI agent nodes is out of scope**: this spec covers Code nodes used for ordinary data processing; custom tool code in LangChain-family nodes is judged under the official AI-node Skills and is not part of this count.

---

## 10. Good and bad examples

### Good example 1: everything can be native

The requirement is "every day, total order amounts per customer and notify the top 10". While planning, the AI first thought of one Code node that loops, accumulates and sorts. After the gate: the per-customer total is Summarize, and sorting plus taking the top 10 is Sort plus Limit. Three native nodes, no code at all. The "Recommendations" block of the note says "`native-first:code-node`: Adopted (no Code nodes used)".

### Good example 2: keep Code, with the reason stated

The requirement includes "parse the LLM reply", where the reply comes in several wrapper formats and, on failure, a regex must pull out the JSON portion. The AI considered Edit Fields and expressions; the fallback branches are so many that an expression would become one unreadable line. It keeps one Code node whose notes say "Why Code: considered an Edit Fields expression; the try/catch and regex fallback across several reply formats is unreadable as an expression", with two comment lines at the top describing input and output. The "Recommendations" block of the note says "Code nodes: 1 of 12 total nodes" and lists that node with the same reason.

### Bad example 1: Code for something with a native node, and no reason

After a Webhook, the AI uses one Code node that calls `require('crypto')` to compute an HMAC and check the signature. The node has no notes and the code has no comments. **What is wrong**: HMAC has a Crypto node (together with the Webhook's `rawBody` and an IF), the official Skill lists it as a recurring slip, and it breaks the notes and comment rules in Section 5. **Fix**: Webhook (with `rawBody`) plus Crypto plus IF; the note's "Recommendations" block says "No Code nodes used".

### Bad example 2: overcorrecting

A three-line field-shaping step is split by the AI, to avoid Code, into a dozen Set, IF and Merge nodes, and the canvas becomes hard to read. **What is wrong**: it breaks rule 3 of Section 9, and readability got worse. **Fix**: one Edit Fields with an expression in the value field (an arrow function if needed); no Code node, and not a dozen nodes either.

---

**Version**: v1.1
**Status**: draft spec. `research/n8n-templates-code-vs-native.en.md`, cited in Section 8, is produced by a separate piece of work; until it is finalized, this spec quotes only the figures already in `research/node-frequency.en.md`.
