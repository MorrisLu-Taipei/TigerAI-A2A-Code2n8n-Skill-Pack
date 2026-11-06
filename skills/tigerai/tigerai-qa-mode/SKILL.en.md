---
name: tigerai-qa-mode
description: Activates a 5-stage guided Q&A interview to help users describe their automation in plain natural language when they don't know how to start. Use when the user says "enable Q&A mode", "Q&A mode", "問答模式", "I don't know how to describe my workflow", "guide me step by step", or asks for guided help building an n8n workflow. Drives the conversation stage-by-stage in everyday language (no technical jargon shown to the user) until enough info is collected to generate a workflow.
---

# TigerAI Q&A Mode — Guided Requirement Gathering

> 🌐 **English** | [繁體中文](SKILL.md)

## 1. Trigger conditions

**Explicit triggers** (user says):
- "enable Q&A mode" / "Q&A mode" / "問答模式"
- "I don't know how to describe my workflow" / "guide me step by step" / "ask me one at a time"

**Implicit trigger** (AI proactively suggests):
When user description is < 20 chars, missing critical info (when to trigger / what to do / where output goes), AI should ask:
> "Want to enter Q&A mode? I'll guide you step-by-step."

> 💬 **Throughout the conversation, AI uses no jargon**: no "webhook", "cron", "DSL", "Layer", "@trigger" etc. Use language users understand ("external system sending data", "fixed time", "form submission").

---

## 2. Five-stage interview

Each stage has a **max question count** to avoid bombardment. Provide A/B/C/D options when the answer is open-ended.

### Stage 1: Trigger (max 2 questions)

**Q1.1**: When should this run?
- A. Receives request from external system (webhook)
- B. Fixed time (daily / weekly / hourly)
- C. I click Run manually
- D. User submits a form

**Q1.2** (per A): give me the webhook path name (e.g. `/order`)
**Q1.2** (per B): how often? (e.g. daily 8 AM, every 15 min)
**Q1.2** (per D): what fields does the form need?

→ AI echoes: `@trigger: webhook POST /order` (internally, not shown to user)

---

### Stage 2: Inputs (max 2 questions)

**Q2.1**: What data comes in when triggered?
- For webhook: give a sample JSON (or describe fields)
- For schedule: usually no input; skippable
- For form: use the previous stage's fields

**Q2.2** (optional): which fields are required, which are optional?

---

### Stage 3: Steps (**max 7 steps**, one question at a time)

Loop pattern. AI repeats until user says "done":

```
AI: After receiving data, what's step 1?
User: Validate amount > 0
AI: [records @step] Then?
User: Write to database
AI: Which database? Which table? Which fields?
User: Postgres, orders table, full record
AI: [records @step] Anything else?
User: Done
```

**Important**:
- After each `@step`, AI rephrases "Current understood flow: ..."
- User can say "change last step to X" / "insert a step before step 2" anytime

**Step limit and handling**:
- **From step 5 onwards**: AI asks "5 steps so far; how many more? Want to keep these as the main workflow and put the rest into a sub-workflow?"
- **At step 7 (hard cap)**: AI strongly suggests sub-workflow split:
  > "Reached the 7-step recommended cap. Complex flows are easier to maintain split across multiple workflows. Suggest:
  >   - main workflow: first N steps (you choose)
  >   - sub-workflow: rest, called via `executeWorkflowTrigger`
  >   How would you like to split?"
- User insists on single workflow → AI complies but Layer 3 must note "expected node count > 25, hard to maintain"

**Native-first (design-stage reminder)**: when planning and rephrasing steps, first think of whether an n8n native node can do it (Summarize for totals, Sort plus Limit for top-N, Merge for joining two datasets) instead of defaulting to "write code for this step". This is an internal planning principle: **do not** raise terms like Code node or native node with the user; if a described step seems to need custom code, ask in plain language what result they actually want. The basis and decision order are in [`spec/native-first.en.md`](../../../spec/native-first.en.md); the gate and the disclosure are run by `sticky-note-to-workflow` after the handoff.

---

### Stage 4: Output (max 2 questions)

**Q4.1**: After processing, where do results go?
- A. Slack notification
- B. Email
- C. Respond to the webhook directly
- D. No external output (already wrote to DB in steps)

**Q4.2** (per answer): channel name / recipient / message template

---

### Stage 5: Error handling (max 1 question)

**Q5.1**: On failure, what should happen?
- A. Ignore, try again next time
- B. Notify me (Slack / Email)
- C. Auto-retry N times
- D. Not sure → AI uses default ("notify + retry 3 times")

---

## 3. Ending: produce sticky note draft and ask user to confirm

After 5 stages, AI **does NOT immediately produce workflow**. First gives a **plain-language sticky note draft** for confirmation. **Draft uses everyday language**, no `@trigger` / `@step` tags shown:

```text
## [AI's understanding of your needs] please confirm

[one-line summary of what you want]

When to run: [time / event]
What to do:
  1. ...
  2. ...
  3. ...
Where results go: [Email / Slack / DB / ...]
On failure: [ignore / notify / retry]

==========
✅ Looks right → I'll generate the complete workflow now
✏️ Want to change something? Tell me (in your own words)
```

After confirmation, calls `sticky-note-to-workflow` Skill to produce the workflow. The latter internally translates the natural language to strict format (DSL), but **the user never sees DSL throughout**.

### After completion: references, recommendations and scan result

This Skill does not generate workflows itself, so this part has two halves:

- **Where this happens**: during the interview, if any material was consulted to offer choices or suggestions (for example explaining with a cookbook example, or looking up an n8n.io template with the user's consent), record it in the "reference log"; if nothing was consulted, record nothing and do not fill in. When the draft is confirmed and handed to `sticky-note-to-workflow`, pass the reference log along.
- Writing the references, recommendations and scan result into the Layer 3 note and the relevant node notes, with only a summary in the conversation, is done by Step 8 of `sticky-note-to-workflow`; this Skill does not scan again. Order, format and honesty rules follow Chapter 4 of [`spec/references-disclosure.en.md`](../../../spec/references-disclosure.en.md).
- If the user leaves midway (for example "I'll write it myself") and no workflow is produced, none of this is needed. Any summary shown to the user is in plain language, without technical terms (keep the principle in Section 1).

> ⚠️ **All AI-shown drafts to users use plain language**. Technical formats (@trigger / @step etc.) are passed only between Skills internally — **never displayed to the user**.

---

## 4. Conversation guidelines

1. **One question at a time** (or two if highly related)
2. **Use A/B/C/D options** when possible — user replies "B" instead of typing
3. **Allow rewind**: "change last answer to X" works any time
4. **Allow exit**: "I'll do it myself" → AI exits Q&A mode
5. **Don't assume**: if user didn't say something, ask; don't backfill defaults
6. **Match language**: user uses Chinese → AI uses Chinese; English → English

---

## 5. Integration with other Skills

After Q&A mode produces Layer 1, auto-chain to:
- `n8n-node-configuration`: fill node parameters
- `sticky-note-to-workflow`: generate three-layer JSON
- `n8n-validation-expert`: validate output

---

## 6. Anti-patterns (avoid)

- ❌ Asking all 5 stages in one shot (overwhelms users)
- ❌ Generating workflow immediately after collecting answers (no confirmation gate)
- ❌ Using technical terms in questions ("webhook or IMAP?" → say "how does the external system notify you?")
- ❌ Switching to other modes mid-Q&A
