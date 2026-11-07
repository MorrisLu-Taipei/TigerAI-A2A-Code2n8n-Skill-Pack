# Sessions and debugging

<!-- TEMPORARY: the MCP has no tool to read Agent sessions. Revisit if one is added, then read traces directly instead of sending the user to the Sessions tab. -->
**You can't read Agent sessions over MCP.** No tool lists sessions or reads a trace, and `get_workflow_execution` only covers workflows. Your job is to give the user a direct link and tell them what to look for.

## What you can see, and what only the user can

| Source | You (MCP) | The user (UI) |
|---|---|---|
| Your own `call_agent` test | Reply, status, approvals, `sessionId` | The session in the Sessions list |
| Workflow tools the Agent called | `search_workflow_executions` + `get_workflow_execution`; `data.parentAgentRun` has `agentId`, `projectId`, `threadId`, `toolCallId` | Same, plus a link from the trace |
| A Message an Agent run | The node output's `session` block | "View session" from the execution log |
| Channel, task, n8n Chat, and Preview sessions | Nothing | Agent → **Sessions** tab |

## Linking straight to a session

```
https://<instance>/projects/<projectId>/agents/<agentId>/sessions/<threadId, URL-encoded>
```

Encode the thread id (`#` → `%23`, `:` can stay). Give this link whenever you have the ids: after `call_agent` (`sessionId` is the thread id), from a Message an Agent output (`session.threadId`), or from a tool execution's `parentAgentRun.threadId`. Otherwise point the user to the Agent's **Sessions** tab.

## What the user sees

- **Sessions list:** title, status (Succeeded, Error, Canceled, Interrupted, Running), origin badge (Preview, n8n Assistant, MCP, Workflow, Schedule, Sub-agent, Slack, Telegram, Discord, Linear, n8n Chat), last activity, tokens. Auto refresh, and filters for status, origin, and last activity.
- **Session trace:** a header with origin, tokens, cost, and duration; a colored timeline strip; and the event list: User, Assistant, Tool, Skill, Memory updated, Approval request and response, Waiting on workflow, Sub-agent ("Open sub-agent session"), errors. Clicking an event opens its details: input, output, model, tokens, cost. Workflow tool events link to the execution.
- **Error events:** "Tool call failed", "Tool experienced an error", "Workflow call did not produce an execution", "Execution failed", "Execution interrupted", and the session cost cap message ("This session reached its cost cap before finishing").

"Send to LangSmith" on a session sends the conversation, tool inputs and outputs, and errors to **n8n's** LangSmith workspace for n8n's debugging. Don't suggest it as a user-side tracing tool.

## Triage

| Symptom | Ask the user to check | Usual cause |
|---|---|---|
| Wrong answer, no tool called | Assistant event; Skill events | Tool or skill description doesn't match how the user asked; instructions forbid it |
| Tool called with wrong values | The Tool event's input | Vague parameter descriptions, or a value the model had to guess because tools can't read trigger data |
| Tool failed | Tool event output, then the linked execution | Credential, unpublished workflow, node error, MCP server unreachable |
| Stuck mid-run | "Approval requested" or "Waiting on workflow" with nothing after | Nobody answered the approval (a task, a channel nobody watches) |
| Approval workflow reports timed out or denied after the user approved | The linked execution's branch | Wrong mapping of the send-and-wait response sends it down the wrong branch |
| Forgot earlier turns | Origin and thread id of both sessions | No memory block; a different session (`/new`, idle timeout, a different key, channel vs workflow) |
| Stopped early | Last error event; header cost | Session cost cap, monthly budget, or `maxIterations` (shows as an error) |
| Sub-agent "didn't run" in production | Sub-agent event result | Child not published |
| Works in Preview, not in Slack | Which version each ran | Channels run the published version; the fix is only in the draft |

When a test exposes a problem, report it and ask before changing the Agent.
