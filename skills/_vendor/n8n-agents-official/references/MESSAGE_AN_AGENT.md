# Message an Agent

`n8n-nodes-base.messageAnAgent` (v3.1) calls a first-class Agent from a workflow and returns its answer as an item. Use it when a fixed pipeline needs the Agent's judgment, or as the core of a chat shell on a platform without a native channel. Its tool variant, `n8n-nodes-base.messageAnAgentTool`, lets an AI Agent node delegate to a first-class Agent.

The pattern: **the Agent decides, the workflow acts.** Ask for a structured decision, then let ordinary nodes do the exact, deterministic work with expressions (the part Agent tools can't do, `TOOLS.md`).

```ts
const triage = node({
    type: 'n8n-nodes-base.messageAnAgent',
    version: 3.1,
    config: {
        name: 'Triage ticket',
        parameters: {
            agentId: { __rl: true, mode: 'id', value: '<AGENT_ID>' },
            message: '={{ "New ticket from " + $json.email + ":\\n" + $json.body }}',
            useStructuredOutput: true,
            schemaType: 'manual',
            outputSchema: '{"type":"object","properties":{"action":{"type":"string","enum":["refund","reply","escalate"]},"reply":{"type":"string"}},"required":["action"]}',
            advanced: {
                session: { session: { sessionIdType: 'customKey', sessionKey: '={{ "triage-" + $json.ticketId }}' } },
            },
        },
    },
})
// then: Switch on $json.structuredOutput.action, and the refund node reads $('Webhook').item.json.orderId directly
```

## Parameters

| Parameter | Notes |
|---|---|
| `agentId` | Resource locator; `mode: 'id'` with the Agent id, or `list` |
| `message` | The user message. Anything the Agent needs from the event goes here (or via the fetch tools below) |
| `useStructuredOutput` + `schemaType` (`fromJson` with `jsonSchemaExample`, or `manual` with `outputSchema`) | The validated object lands in `structuredOutput`. Prefer `manual` with a real schema, same reasons as the AI nodes' output parser |
| `advanced.session.session.sessionIdType` | `fromInput`: `sessionId` from a directly connected Chat Trigger. `customKey`: your own `sessionKey` |
| `advanced.invokeMode` | `allItems` (default): one call for all input items. `perItem`: one call per item |
| `advanced.enableStreaming` | Default true |
| `advanced.allowOtherNodesData` | Adds a `fetch_workflow_context` tool so the Agent can read other nodes' output in this execution |

The Agent always gets `fetch_input_data`, which reads this node's input items (JMESPath `query` optional). Both fetch tools are the model's choice to call, so they're for context, not for exact values.

## Output

Verified live:

```json
{ "text": "...", "structuredOutput": null, "usage": { "promptTokens": 2626, "completionTokens": 13, "totalTokens": 2639 },
  "toolCalls": [ { "toolName": "...", "input": {}, "result": {} } ], "finishReason": "stop",
  "session": { "agentId": "...", "projectId": "...", "sessionId": "my-key", "threadId": "workflow:project-<projectId>:my-key" } }
```

`session` builds the trace link (`SESSIONS_AND_DEBUGGING.md`). The execution log in the UI also links to it.

## Behavior to design around

All verified live unless marked.

- **Draft or published:** manual executions run the Agent's draft (chat-trigger test runs too; read from n8n source, not tested live); production executions run the published version, so publish the Agent before the workflow goes live.
- **Session keys are project-wide, not per Agent.** A key belongs to the first Agent that uses it. The same Agent with the same key from any workflow continues the session; a different Agent with that key fails with "Failed to create the agent execution record". So a bare user id (Telegram id, email) can key one Agent only: prefix per Agent (`support-<telegramId>`, `billing-<telegramId>`). Max 74 characters. No key = a one-off session.
<!-- TEMPORARY: sessions can't be shared between native channel conversations (Slack, Telegram, Discord, Linear, n8n Chat) and Message an Agent calls from workflows. Revisit if n8n adds a way to key into a native session from a workflow, or vice versa. -->
- **Never the same session as a native channel**, even for the same Agent and the same platform thread (`MEMORY.md`).
- **No approvals or waits.** A tool with approval required fails the node: "Agent execution suspended waiting for tool approval. Suspend/resume is not supported in workflow execution context." A workflow tool that waits hits the same suspension (per source).
- **The Agent needs a memory block** for `sessionKey` to mean anything (`MEMORY.md`).
- Put `onError: 'continueErrorOutput'` on the node in anything user-facing, and handle the error branch (`n8n-error-handling-official`).

<!-- TEMPORARY: the inline agent source (agent config embedded in the node) is set only by the node creator's agent picker and isn't exposed in the NDV. Revisit when it's documented or settable. -->
The node also has an inline mode where the Agent's config lives in the node itself: no draft or publish, no Sessions entry, and memory only when a session key is set. It's set from the node creator, not through MCP; build a saved Agent instead.
