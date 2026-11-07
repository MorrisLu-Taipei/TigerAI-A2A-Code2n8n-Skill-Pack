# Channels

A channel makes the Agent something people talk to on a platform. If the Agent only needs to *call* a service (post a report to Slack, file a Linear issue), that's a node tool, not a channel. `discover_agent_assets kind=integrations` lists what this instance offers, each with `useIntegrationWhen`, `useNodeToolWhen`, `approvableActions`, and a settings schema.

## Native channel or shell workflow?

| Native channel | Shell workflow + Message an Agent |
|---|---|
| Nothing to build; mentions, threads, DMs, and replies handled | Full control of routing, slash commands, buttons, and formatting |
| Approvals built in (no parameters on the card; for values, a send-and-wait workflow tool in the same thread, `APPROVALS.md`) | Custom approval with send-and-wait in the shell |
| The Agent can post on its own (`<channel>_action` tools, tasks) | Exact values from the event can be mapped deterministically around the call |
| Sessions per platform thread, only reachable from that thread | Session keys reachable from any workflow in the project |
| Slack, Telegram, Discord, Linear, n8n Chat | Any platform with an n8n trigger (Teams, WhatsApp, email, webhooks) |

Default to native. Pick the shell when one of the right-hand rows is a requirement. Shell patterns: `n8n-ai-nodes-official` `references/CHAT_SURFACE_PATTERNS.md`.

## Rules for every channel

- **Channels always run the published version.** Test in Preview first.
- **Channels aren't versioned.** On an unpublished Agent a configured channel stays inactive until `publish_agent`. On a published Agent, connecting goes live immediately, so confirm with the user first.
- Manage them with `update_agent_integration` (Discord may need the UI, below) (`action: connect` or `disconnect`, `type`, `credentialId`, `settings`). `replacesCredentialId` swaps a credential in one call.
- The Agent answers new @mentions and DMs, then follows the rest of that thread without needing another mention.
- `/new` starts a fresh session. An idle timeout ("New session after inactivity", `sessionIdleTimeoutMinutes` where the settings schema has it) does it automatically.
- Each channel adds `<type>_context` and `<type>_action` tools, so instructions can say "DM the requester when done" and tasks can post proactively.

## Slack

A Slack app sends events only to the request URL in its own config. A `slackApi` credential made for a Slack Trigger or another Agent passes every check and the Agent receives nothing. Use managed setup:

1. `update_agent_integration` `connect`, `type: slack`, no `credentialId`.
   - `status: workspace_selection_required`: lists `managerCredentials` with workspaces. Ask which workspace, and confirm n8n may create a Slack app there.
   - `slack_workspace_not_connected` or `slack_manager_reconnect_required`: give the user `agentUrl` to connect or reconnect the workspace once through Add channel, then retry.
   - `slack_managed_setup_unavailable`: relay `slackApp.requestUrl` and `slackApp.manifest` so the user creates the app, then connect with that app's `slackApi` credential.
2. Call again with `managerCredentialId` and `workspaceId`. `install_approval_required` means the user approves the install at `installUrl`. Then `get_agent` to confirm.

With an explicit credential, check `slackApp.configuredForAgent` in the result; if false, relay the warning and request URL instead of reporting the channel ready.

Approval cards in a channel can be clicked by anyone who can see them.

## Telegram

Settings are required: `{ "accessMode": "private", "allowedUsers": ["@alice", "123456"] }` or `{ "accessMode": "public", "allowedUsers": [] }`. Public means any Telegram user can talk to it, and spend your budget. Default to private. Optional `sessionIdleTimeoutMinutes`.

## Discord and Linear

<!-- TEMPORARY: update_agent_integration's description names only Slack, Telegram, and Linear, though discover_agent_assets lists Discord. Revisit once Discord connect over MCP is confirmed. -->
- Discord: mentions and DMs, replies in channels, threads, and DMs, embeds with buttons. Credential type `discordBotApi`. If connecting it through `update_agent_integration` fails, the user adds it in the Agent's UI.
- Linear: issue and comment events, replies in the Linear conversation, issue and comment actions. Credential type `linearOAuth2Api`. For "file tickets in Linear" without people talking to the Agent in Linear, use a Linear node tool instead.

<!-- TEMPORARY: n8n Chat is behind the PostHog flag 125_agents_n8n_chat, and Teams and WhatsApp integrations exist in code but are hidden. Revisit when they're generally available. -->
## n8n Chat

n8n's own chat UI, where instance users pick an Agent and talk to it. Rolling out behind a flag, so it may not be on the instance. Users are n8n users, and episodic memory is per n8n user.
