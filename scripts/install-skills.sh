#!/usr/bin/env bash
#
# Installs the repo-bundled AI agent skills into the user's global
# Amp skills directory (~/.config/agents/skills/).
#
# Discovers and installs all skills found in .agents/skills/.
#
# Usage:
#   ./scripts/install-skills.sh
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SKILLS_SRC="$REPO_ROOT/.agents/skills"
SKILLS_DST="${XDG_CONFIG_HOME:-$HOME/.config}/agents/skills"

if [ ! -d "$SKILLS_SRC" ]; then
  echo "Error: Skills directory not found at $SKILLS_SRC" >&2
  exit 1
fi

mkdir -p "$SKILLS_DST"

count=0
for src in "$SKILLS_SRC"/*/; do
  [ -d "$src" ] || continue
  skill="$(basename "$src")"
  dst="$SKILLS_DST/$skill"

  rm -rf "$dst"
  cp -R "$src" "$dst"
  echo "Installed: $skill"
  count=$((count + 1))
done

echo ""
echo "Done. $count skill(s) installed to $SKILLS_DST"
