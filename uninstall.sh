#!/usr/bin/env bash
# TigerAI Code2n8n Skill Pack 解除安裝（Linux / macOS / WSL / Git Bash）
# 用法:
#   bash uninstall.sh [--target claude|antigravity|all] [--dry-run] [--help]

set -euo pipefail

TARGET_CHOICE="all"
DRY_RUN="0"

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
  n8n-code-to-native
)
SHARED_DIR="_tigerai-pack-shared"

usage() {
  cat <<EOF
TigerAI Code2n8n Skill Pack uninstaller

Usage:
  bash uninstall.sh [options]

Options:
  --target <claude|antigravity|all>   Which environment(s) to clean. Default: all detected.
  --dry-run                           Print the actions but do not touch the filesystem.
  --help, -h                          Show this help.

Behaviour:
  * Removes the 29 skill folders (21 vendor + 8 TigerAI) and the
    _tigerai-pack-shared/ folder the installer dropped — nothing else.
  * Skill folders not present are silently skipped.
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
  claude)      TARGETS+=("$CLAUDE_TARGET") ;;
  antigravity) TARGETS+=("$ANTIGRAVITY_TARGET") ;;
  all)
    [ -d "$CLAUDE_TARGET" ] && TARGETS+=("$CLAUDE_TARGET")
    [ -d "$ANTIGRAVITY_TARGET" ] && TARGETS+=("$ANTIGRAVITY_TARGET")
    ;;
esac

if [ ${#TARGETS[@]} -eq 0 ]; then
  echo "ℹ Nothing to do — neither $CLAUDE_TARGET nor $ANTIGRAVITY_TARGET exists."
  exit 0
fi

echo "🧹 TigerAI Code2n8n Skill Pack — Uninstaller"
echo "   Target:   $TARGET_CHOICE"
[ "$DRY_RUN" = "1" ] && echo "   Mode:     DRY-RUN (no filesystem writes)"
for T in "${TARGETS[@]}"; do echo "   →         $T"; done
echo ""

do_rm() {
  local path="$1"
  if [ -e "$path" ]; then
    if [ "$DRY_RUN" = "1" ]; then
      echo "   [dry-run] rm -rf \"$path\""
    else
      rm -rf "$path"
    fi
    echo "   ✓ removed $(basename "$path")"
  fi
}

for TARGET in "${TARGETS[@]}"; do
  echo "🧹 Cleaning: $TARGET"
  for name in "${VENDOR_SKILLS[@]}" "${TIGERAI_SKILLS[@]}"; do
    do_rm "$TARGET/$name"
  done
  do_rm "$TARGET/$SHARED_DIR"
  echo ""
done

echo "✅ Uninstall complete."
[ "$DRY_RUN" = "1" ] && echo "   (dry-run: nothing was actually removed.)"
