# Approvals

Before adding or skipping approval, ask the user: who signs off and how much they trust the model is their call. Recommend it for anything that sends, changes, deletes, or spends.

## How to turn it on

- Node, workflow, and custom tools: `"requireApproval": true`.
- MCP servers: `"approval": { "mode": "global" }` or `{ "mode": "selected", "tools": [...] }`.
- Channel actions: `discover_agent_assets kind=integrations` lists each channel's `approvableActions`, marked `sensitive` (e.g. Slack `send_dm`, `send_channel_message`).

## What the approver sees

<!-- TEMPORARY: revisit when n8n adds custom approval messages for Agent tools. -->
<!-- TEMPORARY: revisit when channel approval cards (Slack, Telegram, Discord) show the tool's parameters. -->
Approval is on or off. There's no custom message, title, or button label.

| Surface | Shows | Buttons |
|---|---|---|
| Preview and n8n Chat | "Approval required", "The agent wants to run the {tool} tool.", and the tool's arguments as raw JSON | Allow once, allow for the rest of the session, deny |
| Slack, Telegram, Discord | "The agent wants to run this tool: {tool}" and a *Tool* field. **No arguments** | Approve, Allow for this session, Deny |
| `call_agent` | `approvals[]` with `toolName`, `displayName`, `args`, and a `continuation` | Resume with `{ "type": "approval", "approved": true or false, "continuation": {...} }` |
| Sessions trace | "Approval request for {tool}" with the arguments under *Request details*, then "Approval response for {tool}" marked Approved or Declined | |

Consequences:

- **A Slack approver signs off blind.** If the values matter (amount, recipient), approval in a channel isn't enough; use a custom approval workflow tool (below) or the AI Agent node's human review tools.
- **The label is the display name.** For a workflow tool, that's the workflow's name, not the tool `name` the model sees. Name approval-gated workflows so the label reads well ("Refund customer", not "WF 12 v2").
- **Anyone who can see a channel card can click it.** Approval in a shared channel is approval by whoever clicks first.
- A denial goes back to the model as a refusal; it continues the conversation without the tool.

## Where approval can't happen

| Context | Result |
|---|---|
| Message an Agent (workflow call) | The node fails: "Agent execution suspended waiting for tool approval. Suspend/resume is not supported in workflow execution context." (verified live) |
| Scheduled task | No one is in the conversation, so the run parks waiting for an answer that never comes |

Give Agents that run from workflows or tasks only tools that are safe without approval, and gate the action in the calling workflow instead (agent returns a structured decision, workflow sends a send-and-wait approval, then acts).

## Custom approval through a workflow tool

<!-- TEMPORARY: workaround for fixed approval messages and parameter-less channel cards. Update when custom approval messages are added. -->
When the approver must see real values, or the message must be custom, build the approval into a workflow tool: send-and-wait (Gmail, Slack, and others) with the values in the message, then do the action only on approve. Verified end to end with Gmail send-and-wait.

- While the sub-workflow waits, the Agent suspends. The chat shows "Waiting on {workflow}" with **Check for the result** and **Stop waiting**; `call_agent` returns `approval_required` with `suspensions[]`. When the execution finishes, the Agent resumes with its output.
- Return an explicit result from both branches (`approved` or `denied`, plus what happened), so the Agent can report it. Check the field mapping on the approval response: a wrong mapping drops into the not-approved or timeout branch and the Agent reports that instead.
- Don't also set `requireApproval` on this tool, or the user approves twice.
- **Approve in the same Slack thread.** For an Agent on Slack, give the tool `ai` inputs for the channel and thread ts, and have the send-and-wait node post into that thread. The approval then appears in the conversation, with the values. The model supplies these ids, so tell it to take them from `get_current_message_context`, not the message text. When approvals must go to one place (a finance channel), make the channel a `fixed` input so the model can't redirect it.
- Expect it to fail under Message an Agent like any other suspension.
