# Memory and sessions

## Turn it on

`"memory": { "enabled": true, "storage": "n8n" }`. The UI writes this on every save; `create_agent` doesn't. Without it, verified live: told "my favorite color is teal", then asked in the same session, the Agent said it had never been told.

That block gives three things:

| Kind | Scope | What it does | Config |
|---|---|---|---|
| Conversation history | One session (thread) | The turns so far | On with the block |
| Observational memory | One session | Compresses long sessions into running observations so they fit the context | On unless `observationalMemory.enabled: false`. Optional `observerModel`, `reflectorModel`, token thresholds |
| Episodic memory | Across sessions, per memory owner (below) | The Agent flags facts worth keeping and recalls them in later sessions | Off unless `episodicMemory: { "enabled": true, "credential": "managed" }` or an embedding credential id. `topK`, `maxEntriesPerRun` |

Sessions also get an auto-generated title (the names in the Sessions list).

## Who shares what

| Caller | Session (thread id) | Memory owner (episodic scope) |
|---|---|---|
| Preview, `call_agent` | Per test conversation | The builder user (draft chat) |
| n8n Chat | Per conversation | The n8n user |
| Slack, Telegram, Discord, Linear | `<agentId>:<platform thread>`, e.g. `<agentId>:chat:8902230296-telegram:8955744864#1` | The platform user |
| Scheduled task | Per run | The task |
| Message an Agent | `workflow:project-<projectId>:<sessionKey>` | The session itself |

Consequences:

- **Message an Agent keys are project-wide, not per Agent.** The session id has no Agent in it, so a key belongs to whichever Agent used it first. Any workflow that calls that same Agent with the key continues the session (verified live across two workflows). Calling a different Agent with that key fails with "Failed to create the agent execution record" (verified live). So a bare Telegram user id works as the key for one Agent only; prefix it per Agent (`support-<telegramId>`, `billing-<telegramId>`). Max 74 characters.
<!-- TEMPORARY: sessions can't be shared between native channel conversations (Slack, Telegram, Discord, Linear, n8n Chat) and Message an Agent calls from workflows. Revisit if n8n adds a way to key into a native session from a workflow, or vice versa. -->
- **Channel sessions and workflow sessions never meet.** A Slack thread with the Agent and a Message an Agent call keyed on that thread's `ts` are two separate conversations with separate memory, even for the same Agent. When one conversation must span a chat platform and workflows, skip the native channel: build a shell workflow on the platform's trigger and call the Agent with Message an Agent (`n8n-ai-nodes-official` `references/CHAT_SURFACE_PATTERNS.md`).
- **Episodic memory on channels is per platform user**, so one person's facts follow them across threads but not to other people.
- On channels, `/new` starts a fresh session, and an optional idle timeout starts one automatically (`CHANNELS.md`). Each reset bumps a generation suffix on the thread id (`#1`, `#2`); the first session has none.
- With no session key, each Message an Agent call is a one-off session.

## What memory isn't

- Not a database. For records the Agent or other workflows must query (orders, preferences, tickets), give it a Data Table node tool.
- Not shared between Agents. A sub-agent starts clean; pass what it needs in the delegation `context`.
