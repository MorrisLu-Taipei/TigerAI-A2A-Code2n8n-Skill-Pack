# Sub-agents and model routing

Every top-level Agent has the built-in `delegate_subagent` tool. A call looks like this (from a live run):

```json
{ "subAgentId": "<agent id>", "taskName": "Reply with agent name and OK",
  "goal": "...", "context": "", "expectedOutput": "...", "difficulty": "low" }
```

The child starts clean: it sees `goal`, `context`, and `expectedOutput`, not the parent's conversation. Tell the parent (in `useWhen` or instructions) to pass everything the child needs in `context`.

## Saved vs inline

| | Saved sub-agent | Inline (no `subAgentId`) |
|---|---|---|
| What runs | Another Agent in the same project, with its own instructions, tools, and model | A copy of the parent |
| Configure | `subAgents.agents[]`: `{ "agentId", "useWhen" }` | Nothing; always available |
| Model | The child's own | `subAgents.modelsByDifficulty` by the `difficulty` the parent picks, else the parent's model |
| Use for | A specialist with tools or a model the parent shouldn't carry | Parallel or long subtasks that need a clean context |

`useWhen` (max 512 chars) is how the parent decides to delegate, like a tool description. Make it specific: "Delegate any question about invoices, refunds, or billing history" beats "billing stuff".

## Rules

- **Publish saved children before the parent goes live.** Preview runs the child's draft, so tests pass. `validate_agent` and `publish_agent` don't check the child. In production the call fails with "Sub-agent ... is not published. Publish it before delegating to it in a production run.", and the parent answers without it (verified live).
- **One level deep.** A sub-agent can't delegate further.
- **Parallel limit:** `subAgents.maxChildren`, 1 to 20, default 10.
- The child's run shows in the parent's trace as a Sub-agent event with "Open sub-agent session", and in the Sessions list with origin Sub-agent.

## Model routing

<!-- TEMPORARY: model routing is manual and only covers inline delegation. Revisit if n8n adds automatic routing or routing for saved sub-agents. -->
There's no automatic routing. `modelsByDifficulty` maps `low`, `medium`, and `high` to `{ model, credential }` for **inline** delegations only, and the parent picks the difficulty per call. Missing levels fall back to the parent's model. A typical setup: a strong parent model, with `low` mapped to a cheap fast model for lookups and formatting.

```json
"subAgents": {
  "modelsByDifficulty": {
    "low": { "model": "openai/gpt-4.1-mini", "credential": "<id>" },
    "high": { "model": "<provider/strong-model>", "credential": "<id>" }
  }
}
```

List models and prices with `discover_agent_assets kind=models provider=<provider> credentialId=<id>`.
