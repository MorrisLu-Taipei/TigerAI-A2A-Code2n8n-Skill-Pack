---
name: n8n-skill-router
description: Route n8n workflow troubleshooting (not working, 打不通), drafting, editing, review, and publish requests; includes workflow webhook and credentials issues.
---

# n8n Skill Router

[繁體中文](SKILL.md) | English

Before using any n8n tool, determine the user-authorized action and the target environment. Runtime permission and scope restrictions always take precedence.

1. Read [the pipeline index](references/pipeline.json). Select a route: `diagnose`, `build`, `modify`, `convert`, `review`, or `publish`. “Not working” means `diagnose`: read only. Building, modifying, or converting produces a draft by default. None of those routes implicitly enters publication.
2. Follow the route's stage order. Load its required `skills`, relevant `signals`, and the supported `adapters` entry before connecting; skip adapters for offline work. If there is a `choose` list, select one. A signal outside the route's stages provides a reference when needed, not another stage or additional authority. Within each stage, preserve the index order and skip skills already loaded. For REST-specific operations, consult `n8n-api-bridge`; only use actions supported on the target version. Stop if a required skill, tool, check, or `exit` condition is missing. A route-level `exit`, if present, defines completion for that route.
3. Before any remote mutation or test with side effects, confirm the exact instance, workflow, action and version. For existing workflows, read back the draft and published baseline and keep an approved, sanitized backup. Credentials are references on the node, beside `parameters`, not inside it. Do not copy secret values into workflows or logs. Treat keys already pasted into chat as exposed and request rotation.
4. Publication is a separate decision. R1/R2 evidence must refer to the same candidate and target, and authorization must match the action and version. The optional offline preflight in the repository checks consistency; it cannot authenticate a human or authorize a write. Use the controlled deployment path; if it cannot bind authorization to the version it will publish, stop. After publishing, read back the actual published version. Saving a draft is not publishing. Report a missing readback as unverified; any live test needs its own authorization.

Record the current stage, next step, relevant skills, evidence references and blockers. A Layer 3 note is a handoff, not an approval. Never update a live workflow just to record progress.
