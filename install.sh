#!/usr/bin/env bash
# TigerAI Code2n8n Skill Pack 一鍵安裝（Linux / macOS / WSL / Git Bash）
# 用法:
#   bash install.sh [--target claude|antigravity|all] [--dry-run] [--help]

set -euo pipefail

PACK_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_CHOICE="all"
DRY_RUN="0"

# ---- Skill manifest (kept in sync with plugin.json) ----
VENDOR_SKILLS=(
  n8n-expression-syntax
  n8n-workflow-patterns
  n8n-validation-expert
  n8n-node-configuration
  n8n-code-javascript
  n8n-code-python
  n8n-agents-official
  n8n-ai-nodes-official
  n8n-binary-and-data-official
  n8n-code-nodes-official
  n8n-credentials-and-security-official
  n8n-data-tables-official
  n8n-debugging-official
  n8n-error-handling-official
  n8n-expressions-official
  n8n-extending-mcp-official
  n8n-loops-official
  n8n-node-configuration-official
  n8n-subworkflows-official
  n8n-workflow-lifecycle-official
  using-n8n-skills-official
)
TIGERAI_SKILLS=(
  sticky-note-to-workflow
  n8n-api-bridge
  tigerai-enterprise-patterns
  tigerai-qa-mode
  tigerai-example-finder
  code-to-workflow
  n8n-security-governance
  n8n-review-mode
  n8n-code-to-native
)
EXPECTED_COUNT=$(( ${#VENDOR_SKILLS[@]} + ${#TIGERAI_SKILLS[@]} ))   # 29 (21 vendor + 8 TigerAI)

usage() {
  cat <<EOF
TigerAI Code2n8n Skill Pack installer

Usage:
  bash install.sh [options]

Options:
  --target <claude|antigravity|all>   Which environment(s) to install into. Default: all detected.
  --dry-run                           Print the actions but do not touch the filesystem.
  --help, -h                          Show this help.

Behaviour:
  * Default ("all") installs into every environment whose parent dir already exists:
      - Claude Code:  \$CLAUDE_HOME/skills  (defaults to \$HOME/.claude/skills)
      - Antigravity:  \$HOME/.gemini/antigravity/global_skills
  * If neither parent dir exists, falls back to Claude.
  * "--target claude" or "--target antigravity" forces a single target.
  * Re-running is safe: existing skill folders are removed and recopied.
  * Post-install verifies all $EXPECTED_COUNT skill folders landed in each target.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --target)
      shift
      TARGET_CHOICE="${1:-}"
      ;;
    --target=*)
      TARGET_CHOICE="${1#--target=}"
      ;;
    --dry-run)
      DRY_RUN="1"
      ;;
    -h|--help)
      usage; exit 0
      ;;
    *)
      echo "❌ Unknown argument: $1" >&2
      usage; exit 2
      ;;
  esac
  shift || true
done

case "$TARGET_CHOICE" in
  claude|antigravity|all) ;;
  *) echo "❌ --target must be one of: claude, antigravity, all (got: $TARGET_CHOICE)" >&2; exit 2 ;;
esac

CLAUDE_TARGET="${CLAUDE_HOME:-$HOME/.claude}/skills"
ANTIGRAVITY_TARGET="$HOME/.gemini/antigravity/global_skills"

TARGETS=()
case "$TARGET_CHOICE" in
  claude)
    TARGETS+=("$CLAUDE_TARGET")
    ;;
  antigravity)
    TARGETS+=("$ANTIGRAVITY_TARGET")
    ;;
  all)
    [ -d "$(dirname "$CLAUDE_TARGET")" ] && TARGETS+=("$CLAUDE_TARGET")
    [ -d "$(dirname "$ANTIGRAVITY_TARGET")" ] && TARGETS+=("$ANTIGRAVITY_TARGET")
    if [ ${#TARGETS[@]} -eq 0 ]; then
      TARGETS+=("$CLAUDE_TARGET")
    fi
    ;;
esac

echo "📦 TigerAI Code2n8n Skill Pack — Installer"
echo "   Source:   $PACK_DIR"
echo "   Target:   $TARGET_CHOICE"
[ "$DRY_RUN" = "1" ] && echo "   Mode:     DRY-RUN (no filesystem writes)"
for T in "${TARGETS[@]}"; do echo "   →         $T"; done
echo ""

do_cmd() {
  if [ "$DRY_RUN" = "1" ]; then
    echo "   [dry-run] $*"
  else
    eval "$@"
  fi
}

for TARGET in "${TARGETS[@]}"; do
  echo "🚀 Installing to: $TARGET"
  do_cmd "mkdir -p \"$TARGET\""

  echo "→ Vendor skills (${#VENDOR_SKILLS[@]})"
  for name in "${VENDOR_SKILLS[@]}"; do
    src="$PACK_DIR/skills/_vendor/$name"
    dst="$TARGET/$name"
    if [ ! -d "$src" ]; then echo "   ⚠ source missing: $src"; continue; fi
    do_cmd "rm -rf \"$dst\""
    do_cmd "cp -r \"$src\" \"$dst\""
    echo "   ✓ $name"
  done

  echo "→ TigerAI skills (${#TIGERAI_SKILLS[@]})"
  for name in "${TIGERAI_SKILLS[@]}"; do
    src="$PACK_DIR/skills/tigerai/$name"
    dst="$TARGET/$name"
    if [ ! -d "$src" ]; then echo "   ⚠ source missing: $src"; continue; fi
    do_cmd "rm -rf \"$dst\""
    do_cmd "cp -r \"$src\" \"$dst\""
    echo "   ✓ $name"
  done

  SHARED="$TARGET/_tigerai-pack-shared"
  do_cmd "rm -rf \"$SHARED\""
  do_cmd "mkdir -p \"$SHARED\""
  for sub in spec cookbook research 02-USAGE-MODES.md 03-FIRST-WORKFLOW.md 04-FAQ.md; do
    if [ -e "$PACK_DIR/$sub" ]; then
      do_cmd "cp -r \"$PACK_DIR/$sub\" \"$SHARED/\""
      echo "   ✓ shared/$sub"
    fi
  done

  if [ "$DRY_RUN" != "1" ]; then
    installed=0
    for name in "${VENDOR_SKILLS[@]}" "${TIGERAI_SKILLS[@]}"; do
      [ -d "$TARGET/$name" ] && installed=$((installed + 1))
    done
    if [ "$installed" -eq "$EXPECTED_COUNT" ]; then
      echo "   ✅ Verify: $installed/$EXPECTED_COUNT skills present in $TARGET"
    else
      echo "   ❌ Verify: only $installed/$EXPECTED_COUNT skills present in $TARGET"
      exit 1
    fi
  fi
  echo ""
done

echo "✅ Installation complete."
[ "$DRY_RUN" = "1" ] && echo "   (dry-run: nothing was actually written.)"

echo ""
echo "Next steps:"
echo "  1. Set n8n connection env vars:"
echo "       export N8N_API_URL=https://your-n8n.example.com"
echo "       export N8N_API_KEY=<your-api-key>"
echo "  2. Smoke test:  curl -H \"X-N8N-API-KEY: \$N8N_API_KEY\" \"\$N8N_API_URL/api/v1/workflows?limit=1\""
echo "  3. In Claude Code or Antigravity, try: 「我要建一個 webhook 收 GitHub event 通知 Slack」"
echo "  4. To remove later:  bash uninstall.sh [--target ...] [--dry-run]"
