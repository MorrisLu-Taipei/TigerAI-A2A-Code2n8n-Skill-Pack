# Agent config JSON

`get_agent_builder_reference` returns the live `configSchema`. When it disagrees with this file, the schema wins.

## A minimal runnable Agent

Validated and run live:

```json
{
  "model": "openai/gpt-4.1-mini",
  "credential": "<openAiApi credential id>",
  "instructions": "You are ...",
  "memory": { "enabled": true, "storage": "n8n" },
  "tools": [
    {
      "type": "workflow",
      "workflow": "Record note",
      "workflowId": "<workflow id>",
      "name": "record_note",
      "description": "Record a note for a customer. Use when the user asks to log or remember something about a customer.",
      "requireApproval": true,
      "inputs": {
        "customerId": { "mode": "ai", "description": "Customer id, e.g. C-123" },
        "note": { "mode": "ai" },
        "source": { "mode": "fixed", "value": "agent" }
      }
    }
  ]
}
```

`name`, `model`, `credential`, and `instructions` are what make it runnable. `create_agent` injects `name` from its top-level argument.

## Fields

| Field | Notes |
|---|---|
| `model` | `provider/model-id`, e.g. `openai/gpt-4.1-mini`. List with `discover_agent_assets kind=models provider=...` |
| `credential` | Credential id for that provider. `modelDeploymentName` for Azure-style deployments |
| `instructions` | The system prompt. Required, non-empty |
| `description` | Max 512 chars. Shown in Agent lists |
| `memory` | See `MEMORY.md`. Omit it and the Agent is stateless |
| `tools` | Node, workflow, and custom tool references. See `TOOLS.md` |
| `skills`, `tasks` | References only; bodies are managed with `mutate_agent` |
| `subAgents` | `agents[]` (`agentId`, `useWhen`, `enabled`), `maxChildren` (1 to 20, default 10), `modelsByDifficulty`. See `SUB_AGENTS.md` |
| `mcpServers` | Up to 20 external MCP servers. See `TOOLS.md` |
| `vectorStores` | Up to 20 Pinecone, Qdrant, Supabase, or Postgres stores. See `KNOWLEDGE.md` |
| `providerTools` | Provider-native tools, keyed by provider |
| `personalisation` | `icon` and `gradient`, cosmetic |
| `config.reasoning` | `low`, `medium`, `high`, for reasoning models |
| `config.promptCaching` | `{ enabled, anthropic: { ttl: "5m" or "1h" } }` |
| `config.webSearch` | `{ enabled, provider: auto, native, brave, or searxng, credential }` |
| `config.toolCallConcurrency` | 1 to 100. Default 1: tool calls run one at a time |
| `config.maxIterations` | 1 to 200. Leave unset unless the user asks. Hitting it ends the run and the session shows as an error |
| `config.guardrails.budget` | `{ enabled, monthlyBudgetUsd, alertThresholdPercent, sessionCostCapUsd }`. An alert threshold needs a monthly budget. A session that hits its cap stops |

Channels (`integrations`) aren't part of editable config. `get_agent` shows them read-only; change them with `update_agent_integration`.

## Draft, published, and what isn't versioned

- Every edit changes the **draft**. `publish_agent` snapshots it as the **published** version, which channels, tasks, and production workflow calls run.
- Preview, `call_agent`, task "Run now", and Message an Agent in manual or chat-trigger test runs use the draft.
<!-- TEMPORARY: knowledge files and channel connections aren't versioned with the Agent; revisit if they become part of the published snapshot. -->
- **Not versioned:** knowledge files and channel connections. Adding a file or a channel to a published Agent takes effect at once, with no republish and no rollback.
