# Phase 4: Semantic Index (Superseded)

> 🌐 **English** | [繁體中文](PHASE-4-EMBEDDING-INDEX.md)

> **Status: superseded.** The semantic-index design this file used to record targeted `reference-workflows/` inside the repo. That corpus was removed from the repo on 2026-11-06, so the original design no longer applies and its content is no longer kept.

---

## What happens now

- **Any index is built and maintained on the user's own machine**; the repo stores no index, vectors or template content.
- **Example lookups now search n8n.io live, with the user's consent**: when a reference template is needed, ask the user first, then search n8n.io on the spot; afterwards just tell the user which template was consulted (ID, title and official URL).
- The Skill itself carries only digested knowledge: skeleton patterns in [`patterns.en.md`](patterns.en.md), node and quality statistics in [`node-frequency.en.md`](node-frequency.en.md).
- When generating a workflow, always rebuild it with current node versions; never copy a template.

## Why it was superseded

- Templates carry no open-source license and are governed by the n8n terms and the authors' sharing terms, so the repo should not hold template content or an index derived from it.
- The data source is now the public templates on n8n.io (13,947 of them); method, bias and licensing stance are in [`n8n-templates-method.en.md`](n8n-templates-method.en.md).
- Keeping the index local lets it be updated as the user needs, without being tied to the Pack's versions.
