> Historical record: the `reference-workflows/` mentioned below was removed from the repo on 2026-11-06; see `research/n8n-templates-method.en.md`

# Baseline Alignment (Phase 0)

> 🌐 **English** | [繁體中文](baseline.md)

> Purpose: before any work, lock down "who we reference, what format we produce, what AI sees". All Skills / specs / cookbooks downstream derive from this file.

---

## 1. Learning corpus overview

| Source | Path | Count | Role |
|---|---|---|---|
| Official Skill library | `n8n-skills-main/skills/` | 7 SKILL.md | **Format contract** — template for our custom Skills |
| Public workflow library | `n8n-workflows-main/workflows/` | 2,061 JSON (188 vendor folders) | **Example corpus** — AI reference learning |
| TigerAI internal workflows | `n8n-mcp-json/` | 12 JSON (splitPDF/splitMP3/openwebui-bridge series) | **Enterprise examples** — embodies Atomic/FastAPI/Orchestrator pattern |
| Engineering Playbook | `n8n-global-state-manager/README.md` | 1 doc | **Methodology** — Workflow as Code (WaC) + SDD |
| RAG module SDD | `n8n-rag-system/specification.md` | 1 doc (draft, awaits JSON) | **Placeholder** — exclude for now |

---

## 2. n8n Workflow JSON structure contract

Every workflow JSON must have:

| Field | Description | AI must care |
|---|---|---|
| `name` | workflow name | ✅ |
| `nodes[]` | all nodes (incl. stickyNote) | ✅ |
| `connections{}` | node connection topology | ✅ |
| `settings{}` | workflow-level settings | △ |
| `staticData` | persistent data across executions | △ |
| `tags[]` | classification tags | △ |
| `createdAt` / `updatedAt` | timestamps | ✗ |

### Node common fields

```json
{
  "id": "uuid",
  "name": "display name",
  "type": "n8n-nodes-base.<nodeType>",
  "typeVersion": 1,
  "position": [x, y],
  "parameters": { /* node-specific */ },
  "credentials": { /* optional */ },
  "notes": "node note (optional)",
  "notesInFlow": true
}
```

### Sticky Note Node (key)

`type = "n8n-nodes-base.stickyNote"`, `parameters` includes:
- `content`: **Markdown string**, supports headings/lists/links/images/`{{ $env.* }}`
- `width` / `height`: dimensions (pixels)
- Combined with `position` for canvas placement (top/middle/bottom by y coord)

> **This is the technical foundation of our three-layer structure**: top sticky (user input) / middle nodes (flow) / bottom sticky (AI commentary) — distinguished by `position.y`.

---

## 3. Official 7 Skills format contract

Each Skill is a folder containing:

```
skills/<skill-name>/
├── SKILL.md          # main file with YAML frontmatter
├── README.md         # human reader notes
└── *.md              # supplementary references
```

### SKILL.md frontmatter spec

```yaml
---
name: <skill-name>             # matches folder name, kebab-case
description: <one-line trigger>  # describes when this Skill activates; AI uses this to decide load
---
```

> **Key**: `description` must contain explicit triggers (e.g. "Use when …"), or the Skill won't auto-load. Our custom Skills must follow this format.

### Role of the 7 official Skills

| Skill | Role | Override? |
|---|---|---|
| `n8n-mcp-tools-expert` | MCP tools usage (HIGHEST PRIORITY) | ❌ inherit |
| `n8n-expression-syntax` | `{{ }}` expression syntax | ❌ inherit |
| `n8n-workflow-patterns` | 5 architectural patterns | ❌ inherit |
| `n8n-validation-expert` | validation error interpretation | ❌ inherit |
| `n8n-node-configuration` | node config rules | ❌ inherit |
| `n8n-code-javascript` | Code node JS style | ❌ inherit |
| `n8n-code-python` | Code node Python style | ❌ inherit |

---

## 4. Naming convention (from 2,061 files)

Public corpus uses: `<seq-id>_<Vendor>_<Action>_<Trigger>.json`

- `<Vendor>`: vendor or node category (Activecampaign / Aggregate / Airtable / Stickynote / …)
- `<Action>`: Create / Send / Automate / Automation / Update …
- `<Trigger>`: Triggered / Webhook / Scheduled / Automation

> **Our delivery uses different naming** (see `examples/` spec) to avoid confusion with public corpus.

---

## 5. Hard constraints on AI workflow (derived from this baseline)

1. **AI-generated workflow JSON must be n8n-importable** — structure contract inviolable
2. **AI must read sticky note before writing nodes** — no thin-air generation
3. **AI must write back a bottom sticky note explaining what it did** — three-layer structure
4. **AI must reuse the official 7 Skills' triggers** — don't reinvent
5. **AI references the 2,061 corpus only as reference, not direct copy** — license safety

---

**Status**: Phase 0 baseline aligned. Next: Phase 2a (three-layer structure spec).
