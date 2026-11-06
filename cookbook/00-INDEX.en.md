# Sticky Note Cookbook — Index

> 🌐 **English** | [繁體中文](00-INDEX.md)

> Don't know how to write a sticky? Find the closest example below, copy the "🌱 Plain-language version" into n8n, and AI generates the complete workflow.

Each example offers two formats:
1. **🌱 Plain-language version (recommended)** — describe like talking to a coworker; works without coding skill
2. **📐 Advanced DSL syntax (folded)** — for engineers / strict spec; **non-technical users can skip entirely**

> 🌏 **Want a side-by-side bilingual reference of all 8 sticky notes?** → [`STICKY-EXAMPLES-BILINGUAL.en.md`](STICKY-EXAMPLES-BILINGUAL.en.md)
>
> 🚀 **First time?** Import a starter JSON to get a ready-positioned yellow sticky → [`_starter-README.md`](_starter-README.md) (blank version + bilingual fill-in template)
>
> ✅ **Want a guaranteed-runnable complete workflow as reference?** → [`_runnable-README.md`](_runnable-README.md) (2 R3-verified versions: real n8n curl 200 + execution success)

Page contents:
- **Use case** — when to use this
- **Sticky note content** (plain language + folded DSL)
- **Nodes AI will generate** — preview of the middle workflow
- **AI's commentary** — credentials, assumptions, limits

---

| # | Recipe | Best for | Key nodes |
|---|---|---|---|
| 01 | [Webhook → Slack](01-webhook-to-slack.en.md) | Receive external event, notify team | webhook, slack |
| 02 | [Schedule → Email report](02-schedule-report.en.md) | Daily/weekly auto reports | scheduleTrigger, httpRequest, code, gmail |
| 03 | [Form → DB insert](03-form-to-database.en.md) | Form data into backend | formTrigger, if, postgres |
| 04 | [AI classify → route](04-ai-classify-route.en.md) | Auto-route emails by AI classification | webhook, openAi (langchain package), switch |
| 05 | [File processing pipeline](05-file-process-pipeline.en.md) | PDF/MP3/image split, transcode, upload | formTrigger, httpRequest (FastAPI Worker), code |
| 06 | [Error retry pattern](06-error-retry-pattern.en.md) | Flaky API needs retry / failure alert | wait, errorTrigger, slack |
| 07 | [Multi-source merge](07-multi-source-merge.en.md) | Pull from multiple APIs and merge | merge, set, splitInBatches |
| 08 | [Loop batch processing](08-loop-batch-processing.en.md) | Same processing per item over a batch | splitInBatches, set, sendGrid, if, wait |

---

## Picking a recipe

```text
What I want to do …                     →  Recipe
Trigger on external event              →  01 / 04
Run on schedule                         →  02
Process user form submissions           →  03
AI judges and routes                    →  04
Process uploaded files                  →  05
Need retry / failure alert              →  06
Pull from multiple sources and merge    →  07
Apply same processing per item          →  08
```

> Can't find a fit? Combine. E.g. "daily fetch 100 records → AI classify → write DB" = combo of 02 + 04 + 08 + 03. Just include the relevant Layer 1 blocks.
