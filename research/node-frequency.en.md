# Node Frequency Statistics (n8n.io Public Templates)

> 🌐 **English** | [繁體中文](node-frequency.md)

> **Sample**: 13,947 public templates from n8n.io, 0 parse failures.
> **Source**: the official n8n public API (`https://api.n8n.io/api/templates`), fetched slowly between 2026-11-05 and 2026-11-06. The index reports 14,013 in total but lists 13,947 unique IDs; all 13,947 are present according to the anchor manifest, 0 failures (the gap and the method are in [`n8n-templates-method.en.md`](n8n-templates-method.en.md)).
> **How to read**: "N" = **the number of templates in which the node appears**, not the number of node instances. A template with ten `set` nodes counts once. The one exception is the credential counts in §7, which count node bindings; that section says so.
> **Nature**: everything below is descriptive statistics of what public templates look like. It is not a best-practice list and not a quality certificate. When AI generates a workflow it must rebuild it with currently available node versions rather than copy a template. This repo stores numbers only, no template content.

---

## 1. Overview

| Metric | Value |
|---|---|
| Total templates | 13,947 |
| Total node instances | 310,179 |
| Unique node types | **1,225** |
| Nodes per template | median 19, mean 22.2, P90 39 |
| Templates with stickyNote | **12,978 (93.1%)** |
| Templates without stickyNote | 969 (6.9%) |
| Total stickyNotes | 81,106 (median 5 per template; 6.2 on average among templates that have any) |
| Templates with some error handling | 3,465 (**24.8%**); definition in §9 |
| Templates with AI (LangChain family) nodes | 7,612 (54.6%) |
| Templates created in 2025-2026 | 12,789 (91.7%); the sample skews recent, see §11 |

### Key observations
- Nearly all public templates carry stickyNote annotations (93.1%), and multi-block annotation is the norm, so allowing several stickies in Layer 1 / Layer 3 matches convention. This also reflects that public templates are written for other readers; internal workflows will not necessarily show the same rate. Also, while sticky notes are common, node-level `notes` that explain why a node is configured a certain way appear in only 10.1% of templates (§9.6).
- Only 24.8% of templates have any form of error handling. That is the gap AI should fill proactively, and the Layer 3 "known limits" section must flag it.
- Templates are fairly large: median 19 nodes, P90 39. Template size must not be taken directly as AI's default size cap (see §2).

---

## 2. Size distribution

| Bucket | Nodes | Templates | Share |
|---|---|---|---|
| tiny | ≤ 3 | 315 | 2.3% |
| small | 4–7 | 897 | 6.4% |
| medium | 8–15 | 3,842 | 27.5% |
| large | 16–30 | 6,233 | 44.7% |
| xlarge | 31+ | 2,660 | 19.1% |

> **Design implication**: 63.8% of templates exceed 15 nodes (large + xlarge) and 36.2% have 15 or fewer. Templates run large because they demonstrate full scenarios; that is **not** evidence that bigger is better. The Pack's splitting rule (suggest a sub-workflow beyond 15 nodes for linear flows, 25 for branching ones) is a maintainability choice, not something derived from these statistics; see [`patterns.en.md`](patterns.en.md) §5.

---

## 3. Top triggers

A node counts as a trigger if its type ends in `Trigger`, or is `webhook` or the legacy `cron`. A template can have several triggers, so shares add up to more than 100%.

| Rank | Trigger | N (templates) | Share of all |
|---|---|---|---|
| 1 | `scheduleTrigger` | 4,571 | 32.8% |
| 2 | `manualTrigger` | 3,324 | 23.8% |
| 3 | `webhook` | 2,775 | 19.9% |
| 4 | `formTrigger` | 1,635 | 11.7% |
| 5 | `telegramTrigger` | 832 | 6.0% |
| 6 | `lc:chatTrigger` | 771 | 5.5% |
| 7 | `executeWorkflowTrigger` | 577 | 4.1% |
| 8 | `gmailTrigger` | 553 | 4.0% |
| 9 | `errorTrigger` | 428 | 3.1% |
| 10 | `googleDriveTrigger` | 318 | 2.3% |
| 11 | `lc:mcpTrigger` | 309 | 2.2% |
| 12 | `googleSheetsTrigger` | 274 | 2.0% |
| 13 | `cron` | 244 | 1.7% |
| 14 | `whatsAppTrigger` | 160 | 1.1% |
| 15 | `slackTrigger` | 98 | 0.7% |

### Top 8 trigger combinations

Grouped by the set of distinct triggers in each template; every template falls into exactly one combination.

| Rank | Trigger combination | Templates | Share of all |
|---|---|---|---|
| 1 | only `scheduleTrigger` | 2,772 | 19.9% |
| 2 | only `manualTrigger` | 1,898 | 13.6% |
| 3 | only `webhook` | 1,738 | 12.5% |
| 4 | only `formTrigger` | 1,177 | 8.4% |
| 5 | `manualTrigger` + `scheduleTrigger` | 585 | 4.2% |
| 6 | only `telegramTrigger` | 539 | 3.9% |
| 7 | only `lc:chatTrigger` | 378 | 2.7% |
| 8 | only `gmailTrigger` | 348 | 2.5% |

A further 156 templates (1.1%) have no trigger at all, possibly fragments called by other flows, or display-only examples.

> **Design implication**:
> - `scheduleTrigger` (32.8%) is the most common trigger, followed by `manualTrigger`, `webhook` and `formTrigger`.
> - 1,898 templates (13.6%) have only `manualTrigger`: mostly tutorials or demos that need a human click to run, not suitable as-is for flows meant to run unattended.
> - The legacy `cron` still appears in 244 templates. When both exist, AI always uses `scheduleTrigger` (see §10).

---

## 4. Top 40 node types

N = number of templates containing the node (not node instances). The `@n8n/n8n-nodes-langchain.*` family is abbreviated with an `lc:` prefix.

| Rank | Node Type | N (templates) | Share of all | Role |
|---|---|---|---|---|
| 1 | `stickyNote` | 12,978 | 93.1% | Annotation |
| 2 | `code` | 8,423 | 60.4% | Custom JS/Python |
| 3 | `set` | 7,850 | 56.3% | Set fields / shape data |
| 4 | `httpRequest` | 7,231 | 51.8% | API call |
| 5 | `if` | 7,175 | 51.4% | Binary condition |
| 6 | `googleSheets` | 5,062 | 36.3% | Spreadsheet |
| 7 | `scheduleTrigger` | 4,571 | 32.8% | Schedule trigger |
| 8 | `lc:agent` | 4,336 | 31.1% | AI Agent |
| 9 | `manualTrigger` | 3,324 | 23.8% | Manual trigger |
| 10 | `lc:lmChatOpenAi` | 3,260 | 23.4% | OpenAI chat model |
| 11 | `gmail` | 3,248 | 23.3% | Email |
| 12 | `webhook` | 2,775 | 19.9% | HTTP trigger |
| 13 | `merge` | 2,646 | 19.0% | Merge inputs |
| 14 | `wait` | 2,494 | 17.9% | Wait / throttle |
| 15 | `slack` | 2,394 | 17.2% | Messaging |
| 16 | `splitInBatches` | 2,361 | 16.9% | Batch loop |
| 17 | `lc:outputParserStructured` | 2,294 | 16.4% | Structured output parser |
| 18 | `switch` | 2,229 | 16.0% | Multi-way branch |
| 19 | `telegram` | 1,717 | 12.3% | Messaging |
| 20 | `formTrigger` | 1,635 | 11.7% | Form trigger |
| 21 | `lc:openAi` | 1,608 | 11.5% | OpenAI action node |
| 22 | `splitOut` | 1,603 | 11.5% | Split array |
| 23 | `lc:chainLlm` | 1,518 | 10.9% | Basic LLM chain |
| 24 | `googleDrive` | 1,488 | 10.7% | Cloud files |
| 25 | `noOp` | 1,446 | 10.4% | Placeholder / branch join |
| 26 | `respondToWebhook` | 1,408 | 10.1% | Webhook response |
| 27 | `filter` | 1,348 | 9.7% | Filter |
| 28 | `lc:lmChatGoogleGemini` | 1,311 | 9.4% | Gemini chat model |
| 29 | `aggregate` | 1,289 | 9.2% | Aggregate |
| 30 | `lc:memoryBufferWindow` | 1,098 | 7.9% | Chat memory (window) |
| 31 | `extractFromFile` | 835 | 6.0% | Read file |
| 32 | `telegramTrigger` | 832 | 6.0% | Telegram trigger |
| 33 | `lc:chatTrigger` | 771 | 5.5% | Chat trigger |
| 34 | `emailSend` | 753 | 5.4% | Send email (SMTP) |
| 35 | `dataTable` | 589 | 4.2% | Built-in data table |
| 36 | `executeWorkflowTrigger` | 577 | 4.1% | Sub-workflow entry |
| 37 | `lc:lmChatOpenRouter` | 553 | 4.0% | OpenRouter chat model |
| 38 | `gmailTrigger` | 553 | 4.0% | Gmail trigger |
| 39 | `convertToFile` | 529 | 3.8% | Convert to file |
| 40 | `airtable` | 504 | 3.6% | Cloud database |

> **Design implication**: the four general-purpose nodes `code`, `set`, `httpRequest` and `if` are the chassis of almost every flow, and the `agent` AI node already ranks in the top 10. The DSL label mapping table (`sticky-note-dsl.md` §4) should cover these 40 first.

### Structural nodes: frequent but easy to overlook

| Node | Purpose | N (templates) | Share of all | When AI should add it |
|---|---|---|---|---|
| `set` | Shape data | 7,850 | 56.3% | When fields are reshaped between nodes |
| `noOp` | Join branches | 1,446 | 10.4% | After if/switch when branches should rejoin |
| `merge` | Merge inputs | 2,646 | 19.0% | When parallel branches end |
| `splitOut` | Split array into items | 1,603 | 11.5% | Upstream returns an array, downstream wants items |
| `aggregate` | Collect loop results | 1,289 | 9.2% | After splitInBatches when results must be recombined |
| `respondToWebhook` | Webhook response | 1,408 | 10.1% | When the webhook caller needs a reply |
| `stopAndError` | Raise an error on purpose | 325 | 2.3% | When input is invalid and the error flow should take over |

---

## 5. Top categories

Categories are the official category labels on n8n.io templates. A template can carry several, so shares add up to more than 100%.

| Rank | Category | N (templates) | Share of all |
|---|---|---|---|
| 1 | AI Summarization | 4,299 | 30.8% |
| 2 | Multimodal AI | 2,960 | 21.2% |
| 3 | Content Creation | 1,743 | 12.5% |
| 4 | Market Research | 1,686 | 12.1% |
| 5 | AI Chatbot | 1,677 | 12.0% |
| 6 | Document Extraction | 1,411 | 10.1% |
| 7 | Lead Generation | 1,085 | 7.8% |
| 8 | AI RAG | 944 | 6.8% |
| 9 | Social Media | 809 | 5.8% |
| 10 | Personal Productivity | 712 | 5.1% |
| 11 | Engineering | 663 | 4.8% |
| 12 | CRM | 662 | 4.7% |
| 13 | Support Chatbot | 640 | 4.6% |
| 14 | DevOps | 580 | 4.2% |
| 15 | Ticket Management | 572 | 4.1% |
| 16 | Lead Nurturing | 558 | 4.0% |
| 17 | Invoice Processing | 466 | 3.3% |
| 18 | HR | 379 | 2.7% |
| 19 | Crypto Trading | 345 | 2.5% |
| 20 | Project Management | 314 | 2.3% |

The most frequent nodes within each large category (excluding `stickyNote`, `noOp`, `manualTrigger`), for the top five categories:

| Category | Most frequent nodes (N) |
|---|---|
| AI Summarization | `code` 3,202, `set` 2,695, `if` 2,464, `httpRequest` 2,245, `googleSheets` 2,076, `scheduleTrigger` 1,794 |
| Multimodal AI | `httpRequest` 1,918, `code` 1,712, `set` 1,677, `if` 1,425, `lc:agent` 1,097, `googleSheets` 1,065 |
| Content Creation | `httpRequest` 1,303, `set` 1,080, `code` 1,070, `if` 891, `wait` 745, `lc:agent` 649 |
| Market Research | `code` 1,244, `set` 1,082, `httpRequest` 1,078, `googleSheets` 852, `scheduleTrigger` 851, `if` 758 |
| AI Chatbot | `lc:agent` 1,120, `set` 873, `if` 839, `code` 808, `lc:lmChatOpenAi` 700, `httpRequest` 646 |

> **Design implication**: categories are dominated by AI-related ones (AI Summarization, Multimodal AI, AI Chatbot, AI RAG), consistent with the recent, AI-leaning sample described in §11. Classic integration needs (CRM, Invoice Processing and so on) have relatively fewer samples.

---

## 6. Top AI nodes

7,612 templates (54.6%) contain at least one `@n8n/n8n-nodes-langchain.*` node. In the table, N is a template count and the share's denominator is all 13,947 templates.

| Rank | Node (without `@n8n/n8n-nodes-langchain.`) | N (templates) | Share of all |
|---|---|---|---|
| 1 | `agent` | 4,336 | 31.1% |
| 2 | `lmChatOpenAi` | 3,260 | 23.4% |
| 3 | `outputParserStructured` | 2,294 | 16.4% |
| 4 | `openAi` | 1,608 | 11.5% |
| 5 | `chainLlm` | 1,518 | 10.9% |
| 6 | `lmChatGoogleGemini` | 1,311 | 9.4% |
| 7 | `memoryBufferWindow` | 1,098 | 7.9% |
| 8 | `chatTrigger` | 771 | 5.5% |
| 9 | `lmChatOpenRouter` | 553 | 4.0% |
| 10 | `lmChatAnthropic` | 470 | 3.4% |
| 11 | `googleGemini` | 418 | 3.0% |
| 12 | `documentDefaultDataLoader` | 407 | 2.9% |
| 13 | `embeddingsOpenAi` | 353 | 2.5% |
| 14 | `informationExtractor` | 318 | 2.3% |
| 15 | `mcpTrigger` | 309 | 2.2% |
| 16 | `toolWorkflow` | 263 | 1.9% |
| 17 | `lmChatGroq` | 255 | 1.8% |
| 18 | `textSplitterRecursiveCharacterTextSplitter` | 243 | 1.7% |
| 19 | `toolThink` | 199 | 1.4% |
| 20 | `vectorStorePinecone` | 168 | 1.2% |

### Language-model vendor share

The denominator is the 5,879 templates containing any language-model node (type starting with `lm`, such as `lmChatOpenAi`), i.e. 42.2% of all templates. A template may use several vendors, so shares add up to more than 100%.

| Vendor | Nodes | N (templates) | Share of templates with a language-model node |
|---|---|---|---|
| OpenAI | `lmChatOpenAi`, `lmOpenAi` | 3,264 | 55.5% |
| Google Gemini | `lmChatGoogleGemini` | 1,311 | 22.3% |
| OpenRouter | `lmChatOpenRouter` | 553 | 9.4% |
| Anthropic | `lmChatAnthropic` | 470 | 8.0% |
| Groq | `lmChatGroq` | 255 | 4.3% |
| Azure OpenAI | `lmChatAzureOpenAi` | 142 | 2.4% |
| Ollama | `lmChatOllama`, `lmOllama` | 99 | 1.7% |
| DeepSeek | `lmChatDeepSeek` | 61 | 1.0% |
| Mistral | `lmChatMistralCloud` | 58 | 1.0% |
| xAI Grok | `lmChatXAiGrok` | 21 | 0.4% |

Some templates skip the `lm*` chat-model nodes and use vendor action nodes directly: `openAi` in 1,608 templates and `googleGemini` in 418 templates.

> **Design implication**: vendor shares reflect the choices of 2025-2026 template authors and shift quickly; do not use them to decide which model a user should pick, which depends on the user's environment and compliance needs. The AI structure (`agent` + language model + `memoryBufferWindow` + `outputParserStructured`) is more worth borrowing than the vendor choice.

---

## 7. Top 20 credential types

Only credential **type names** are listed (for example `googleSheetsOAuth2Api`); templates carry no actual credential content, and none should. **Note: counts in this section are the number of node bindings to that credential type (node instances), not template counts**, so they cannot be compared directly with N elsewhere.

| Rank | Credential type | Node bindings |
|---|---|---|
| 1 | `googleSheetsOAuth2Api` | 6,743 |
| 2 | `openAiApi` | 5,553 |
| 3 | `gmailOAuth2` | 3,751 |
| 4 | `telegramApi` | 3,376 |
| 5 | `httpHeaderAuth` | 2,737 |
| 6 | `googleDriveOAuth2Api` | 2,109 |
| 7 | `googlePalmApi` | 2,086 |
| 8 | `slackApi` | 1,248 |
| 9 | `airtableTokenApi` | 1,118 |
| 10 | `googleApi` | 836 |
| 11 | `slackOAuth2Api` | 778 |
| 12 | `httpBearerAuth` | 716 |
| 13 | `postgres` | 700 |
| 14 | `openRouterApi` | 678 |
| 15 | `supabaseApi` | 622 |
| 16 | `notionApi` | 581 |
| 17 | `smtp` | 551 |
| 18 | `googleCalendarOAuth2Api` | 536 |
| 19 | `anthropicApi` | 496 |
| 20 | `blotatoApi` | 381 |

> **Design implication**: Google (Sheets, Drive, Gmail), OpenAI, Telegram and HTTP header auth are the credentials users most often need to prepare in advance. When generating a workflow, AI should list in Layer 3 which credentials the user must create, but must **never** write any credential value into the workflow.

---

## 8. Top node co-occurrence

Counted per template: the number of templates in which two node types appear together. `stickyNote`, `noOp`, `manualTrigger` and all triggers are excluded, so only business nodes remain.

| Rank | Node pair | N (templates) | Share of all | Implied practice |
|---|---|---|---|---|
| 1 | `code` + `if` | 5,140 | 36.9% | Custom logic then branch |
| 2 | `code` + `httpRequest` | 5,027 | 36.0% | API plus custom processing |
| 3 | `code` + `set` | 4,941 | 35.4% | Reshape fields after code |
| 4 | `if` + `set` | 4,592 | 32.9% | Branch then reshape |
| 5 | `httpRequest` + `set` | 4,571 | 32.8% | Fetch an API then shape data |
| 6 | `httpRequest` + `if` | 4,125 | 29.6% | Route on API result |
| 7 | `code` + `googleSheets` | 3,625 | 26.0% | Process in code then write to a sheet |
| 8 | `googleSheets` + `if` | 3,059 | 21.9% | Branch on sheet data |
| 9 | `googleSheets` + `set` | 2,934 | 21.0% | Shape then write to a sheet |
| 10 | `googleSheets` + `httpRequest` | 2,673 | 19.2% | Sync API data into a sheet |
| 11 | `lc:agent` + `set` | 2,580 | 18.5% | Shape before/after the agent |
| 12 | `lc:agent` + `lc:lmChatOpenAi` | 2,524 | 18.1% | Agent with an OpenAI model |
| 13 | `lc:agent` + `code` | 2,462 | 17.7% | Agent with code processing |
| 14 | `code` + `gmail` | 2,297 | 16.5% | Process then send/read mail |
| 15 | `lc:lmChatOpenAi` + `set` | 2,104 | 15.1% | Shape model output |

> Co-occurrence only says that nodes often appear together, not their wiring order or any causality; skeleton-level synthesis is in [`patterns.en.md`](patterns.en.md).

---

## 9. Quality signals

These are signals of whether a template does something at all, not a score of how well it is done.

### 9.1 Annotation coverage

- With stickyNote: 12,978 / 13,947 (93.1%).
- Without stickyNote: 969 (6.9%).
- Median stickyNote count per template: 5.
- These are sticky notes only; node-level `notes` and comments inside code are in §9.6, together with the overlap of sticky notes and node `notes`.

### 9.2 Error handling

A template counts as "having error handling" if any of the following holds: it contains an `errorTrigger` node, any node sets `continueOnFail`, or any node's `onError` is something other than the default `stopWorkflow`. **`retryOnFail` is counted separately and is not part of this definition.**

| Signal | Templates | Share of all |
|---|---|---|
| Any of the above (has error handling) | **3,465** | **24.8%** |
| Contains `errorTrigger` (dedicated error flow) | 428 | 3.1% |
| Any node with `onError` other than `stopWorkflow` | 2,857 | 20.5% |
| Any node with the older `continueOnFail` | 411 | 2.9% |
| Any node with `alwaysOutputData` | 2,579 | 18.5% |

### 9.3 Node-level `onError` distribution

`onError` is the node setting for what to do when that node fails. The table lists both node counts and template counts; node counts are inflated by a few large templates, so use template counts to judge prevalence.

| `onError` value | Nodes | Templates | Share of all |
|---|---|---|---|
| `continueRegularOutput` | 6,564 | 2,037 | 14.6% |
| `continueErrorOutput` | 3,021 | 1,180 | 8.5% |
| `stopWorkflow` | 113 | 15 | 0.1% |

- `continueRegularOutput` keeps going on the normal output after a failure; `continueErrorOutput` routes failures to a dedicated error output branch; `stopWorkflow` halts the whole flow (the default behaviour, rarely written out explicitly).
- `continueRegularOutput` can silently swallow errors; pair it with a downstream check rather than treating it as "handled".

### 9.4 Retry settings

- Nodes with `retryOnFail`: 6,648, spread over 1,879 templates (13.5%).
- 692 templates have retries but none of the error handling above. Counting "error handling or retry" together gives 4,157 templates (29.8%).
- Of the 7,231 templates with `httpRequest`, 2,237 (30.9%) have error handling, 1,314 (18.2%) have retries, and 2,680 (37.1%) have at least one. External API calls are where error handling and retries matter most, yet most templates skip them.

### 9.5 Flow-control nodes

| Node | Templates | Share of all |
|---|---|---|
| `splitInBatches` | 2,361 | 16.9% |
| `wait` | 2,494 | 17.9% |
| `executeWorkflow` | 310 | 2.2% |
| `stopAndError` | 325 | 2.3% |

> **Design implication**: `respondToWebhook` appears in only 1,357 templates, while 2,775 contain `webhook` (48.9% have a response node). No `respondToWebhook` does not mean no response (the Webhook node has its own response modes), but when designing a webhook flow, decide explicitly who responds, when, and what to return on failure.

### 9.6 Annotations and explanations

n8n has two places for explanatory text: sticky-note nodes (`stickyNote`) on the canvas, and the `notes` field on any ordinary node (with `notesInFlow` set to show that text under the node on the canvas). The tables below count them separately, then together.

| Metric | Count | Share |
|---|---|---|
| Templates with sticky notes (`stickyNote`) | 12,978 / 13,947 | 93.1% |
| Total sticky notes | 81,106 | median 5 per template, P90 10 |
| Sticky note content length (71,961 notes with content) | median 187 characters | — |
| Templates with at least one node-level `notes` | 1,404 / 13,947 | 10.1% |
| Nodes with `notes` | 10,368 / 310,179 | 3.3% (excluding sticky nodes from the denominator: 10,196 / 229,073, about 4.5%) |
| Nodes with `notesInFlow` true | 4,648 nodes across 722 templates | 5.2% of all templates |

**Overlap of the two carriers**

| Combination | Templates | Share of all |
|---|---|---|
| Both sticky notes and node `notes` | 1,342 | 9.6% |
| Sticky notes only | 11,636 | 83.4% |
| Node `notes` only | 62 | 0.4% |
| Neither | 907 | 6.5% |

**Adoption by size** (bucket definitions in §2)

| Size | Templates | With sticky notes | With node `notes` |
|---|---|---|---|
| tiny | 315 | 13 (4.1%) | 8 (2.5%) |
| small | 897 | 523 (58.3%) | 67 (7.5%) |
| medium | 3,842 | 3,636 (94.6%) | 306 (8.0%) |
| large | 6,233 | 6,156 (98.8%) | 629 (10.1%) |
| xlarge | 2,660 | 2,650 (99.6%) | 394 (14.8%) |

**Comments inside Code nodes**: there are 27,074 `code` nodes (those with `jsCode` or `pythonCode`), and 15,996 of them (59.1%) contain a comment. A comment is a whole line starting with `//` (JavaScript) or `#` (Python), or a `/* */` block comment; trailing comments and `//` inside strings (such as URLs) are not counted, to avoid overstating. This is descriptive only and says nothing about whether the comments are useful.

**Reading the numbers**
- Sticky notes are everywhere: over 90% of templates have them and nearly every large template does. But they are canvas-level overviews, typically a flow summary and setup steps, with a median under 200 characters each.
- Node-level `notes` that explain why a node is configured a certain way are rare: about one template in ten uses them, and only about 39% (4,053) of the nodes that have `notes` set `notesInFlow` to show them on the canvas. Templates with node `notes` but no sticky notes are only 0.4%, so node `notes` almost always supplement sticky notes rather than replace them.
- Comments inside code (59.1%) are far more common than node `notes` (3.3%): explanation tends to live in the code rather than on the canvas.
- These are descriptive statistics. Having a comment does not make the content correct or consistent with the actual settings, and lacking one does not make a template poor. This section only describes the habits of public templates.
- The Pack does not follow these proportions. The AI always adds the three-layer sticky notes (user request, AI implementation notes, references) and node-level `notes`, and discloses which sources it consulted; the rules are in [`../spec/references-disclosure.md`](../spec/references-disclosure.md).

---

## 10. Deprecated nodes and the trend by year

The nodes below have been superseded by newer ones, and AI always uses the newer ones when generating (mapping in the table). "Templates" is again a template count. Which nodes are available and what supersedes them depends on the user's n8n version at the time, so check the current node list before generating.

| Old node | Templates | Share of all | Use instead |
|---|---|---|---|
| `function` | 328 | 2.4% | `code` |
| `cron` | 244 | 1.7% | `scheduleTrigger` |
| `functionItem` | 34 | 0.2% | `code` |
| `start` | 10 | 0.1% | `manualTrigger` |
| `interval` | 10 | 0.1% | `scheduleTrigger` |
| Total (at least one) | **522** | **3.7%** | |

### By creation year

| Year created | Templates | With deprecated nodes | Share of that year |
|---|---|---|---|
| 2019 | 24 | 11 | 45.8% |
| 2020 | 307 | 62 | 20.2% |
| 2021 | 136 | 50 | 36.8% |
| 2022 | 143 | 58 | 40.6% |
| 2023 | 86 | 0 | 0.0% |
| 2024 | 462 | 6 | 1.3% |
| 2025 | 6,564 | 300 | 4.6% |
| 2026 | 6,225 | 35 | 0.6% |

> **Reading**: roughly two to nearly five in ten templates from 2019-2022 contain deprecated nodes; that falls to 4.6% (300 / 6,564) for 2025 and 0.6% (35 / 6,225) for 2026. Still, 335 templates from the last two years carry the old style, so "a template uses node X" does not mean "X is still the recommended way". The year is when the template was created, not the version of the nodes inside it.

---

## 11. Distribution by creation year

| Year | Templates | Share of all |
|---|---|---|
| 2019 | 24 | 0.2% |
| 2020 | 307 | 2.2% |
| 2021 | 136 | 1.0% |
| 2022 | 143 | 1.0% |
| 2023 | 86 | 0.6% |
| 2024 | 462 | 3.3% |
| 2025 | 6,564 | 47.1% |
| 2026 | 6,225 | 44.6% |

> **Heads-up**: 2025 and 2026 together account for 12,789 templates, **91.7%** of the sample, so it clearly skews recent and toward AI applications. Years 2019-2024 have few samples (1,158 in total), so avoid over-reading trends for the older years. Counts for 2026 only run up to the fetch date (2026-11-06).

---

## 12. How to use these statistics

- **This is descriptive**: it shows what public templates look like. It is neither a best-practice list nor a quality certificate, and high frequency does not mean correct.
- **Rebuild when generating**: use the nodes and parameters available now; do not copy templates, and do not keep deprecated nodes just because old templates use them.
- **The sample skews recent and AI-heavy**: 2025-2026 make up over 90%, so the numbers do not describe every n8n use case.
- **Template content is not in this repo**: when the original template is needed, search n8n.io live with the user's consent, and only tell the user which template was consulted.

---

**Data version**: compiled 2026-11-06 (13,947 templates). Method and limitations: [`n8n-templates-method.en.md`](n8n-templates-method.en.md).
