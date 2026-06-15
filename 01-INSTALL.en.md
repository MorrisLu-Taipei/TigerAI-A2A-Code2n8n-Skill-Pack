# 01 — Installation

> 🌐 **English** | [繁體中文](01-INSTALL.md)

## Prerequisites

- [Claude Code](https://claude.com/claude-code) or [Antigravity](https://github.com/google-deepmind/antigravity) (environments that can load Skills)
- A deployed n8n instance (version ≥ 1.0) accessible via REST API
- **No MCP server required.** This Pack speaks to n8n via the public REST API only (`plugin.json` declares `"no MCP dependency"`). If you happen to already run `n8n-mcp`, the Pack does not use it.

## One-command install (recommended)

### Linux / macOS / WSL

```bash
bash install.sh
```

### Windows PowerShell

```powershell
.\install.ps1
```

The script will write to **every detected target** under your home directory — currently:
- Claude Code: `~/.claude/skills/`
- Antigravity: `~/.gemini/antigravity/global_skills/`

(If neither directory exists, it defaults to Claude.) There is no `--dry-run` or per-target flag yet — that's on the v0.25 roadmap. Re-running is safe: existing skill folders are overwritten in place.

## Antigravity Exclusive Install (Fastest)

If you are using **Antigravity (AG)**, you can type the command directly in the chat and let the AI handle everything:

```text
/install-n8n-pack
```

Or just tell the AI:
> "Install this n8n Skill Pack for me."

What the script actually does:
1. Copies `skills/_vendor/*` (6 vendor skills) and `skills/tigerai/*` (8 TigerAI skills) into your config directory.
2. Mirrors `cookbook/`, `spec/`, `research/`, and supporting docs (02 / 03 / 04) into a `_tigerai-pack-shared/` folder inside the same config directory so the AI can consult them.

What the script **does not** do (despite older copy that said otherwise):
- It does **not** start Claude / Antigravity for you and verify that skill triggers loaded — that check is on you (see "Verify" below).
- It does **not** set environment variables — see "Environment Variables Setup" below.

## Manual install

```bash
cp -r skills/_vendor/* ~/.claude/skills/
cp -r skills/tigerai/* ~/.claude/skills/
ls ~/.claude/skills/   # expect 14 entries (6 vendor + 8 tigerai)
```

## Environment Variables Setup

Create a `.env` file in the pack's root and fill in:

```bash
N8N_API_URL="http://localhost:5678"
N8N_API_KEY="your-n8n-api-key"
```

> [!TIP]
> If you are running n8n in Docker, ensure `N8N_API_URL` is reachable from the host where Claude Code / Antigravity runs.

## n8n Configuration

To allow the AI to call the n8n API for reading and writing workflows:

1. Create an API Key in n8n: **Settings → API → Create**.
2. (Optional) Export the variables in your shell so child processes pick them up:
   ```bash
   export N8N_API_URL="https://your-n8n.example.com"
   export N8N_API_KEY="<api-key>"
   ```
3. Smoke-test the connection:
   ```bash
   curl -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_API_URL/api/v1/workflows?limit=1"
   ```
   Expect a JSON response with `data: [...]`. Anything else (401, 404, ECONNREFUSED) means env vars / network / key need fixing before continuing.

## Verify

In a Claude Code or Antigravity conversation, type:

> I want to build a workflow that takes a GitHub event webhook and notifies Slack.

If installed correctly, the assistant will:
- Reference `cookbook/01-webhook-to-slack.en.md`
- Produce a three-layer workflow JSON via `sticky-note-to-workflow` skill
- PUT the JSON into your n8n via `n8n-api-bridge` skill (requires the env vars above)

If the skills do not trigger: re-run the installer, restart your Claude Code / Antigravity session, and confirm the 14 skill folders appear under `~/.claude/skills/` (or the Antigravity equivalent).

## Uninstall

There is **no official `uninstall.sh` yet** (planned for v0.25). The manual cleanup below removes everything the installer wrote:

```bash
# Vendor skills (6)
rm -rf ~/.claude/skills/n8n-expression-syntax
rm -rf ~/.claude/skills/n8n-workflow-patterns
rm -rf ~/.claude/skills/n8n-validation-expert
rm -rf ~/.claude/skills/n8n-node-configuration
rm -rf ~/.claude/skills/n8n-code-javascript
rm -rf ~/.claude/skills/n8n-code-python

# TigerAI skills (8)
rm -rf ~/.claude/skills/sticky-note-to-workflow
rm -rf ~/.claude/skills/n8n-api-bridge
rm -rf ~/.claude/skills/tigerai-enterprise-patterns
rm -rf ~/.claude/skills/tigerai-qa-mode
rm -rf ~/.claude/skills/tigerai-example-finder
rm -rf ~/.claude/skills/code-to-workflow
rm -rf ~/.claude/skills/n8n-security-governance
rm -rf ~/.claude/skills/n8n-code-to-native

# Shared reference materials the installer dropped
rm -rf ~/.claude/skills/_tigerai-pack-shared

# Antigravity equivalents (delete only if you installed there too)
rm -rf ~/.gemini/antigravity/global_skills/n8n-*
rm -rf ~/.gemini/antigravity/global_skills/sticky-note-* \
       ~/.gemini/antigravity/global_skills/tigerai-* \
       ~/.gemini/antigravity/global_skills/code-to-workflow \
       ~/.gemini/antigravity/global_skills/n8n-security-governance \
       ~/.gemini/antigravity/global_skills/n8n-code-to-native \
       ~/.gemini/antigravity/global_skills/_tigerai-pack-shared
```

Wildcards alone (`n8n-*` / `tigerai-*` / `sticky-note-*`) miss `code-to-workflow` and `_tigerai-pack-shared`, so the script above is intentionally explicit.

## Next: [02-USAGE-MODES.en.md](02-USAGE-MODES.en.md)
