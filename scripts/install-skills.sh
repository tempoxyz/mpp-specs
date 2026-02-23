#!/usr/bin/env bash
#
# Installs the repo-bundled AI agent skills into the user's global
# Amp skills directory (~/.config/agents/skills/).
#
# Skills included:
#   - reviewing-ietf-drafts      Internet-Draft review methodology
#   - payment-auth-scheme-author  Payment auth scheme authoring guidance
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

SKILLS=(
  reviewing-ietf-drafts
  payment-auth-scheme-author
)

for skill in "${SKILLS[@]}"; do
  src="$SKILLS_SRC/$skill"
  dst="$SKILLS_DST/$skill"

  if [ ! -d "$src" ]; then
    echo "Warning: $skill not found in repo, skipping" >&2
    continue
  fi

  rm -rf "$dst"
  cp -R "$src" "$dst"
  echo "Installed: $skill"
done

echo ""
echo "Done. ${#SKILLS[@]} skills installed to $SKILLS_DST"
