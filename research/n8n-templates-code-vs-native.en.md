# Code Nodes in Community Templates: What They Do and How Many Could Use Native Nodes

> **English** | [繁體中文](n8n-templates-code-vs-native.md)

> **Sample**: 13,947 public templates from n8n.io (how they were fetched and how complete the set is: [`n8n-templates-method.en.md`](n8n-templates-method.en.md); full node statistics: [`node-frequency.en.md`](node-frequency.en.md)).
> **Nature**: everything below is descriptive statistics and heuristic estimates. It is not a criticism of template authors and does not mean a Code node is bad. This repo stores aggregate numbers only: no template content, IDs, authors, or code snippets.
> **Purpose**: an empirical background for the "prefer native nodes when AI generates a workflow" spec ([`../spec/native-first.en.md`](../spec/native-first.en.md)): what Code nodes in community templates actually do, and how many have a native node available.

---

## 1. Sample and denominators

| Item | Number |
|---|---|
| Templates | 13,947 |
| Node instances | 310,179 (229,073 excluding sticky notes) |
| Code nodes (type `n8n-nodes-base.code`) | **29,882**, in **8,423 templates (60.4%, denominator 13,947)** |
| With code text (`jsCode` or `pythonCode` non-empty) | **27,074** (90.6% of 29,882); 8.7% of all nodes |
| Code nodes without code text | 2,808 (reason not investigated, possibly parameters not stored; excluded from the use-case classification) |
| Language | JavaScript 26,946 (99.5%), Python 128 (0.5%); denominator 27,074 |
| Execution mode | Run once for all items 24,759 (91.4%), run once for each item 2,315 (8.6%); denominator 27,074 |

**Denominator convention**: the use-case classification, line counts and replaceability estimates use the 27,074 Code nodes that have code text. Template-level figures and node shares ("Code nodes per template", "Code-dominated") use all 29,882 Code nodes (a node without code text still counts as a node). The "27,074 Code nodes, about 8.7% of all nodes" quoted in [`../spec/native-first.en.md`](../spec/native-first.en.md) §8 is the same 27,074.

---

## 2. How to read this, and limits

1. **The primary category is a heuristic.** It is decided from patterns (regular expressions) in the code text plus complexity (lines, branches, loops, functions). Each node gets one primary category; every other matching category is recorded as secondary. The code was not executed and neighbouring nodes were not inspected, so misclassification happens.
2. **"Replaceable" does not mean "should be replaced".** The estimate is: ignoring readability trade-offs and the user's n8n version, a native node or an expression can do this job. Splitting simple logic into a dozen nodes is not necessarily easier to read (see [`../spec/native-first.en.md`](../spec/native-first.en.md) §9).
3. **Upstream nodes and the author's reasons are invisible.** A template may use Code because no native node existed then (Summarize, Remove Duplicates and Compare Datasets came later), for demonstration, or because it genuinely needed it.
4. **Line count** is non-blank lines excluding whole-line comments. Pattern matching looks at the first 20,000 characters of each node (this only affects a handful of minified, very long scripts and not their classification).
5. **The spot check is a subjective judgement** made by reading the first 280 to 420 characters of each sampled node. Boundary cases are fuzzy by nature; see §7.
6. **Templates skew recent**: 91.7% were created in 2025 to 2026 (see [`node-frequency.en.md`](node-frequency.en.md)). The year trend (§8) is affected, and 2020 to 2024 have small samples.
7. These numbers describe public templates, not internal workflows in general.

---

## 3. Scale and share

| Metric | Value | Denominator |
|---|---|---|
| Templates with Code | 8,423 (60.4%) | 13,947 templates |
| Code nodes as a share of all non-sticky nodes | **13.0%** (29,882 / 229,073) | all non-sticky nodes |
| Code nodes as a share of all nodes (incl. sticky) | 9.6% (29,882 / 310,179) | all nodes |
| Code nodes per template that has Code | median 2, mean 3.5, P90 8, max 77 | 8,423 templates with Code |
| Same, templates with exactly 1 Code node | 32.6% | 8,423 |
| Same, up to 3 Code nodes | 67.7% | 8,423 |
| Same, 10 or more Code nodes | 503 templates (6.0%) | 8,423 |
| Code nodes per template over all templates | median 1, P90 6 | 13,947 |
| Within a template that has Code, Code as a share of non-sticky nodes | median 18.8% | 8,423 |
| **Code-dominated** (Code nodes >= 50% of non-sticky, non-trigger nodes) | **376 templates** | 2.7% of all templates (/13,947); 4.5% of templates with Code (/8,423) |

Trigger detection follows [`n8n-templates-method.en.md`](n8n-templates-method.en.md) §4 (type ending in `Trigger`, `webhook`, legacy `cron`).

---

## 4. Code length

Denominator: 27,074 Code nodes with code text.

| Metric | Value |
|---|---|
| Median lines | **21** |
| Mean lines | 36.7 |
| P90 lines | **79** |
| Nodes with <= 10 lines | **26.0%** |
| Nodes with <= 15 lines | 39.1% |
| Nodes with > 50 lines | 19.3% |
| Nodes with > 100 lines | 6.6% |

---

## 5. Use-case classification (primary category)

Each node gets one primary category. The order is "most specific first": cross-execution state and environment variables, then jobs that have a dedicated native node (hashing, XML, files, HTTP, Markdown, HTML, deduplication, sorting, aggregation, merging, splitting, slicing, filtering, dates), and only then the generic string, JSON, field-mapping and condition categories. Code that is complex (many branches, loops or functions, or long with branching) is always classed as "Custom algorithm or complex business logic". The full rules are kept in a machine-readable rules file (not part of this repo). Denominator 27,074.

| Primary category | Nodes | Share | Median lines | Native equivalent | Replaceability |
|---|---|---|---|---|---|
| Custom algorithm or complex business logic | 10,427 | 38.5% | 47 | No native equivalent | No native equivalent |
| Field mapping, renaming and assembly (incl. simple conditions) | 7,981 | 29.5% | 10 | Edit Fields (Set) | Replaceable |
| Parsing AI response text (fences, JSON, fallbacks) | 1,206 | 4.5% | 16 | Structured Output Parser / Information Extractor, or the expression .parseJson() | Partly replaceable |
| Cross-execution state (workflow static data) | 965 | 3.6% | 24 | No native equivalent (partly Remove Duplicates cross-execution mode, Data Table) | No native equivalent |
| String handling and regex | 906 | 3.3% | 15 | Expression (string methods), Edit Fields, Extract nodes | Replaceable |
| JSON parse or serialize | 791 | 2.9% | 11 | Expression (.parseJson() / JSON.stringify), Edit Fields | Replaceable |
| Date and time handling | 715 | 2.6% | 19 | Date & Time (or Luxon in an expression) | Replaceable |
| File and binary handling | 695 | 2.6% | 13 | Extract From File / Convert to File (also Read/Write Files, Compression) | Replaceable |
| Deduplication | 529 | 2.0% | 14 | Remove Duplicates (incl. cross-execution mode) | Replaceable |
| HTML parse or build | 453 | 1.7% | 17 | HTML (Extract HTML Content / Convert to HTML Table / Generate HTML Template) | Replaceable |
| Splitting arrays into items | 414 | 1.5% | 11 | Split Out | Replaceable |
| Sorting | 364 | 1.3% | 14 | Sort | Replaceable |
| Aggregation and grouping | 338 | 1.2% | 16 | Summarize / Aggregate | Replaceable |
| Filtering items | 315 | 1.2% | 11 | Filter | Replaceable |
| Merging or comparing sources | 189 | 0.7% | 16 | Merge / Compare Datasets | Partly replaceable |
| ID and random generation | 173 | 0.6% | 11 | Crypto (generate) / expressions such as $randomInt | Replaceable |
| Conditions and routing (no field assembly) | 142 | 0.5% | 11 | IF / Switch | Replaceable |
| Passthrough or empty shell | 117 | 0.4% | 1 | No node needed (remove it) or No Operation | Replaceable |
| Limit and slicing | 107 | 0.4% | 13 | Limit | Replaceable |
| Reading environment variables ($env, $vars) | 96 | 0.4% | 17 | Expression {{ $env.NAME }} in Edit Fields | Replaceable |
| Hash, HMAC, signing, encryption | 68 | 0.3% | 19 | Crypto | Replaceable |
| Markdown conversion | 59 | 0.2% | 15 | Markdown | Replaceable |
| HTTP calls | 16 | 0.1% | 22 | HTTP Request (built-in pagination) | Replaceable |
| XML parse or build | 4 | 0.0% | 19.5 | XML | Replaceable |
| Wait and delay | 4 | 0.0% | 3 | Wait | Replaceable |

**How to read it**:

- The two largest categories are "Custom algorithm or complex business logic" (38.5%) and "Field mapping, renaming and assembly" (29.5%). The latter is what Edit Fields is for; its median is only 10 lines.
- Jobs with a dedicated native node (deduplication, sorting, aggregation, splitting, filtering, slicing, files, HTML and so on) each account for 0.0% to 2.6%, but together they are not small (see §13).
- "HTTP calls", "XML" and "Wait" are almost absent from Code nodes (24 nodes in total, each category under 0.2%).
- "Parsing AI response text" is 4.5%. This code often carries fallbacks for several response shapes, so it is "partly replaceable": using structured output upstream (Structured Output Parser or Information Extractor) removes the after-the-fact parsing. For comparison, 2,294 (16.4%) templates contain a Structured Output Parser and 318 (2.3%) contain an Information Extractor (denominator 13,947).

### Secondary hits (share of nodes containing the pattern anywhere)

A node can match several categories, so the total exceeds 100%. Denominator 27,074.

| Pattern category | Nodes | Share |
|---|---|---|
| Field mapping, renaming and assembly (incl. simple conditions) | 25,718 | 95.0% |
| Conditions and routing (no field assembly) | 14,416 | 53.2% |
| String handling and regex | 8,191 | 30.3% |
| JSON parse or serialize | 5,292 | 19.5% |
| Date and time handling | 3,804 | 14.1% |
| Parsing AI response text (fences, JSON, fallbacks) | 3,603 | 13.3% |
| Deduplication | 2,668 | 9.9% |
| Sorting | 2,331 | 8.6% |
| Aggregation and grouping | 2,070 | 7.6% |
| HTML parse or build | 1,664 | 6.1% |
| Merging or comparing sources | 1,485 | 5.5% |
| File and binary handling | 1,176 | 4.3% |
| Splitting arrays into items | 1,127 | 4.2% |
| Filtering items | 1,103 | 4.1% |
| Cross-execution state (workflow static data) | 965 | 3.6% |
| Limit and slicing | 606 | 2.2% |
| ID and random generation | 564 | 2.1% |
| Hash, HMAC, signing, encryption | 380 | 1.4% |
| Markdown conversion | 300 | 1.1% |
| Reading environment variables ($env, $vars) | 215 | 0.8% |
| Passthrough or empty shell | 141 | 0.5% |
| HTTP calls | 125 | 0.5% |
| Wait and delay | 39 | 0.1% |
| XML parse or build | 19 | 0.1% |

---

## 6. Estimate of what native nodes could replace

This is a **heuristic estimate and it contains misjudgements** (see §2 and §7). Four definitions, from narrow to wide; the denominator is 27,074 for all of them:

| Definition | Rule | Nodes | Share |
|---|---|---|---|
| **Strict estimate** | Primary category is a "replaceable" one, code is <= 15 lines, no cross-execution state, no environment variables, not a custom algorithm | 9,449 | **34.9%** |
| **Middle estimate** | Primary category is "replaceable" or "partly replaceable" (any length), no cross-execution state, no environment variables, not a custom algorithm | 15,586 | **57.6%** |
| Loose upper bound | Any pattern of any replaceable category appears anywhere | 26,529 | 98.0% |
| (Reference) dedicated-node patterns | Any pattern of a category that has a dedicated native node (excluding generic field mapping, conditions, strings, JSON) | 11,542 | 42.6% |

**Suggested reading**: "roughly 35% to 58%". The strict estimate is conservative; the middle estimate also counts longer nodes that are still data shaping. The loose bound is close to 100% because almost every node touches field mapping or a condition somewhere, so it carries no information and serves only as a boundary.

Not replaceable: custom algorithm or complex business logic 38.5%, cross-execution state 3.6% (they do not overlap, because state takes priority when classifying).

**Composition of the strict estimate** (top 8 categories):

| Primary category | Nodes | Share of all (/27,074) | Share of the strict estimate (/9,449) |
|---|---|---|---|
| Field mapping, renaming and assembly (incl. simple conditions) | 5,882 | 21.7% | 62.2% |
| JSON parse or serialize | 517 | 1.9% | 5.5% |
| String handling and regex | 483 | 1.8% | 5.1% |
| File and binary handling | 450 | 1.7% | 4.8% |
| Deduplication | 311 | 1.1% | 3.3% |
| Date and time handling | 280 | 1.0% | 3.0% |
| Splitting arrays into items | 270 | 1.0% | 2.9% |
| Filtering items | 233 | 0.9% | 2.5% |

**Sensitivity to the complexity gate**: whether a node counts as custom depends on a complexity gate. Loosening or tightening it gives the following (same nodes):

| Gate setting | Strict | Middle | Classed as custom |
|---|---|---|---|
| Final (used in this document) | 34.9% | 57.6% | 38.5% |
| Loose (only block > 40 lines or complexity >= 18) | 35.1% | 73.1% | 22.8% |
| Tight (> 20 lines and complexity >= 3 counts as custom) | 32.6% | 48.5% | 47.7% |

The strict estimate is insensitive to the gate (32.6% to 35.1%); the middle estimate is very sensitive (48.5% to 73.1%) because nodes of 16 to 40 lines are the hardest to judge.

**Template level**: among the 7,678 templates that have at least one Code node with code text, **every** such node meets the strict estimate in 1,378 templates (17.9%) and the middle estimate in 2,962 (38.6%). In other words, by this estimate roughly 18% to 39% of templates with Code could do without a Code node entirely.

---

## 7. Spot check

To see how reliable the heuristic classification is, random samples were drawn from the results and the code was read by hand. Only numbers and error types are reported.

| Round | Sample | Result |
|---|---|---|
| Round 1 (before adjustment) | 100 nodes classified as "replaceable" | category and replaceability both reasonable 52; category off but "replaceable" reasonable 34; "replaceable" not reasonable 14. **Replaceability reasonable 86%**, category matches 52% |
| Round 1 (before adjustment) | 100 nodes classified as "custom algorithm" | truly custom or complex 86; actually doable with native nodes or expressions 14. **Reasonable 86%** |
| Round 2 (after adjustment, fresh sample) | 100 "replaceable" | category and judgement both reasonable 65; category off but judgement reasonable 30; judgement not reasonable 5. **Replaceability reasonable 95%**, category matches 65% |
| Round 2 (after adjustment, fresh sample) | 100 "custom algorithm" | reasonable 84; not reasonable 16. **Reasonable 84%** |

Round 2 combined: 179 / 200 (89.5%). Every number in this document was computed with the adjusted rules.

**Main error types** (round 1, used to adjust the rules):

- Keyword false hits: words in data (for example node or field names containing "duplicate" or "seen") read as deduplication; substrings of `Math.random` or `uuid` read as random generation; a mere mention of `mimeType` or `fileName` read as file handling.
- Complexity underestimated: two nested loops, nested matching across several upstream nodes, and hand-written state machines under 40 lines were counted as replaceable.
- Generic categories competing: field mapping, conditions, dates and strings often appear together in one node, so which one becomes primary is close to arbitrary.
- Custom over-called: very long nodes that only assemble HTML or message text, or that are just a long list of constants, were sent to custom by the complexity gate.

**Adjustments after round 1**: removed keyword-only patterns; date, string and condition categories now need enough occurrences to count as a hit; "merging" now requires references to two different upstream nodes; complexity no longer counts `||`, `??` or arrow functions (too common in field mapping) and the line and branch gates were recalibrated; field mapping needs real evidence of assembling an object to be primary; very short nodes that match no pattern are classed as field mapping. The gate values were tuned on the 200 labelled nodes of round 1, which is why round 2 uses a fresh sample.

**Error types that remain in round 2**: data-shaping nodes of 16 to 40 lines with some branching (whether they are "replaceable" is a matter of opinion); binary operations such as `this.helpers.getBinaryDataBuffer`, where a native node may not expose the needed option; a short Python HMAC signature that the complexity gate sent to custom (the Crypto node could do it).

**Limits**: one reviewer, looking only at the opening snippet of each node, with a fairly subjective standard. Each sample has 100 nodes, so sampling error alone is about +/-6 to +/-7 percentage points.

---

## 8. Trend by creation year

The year is when the template was created on n8n.io, not a node version. Templates that contain the legacy `Function` or `Function Item` nodes number only 355 overall (2.5%), mostly early ones, and do not change how the table reads. The 24 templates from 2019 and earlier have no Code nodes and are not listed.

| Year | Templates | Templates with Code | Code nodes | Code share of non-sticky nodes | Code-dominated templates | Strict estimate (denominator: Code nodes with code text) |
|---|---|---|---|---|---|---|
| 2020 | 307 | 0.7% | 3 | 0.3% | 0.3% | 66.7% (3) |
| 2021 | 136 | 0.7% | 1 | 0.1% | 0.0% | 0.0% (1) |
| 2022 | 143 | 4.9% | 15 | 1.4% | 0.7% | 26.7% (15) |
| 2023 | 86 | 46.5% | 63 | 8.1% | 9.3% | 47.6% (63) |
| 2024 | 462 | 33.5% | 275 | 4.6% | 0.6% | 53.6% (265) |
| 2025 | 6,564 | 51.4% | 8,707 | 8.6% | 1.8% | 37.4% (7,002) |
| 2026 | 6,225 | 77.8% | 20,818 | 17.6% | 3.9% | 33.7% (19,725) |

**Observations**:

- There is no sign of improvement in newer templates. Templates with Code were 51.4% in 2025 and 77.8% in 2026; the Code share of non-sticky nodes rose from 8.6% to 17.6%.
- The 6,225 templates from 2026 contribute 20,818 Code nodes, 69.7% of all Code nodes.
- The strict estimate went from 53.6% in 2024 (only 265 nodes, a small sample) to 37.4% in 2025 and 33.7% in 2026.
- Code nodes are very few in 2020 to 2023 (at most 63 per year), so those ratios are unstable and should not be interpreted.
- This only describes the numbers and does not speculate about causes.

---

## 9. Node notes (why it is configured this way)

| Metric | Value | Denominator |
|---|---|---|
| Code nodes with node `notes` | **6.1%** (1,821) | all Code nodes 29,882 |
| For comparison: all nodes with `notes` | 3.3% (10,357) | all nodes 310,179 |
| Templates where at least one Code node has `notes` | 467 (5.5%) | 8,423 templates with Code |
| Nodes in the strict estimate that have `notes` | 5.9% | strict estimate 9,449 |
| Nodes classed as custom that have `notes` | 7.0% | custom 10,427 |

In community templates, Code nodes carry `notes` about twice as often as nodes in general, but still rarely: the great majority say nothing about why a native node was not used. That is the gap addressed by [`../spec/references-disclosure.en.md`](../spec/references-disclosure.en.md) §7 and [`../spec/native-first.en.md`](../spec/native-first.en.md).

---

## 10. Co-occurrence with IF, Switch and Set

Appearing together in the same template. Templates with Code are larger, so co-occurrence is higher by construction; templates without Code are listed for comparison.

| Node | Templates with Code (/8,423) | Templates without Code (/5,524) |
|---|---|---|
| IF (`n8n-nodes-base.if`) | 61.0% | 36.8% |
| Switch (`n8n-nodes-base.switch`) | 17.6% | 13.5% |
| Set (`n8n-nodes-base.set`) | 58.7% | 52.7% |
| At least one of the three | **83.7%** | 67.2% |
| All three | 8.7% | 4.1% |
| Set and (IF or Switch) | 42.1% | not computed |

Most templates with Code also use IF, Switch or Set: Code is usually mixed with native nodes rather than carrying the whole workflow.

---

## 11. "Job to native node" table

The type strings use the spelling that actually appears in the template data (same capitalization). N is the number of templates containing the node (denominator 13,947), the same convention as [`node-frequency.en.md`](node-frequency.en.md). For how to configure each node, see [`../skills/_vendor/n8n-node-configuration/NATIVE_NODES.md`](../skills/_vendor/n8n-node-configuration/NATIVE_NODES.md); confirm with `get_node` on the user's n8n version before committing a config.

| Job | Native node | type | N (templates) |
|---|---|---|---|
| Field mapping, renaming, assembly, simple conditional fields | Edit Fields (Set) | `n8n-nodes-base.set` | 7,850 (56.3%) |
| Conditional routing | IF / Switch | `n8n-nodes-base.if` / `n8n-nodes-base.switch` | 7,175 (51.4%) / 2,229 (16.0%) |
| Filtering items | Filter | `n8n-nodes-base.filter` | 1,348 (9.7%) |
| Sorting | Sort | `n8n-nodes-base.sort` | 149 (1.1%) |
| Top N, slicing | Limit | `n8n-nodes-base.limit` | 485 (3.5%) |
| Deduplication (incl. across executions) | Remove Duplicates | `n8n-nodes-base.removeDuplicates` | 277 (2.0%) |
| Aggregation, grouped statistics | Summarize / Aggregate | `n8n-nodes-base.summarize` / `n8n-nodes-base.aggregate` | 149 (1.1%) / 1,289 (9.2%) |
| Array to items | Split Out | `n8n-nodes-base.splitOut` | 1,603 (11.5%) |
| Merging and comparing sources | Merge / Compare Datasets | `n8n-nodes-base.merge` / `n8n-nodes-base.compareDatasets` | 2,646 (19.0%) / 49 (0.4%) |
| Date and time | Date & Time | `n8n-nodes-base.dateTime` | 99 (0.7%) |
| Hash, HMAC, signing, ID generation | Crypto | `n8n-nodes-base.crypto` | 125 (0.9%) |
| XML conversion | XML | `n8n-nodes-base.xml` | 106 (0.8%) |
| HTML extraction or generation | HTML | `n8n-nodes-base.html` | 351 (2.5%) |
| Markdown and HTML | Markdown | `n8n-nodes-base.markdown` | 224 (1.6%) |
| File to items | Extract From File | `n8n-nodes-base.extractFromFile` | 835 (6.0%) |
| Items to file | Convert to File | `n8n-nodes-base.convertToFile` | 529 (3.8%) |
| Compression | Compression | `n8n-nodes-base.compression` | 47 (0.3%) |
| Reading and writing local files | Read/Write Files from Disk | `n8n-nodes-base.readWriteFile` | 175 (1.3%) |
| HTTP calls (incl. pagination) | HTTP Request | `n8n-nodes-base.httpRequest` | 7,231 (51.8%) |
| Wait, delay | Wait | `n8n-nodes-base.wait` | 2,494 (17.9%) |
| Raising an error on purpose | Stop and Error | `n8n-nodes-base.stopAndError` | 325 (2.3%) |
| Only new records (cross-execution state) | Remove Duplicates (cross-execution mode) / Data Table | `n8n-nodes-base.removeDuplicates` / `n8n-nodes-base.dataTable` | 277 (2.0%) / 589 (4.2%) |
| Reading environment variables | Expression {{ $env.NAME }} | `n8n-nodes-base.set` | 7,850 (56.3%) |
| Structured AI output (no after-the-fact parsing) | Structured Output Parser / Information Extractor | `@n8n/n8n-nodes-langchain.outputParserStructured` / `@n8n/n8n-nodes-langchain.informationExtractor` | 2,294 (16.4%) / 318 (2.3%) |
| Renaming keys | Rename Keys | `n8n-nodes-base.renameKeys` | 18 (0.1%) |

Notes: `n8n-nodes-base.function` (328 templates) and `n8n-nodes-base.functionItem` (34 templates) are deprecated legacy code nodes and should not be used in new workflows; `n8n-nodes-base.itemLists` (84 templates) is the legacy list-handling node whose functions were split into Sort, Limit, Split Out, Aggregate, Remove Duplicates and others.

---

## 12. Legitimate uses of Code

The official Skill's position is "the bar is high, but not never". Using Code is reasonable in these situations (details in [`../spec/native-first.en.md`](../spec/native-first.en.md) §4):

1. **Whole-dataset work across several sources**: reading several upstream nodes at once, building lookup tables or accumulators, then applying them to a third dataset. As an expression this becomes one very long line that is hard to debug.
2. **Stateful work and multi-step intermediate structures** that single-item tools (expressions, Edit Fields) cannot reach, such as state machines or quotas consumed in sequence.
3. **Custom logic with no native equivalent**: scoring and ranking algorithms, text similarity, per-item branching on data shape, nested objects assembled in loops, AI output parsers that tolerate several formats.
4. **Details the native node does not expose**: non-standard signing, timing-safe comparison.
5. **External libraries**, once it is clear the Crypto node or a Luxon expression cannot do it.

The data here are consistent with that: nodes classed as custom algorithm or complex business logic have a median of 47 lines, clearly longer than the overall 21; another 3.6% of nodes use cross-execution state (`$getWorkflowStaticData`), which has no one-to-one native node. Only the "process new records only" use can move to Remove Duplicates in cross-execution mode or a Data Table.

---

## 13. How to use this

When generating or editing a workflow:

1. **Follow the decision order first**: expression -> arrow function in Edit Fields -> native node (the table in §11) -> Code last. The official quick test: can the job be described as "take this one item and..."? If yes, it is the wrong tool.
2. **Look up the native node by category**: deduplication, sorting, aggregation, splitting, filtering, slicing, dates, hashing, XML, HTML, Markdown, files, HTTP and waiting all have dedicated nodes. Together these account for about 16.4% of community Code nodes (primary category).
3. **If you do use Code, write in the node `notes` why a native node could not be used**: one to three sentences, naming which native node was considered and why it does not work (format in [`../spec/native-first.en.md`](../spec/native-first.en.md) §5; the general rules for node notes are in [`../spec/references-disclosure.en.md`](../spec/references-disclosure.en.md) §7). If no concrete reason can be written, use the native node.
4. **Disclose the number of Code nodes at the end**: per [`../spec/native-first.en.md`](../spec/native-first.en.md) §7, write `native-first:code-node` under the recommendations in the Layer 3 sticky note, for example "adopted (Code nodes: N of M total nodes)" with the reason for each; if there are none, write "no Code nodes used".
5. **Do not overcorrect**: splitting ten clear lines of code into ten nodes is not necessarily easier to read; write the trade-off in `notes`.

The ratios in this document only show what community templates look like. They are neither a generation-time criterion nor a threshold. The criterion is the decision order above, plus a stated reason.
