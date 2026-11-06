---
name: tigerai-example-finder
description: Given the user's described intent, checks cookbook/ (TigerAI curated) and examples/ (enterprise cases) first, then uses the digested skeleton knowledge in research/ to judge the approach; only with the user's consent does it search official public templates on n8n.io for extra reference. Picks the 3-5 closest approaches, explains each in plain language and how it differs from the user's need, and always says which template was referenced (ID, title, URL). Templates are only read and digested - the actual workflow is always rebuilt from scratch with current node versions; templates are never copied and deprecated nodes are never carried over. Use when the user says "範例查詢模式", "find examples", "show me examples", "anyone done X before", "similar workflow", or vaguely describes a goal and wants to see prior art before committing to a design.
---

# TigerAI Example Finder

> 🌐 **English** | [繁體中文](SKILL.md)

> **Positioning**: this Skill is the "brain", not a template warehouse. Reference templates are *digested*: we read them, understand their skeleton and approach, then rebuild your workflow with the current, correct nodes and versions. We never copy template JSON, and we never carry over deprecated nodes. All you need to know is "which template did it reference".

## 1. Trigger conditions

**Explicit triggers**:
- "example finder mode" / "範例查詢模式" / "Example mode"
- "find examples" / "find similar" / "anyone done X" / "is there one already"
- "show me examples for ..." / "any reference for ..."

**Implicit trigger**:
User mentions "I don't know how", "want to see", "browse first" -> AI proactively asks:
> "Want me to find a few similar examples for reference first?"

---

## 2. Search sources (in priority order)

| Order | Source | Role | How to search | User consent needed? |
|---|---|---|---|---|
| 1 | `cookbook/` | TigerAI curated (with full three-layer notes) | Read `00-INDEX.en.md` titles and use cases | No (local) |
| 2 | `examples/` | Enterprise-grade cases (e.g. `tigerai-flagship/`) | Read each case's INDEX and SDD spec | No (local) |
| 3 | Digested skeleton knowledge in `research/` | Judge skeletons and common nodes without downloading any template | Read [`patterns.en.md`](../../../research/patterns.en.md) (skeleton patterns, anti-patterns) and [`node-frequency.en.md`](../../../research/node-frequency.en.md) (node and quality statistics) | No (local) |
| 4 | Official public templates on n8n.io | Live lookup as reference | See the flow in section 3 | **Yes, in two separate steps** |

Background: the statistics in source 3 come from digesting 13,947 official public templates on n8n.io locally (310,179 nodes, 1,225 node types); the method is in [`n8n-templates-method.en.md`](../../../research/n8n-templates-method.en.md). The repo keeps only the statistics and a handful of representative template IDs - no template files and no full title index.

Most requests find their skeleton in sources 1-3. Only consider source 4 when those three are not close enough.

---

## 3. Search flow

### 3.1 Extract keywords
From the user's description, extract 1-3 core concepts:
> "I want to email the customer list to sales every morning"
> -> keywords: `schedule`, `customer`, `email`

### 3.2 Local search first (sources 1-3)
1. cookbook first -> first match wins (high quality, complete three-layer notes)
2. then examples -> priority for enterprise customers
3. then use `research/patterns.en.md` to decide which skeleton the request belongs to (webhook, schedule, form, batch, branching, sub-workflow, retry and error reporting, ...), and `research/node-frequency.en.md` to confirm common node combinations

### 3.3 Live search of official n8n.io templates (source 4, needs consent)

**Step 1: ask first, do not query directly.** Once keywords are ready, ask the user:
> "The local curated examples roughly cover this. Would you like me to also search official public templates on n8n.io for reference? I only read how they are built; I won't copy or import them."

Without consent, stay with sources 1-3 and make no connection.

**Step 2: after consent, search summaries.** Call the public search API:

```
GET https://api.n8n.io/api/templates/search?search=<keywords>&rows=10&page=1
```

The response is a summary (including `id`, `name`, `description`, `totalViews`, `user`, ...). Use it only to pick candidates; show the user the IDs and titles, and do not read out author personal details.

**Step 3: only after the user picks a template and consents again, fetch its content.**

```
GET https://api.n8n.io/api/templates/workflows/<id>
```

The response is `{"workflow": {...}}`; the node graph is in `workflow.workflow` under `nodes` and `connections`.

**Usage limits (must follow)**:
- Query only the few entries that are needed; no bulk crawling.
- Wait at least 2.5 seconds between requests.
- Never store fetched content in the repo, and never redistribute it.
- Fetched content is only for "reading and understanding the skeleton and approach"; never import it into the user's n8n, and never paste template JSON verbatim into the output.
- If the network is down or the API does not respond, say so honestly and fall back to sources 1-3; never invent template contents.

### 3.4 Ranking

**Core principle: skeleton beats topic**

Users describe needs by "business topic" (e.g. "order notify LINE"), but a workflow's reusability comes from its **skeleton** (webhook + set + notify), not the topic. AI must check the skeleton first.

**Ranking formula** (higher score wins):
1. **Skeleton match** (most important): does the user's described trigger / step count / branching align with the example skeleton?
   - same trigger (webhook / schedule / form ...): +10
   - same primary node types (http+set / merge / splitInBatches): +5 each
2. **Source weight**: cookbook x3 / examples x2.5 / official template x1
3. **Topical keyword hits** (secondary): business-domain words match, +2 each (so topic never overpowers skeleton)
4. **Deprecated-node penalty**: template uses deprecated nodes (Function, FunctionItem, Cron, Start, Interval, ...): -3
5. **Recency bonus**: template created within the last two years: +2
6. Keyword hit count adds +1 each

**Example: user says "order notify LINE"** (IDs below are illustrative)

| Candidate | Topic match | Skeleton match | Source weight | Total | Rank |
|---|---|---|---|---|---|
| cookbook/01 GitHub->Slack | ❌ (GitHub vs order) | ✅✅ (webhook + set + notify, fully aligned) | x3 | **High** | 1 |
| Official template #\<ID-A\> (illustrative) | ✅ (order) | ✅ (same skeleton) | x1 | Mid | 2 |
| Official template #\<ID-B\> (illustrative, uses an old node) | ✅ | ✅ | x1, plus penalty | Mid-low | 3 |

> 🎯 **Lesson**: cookbook 01 has the wrong topic but the most similar skeleton and high quality; ranking it first helps the user more than "same topic but scattered templates".

Take the Top 3-5. **Always explain the ranking rationale** (to avoid confusion):

> "Example 1 has a different topic (GitHub), but **the structure IS your need** - webhook receives an event, compose a message, push a notification. Starting from this approach is fastest."

---

## 4. Presentation format

For each match, AI uses this template (**plain language**, no code dumps):

```markdown
### Example N: <cookbook name / examples case / official template title>

**Referenced template**: #<ID> "<title>" https://n8n.io/workflows/<ID>
(For local sources, write cookbook/xx or examples/xx; no template URL needed)
> I only reference its approach; the actual workflow will be rebuilt with current node versions, not copied from it.

**What this workflow does**
<one-line business goal>

**How it works**
1. Trigger: <webhook / schedule / form>
2. Main steps: <3-5 plain-language steps>
3. Output: <where>

**Key nodes (why chosen)**
- <plain-language node name>: <why over alternatives>

**Vs your need**
- ✅ Same: <what aligns>
- ⚠️ Different: <what differs, what you need to change>

**Old vs new** (only if the template uses deprecated nodes)
- The template uses <old node>; I will use <current node> instead

**Use as reference? Adjust?**
Suggestion: <use as skeleton / adjust N places / not a fit, see next>
```

After listing all examples, AI ends with:

```
How to proceed?
A. Use Example N's approach as the skeleton -> I'll build your version with current nodes
B. None close enough -> switch to Q&A mode for a fresh design
C. Show me more (give me more precise keywords)
```

---

## 5. Handling old vs new

Many templates on n8n.io were created early, or their authors kept older habits. In our statistics over 13,947 official public templates, deprecated nodes (`function`, `functionItem`, `cron`, ...) still appear in some of them, and only about 24.8% of templates have error handling. So "how the template does it" is not "how it should be done today".

Rules:

1. **Say it plainly**: if the referenced template uses deprecated nodes (Function, FunctionItem, Cron, Start, Interval, ...), tell the user directly when presenting it; do not gloss over it.
2. **Use the current nodes**:

   | Old pattern in a template | Use instead |
   |---|---|
   | Function / FunctionItem | Code node |
   | Cron / Interval | Schedule Trigger |
   | Start | An explicit trigger (Manual Trigger, Webhook, Schedule Trigger, ...) |

   Any other old node or old node version is likewise rebuilt with its current counterpart; check the official Skills under `skills/_vendor/` for parameters and usage when needed.
3. **Check against anti-patterns**: before producing a workflow, AI must check the anti-pattern list in [`research/patterns.en.md`](../../../research/patterns.en.md) (e.g. shipping a Manual Trigger to production, missing error handling, old nodes, oversized workflows that are not split), and must not carry a template's bad habits into the output.
4. **Fill in what the template skipped**: if the template has no error handling, add retry and error reporting per the skeleton; if it has no explanatory notes, add sticky notes.
5. **Never copy**: however complete a template is, the output is always a rebuild.

---

## 6. Example: full conversation demo

> **User**: find a workflow that fetches DB data on a schedule and emails a report

> **AI** (internal): keywords = `schedule`, `database`, `report`, `email`; check cookbook and research skeletons first

> **AI**:
> The local curated examples already have a close approach:
>
> ### Example 1: cookbook/02-schedule-report.md ⭐ closest
> **What this workflow does**: every day at 08:00 pulls yesterday's sales data and emails an HTML report to the sales team.
> **How it works**:
> 1. Schedule trigger (every morning at 8)
> 2. Fetch sales data -> compute the top three -> apply an HTML template
> 3. Send to the sales mailbox
>
> **Vs your need**:
> - ✅ Same: scheduled, builds a report, sends email
> - ⚠️ Different: your source is a database, not an API -> replace the fetch step with a database node
>
> **Suggestion**: adjust from this skeleton, about 5 minutes
>
> Only this one is very close locally. **Would you like me to also search official public templates on n8n.io for reference?** I only read how they are built; I won't copy or import them.
>
> (Only after the user says yes do I search and list candidates. If one is used, it is labeled like this:)
>
> ### Example 2: official template (illustrative format)
> **Referenced template**: #\<ID\> "\<title\>" https://n8n.io/workflows/\<ID\>
> > I only reference its approach; the actual workflow will be rebuilt with current node versions, not copied from it.
>
> **Old vs new**: this template uses the old Cron node; I will use the Schedule Trigger instead.
>
> How to proceed? A / B / C?

---

## 7. Next step

| User picks | AI action |
|---|---|
| A (use example as skeleton) | Enter `sticky-note-to-workflow`, bring the example's Layer 1 and help adjust it; always use current node versions |
| B (design fresh) | Switch to `tigerai-qa-mode` 5-stage Q&A |
| C (more) | Re-search and present the 6th-10th (official templates need fresh consent before connecting) |
| Nothing / vague | AI proactively pushes A (most common choice) |

---

## 8. Conversation guidelines

1. **Always plain language**: avoid `n8n-nodes-base.xxx` type names; say "Slack node", "database node".
2. **Always compare**: each example must say "vs your need"; do not just paste descriptions.
3. **No more than 5**: more causes fatigue.
4. **Say honestly when nothing is found**: say "no close example, I suggest designing directly" and suggest Q&A mode; do not stretch a weak match.
5. **Do not pretend to know**: if unsure what a template does, say so; if you did not read its content, do not describe details.
6. **Ask before querying**: always get the user's consent before connecting to n8n.io, and consent again before fetching full content.
7. **Name the reference**: every non-local example needs an ID, title and URL so the user knows which one was referenced.
8. **Never copy or import**: do not paste template JSON into the output, do not import into the user's n8n, do not store in the repo.

---

## 9. Relation to other Skills

- **Vs `tigerai-qa-mode`**: complementary; if no good example, switch to Q&A
- **Vs `cookbook/`**: first search source
- **Vs `research/`**: digested skeleton and anti-pattern knowledge, the basis for judging and gatekeeping
- **Vs `sticky-note-to-workflow`**: hand off once the user picks an approach
