---
name: n8n-agents-official
description: 'Use when the user wants an agent, assistant, or bot in n8n, or is building, editing, testing, publishing, or debugging a first-class n8n Agent. Covers choosing an Agent vs a workflow vs the AI Agent node, the Agent MCP tools (create_agent, mutate_agent, validate_agent, call_agent, publish_agent, update_agent_integration), Agent config JSON, tools and approvals, skills, sub-agents, model routing, knowledge files, vector stores, memory and sessions, Slack / Telegram / Discord / Linear / n8n Chat channels, scheduled tasks, the Message an Agent node, and reading Agent sessions and traces. Triggers on "build me an agent", "assistant", "chatbot", "Slack bot", "Telegram bot", "agent skills", "sub-agent", "knowledge base", "agent memory", "session", "Message an Agent", "publish the agent", or any Agent tool call.'
---

# n8n Agents

A first-class n8n Agent is a saved resource with its own instructions, model, tools, skills, sub-agents, memory, channels, scheduled tasks, versions, and spend limits. It is configured as JSON through the Agent MCP tools, never with Workflow SDK code. The AI Agent node inside a workflow is a different thing, covered by `n8n-ai-nodes-official`.

<!-- TEMPORARY: revisit when the Preview tag is removed from Agents in the UI, and when Agents are declared ready for Enterprise. -->
Agents are generally available. The UI shows a Preview tag because they change often and some features you might expect aren't there yet. They aren't ready for Enterprise yet: an Enterprise instance may have them enabled, but don't assume it. If `create_agent` isn't in your tool list, Agents aren't enabled on this instance. Say so and offer a workflow instead of guessing.

## Non-negotiables

1. **Always send a memory block when creating over MCP:** `"memory": { "enabled": true, "storage": "n8n" }`. The UI adds it on every save. `create_agent` saves exactly what you send, and without it the Agent forgets the previous turn even inside one session (verified live).
2. **Never publish without the user's explicit OK.** A built Agent is a draft. Configuring a channel on an already published Agent connects it immediately, so confirm that too.
3. **Publish what the Agent calls.** Workflow tools need a When Executed by Another Workflow trigger, the same project, and a published workflow (`validate_agent` reports it). Saved sub-agents must be published too, and nothing checks that: validation and publishing pass, then production delegation fails and the parent quietly answers on its own.
4. **Approval on anything that sends, changes, deletes, or spends**, and know what the approver will see. See `references/APPROVALS.md`.
5. **One `mutate_agent` per change, always with the latest `configHash`.** A stale hash returns `stale_config`: call `get_agent` and retry.

## Agent, workflow, or AI Agent node?

Decide before calling any build tool. The first question is the "say it out loud" test.

| You can... | Build |
|---|---|
| Say every step before the request arrives, none needs judgment | Workflow |
| Say every step, one needs judgment (label, extract, summarize, write) | Workflow with an AI step: Text Classifier, Information Extractor, chain, or AI Agent node (`n8n-ai-nodes-official`) |
| Not say the steps until you see the request, and people talk to it or it acts on its own | **First-class n8n Agent** |
| Not say the steps, but one of the limits below applies | AI Agent node in a workflow |
| Not say the steps, and a fixed pipeline also needs the same brain | First-class Agent, called from the workflow with Message an Agent. The agent decides, the workflow acts |

"Build me an agent" or "assistant" means a first-class Agent unless a limit applies. A Chat Trigger plus an AI Agent node is not a substitute for a requested Agent. If a request is really a fixed trigger plus fixed steps, explain the mismatch and ask before building a workflow instead.

### Current limits that point to the AI Agent node

<!-- TEMPORARY: revisit when n8n adds custom approval messages for Agent tools. -->
<!-- TEMPORARY: revisit when channel approval cards (Slack, Telegram, Discord) show the tool's parameters. -->
<!-- TEMPORARY: revisit when Agent tools can read run context (trigger or upstream node data) in expressions. -->
<!-- TEMPORARY: revisit if n8n lets a workflow key into a native channel session (or the reverse). -->

| Need | Why an Agent can't do it today | Use instead |
|---|---|---|
| Custom approval message, or the approver must see the parameters in Slack | Approval is on/off with a fixed message. Channel cards show the tool name only | A workflow tool that runs its own send-and-wait approval with the values (can post in the same Slack thread) |
| Trigger or node data mapped exactly into a tool parameter | Tool expressions only see the model's own arguments (verified live for node and workflow tools) | AI Agent node, or Message an Agent with structured output and downstream nodes doing the mapping |
| One conversation shared by a native channel and workflows | Channel threads and Message an Agent session keys live in separate namespaces | A shell workflow on the platform's trigger, calling the Agent with Message an Agent |
| Approval inside a Message an Agent call | Fails with "Suspend/resume is not supported in workflow execution context" | Gate the action in the calling workflow |

## MCP build sequence

1. `get_agent_builder_reference` once. Its `configSchema` is the source of truth for field names; trust it over this skill when they differ.
2. `search_projects`, then `discover_agent_assets` (`models`, `integrations`, `workflows`, `subagents`, `mcpServers`), `list_credentials`, and `search_nodes` with `usage: "agentTool"` + `get_node_types` for node tools.
3. `create_agent` with model, credential, instructions, memory block, and ordinary tools. Skills, tasks, and custom tools come after, through `mutate_agent`, because they need server-generated ids.
4. `mutate_agent`, one operation per call. `skill.upsert` doesn't change `configHash`; config patches do.
5. `validate_agent` until `valid: true` and `missing` is empty.
6. One representative `call_agent`. It runs the draft through Preview with real tools, so side effects happen: if any tool without approval sends, writes, or pays, ask the user before the test. Every returned approval goes to the human; resume each with its `continuation`.
7. Report the draft with the `url` from `validate_agent`, plus the session link (see `references/SESSIONS_AND_DEBUGGING.md`), and ask whether to publish.
8. `publish_agent` only on an explicit yes. Channels: `update_agent_integration` (`references/CHANNELS.md`).

Details on every operation, error code, and version tool: `references/MCP_BUILD.md`.

## Where depth lives

| File | Read when |
|---|---|
| `references/MCP_BUILD.md` | Any `mutate_agent` operation, error codes, versions, revert, delete, `availableInMCP` |
| `references/CONFIG.md` | Writing or reviewing Agent JSON: every field, limits, defaults, what is versioned |
| `references/TOOLS.md` | Node, workflow, custom, MCP server, and built-in tools, input modes, what expressions can see |
| `references/APPROVALS.md` | Adding approval, what each surface shows, where approval can't happen, custom approval through a workflow tool |
| `references/SKILLS.md` | Adding Agent skills: how loading works, writing descriptions, references |
| `references/SUB_AGENTS.md` | Delegation, saved vs inline sub-agents, model routing by difficulty |
| `references/KNOWLEDGE.md` | Uploaded knowledge files vs external vector stores |
| `references/MEMORY.md` | Memory kinds, session scopes, session keys |
| `references/CHANNELS.md` | Slack, Telegram, Discord, Linear, n8n Chat, or "native channel or shell workflow?" |
| `references/TASKS.md` | Scheduled tasks |
| `references/MESSAGE_AN_AGENT.md` | Calling an Agent from a workflow |
| `references/SESSIONS_AND_DEBUGGING.md` | Anything went wrong, or the user asks where to see what the Agent did |

For a chat bot built as a workflow shell (platforms without a native channel, slash commands, custom routing), the shell patterns live in `n8n-ai-nodes-official` `references/CHAT_SURFACE_PATTERNS.md`, section "Core as Message an Agent". Its one rule that can't wait: on surfaces that deliver the bot's own messages (Slack, Discord), a shell that posts replies must filter out the bot's user ID right after the trigger, or it triggers itself forever.

## Writing instructions

Instructions are the system prompt. Same split as the node: persona, rules, output format, and inter-tool flow go in instructions; how to call a specific tool goes in that tool's description. Long procedures the Agent needs only sometimes belong in a skill, which costs tokens only when loaded. Say where to deliver results ("post the summary in #ops"), because a scheduled run has no one to reply to.

## Anti-patterns

| Anti-pattern | What goes wrong | Fix |
|---|---|---|
| `create_agent` without `memory` | Agent forgets the previous turn even in one session | Send `{ "enabled": true, "storage": "n8n" }` |
| Chat Trigger + AI Agent node when the user asked for an agent | Loses channels, sessions, approvals, versions, tasks, and budgets | First-class Agent, unless a limit applies |
| Publishing because validation passed | The user didn't approve a live Agent, and channels go live with it | Report the draft and ask |
| Saved sub-agent left unpublished | Production delegation fails silently; the parent answers without it | Publish children before the parent goes live |
| Expression in a tool input that reads `$('Webhook')` or `$json.<trigger field>` | Only the model's arguments are visible, so the value is empty or wrong | Pass it through the message, or keep the mapping in a workflow |
| Approval on a tool the Agent calls under Message an Agent or a task | Run fails, or parks with no one to answer | Gate in the calling workflow; give tasks only safe tools |
| Same Message an Agent session key for two Agents in a project (e.g. both keyed on a bare Telegram id) | Keys are project-wide, not per Agent: the second Agent fails with "Failed to create the agent execution record" | Prefix keys per Agent: `support-<telegramId>` |
| Skill body says "read references/x.md" vaguely | The model often skips it | "Load `references/x.md` with `load_skill` (filePath) before answering" |
| Integrations set through `config.patch` | Rejected | `update_agent_integration` |
| Slack connected with a credential built for a Slack Trigger | Passes every check, receives nothing | Managed setup, or an app whose request URL points at this Agent |
