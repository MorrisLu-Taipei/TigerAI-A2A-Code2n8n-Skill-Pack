# Scheduled tasks

A task runs the Agent on a cron schedule with a written objective, for work it should do on its own (morning digest, weekly cleanup, checking a queue).

```json
{ "type": "task.upsert", "enabled": true, "task": {
  "name": "Morning digest",
  "objective": "Summarize yesterday's new support tickets by theme and post the summary in Slack #support-leads. If there were none, post nothing.",
  "cronExpression": "0 9 * * 1-5",
  "timezone": "America/New_York"
} }
```

- `cronExpression`: standard five fields. `objective`: up to 10,000 chars.
- **Set `timezone` explicitly.** Omitted over MCP, it's stored as `null` and runs in the instance timezone (verified live). Tasks created in the UI default to the browser's timezone instead, so the same cron can fire at different hours depending on how it was made. On a replace, an omitted `timezone` keeps the old one; send `null` to reset to the instance timezone.
- `enabled` on the operation turns the task on or off without deleting it.

## How a task run behaves

- **Scheduled runs use the published version.** A task added to the draft does nothing until `publish_agent`. "Run now" in the UI runs the draft.
- **There's no one to reply to.** The objective must say where results go ("post in #ops", "DM @alice"), which needs a channel or a node tool that can deliver. A task that only "summarizes" produces a summary nobody sees.
- **There's no one to approve.** A tool with approval required makes the run wait for an answer that never comes. Give scheduled work only tools that are safe without approval.
- Each run is its own session with origin **Schedule** in the Sessions list, and episodic memory scoped to the task.
- Say what to do when there's nothing to do; otherwise it may post "nothing to report" every morning.
