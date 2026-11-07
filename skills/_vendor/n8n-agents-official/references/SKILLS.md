# Agent skills

An Agent skill is a named set of instructions the Agent loads only when it needs them. Use one for a procedure that matters for some requests but would waste tokens on every turn if it lived in `instructions` (a refund policy, a report format, a triage playbook).

## How loading works

- Each skill's `name` and `description` sit in the system prompt as a catalog. The body doesn't.
- The model calls the built-in `load_skill` when a request matches a description. The body then stays in context for the rest of the conversation, so a loaded skill costs tokens on every later turn.
- References load separately: `load_skill` with the skill and a `filePath`. **Say so explicitly in the body.** In a live test, "read references/signoff.md" was ignored; "load the linked file references/signoff.md with load_skill (filePath)" worked.

So the description is the trigger. Write it like this skill pack's descriptions: "Use when ...", with the words a user would actually type.

## Creating one

```json
{ "type": "skill.upsert", "skill": {
  "name": "Refund policy",
  "description": "Use when the user asks for a refund, a return, or money back.",
  "instructions": "1. Check the order date with get_order.\n2. ...\nBefore quoting limits, load references/limits.md with load_skill (filePath).",
  "references": [ { "path": "references/limits.md", "content": "..." } ]
} }
```

| Field | Limit |
|---|---|
| `name` | 128 chars, unique per Agent (`skill_name_taken` otherwise) |
| `description` | 512 chars |
| `instructions` | 64 KB |
| `references` | Up to 20 Markdown files, 64 KB each |

- To edit, pass `skillId` and `baseSkillHash` from `get_agent` `skillHashes`, so you don't overwrite an edit made elsewhere. `skill.upsert` doesn't change `configHash`.
- `allowedTools` is accepted but doesn't restrict anything at runtime. Put tool rules in the body.
- Skills can't carry scripts, assets, or templates; only Markdown.

<!-- TEMPORARY: the Skills Hub (shared project and global skills, imported from SKILL.md folders) is behind N8N_AGENTS_SKILLS_HUB_ENABLED. Revisit when it's on by default. -->
Some instances have a Skills Hub for sharing skills across Agents and importing SKILL.md folders. Import takes `SKILL.md` plus `references/*.md` and refuses a `scripts/` folder. Over MCP, skills are always per Agent.

## Skill, instructions, or sub-agent?

| Put it in | When |
|---|---|
| `instructions` | Needed on nearly every turn: persona, safety, output format |
| A skill | A procedure for some requests, using the Agent's own tools |
| A sub-agent | Work that needs different tools, a different model, or a clean context (`SUB_AGENTS.md`) |
