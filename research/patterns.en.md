# Workflow Skeleton Patterns (n8n.io Public Templates)

> 🌐 **English** | [繁體中文](patterns.md)

> Common skeletons synthesized from the node composition and statistics of 13,947 public n8n.io templates (data version: 2026-11-06).
> **These are descriptive statistics and practices distilled from them, not templates and not a quality certificate.** When AI generates a workflow it must rebuild it with currently available node versions; templates are digested references, never copied.

---

## 1. How to read, and overall baselines

- **"N" and shares**: a skeleton's count is the number of templates meeting its condition; shares use all 13,947 templates as the denominator.
- **Skeletons are not mutually exclusive**: one template can be both "schedule" and "batch loop", so the 14 shares add up to 132.1%. The classification looks only at node composition (for example "contains `scheduleTrigger`"), not at wiring order.
- **Overall baselines**: median 19 nodes (mean 22.2, P90 39); median 5 sticky notes; 93.1% have stickies; 24.8% have any error handling (definition in [`node-frequency.en.md`](node-frequency.en.md) §9).
- **Definition of "has error handling"**: contains `errorTrigger`, any node sets `continueOnFail`, or any node's `onError` is not the default `stopWorkflow`; retries (`retryOnFail`) are not counted.
- **Representative templates**: each class lists 3 templates, picked among those with 6-25 nodes and a view count, taking the top 3 by views. They only show what the class looks like; high views do not mean the design is correct.

### Common business-node combinations

After excluding `stickyNote`, `noOp`, `manualTrigger` and triggers, the node pairs that most often appear together (full ranking in [`node-frequency.en.md`](node-frequency.en.md) §8):

| Node pair | N (templates) | Pattern name |
|---|---|---|
| `code` + `if` | 5,140 | Custom logic, then branch |
| `code` + `httpRequest` | 5,027 | API + custom logic |
| `code` + `set` | 4,941 | Process in code, then shape |
| `if` + `set` | 4,592 | Conditional shaping |
| `httpRequest` + `set` | 4,571 | API shaping |
| `httpRequest` + `if` | 4,125 | Route on API result |
| `code` + `googleSheets` | 3,625 | Process then write to sheet |
| `googleSheets` + `if` | 3,059 | Branch on sheet data |

---

## 2. The 14 skeletons

### Overview

| Skeleton | Meaning | Templates | Share | Median nodes | With sticky | With error handling |
|---|---|---|---|---|---|---|
| `webhook-api` | Webhook in, with a response node | 1,357 | 9.7% | 22 | 97.4% | 38.2% |
| `webhook-fire` | Webhook in, no response node | 1,418 | 10.2% | 21 | 93.8% | 24.7% |
| `schedule` | Scheduled trigger | 4,571 | 32.8% | 22 | 97.9% | 33.9% |
| `form` | Form trigger | 1,635 | 11.7% | 19 | 98.5% | 27.1% |
| `chat-agent` | Conversational AI agent | 641 | 4.6% | 19 | 95.3% | 16.2% |
| `agent-tools` | Agent with tools | 855 | 6.1% | 27 | 96.8% | 20.2% |
| `rag` | RAG (vector store + embeddings + document loader) | 395 | 2.8% | 28 | 99.2% | 24.1% |
| `telegram` | Telegram bot | 832 | 6.0% | 25 | 95.2% | 22.4% |
| `gmail` | Gmail trigger | 553 | 4.0% | 21 | 98.4% | 24.8% |
| `subworkflow` | Callable sub-workflow | 577 | 4.1% | 24 | 98.4% | 32.8% |
| `error-handler` | Error-handling flow | 428 | 3.1% | 28 | 97.7% | 100.0% |
| `mcp-server` | MCP server | 309 | 2.2% | 16 | 96.8% | 3.9% |
| `batch-loop` | Batch loop | 2,361 | 16.9% | 23 | 97.5% | 37.6% |
| `wait` | Contains a wait node | 2,494 | 17.9% | 24 | 98.4% | 33.7% |

> Baseline for comparison: 24.8% of all templates have error handling. The 100.0% for `error-handler` follows from the class definition; the other classes range from 3.9% (`mcp-server`) to 38.2% (`webhook-api`), and none exceeds four in ten.

### 2.1 `webhook-api`: Webhook in, with a response node

- **Share**: 1,357 templates (9.7%)
- **Median node count**: 22 (overall: 19); with sticky 97.4%
- **Error-handling share**: 38.2% (overall: 24.8%)
- **Typical node mix** (share of this class's templates): `respondToWebhook` 100%, `webhook` 100%, `code` 74%, `if` 65%, `httpRequest` 57%, `set` 56%, `lc:agent` 31%, `googleSheets` 26%
- **Common shape** (inferred from the nodes above, not a statistic): `webhook` → check / route (`if`, `code`) → process (`httpRequest`, `set`, AI) → `respondToWebhook`
- **How to use this**: Check the caller at the entrance (shared secret, signature or header credential), make every branch (failure branches included) reach a response node, and decide what to return on timeout or error so the caller is never left hanging.
- **Representative templates**:
  - #2679 "⚡AI-powered YouTube video summarization & analysis" (https://n8n.io/workflows/2679)
  - #2846 "AI voice chatbot with ElevenLabs & OpenAI for customer service and restaurants" (https://n8n.io/workflows/2846)
  - #4484 "Build a voice AI chatbot with ElevenLabs and InfraNodus knowledge experts" (https://n8n.io/workflows/4484)

### 2.2 `webhook-fire`: Webhook in, no response node

- **Share**: 1,418 templates (10.2%)
- **Median node count**: 21 (overall: 19); with sticky 93.8%
- **Error-handling share**: 24.7% (overall: 24.8%)
- **Typical node mix** (share of this class's templates): `webhook` 100%, `if` 64%, `code` 64%, `set` 63%, `httpRequest` 56%, `googleSheets` 37%, `lc:agent` 32%, `slack` 29%
- **Common shape** (inferred from the nodes above, not a statistic): `webhook` → `if` / `code` / `set` → notify or write (`slack`, `googleSheets`, AI agent), no `respondToWebhook`
- **How to use this**: This class only checks for a `respondToWebhook` node; the Webhook node's own response mode also counts as a response. Decide first whether the caller waits for a result; if the platform wants a quick acknowledgement, respond first and run the long flow afterwards. The entrance needs a caller check here too.
- **Representative templates**:
  - #1961 "Slack chatbot powered by AI" (https://n8n.io/workflows/1961)
  - #2864 "🐋🤖 DeepSeek AI agent + Telegram + LONG TERM memory 🧠" (https://n8n.io/workflows/2864)
  - #1938 "Discord AI-powered bot" (https://n8n.io/workflows/1938)

### 2.3 `schedule`: Scheduled trigger

- **Share**: 4,571 templates (32.8%)
- **Median node count**: 22 (overall: 19); with sticky 97.9%
- **Error-handling share**: 33.9% (overall: 24.8%)
- **Typical node mix** (share of this class's templates): `scheduleTrigger` 100%, `code` 76%, `set` 63%, `if` 60%, `httpRequest` 58%, `googleSheets` 47%, `gmail` 32%, `lc:agent` 29%
- **Common shape** (inferred from the nodes above, not a statistic): `scheduleTrigger` → fetch (`httpRequest`, `googleSheets`) → shape and decide (`code`, `set`, `if`) → output (`gmail`, sheet, AI)
- **How to use this**: A scheduled flow runs unattended, so it must be safe to re-run without duplicate writes (record what was processed), notify on failure, and set the timezone and frequency explicitly. Always use `scheduleTrigger`, not the legacy `cron`.
- **Representative templates**:
  - #8642 "Generate AI viral videos with VEO 3 and upload to TikTok" (https://n8n.io/workflows/8642)
  - #4846 "Generate AI videos with Google Veo3, save to Google Drive and upload to YouTube" (https://n8n.io/workflows/4846)
  - #8527 "Learn n8n basics in 3 easy steps ✨" (https://n8n.io/workflows/8527)

### 2.4 `form`: Form trigger

- **Share**: 1,635 templates (11.7%)
- **Median node count**: 19 (overall: 19); with sticky 98.5%
- **Error-handling share**: 27.1% (overall: 24.8%)
- **Typical node mix** (share of this class's templates): `formTrigger` 100%, `code` 63%, `httpRequest` 61%, `set` 56%, `if` 54%, `googleSheets` 41%, `lc:agent` 32%, `gmail` 29%
- **Common shape** (inferred from the nodes above, not a statistic): `formTrigger` → check fields (`if`, `code`) → process or write (`httpRequest`, `googleSheets`, AI) → notify (`gmail`)
- **How to use this**: Treat form fields as the input contract: give missing or malformed fields an explicit branch, and for public forms consider abuse and add origin or rate limits where needed.
- **Representative templates**:
  - #5148 "Local chatbot with retrieval augmented generation (RAG)" (https://n8n.io/workflows/5148)
  - #2736 "Summarize YouTube videos from transcript" (https://n8n.io/workflows/2736)
  - #5010 "RAG Starter Template using Simple Vector Stores, Form trigger and OpenAI" (https://n8n.io/workflows/5010)

### 2.5 `chat-agent`: Conversational AI agent

- **Share**: 641 templates (4.6%)
- **Median node count**: 19 (overall: 19); with sticky 95.3%
- **Error-handling share**: 16.2% (overall: 24.8%)
- **Typical node mix** (share of this class's templates): `lc:agent` 100%, `lc:chatTrigger` 100%, `lc:memoryBufferWindow` 66%, `lc:lmChatOpenAi` 64%, `set` 46%, `code` 33%, `httpRequest` 30%, `if` 29%
- **Common shape** (inferred from the nodes above, not a statistic): `chatTrigger` → `agent` (with a language model, `memoryBufferWindow`, tools) → reply
- **How to use this**: Few have error handling, so add it proactively: still return a human-readable reply when the model or a tool fails; give the memory node a session key so different users' conversations do not mix; state the role and boundaries in the system prompt.
- **Representative templates**:
  - #6270 "Build your first AI agent" (https://n8n.io/workflows/6270)
  - #2090 "Chat with a database using AI" (https://n8n.io/workflows/2090)
  - #2753 "RAG chatbot for company documents using Google Drive and Gemini" (https://n8n.io/workflows/2753)

### 2.6 `agent-tools`: Agent with tools

- **Share**: 855 templates (6.1%)
- **Median node count**: 27 (overall: 19); with sticky 96.8%
- **Error-handling share**: 20.2% (overall: 24.8%)
- **Typical node mix** (share of this class's templates): `lc:agent` 100%, `set` 68%, `lc:lmChatOpenAi` 68%, `httpRequest` 47%, `lc:memoryBufferWindow` 47%, `code` 44%, `if` 40%, `lc:outputParserStructured` 39%
- **Common shape** (inferred from the nodes above, not a statistic): `agent` + several tool nodes (`toolWorkflow`, `httpRequest`, and so on) + language model + memory + output parser
- **How to use this**: The node-count median is high and flows bloat as tools pile up: name and describe each tool clearly so the model knows when to use it; restrict tools that write or delete data, and consider wrapping complex tools in sub-workflows.
- **Representative templates**:
  - #2753 "RAG chatbot for company documents using Google Drive and Gemini" (https://n8n.io/workflows/2753)
  - #8642 "Generate AI viral videos with VEO 3 and upload to TikTok" (https://n8n.io/workflows/8642)
  - #2006 "AI agent that can scrape webpages" (https://n8n.io/workflows/2006)

### 2.7 `rag`: RAG (vector store + embeddings + document loader)

- **Share**: 395 templates (2.8%)
- **Median node count**: 28 (overall: 19); with sticky 99.2%
- **Error-handling share**: 24.1% (overall: 24.8%)
- **Typical node mix** (share of this class's templates): `lc:documentDefaultDataLoader` 100%, `lc:agent` 78%, `lc:embeddingsOpenAi` 70%, `set` 58%, `lc:textSplitterRecursiveCharacterTextSplitter` 58%, `lc:lmChatOpenAi` 56%, `code` 48%, `httpRequest` 47%
- **Common shape** (inferred from the nodes above, not a statistic): `documentDefaultDataLoader` + text splitter + embeddings (`embeddings*`) + vector store (`vectorStore*`) + `agent` / Q&A
- **How to use this**: Split ingestion from querying into two flows; record and keep the embedding model, vector dimensions and splitter settings consistent (changing the model means rebuilding the index); make answers able to point to the source passages.
- **Representative templates**:
  - #2753 "RAG chatbot for company documents using Google Drive and Gemini" (https://n8n.io/workflows/2753)
  - #1960 "Ask questions about a PDF using AI" (https://n8n.io/workflows/1960)
  - #5148 "Local chatbot with retrieval augmented generation (RAG)" (https://n8n.io/workflows/5148)

### 2.8 `telegram`: Telegram bot

- **Share**: 832 templates (6.0%)
- **Median node count**: 25 (overall: 19); with sticky 95.2%
- **Error-handling share**: 22.4% (overall: 24.8%)
- **Typical node mix** (share of this class's templates): `telegramTrigger` 100%, `telegram` 96%, `set` 62%, `if` 57%, `lc:agent` 57%, `code` 55%, `httpRequest` 45%, `switch` 39%
- **Common shape** (inferred from the nodes above, not a statistic): `telegramTrigger` → `switch` / `if` routing (text, voice, image) → process (AI, `httpRequest`) → `telegram` reply
- **How to use this**: Handle message types beyond text (voice, image, sticker) and provide a default reply; restrict who may use the bot (for example by matching allowed chat identifiers) so strangers cannot trigger actions with cost or side effects.
- **Representative templates**:
  - #2462 "Angie, personal AI assistant with Telegram voice and text" (https://n8n.io/workflows/2462)
  - #8237 "Personal life manager with Telegram, Google services & voice-enabled AI" (https://n8n.io/workflows/8237)
  - #1934 "Telegram AI chatbot" (https://n8n.io/workflows/1934)

### 2.9 `gmail`: Gmail trigger

- **Share**: 553 templates (4.0%)
- **Median node count**: 21 (overall: 19); with sticky 98.4%
- **Error-handling share**: 24.8% (overall: 24.8%)
- **Typical node mix** (share of this class's templates): `gmailTrigger` 100%, `gmail` 74%, `code` 65%, `if` 64%, `set` 55%, `googleSheets` 48%, `lc:lmChatOpenAi` 38%, `lc:agent` 38%
- **Common shape** (inferred from the nodes above, not a statistic): `gmailTrigger` → classify or extract (`code`, AI) → process (`googleSheets`, `slack`) → reply or label (`gmail`)
- **How to use this**: Avoid looping on mail the flow itself sent, and mark or record processed messages; mail can be long or sensitive, so decide what to trim or mask before passing it to AI.
- **Representative templates**:
  - #2740 "Basic automatic Gmail email labelling with OpenAI and Gmail API" (https://n8n.io/workflows/2740)
  - #4722 "Gmail AI Email Manager" (https://n8n.io/workflows/4722)
  - #1953 "Suggest meeting slots using AI" (https://n8n.io/workflows/1953)

### 2.10 `subworkflow`: Callable sub-workflow

- **Share**: 577 templates (4.1%)
- **Median node count**: 24 (overall: 19); with sticky 98.4%
- **Error-handling share**: 32.8% (overall: 24.8%)
- **Typical node mix** (share of this class's templates): `executeWorkflowTrigger` 100%, `set` 75%, `code` 54%, `httpRequest` 52%, `if` 50%, `lc:agent` 48%, `lc:lmChatOpenAi` 36%, `lc:toolWorkflow` 33%
- **Common shape** (inferred from the nodes above, not a statistic): `executeWorkflowTrigger` → process (`set`, `code`, `httpRequest`, AI) → return a result; often called by `toolWorkflow` or other flows
- **How to use this**: Document the input and output fields in a sticky note; a failing sub-workflow must return its error to the caller instead of swallowing it; split by single responsibility so each piece can be re-run on its own.
- **Representative templates**:
  - #2006 "AI agent that can scrape webpages" (https://n8n.io/workflows/2006)
  - #2786 "Create a branded AI-powered website chatbot" (https://n8n.io/workflows/2786)
  - #2035 "Telegram AI bot with LangChain nodes" (https://n8n.io/workflows/2035)

### 2.11 `error-handler`: Error-handling flow

- **Share**: 428 templates (3.1%)
- **Median node count**: 28 (overall: 19); with sticky 97.7%
- **Error-handling share**: 100.0% (overall: 24.8%)
- **Typical node mix** (share of this class's templates): `errorTrigger` 100%, `code` 80%, `if` 75%, `set` 64%, `slack` 58%, `scheduleTrigger` 55%, `gmail` 54%, `googleSheets` 53%
- **Common shape** (inferred from the nodes above, not a statistic): `errorTrigger` → shape error details (`code`, `set`) → notify (`slack`, `gmail`) or log (`googleSheets`)
- **How to use this**: The 100% here follows from the class definition (containing `errorTrigger` counts as error handling) and says nothing about quality; across all templates only about a quarter have any error handling. Build one shared error flow, point other workflows at it in their settings, and make the notification carry the workflow name and failing node.
- **Representative templates**:
  - #2894 "Upload to Instagram, TikTok & YouTube from Google Drive" (https://n8n.io/workflows/2894)
  - #5787 "From Google Drive to Instagram, TikTok & YouTube with AI descriptions & Airtable tracking" (https://n8n.io/workflows/5787)
  - #4474 "Automate multi-channel customer support with Gmail, Telegram, and GPT AI" (https://n8n.io/workflows/4474)

### 2.12 `mcp-server`: MCP server

- **Share**: 309 templates (2.2%)
- **Median node count**: 16 (overall: 19); with sticky 96.8%
- **Error-handling share**: 3.9% (overall: 24.8%)
- **Typical node mix** (share of this class's templates): `lc:mcpTrigger` 100%, `httpRequestTool` 24%, `lc:agent` 21%, `lc:mcpClientTool` 18%, `lc:memoryBufferWindow` 15%, `set` 13%, `lc:lmChatOpenAi` 13%, `lc:toolWorkflow` 13%
- **Common shape** (inferred from the nodes above, not a statistic): `mcpTrigger` + a few tool nodes (`httpRequestTool`, `toolWorkflow`, and so on), often with `agent` / `mcpClientTool`
- **How to use this**: This is the smallest class and the one with the least error handling. Its tools are called directly by external MCP clients, so inventory which tools write or leak data, add access control, and have tools return readable errors on failure.
- **Representative templates**:
  - #3905 "Build a personal assistant with Google Gemini, Gmail and Calendar using MCP" (https://n8n.io/workflows/3905)
  - #3656 "Ai-powered Telegram task manager with MCP server" (https://n8n.io/workflows/3656)
  - #3638 "Build your own CUSTOM API MCP server" (https://n8n.io/workflows/3638)

### 2.13 `batch-loop`: Batch loop

- **Share**: 2,361 templates (16.9%)
- **Median node count**: 23 (overall: 19); with sticky 97.5%
- **Error-handling share**: 37.6% (overall: 24.8%)
- **Typical node mix** (share of this class's templates): `splitInBatches` 100%, `code` 73%, `set` 63%, `httpRequest` 61%, `if` 60%, `googleSheets` 47%, `scheduleTrigger` 47%, `wait` 37%
- **Common shape** (inferred from the nodes above, not a statistic): fetch a list → `splitInBatches` → (loop body) `httpRequest` / `code` / `set` → (often with `wait`) → `aggregate` / write
- **How to use this**: When the loop calls external services, mind rate limits: control the batch size, add `wait` where needed, and set retry or skip for single-item failures so one bad item does not sink the batch; converge with `aggregate` after the loop.
- **Representative templates**:
  - #5385 "Lead generation system: Google Maps to email scraper with Google Sheets export" (https://n8n.io/workflows/5385)
  - #5906 "Automated job applications & status tracking with LinkedIn, Indeed & Google Sheets" (https://n8n.io/workflows/5906)
  - #1073 "Scrape and store data from multiple website pages" (https://n8n.io/workflows/1073)

### 2.14 `wait`: Contains a wait node

- **Share**: 2,494 templates (17.9%)
- **Median node count**: 24 (overall: 19); with sticky 98.4%
- **Error-handling share**: 33.7% (overall: 24.8%)
- **Typical node mix** (share of this class's templates): `wait` 100%, `httpRequest` 79%, `if` 71%, `code` 68%, `set` 65%, `googleSheets` 43%, `scheduleTrigger` 35%, `splitInBatches` 35%
- **Common shape** (inferred from the nodes above, not a statistic): `wait` together with `httpRequest` and `if`: waiting for async results, polling, or throttling between calls
- **How to use this**: When used for throttling or waiting on async jobs (video or image generation, for example), cap polling by count or time and give it a timeout branch to avoid waiting forever; for long waits, think through how state survives a restart.
- **Representative templates**:
  - #8642 "Generate AI viral videos with VEO 3 and upload to TikTok" (https://n8n.io/workflows/8642)
  - #4846 "Generate AI videos with Google Veo3, save to Google Drive and upload to YouTube" (https://n8n.io/workflows/4846)
  - #2740 "Basic automatic Gmail email labelling with OpenAI and Gmail API" (https://n8n.io/workflows/2740)

---

## 3. Anti-patterns and outdated practices

These practices are common in public templates but AI should not carry them into generated workflows. Numbers are template counts; shares use all 13,947 as the denominator.

### Anti-pattern 1: deprecated nodes
- 522 templates (3.7%) contain at least one deprecated node: `function` 328, `cron` 244, `functionItem` 34, `start` 10, `interval` 10.
- Of the 6,564 templates created in 2025, 300 (4.6%) still have them, and 35 of 6,225 from 2026 (0.6%); the trend is falling but not zero.
- **AI rule**: always use the newer nodes (`code`, `scheduleTrigger`, `manualTrigger`); do not carry the old ones over just because a template uses them.

### Anti-pattern 2: missing error handling
- 10,482 templates (75.2%) have no `errorTrigger`, no `continueOnFail` and no non-default `onError`; among the 7,231 templates with `httpRequest`, only 30.9% have error handling and 18.2% have retries.
- **AI rule**: for workflows with `httpRequest` or other external calls, Layer 3 "known limits" must state the failure behaviour; when the user did not write `@on-error`, suggest adding it and choose a mode per `three-layer.md` §6.

### Anti-pattern 3: no explanation (no sticky notes)
- 969 templates (6.9%) have no sticky note at all, leaving the next person to guess each node's purpose. The overall median is 5 notes.
- **AI rule**: generated workflows always carry the Layer 1 / Layer 3 explanatory sticky notes.

### Anti-pattern 4: running a manual-only flow unattended
- 1,898 templates (13.6%) have only `manualTrigger`, mostly tutorials and demos.
- **AI rule**: a workflow meant to run unattended does not use `manualTrigger` as its only entry unless the user states `@trigger: manual`.

### Anti-pattern 5: oversized workflows left unsplit
- 2,660 templates (19.1%) exceed 30 nodes, and the P90 is 39. Many nodes is not wrong in itself, but maintenance and debugging costs rise.
- **AI rule**: when the §5 node-count guideline is exceeded, proactively suggest splitting into sub-workflows (`executeWorkflowTrigger`).

---

## 4. Mapping to the 8 cookbooks

| Cookbook | Skeleton(s) | Templates in the skeleton(s) |
|---|---|---|
| 01 webhook→slack | webhook-fire / webhook-api | 1,418 / 1,357 |
| 02 schedule-report | schedule | 4,571 |
| 03 form-to-database | form | 1,635 |
| 04 ai-classify-route | chat-agent / agent-tools / telegram | 641 / 855 / 832 |
| 05 file-process-pipeline | subworkflow / wait | 577 / 2,494 |
| 06 error-retry-pattern | error-handler | 428 |
| 07 multi-source-merge | schedule | 4,571 |
| 08 loop-batch-processing | batch-loop | 2,361 |

> The mapping only says which skeleton a cookbook scenario belongs to; it does not mean the cookbooks were adapted from these templates.

---

## 5. AI's workflow generation decision flow (summary)

The following are the Pack's own design guidelines. The node-count caps are a maintainability choice, not derived from the statistics, which only remind us of common community practice.

```text
1. Parse the Layer 1 DSL -> confirm the trigger
2. Match against the 14 skeletons in §2 -> pick the closest (several may apply)
3. Apply the node mapping (node-frequency.md §4 + dsl §4) and confirm the nodes are currently available in the user's environment
4. Auto-add structural nodes:
   - if followed by noOp to converge
   - splitInBatches followed by aggregate
   - for a webhook trigger, decide the response mode (respondToWebhook or the Webhook node's own response mode)
   - switch without an explicit fallback -> must add a fallback (NaN/null/otherwise) -> noOp
   - 3+ branch switch -> tail must merge (mode=append) into a single output
5. Node count caps (flexible):
   - linear workflow <= 15 nodes -> over -> suggest a sub-workflow (executeWorkflowTrigger)
   - branched workflow <= 25 nodes -> relaxed because each branch has independent nodes
6. Proactively add Layer 3 risk warnings:
   - Contains httpRequest -> flag retry/timeout
   - Missing @on-error -> suggest adding (per three-layer.md §6 mode A or B)
   - Node count nearing the cap -> suggest a sub-workflow split
   - LLM scoring/classification -> flag non-determinism, calibration needed
   - Switch missing fallback -> AI adds it and notes in Layer 3 "user did not specify, default noOp"
   - Credentials the user must create -> list type names only, never write any credential value
7. Forbidden: deprecated nodes (cron / function / functionItem / start / interval); manualTrigger unless explicit
```

---

## 6. How to use this document

- **Descriptive statistics, not a quality certificate**: every number only says what is common in public templates. Common does not mean correct, and does not mean it should be done that way.
- **High views do not mean correct**: representative templates were picked by views, which reflects popularity and exposure time, not design quality. Do not treat them as the standard answer because they rank first.
- **Rebuild with current nodes**: when generating a workflow, build it from scratch with the nodes and parameters currently available in the user's environment. Do not copy a template, keep old nodes, or assume a template's parameters still hold.
- **When a template was consulted, just tell the user which one**: give it as "#ID "Title" (URL)", pointing to the official n8n.io page. This repo stores no template content; to read the original, search n8n.io live with the user's consent.
- **The sample skews recent and AI-heavy**: 91.7% of templates were created in 2025-2026 and 54.6% involve AI, so representativeness for classic integration scenarios is weaker. Method and limitations: [`n8n-templates-method.en.md`](n8n-templates-method.en.md).

---

**Data version**: compiled 2026-11-06 (13,947 templates). This document cites 34 templates in total (the representative templates of each skeleton).
