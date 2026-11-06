# Learning from n8n.io Templates: Method and Reproducibility

> 🌐 **English** | [繁體中文](n8n-templates-method.md)

> This file records how the numbers in `node-frequency.en.md` and `patterns.en.md` were produced, what biases they carry, and why the repo stores statistics only.
> **This repo contains no n8n.io template JSON, no full title index and no author information.** It holds only aggregate statistics, skeleton patterns and a small number of cited template IDs.

---

## 1. Stance: the Skill is the brain, templates are digested

- The Skill's role is the "brain": having read many public templates, it keeps **descriptive statistics** and **practices distilled from them**.
- Templates are not material to be copied. When AI generates a workflow it rebuilds it with the nodes and parameters currently available in the user's environment; if it consulted a template, it only tells the user which one (ID and title, with a link to the official n8n.io page).
- The primary basis is the public templates on n8n.io, the official source. The 2,061 community workflows that used to live in the repo as reference material (`reference-workflows/`) were removed on 2026-11-06 and are no longer a basis.

---

## 2. Data source and how it was obtained

| Item | Detail |
|---|---|
| Source | The official n8n public templates API: `https://api.n8n.io/api/templates` |
| Index endpoint | `/search?rows=99&page=N`, listing templates page by page (142 pages) |
| Detail endpoint | `/workflows/<id>`, one request per template for its full content |
| Fetch period | 2026-11-05 to 2026-11-06 (a little over 13 hours) |
| Result | The index reports 14,013 entries; 13,947 unique IDs after de-duplication; all 13,947 were retrieved with **0 failures** and 0 parse failures |

### Fetching: slow and resumable

- **Slow**: a fixed 2.5-3.5 second gap between requests (minimum interval plus random jitter), strictly sequential, never parallel.
- **Self-identifying**: the User-Agent states it is a slow personal-research fetch; only the public API is used, with no account information.
- **Back-off on errors**: HTTP 429 and 5xx wait progressively longer and retry (up to 6 times); network errors back off the same way; a 404 is recorded as a failure rather than forced.
- **Resumable**: files that already exist are not fetched again, so a rerun after an interruption fills in only what is missing. Files are written to a temporary name and then renamed, so half-written files do not occur.
- **Local storage**: the raw data lives only on the user's machine, readable and writable by the owner alone, and **never enters the repo**.

---

## 3. The anchor manifest and completeness

The anchor's purpose: later reruns fetch only what is missing, and "is the data complete" becomes something that can be checked rather than assumed.

- The manifest records: the total reported by the index, the number of unique IDs the index lists, the number of local files, each file's SHA-256 and size, the list of missing IDs, the list of extra IDs, and a `complete` flag.
- This run: 13,947 unique index IDs, 13,947 local files, 0 missing, 0 extra, `complete = true`.
- **The index reports 14,013 in total but lists only 13,947 unique IDs, a gap of 66.** The entries retrieved page by page contain no duplicates, so the 66 is a gap between the total the API reports and the templates it actually enumerates. The cause was not investigated (it could be delisted or unpublished templates, or how the API counts), and we do not speculate. All statistics use 13,947 as the denominator.
- On a rerun, the anchor determines which templates are missing; newly published templates are only discovered by fetching the index again, so results differ depending on when the fetch happens.

---

## 4. Metric definitions

Every share uses 13,947 (all templates) as the denominator unless a table says otherwise. **"N" is always the number of templates containing the node, not the number of node instances**; the only exception is credential types, which count node bindings.

| Metric | Definition |
|---|---|
| Node count | Number of nodes in the template graph (`nodes`), `stickyNote` included |
| Size buckets | tiny <= 3, small 4-7, medium 8-15, large 16-30, xlarge 31+ nodes |
| Median / P90 | Sort the per-template node counts, take the median and the 90th percentile (the value at zero-based index floor(0.9 x templates) of the sorted list) |
| Trigger | A node type ending in `Trigger`, or `webhook`, or the legacy `cron`; this includes `errorTrigger` and `executeWorkflowTrigger` |
| Trigger combination | The set of distinct triggers in each template; each template falls into exactly one combination |
| Node co-occurrence | Two different node types in the same template count once; `stickyNote`, `noOp`, `manualTrigger` and all triggers are excluded |
| Category | The official category labels on n8n.io templates; multiple allowed |
| AI node | Node type starting with `@n8n/n8n-nodes-langchain.` |
| Language-model vendor | Grouped by `lm*` nodes; the denominator is templates containing any language-model node |
| Credential type | Only the credential **type name** bound on a node, counted as node bindings; no credential content is read or stored |
| Has sticky | At least one `stickyNote` node in the template |
| Has error handling | Contains `errorTrigger`, or any node sets `continueOnFail`, or any node sets `onError` to a value other than `stopWorkflow`; **`retryOnFail` is counted separately and not included** |
| Deprecated nodes | `function`, `functionItem`, `cron`, `start`, `interval`; the replacements are in `node-frequency.en.md` §10 |
| Year | The year of the template's creation time on n8n.io (`createdAt`), **not the version of the nodes inside it** |

### Skeleton classification (`patterns.en.md`)

- 14 skeletons, defined only by node composition (for example "contains `webhook` and contains `respondToWebhook`"), not by wiring order.
- Skeletons are **not mutually exclusive**: a template can belong to several, so shares add up to more than 100%.
- Representative templates: for each class, among templates with 6-25 nodes and a view count, take the top 3 by views.

### Supplementary metrics

Deprecated nodes, `onError` and retry settings, flow-control nodes and trigger combinations were computed by rescanning all templates read-only, in addition to the aggregate statistics. The results match, item by item, the figures calculated independently beforehand.

---

## 5. Reproducibility

- **Steps**: fetch the index -> fetch details -> build the anchor and confirm completeness -> aggregate statistics -> classify skeletons -> compute supplementary metrics.
- **Scripts and raw data stay on the user's machine** and are not in this repo; the repo holds results only. To reproduce, obtain the API data yourself and compute according to the definitions above.
- **Point in time**: templates are added, edited and delisted, so a rerun at another time gives different numbers; the numbers in this file are fixed to the 2026-11-06 version.
- **Source of numbers**: every number in this repo's text comes from the aggregation and supplementary computation above; none was filled in from memory.

---

## 6. Sample bias and limits of use

- **Skews recent**: templates created in 2025-2026 make up 91.7% (12,789 / 13,947), and 2019-2024 together have only 1,158. Do not over-read trends for older years.
- **Skews AI**: 54.6% of templates contain LangChain-family nodes; representativeness for classic integration scenarios is weaker.
- **Public-showcase bias**: public templates are written for other readers, so the sticky-note rate (93.1%) is likely far higher than in typical internal workflows.
- **Popularity bias**: representative templates are picked by views, which reflects popularity and exposure time, not design quality.
- **Official public templates only**: no internal or private workflows, and no community libraries outside n8n.io.
- **Field limits**: category labels are set by authors and the platform; `createdAt` is the template's creation time; this analysis did not examine node `typeVersion` and has no execution results, so it cannot tell whether a template still runs on a current version.
- **Descriptive statistics, not a quality certificate**: no number may be read as "this is the right way to do it".

---

## 7. Licensing and terms stance

- Public templates on n8n.io carry **no open-source license**. Their use and redistribution are governed by the n8n website terms and by the terms under which each author shared the template.
- This project therefore takes a conservative approach:
  1. The repo stores **no template JSON** and no template description text.
  2. The repo stores **no author names, bios, avatars or personal links**, and no full title index.
  3. The repo stores only **aggregate statistics, distilled skeleton patterns, and a small number of cited template IDs and titles** (`patterns.en.md` cites 34, each with a link to the official n8n.io page for readers to look up themselves).
  4. **Template content is not redistributed**; when the original is needed, search n8n.io live with the user's consent.
- This is the project's own conservative practice and not legal advice; if n8n's terms change, the official announcement prevails.

---

## 8. What happened to the template index

The earlier semantic-index design is superseded: any index is built and maintained on the user's own machine and is not stored in the repo. Example lookups now search n8n.io live, with the user's consent. See [`PHASE-4-EMBEDDING-INDEX.en.md`](PHASE-4-EMBEDDING-INDEX.en.md).

---

**Data version**: 2026-11-06 (13,947 templates).
