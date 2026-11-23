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

The script writes to **every detected target** under your home directory — currently:
- Claude Code: `~/.claude/skills/`
- Antigravity: `~/.gemini/antigravity/global_skills/`

(If neither parent directory exists, it defaults to Claude.) Re-running is safe: existing skill folders are removed and recopied. Post-install verifies that **33/33** skill folders landed in each target and exits non-zero if any are missing.

### Flags

| Flag | Effect |
| --- | --- |
| `--target claude` | Install into Claude only |
| `--target antigravity` | Install into Antigravity only |
| `--target all` | Default — install into all detected targets |
| `--dry-run` | Print every filesystem action without performing it |
| `--help` | Show usage |

PowerShell uses `-Target` / `-DryRun` / `-Help` (PowerShell-style switches).

## Antigravity Exclusive Install (Fastest)

If you are using **Antigravity (AG)**, you can type the command directly in the chat and let the AI handle everything:

```text
/install-n8n-pack
```

Or just tell the AI:
> "Install this n8n Skill Pack for me."

What the script actually does:
1. Copies `skills/_vendor/*` (21 vendor skills) and `skills/tigerai/*` (12 TigerAI skills) into your config directory.
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

If the skills do not trigger: re-run the installer, restart your Claude Code / Antigravity session, and confirm the 33 skill folders appear under `~/.claude/skills/` (or the Antigravity equivalent).

## Uninstall

`uninstall.sh` / `uninstall.ps1` mirror the installer — same `--target` / `--dry-run` / `--help` flags. Both remove the **33 skill folders + `_tigerai-pack-shared/`** the installer wrote, and silently skip anything not present.

```bash
# Linux / macOS / WSL
bash uninstall.sh                        # remove from all detected targets
bash uninstall.sh --target claude        # remove from Claude only
bash uninstall.sh --dry-run              # preview, do not touch the filesystem
```

```powershell
# Windows PowerShell
.\uninstall.ps1                          # remove from all detected targets
.\uninstall.ps1 -Target antigravity      # remove from Antigravity only
.\uninstall.ps1 -DryRun                  # preview, do not touch the filesystem
```

If you prefer to do it by hand, the uninstaller maintains an explicit list of the 33 skill folders + `_tigerai-pack-shared` — read its source for the exact paths.

## Next: [02-USAGE-MODES.en.md](02-USAGE-MODES.en.md)
