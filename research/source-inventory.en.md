> Historical record: the `reference-workflows/` mentioned below was removed from the repo on 2026-11-06; see `research/n8n-templates-method.en.md`

# Source Inventory (Phase 0)

> 🌐 **English** | [繁體中文](source-inventory.md)

> One-time clarification of the role and integration approach for all materials under `c:\Tools\@@@@@@Antigravity\n8n-RD-Rules\`.

---

## A. Learning materials (for AI to read)

### A1. `n8n-skills-main/`
- **Role**: **Format contract + 7 reusable Skills**
- **Integration**: copy `skills/*` to `delivery/TigerAI-Code2n8n-Skill-Pack/skills/_vendor/`
- **Key files**: `CLAUDE.md` (architecture), `skills/<name>/SKILL.md` (each Skill body)
- **License**: MIT, copyable; preserve LICENSE and source attribution

### A2. `n8n-workflows-main/workflows/`
- **Role**: **2,061 example corpus**, AI reference learning
- **Integration**:
  1. Bulk copy to `delivery/.../reference-workflows/` (for users/AI lookup)
  2. Script-extract structured index to `research/workflow-index.json`
- **Key findings**:
  - Naming `<id>_<Vendor>_<Action>_<Trigger>.json`
  - Trigger types concentrate on: Triggered / Webhook / Scheduled / Automation
  - Has `Stickynote` subcategory (Aggregate/Airtabletool/Code/...) — natural sticky-note examples
  - Sticky content is Markdown, often with Introduction / Benefits / Key Features / Setup Instructions / Testing
- **Side files**: `api_server.py`, `workflow_db.py` — that project's own search API, **not included in delivery** (different from our AI Pipeline approach)

---

## B. TigerAI internal assets (existing implementations)

### B1. `n8n-mcp-json/`
- **Role**: TigerAI's 12 production workflows (splitPDF / splitMP3 / openwebui-bridge series)
- **Design patterns embodied**:
  - `*-orchestrated.json`: atomic orchestration, loop-level transparency
  - `*-form.json`: Form Trigger entry pattern
  - `*-WSL-Remote.json`: cross-environment Worker location transparency
  - `*-modular.json`: sub-workflow split
  - `*-native.json` vs `*-fixed.json`: n8n native vs patched comparison
- **Integration**:
  - Pick 3–5 representatives (suggest: `splitPDF-orchestrated.json`, `splitMP3-API-Orchestrated.json`, `openwebui-bridge-v2.json`) → copy to `examples/tigerai-flagship/` as **enterprise examples**
  - Others stay in original location; not copied

### B2. `n8n-global-state-manager/`
- **Role**: **Engineering Playbook** (README.md is v1.0 methodology doc)
- **Core concepts**:
  - Workflow as Code (WaC)
  - Specification-Driven Development (SDD)
  - Standard project structure: `specification.md` + `workflow.json` + `README.md`
  - SDD required sections: Purpose / Trigger & Inputs / Business Logic / Outputs / Errors / Test Scenarios
- **Integration**:
  - Extract SDD template into `skills/tigerai/tigerai-enterprise-patterns/` (Phase 3)
  - This phase: reference in `research/`, no copy

### B3. `n8n-rag-system/`
- **Role**: placeholder SDD (draft, awaits JSON)
- **Integration**: **excluded this phase**; revisit when actual RAG workflow exists
- **Note**: tracking item in `MEMORY.md`

### B4. `Docker-Installation/`
- **Role**: n8n local deployment data
- **Integration**: **not in delivery** (customers have their own deployments); but mention "self-hosted n8n required" in `01-INSTALL.md`

### B5. Root `SDD.md` / `README.md`
- **Role**: top-level project doc
- **Integration**: delivery `README.md` references the "Four Consultancy Pillars" section from `SDD.md`

---

## C. Excluded (explicit non-includes)

| Item | Reason |
|---|---|
| `n8n-workflows-main/api_server.py` etc. | Different from our AI Pipeline approach |
| `n8n-workflows-main/Dockerfile` / `docker-compose*.yml` | That project's self-deploy |
| `Docker-Installation/` | Customer self-provisioned |
| `n8n-rag-system/` | Draft phase |
| `install_docker.sh` (root) | Customer self-provisioned |

---

## D. Integration matrix (one diagram)

```
[Source]                         →  [Delivery destination]
n8n-skills-main/skills/*         →  skills/_vendor/*
n8n-workflows-main/workflows/*   →  reference-workflows/*  +  research/workflow-index.json
n8n-mcp-json/(curated)           →  examples/tigerai-flagship/*
n8n-global-state-manager/README  →  skills/tigerai/tigerai-enterprise-patterns/ (Phase 3)
n8n-rag-system/                  →  [excluded for now]
Docker-Installation/             →  [excluded; mentioned in docs]
```

---

**Status**: Phase 0 inventory complete. Phase 1 copy is scheduled after `research/workflow-index.json` is produced (will require non-trivial disk usage for 2,061 files; user confirms first).
