# Agent tools

Tool names and descriptions are part of the prompt, same as for the AI Agent node: verb-first names (`record_note`, not `tool1`) and descriptions that say what it does, when to use it, and what each input means. Pick the lightest type that covers the job.

| Type | Use for |
|---|---|
| Node tool | One operation of an existing n8n node (send a Slack message, query a Data Table, HTTP request) |
| Workflow tool | Anything multi-step, branching, or reused. The most capable option |
| MCP server | A whole external tool catalog (GitHub, Linear, an internal MCP) |
| Custom tool | Small pure logic (formatting, math) with no credentials or I/O |
| Channel | The Agent is *talked to* on that platform. Not a tool; see `CHANNELS.md` |

## Node tools

```json
{
  "type": "node",
  "name": "echo_http",
  "description": "Echo a search term through an HTTP test endpoint. Use when asked to echo.",
  "node": {
    "nodeType": "n8n-nodes-base.httpRequestTool",
    "nodeTypeVersion": 4.5,
    "nodeParameters": {
      "method": "GET",
      "url": "https://httpbin.org/get",
      "sendQuery": true,
      "queryParameters": { "parameters": [
        { "name": "q", "value": "={{ $fromAI('q', 'The search term to echo', 'string') }}" }
      ] }
    },
    "credentials": {}
  }
}
```

- Discover nodes with `search_nodes` `usage: "agentTool"`, then `get_node_types`. Credentials are `{ "<credentialType>": { "id", "name" } }`.
- Model-filled values use `$fromAI('key', 'description', 'type')`. Everything else is fixed.
- Resource locators and dropdowns (channel, sheet, table) take real values from `explore_node_resources`; `$fromAI` there is rejected.
- Write the `description` in JSON. A tool without one gets the generic "Execute node ..." text and is picked badly.

## Workflow tools

```json
{
  "type": "workflow", "workflow": "Record note", "workflowId": "<id>",
  "name": "record_note", "description": "...", "requireApproval": false,
  "inputs": {
    "customerId": { "mode": "ai", "description": "Customer id, e.g. C-123" },
    "source": { "mode": "fixed", "value": "agent" },
    "receivedVia": { "mode": "expression", "value": "={{ $now.toISO() }}" }
  }
}
```

- The workflow must start with **When Executed by Another Workflow** (`n8n-nodes-base.executeWorkflowTrigger`) using Define Below inputs, live in the **same project**, and be **published**. `validate_agent` lists an unpublished one under `missing`.
- `inputs` keys are the trigger's input names. Missing keys default to `ai`. `fixed` and `expression` inputs are hidden from the model.
- `allOutputs: true` returns every node's output instead of the last node's.
- The sub-execution is a normal workflow execution (readable with `get_workflow_execution`). Its `parentAgentRun` carries `agentId`, `projectId`, and `threadId`, which build the session link.
- A workflow tool that waits (Wait node, send-and-wait) suspends the Agent until the execution finishes, then returns its output. This is how custom approval works; see `APPROVALS.md`.

### What expressions can see

<!-- TEMPORARY: revisit when Agent tools can read run context (trigger or upstream node data) in expressions. -->
In both node tools and workflow-tool `expression` inputs, `$json` is the model's arguments for that call and nothing else (verified live: `{{ JSON.stringify($json) }}` returned only `{"q":"walrus"}`). There's no trigger, no `$('Node')`, and no data from a calling workflow. Static expressions (`$now`, `$execution.mode`) work. To get exact values from an event into a tool, keep that mapping in a workflow (`MESSAGE_AN_AGENT.md`) or use the AI Agent node.

## MCP servers

```json
{
  "name": "github", "url": "https://api.githubcopilot.com/mcp/",
  "transport": "streamableHttp", "authentication": "githubOAuth2Api",
  "credential": "<id>", "metadata": { "nodeTypeName": "@n8n/mcp-registry.gitHub" },
  "toolFilter": { "mode": "allow", "tools": ["search_issues", "get_issue"] },
  "approval": { "mode": "selected", "tools": ["create_issue"] }
}
```

- Find registry servers with `discover_agent_assets kind=mcpServers`; copy `metadata` from the result, don't invent it.
- Call `verify_agent_mcp_server` with the same fields before saving, and build `toolFilter` from the tools it returns. `validate_agent` never connects, so an unverified server can pass validation and fail at runtime (the run continues without its tools and warns).
- Credentials can't be created through MCP. If none exists, ask the user to create one.
<!-- TEMPORARY: newer n8n replaces mcpServers[].approval with toolPermissions (read/write categories). Update this block when the live configSchema changes. -->
- `approval`: `{ "mode": "global" }` for every tool, or `selected` with a list. Absent means no approval.

## Custom tools

```ts
import { Tool } from '@n8n/agents';
import { z } from 'zod';

export default new Tool('get_current_datetime')
    .description('Return the current date and time as an ISO 8601 string')
    .input(z.object({}))
    .handler(async () => new Date().toISOString());
```

Created with `mutate_agent` `customTool.upsert` (`code`), which also attaches it as `{ "type": "custom", "id": "get_current_datetime" }` (the id is the `Tool` name). Only `@n8n/agents` and `zod` import. Runs in a sandbox: no credentials, so anything that calls an authenticated API belongs in a node or workflow tool.

## Built-in tools

The runtime adds these; don't recreate them.

| Tool | What it does |
|---|---|
| `get_environment` | Current date, time, instance timezone, weekday |
| `load_skill` | Loads a skill body or one of its reference files (`SKILLS.md`) |
| `delegate_subagent` | Delegates to a saved or inline sub-agent (`SUB_AGENTS.md`) |
| `write_todos` | The Agent's own task list for long runs |
| `mark_session_failed` | The Agent gives up with a reason; the session shows as an error |
| `find_file`, `search_text`, `read_file` | Knowledge files, when uploaded (`KNOWLEDGE.md`) |
| `search_<name>` | One per vector store (`KNOWLEDGE.md`) |
| `<channel>_context`, `<channel>_action` | Per connected channel, e.g. `slack_action` to DM or post |
