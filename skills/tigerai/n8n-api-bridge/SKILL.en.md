---
name: n8n-api-bridge
description: Standard SOP for reading and writing n8n workflows via the n8n REST API — read sticky notes from a workflow, push generated JSON back, list workflows, activate/deactivate, manage executions. Use when the user references a workflow by ID/URL, asks to "deploy" or "push to n8n" or "讀 n8n", or when sticky-note-to-workflow needs to fetch source/write target. Uses raw HTTP REST API only; no MCP dependency.
---

# n8n-api-bridge — n8n REST API SOP

> 🌐 **English** | [繁體中文](SKILL.md)

> **Restricted Agent mode (Portal): writing and activation are disabled.**
> When the host places the marker `[PORTAL-RESTRICTED-AGENT-MODE v1]` in the system prompt or session context (format and rules in [`spec/agent-restricted-mode.en.md`](../../../spec/agent-restricted-mode.en.md)), every `POST`/`PUT`/`PATCH`/`DELETE`, `activate`/`deactivate` and direct SQL in this Skill is **disabled**; do not use `N8N_API_URL`/`N8N_API_KEY` or build HTTP requests yourself. Reading (listing, reading a workflow, viewing executions) goes only through read-only tools provided by the host (names per the host). The merge write-back of §4.2, the idempotent write-back of §4.3 and the example in §7 are never executed; output the workflow JSON only and let the host write it. Without the marker, this file applies as written.
> This text is only a hint; real enforcement is the host's tool allowlist and environment (no n8n key in the Agent environment, no network path to n8n).

## 1. Trigger conditions

**Explicit**:
- "read n8n workflow" / "read workflow ID"
- "deploy" / "push to n8n" / "write back to n8n"
- "activate / deactivate workflow"
- "list workflows"

**Implicit**:
- After `sticky-note-to-workflow` produces a workflow → auto-chain to write back
- Example finder picks an example → auto-deploy for testing

---

## 2. Connection setup

Expected env vars:

```bash
N8N_API_URL=https://your-n8n.example.com   # no trailing slash
N8N_API_KEY=<api-key>                       # from n8n Settings → API
```

Verify:

```bash
curl -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_API_URL/api/v1/workflows?limit=1"
```

200 + JSON = good.

---

## 3. n8n REST API endpoints

This Pack **calls n8n REST API directly**, no MCP server dependency.

| Operation | HTTP call |
|---|---|
| List workflows | `GET /api/v1/workflows` |
| Read workflow | `GET /api/v1/workflows/{id}` |
| Create | `POST /api/v1/workflows` |
| Update | `PUT /api/v1/workflows/{id}` (body must include `name`, `nodes`, `connections`, `settings`; **the public API does not support `PATCH` and returns 405**, observed on 2.37.3 / 2.44.6 / 2.46.6) |
| Activate | `POST /api/v1/workflows/{id}/activate` |
| Deactivate | `POST /api/v1/workflows/{id}/deactivate` |
| Delete | `DELETE /api/v1/workflows/{id}` |
| Executions | `GET /api/v1/executions` |
| Credentials | `GET /api/v1/credentials` |

All calls include header `X-N8N-API-KEY: $N8N_API_KEY`.

---

## 4. Standard workflows

### 4.1 "Read sticky note → produce workflow"

```text
1. GET /api/v1/workflows/{id}
2. Extract from nodes[] those with type=stickyNote and color=4
3. Concatenate parameters.content (multiple sorted by position.x)
4. Feed content into sticky-note-to-workflow
5. Receive new workflow JSON
6. PUT /api/v1/workflows/{id} (body: {name, nodes, connections, settings})
   ↑ Note: Layer 1 sticky must be preserved; only insert/replace Layer 2 + Layer 3
```

### 4.2 "Merge write-back" core rule

When writing back to n8n, **must NOT overwrite user's Layer 1**:

```javascript
// pseudo
const existing = await get(id);
const userLayer1 = existing.nodes.filter(n => n.type === 'stickyNote' && n.parameters.color === 4);
const aiLayer2 = generatedNodes.filter(n => n.type !== 'stickyNote');
const aiLayer3 = generatedNodes.filter(n => n.type === 'stickyNote' && n.parameters.color === 5);

const merged = {
  ...existing,
  nodes: [...userLayer1, ...aiLayer2, ...aiLayer3],
  connections: generatedConnections,  // replace all (excluding sticky)
};
await updateFull(id, merged);
```

### 4.3 "Idempotency" rule

Multiple AI calls on same workflow:
- If color=5 Layer 3 sticky already exists → **ask user to confirm overwrite** (spec three-layer.md §7 rule 3)
- Before write, GET the current JSON and back up locally for rollback
- After write, call `POST /api/v1/workflows/{id}/activate` to trigger n8n's built-in schema validation

---

## 5. Error handling

| Status | Meaning | AI handling |
|---|---|---|
| 401 | API key invalid | Ask user to regenerate |
| 403 | Permission denied | Ask for owner/admin role |
| 404 | Workflow not found | Ask to confirm ID |
| 400 | Invalid JSON schema, missing node settings, missing credential, deprecated node type | Report the specific field; AI fixes per error message and re-PUTs (observed: an invalid PUT returns 400, not 422) |
| 405 | Unsupported method (e.g. `PATCH`) | Use `PUT` with the full body |
| 409 | Conflict (concurrent edit, or webhook path already used by another active workflow) | Re-read + re-merge + re-write; for a webhook conflict, change `path` |
| 5xx | n8n internal | Exponential backoff retry 3× (1s/2s/4s) |
| timeout | Large workflow | Increase timeout to 60s, retry |

## 5.1 ⚠️ Never directly modify workflow via SQL (v0.9.0 R3 finding)

n8n has versioning: `workflow_entity` works with `versionId` / `activeVersionId` / `workflow_published_version` tables. Direct `UPDATE workflow_entity SET nodes=...` **is NOT picked up by activate flow**, causing weird artifacts like webhook path mismatches.

**Rules**:
- ❌ `UPDATE n8n.workflow_entity SET nodes = ...` — never
- ✅ `PUT /api/v1/workflows/{id}` with `{ name, nodes, connections, settings }` — n8n correctly bumps version
- ✅ Before write, `GET /api/v1/workflows/{id}` to get the latest version, modify, then PUT
- ✅ Activate / Deactivate via `POST /api/v1/workflows/{id}/(de)activate`

---

## 6. Security constraints

- ❌ **Never** put API key in workflow JSON or sticky notes
- ❌ **Never** commit N8N_API_URL / KEY to git
- ✅ Production write must prompt user confirm
- ✅ Bulk writes (>5 workflows) must dry-run preview

---

## 7. Example: full read-write loop

```python
# Pseudo-code (pure REST API, no MCP dependency)
import os, requests
N8N_URL = os.environ['N8N_API_URL']
HEADERS = {'X-N8N-API-KEY': os.environ['N8N_API_KEY']}

def regenerate_workflow_from_sticky(workflow_id):
    # 1. GET current workflow
    r = requests.get(f"{N8N_URL}/api/v1/workflows/{workflow_id}", headers=HEADERS)
    wf = r.json()

    # 2. Extract user Layer 1 stickies (color=4)
    user_layer1 = [n for n in wf['nodes']
                   if n['type'] == 'n8n-nodes-base.stickyNote'
                   and n['parameters'].get('color') == 4]
    if not user_layer1:
        raise Exception("No user sticky note (color=4) found")

    layer1_text = "\n\n".join(
        n['parameters']['content']
        for n in sorted(user_layer1, key=lambda x: x['position'][0])
    )

    # 3. Call sticky-note-to-workflow Skill to produce new nodes (Layer 2 + Layer 3)
    result = invoke_skill('sticky-note-to-workflow', layer1=layer1_text)
    if not result['success']:
        return result['errors']

    # 4. Merge three layers (preserve Layer 1)
    merged = merge_three_layers(wf, user_layer1, result['workflow'])

    # 5. PUT back (n8n auto-validates schema)
    requests.put(f"{N8N_URL}/api/v1/workflows/{workflow_id}",
                 headers=HEADERS, json=merged)

    return {'workflow_id': workflow_id, 'status': 'regenerated'}
```

---

## 8. Chains with other Skills

- **Called by `sticky-note-to-workflow`**: write back the produced workflow
- **Calls `n8n-validation-expert`**: validate JSON schema before write
- **Called by `tigerai-enterprise-patterns`**: enterprise scenarios require pre-write manual review
