# 02 — Three Usage Modes

> 🌐 **English** | [繁體中文](02-USAGE-MODES.md)

> This Skill Pack supports **three usage styles**. Pick by familiarity. AI auto-switches based on trigger phrases.
>
> **Zero syntax to learn** — the entire Pack accepts plain natural language (English / Chinese / mixed). AI handles structured parsing internally.

---

## Mode 1: Cookbook copy (fastest)

**For**: You know what flow you want and want it done quickly.

**How**:
1. Open [`cookbook/00-INDEX.en.md`](cookbook/00-INDEX.en.md), find the closest example
2. Copy the "🌱 Plain-language version" content into a sticky note in n8n
3. Tweak a few values (your channel name, API URL, sender, etc.)
4. Ask AI → get the full workflow

**Trigger**: Just submit your sticky note. No special phrase needed.

> 📐 Each cookbook also includes an "Advanced DSL strict syntax" (collapsed details block) for engineers or strict spec scenarios. **Beginners can completely ignore the DSL** — the plain-language version is enough.

---

## Mode 2: Q&A mode (most beginner-friendly) ⭐

**For**: Not sure how to describe your needs, first-time n8n user, want guided help.

**How**: Tell AI:

> "enable Q&A mode" / "啟用問答模式" / "I don't know how to describe my workflow"

AI runs **5 stages**, asking 1–3 questions per stage:

| Stage | Sample question |
|---|---|
| 1. Trigger | When should this run? (Time / external event / manual / form) |
| 2. Inputs | What data comes in when triggered? What fields? |
| 3. Steps | What happens after? (AI keeps asking "and then?" until you say done) |
| 4. Outputs | Where do results go? (Slack / Email / DB / API) |
| 5. Errors | On failure, what to do? (Ignore / notify / retry) |

After each stage AI **echoes back** your draft so far in plain language.
After all stages, AI asks you to **confirm**, then generates the workflow in one shot.

Details: [`skills/tigerai/tigerai-qa-mode/SKILL.md`](skills/tigerai/tigerai-qa-mode/SKILL.md)

---

## Mode 3: Example finder (best for learning)

**For**: You roughly know what you want, but want to see how others did it before deciding.

**How**: Tell AI:

> "example finder mode: find something similar to X" / "範例查詢模式" / "show me examples for X"

AI will:
1. Search `cookbook/` and `examples/` first, then use the digested skeleton knowledge in `research/` to judge the approach. If those are not close enough, it asks whether you want it to look up official public templates on n8n.io, and only searches after you agree. It picks the top 3–5 approaches and always names the referenced template (ID, title, URL)
2. For each match, **explain in plain language**:
   - What this workflow does
   - Which nodes it uses and why
   - How it differs from your need
3. Ask: "Use one of these as the skeleton? Adjust N places? Or want me to design a fresh one?" (templates are only read and digested; the actual workflow is rebuilt with current node versions, never copied)

Details: [`skills/tigerai/tigerai-example-finder/SKILL.md`](skills/tigerai/tigerai-example-finder/SKILL.md)

---

## Mode comparison

| Mode | Speed | Learning curve | Customization | Best for |
|---|---|---|---|---|
| Cookbook copy | ⚡⚡⚡ | Low | Medium | Repetitive standard flows |
| Q&A mode | ⚡⚡ | Lowest | High | Never written one before |
| Example finder | ⚡ | Medium | Highest | Want to learn from prior art |

---

## Modes can be combined

Real example:

```
User → Example finder: "find customer-routing related workflows"
     → After review: "I want something like cookbook/04 but with database logging"
     → Q&A mode kicks in to fill in missing details (DB schema, credentials)
     → AI generates the workflow
```

AI keeps the entire context across modes — no need to re-explain.

## Next: [03-FIRST-WORKFLOW.en.md](03-FIRST-WORKFLOW.en.md) (hands-on tutorial)
