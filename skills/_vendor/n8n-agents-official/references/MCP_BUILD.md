# Agent MCP tools in depth

## Access

- **`availableInMCP`.** Every tool except `search_agents` refuses an Agent that isn't available in MCP: "Agent is not available in MCP. Enable MCP access from the agents list, or from the MCP settings page." Agents created through MCP get it automatically. For one built in the UI, ask the user to open the Agents list, then the Agent's menu, then **Enable MCP access**.
- **Scopes.** Reading needs `agent:read`, editing needs `agent:write`, and `call_agent` needs `agent:execute`. A missing scope returns "You do not have permission to access agents in this project."
- **Tools register only when** the MCP builder is on and the Agents module is active and enabled.

## The tools

| Tool | Notes |
|---|---|
| `get_agent_builder_reference` | The guide plus the live `configSchema`. Read once per session |
| `discover_agent_assets` | `kind`: `models` (pass `provider`, optionally `credentialId` and `query`, to list a provider's models with prices and limits), `integrations` (channels, their capabilities, and settings schemas), `workflows` (attachable as tools), `subagents` (same-project Agents), `mcpServers` (registry entries) |
| `search_agents` / `get_agent` | `get_agent` returns `config`, `configHash`, `isRunnable`, `missing`, skill bodies with `skillHashes`, `tasks`, `customTools`, and read-only `integrations`. Pass `versionId` to read a published snapshot |
| `create_agent` | `projectId`, `name`, optional initial `config` (no skills, tasks, custom tools, or integrations) |
| `mutate_agent` | One operation per call, below |
| `validate_agent` | Returns `valid`, `errors`, `missing`, and the editor `url`. A missing published workflow shows up in `missing` |
| `verify_agent_mcp_server` | Opens a real connection and returns the server's tools. `validate_agent` never does this |
| `call_agent` | Tests the draft through Preview. Results: `completed`, `suspended` with `approvals[]` (each with a `continuation`), or `approval_required` with `suspensions[]` when a workflow tool is waiting |
| `publish_agent` / `unpublish_agent` | Publish activates tasks and channels. `publish_agent` with `versionId` republishes an older version |
| `list_agent_versions` / `revert_agent` | Revert copies a published version into the draft without publishing |
| `update_agent_integration` | The only way to change channels. See `CHANNELS.md` |
| `delete_agent` | Permanent. Confirm first |

In publish, unpublish, and revert responses, `activeVersionId` is the live version (null when unpublished). `versionId` is the draft's internal pointer; don't report it as a published version.

## `mutate_agent` operations

Every call takes top-level `agentId`, `baseConfigHash` (the latest `configHash`), and one `operation`. Fields sit directly on the operation object, with no `value` wrapper.

| Operation | Fields | Notes |
|---|---|---|
| `config.replace` | `config` | Complete editable config. No `integrations` |
| `config.patch` | `patch` (RFC 6902) | Paths under `/integrations` are rejected. Use `add` with `/tools/-` to append |
| `skill.upsert` | `skill` (`name`, `description`, `instructions`, optional `references[]`), optional `skillId` + `baseSkillHash` | Omit `skillId` to create and attach. A duplicate name returns `skill_name_taken`. Doesn't change `configHash` |
| `skill.delete` | `skillId` | Detaches and removes the reference |
| `task.upsert` | `task` (`name`, `objective`, `cronExpression`, optional `timezone`), optional `taskId`, `enabled` | See `TASKS.md` |
| `task.delete` | `taskId` | |
| `customTool.upsert` | `code` | TypeScript with only `@n8n/agents` and `zod` imports. See `TOOLS.md` |
| `customTool.delete` | `toolId` | |

Example patch (verified live):

```json
{ "type": "config.patch", "patch": [
  { "op": "add", "path": "/memory", "value": { "enabled": true, "storage": "n8n" } },
  { "op": "replace", "path": "/tools/0/requireApproval", "value": true }
] }
```

## Error codes

| Code or message | Meaning | Fix |
|---|---|---|
| `stale_config` | `baseConfigHash` is old | `get_agent`, reapply against the new snapshot |
| `skill_name_taken` | Another skill on the Agent has that name | Rename, or upsert with its `skillId` |
| `slack_app_built_for_another_agent` | The bot credential belongs to another Agent's Slack app | Disconnect it, then install again |
| `agent_misconfigured` (from `call_agent`) | Draft isn't runnable | `get_agent`, read `missing` |
| `missing: tools.N.workflowId (... is not published ...)` | Workflow tool not published | `publish_workflow`, with the user's OK |

## Guards worth knowing

- Credentials must be ones the caller can access; `list_credentials` gives ids. Never put secrets in config.
- Empty instructions are rejected.
- `$fromAI` is rejected in dynamic option fields (resource locators, load-options) of node tools; set those to real values from `explore_node_resources`.
- Conversation runs aren't workflow executions. `get_workflow_execution` covers only workflows the Agent called as tools.
