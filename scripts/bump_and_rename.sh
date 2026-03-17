#!/bin/bash
# bump_and_rename.sh — Increment the core spec's revision number.
#
# Renames the file and updates frontmatter (docname, version) so the build
# pipeline produces an artifact ready for IETF datatracker submission.
#
# Usage: ./scripts/bump_and_rename.sh
#   Prints the new version (e.g. "01") to stdout.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
CORE_DIR="$ROOT_DIR/specs/core"

PREFIX="draft-httpauth-payment"

# Find the current spec file
CURRENT_FILE=$(find "$CORE_DIR" -name "${PREFIX}-*.md" -type f | head -1)
if [[ -z "$CURRENT_FILE" ]]; then
  echo "ERROR: Cannot find ${PREFIX}-*.md in $CORE_DIR" >&2
  exit 1
fi

# Extract current version
CURRENT_VER=$(basename "$CURRENT_FILE" .md | grep -oE '[0-9]+$')
NEW_VER=$(printf "%02d" $((10#$CURRENT_VER + 1)))

NEW_FILE="$CORE_DIR/${PREFIX}-${NEW_VER}.md"

# Rename the file
git -C "$ROOT_DIR" mv "$CURRENT_FILE" "$NEW_FILE"

# Update frontmatter version and docname
sed -i.bak "s/^docname: .*$/docname: ${PREFIX}-${NEW_VER}/" "$NEW_FILE"
sed -i.bak "s/^version: .*$/version: ${NEW_VER}/" "$NEW_FILE"
rm -f "$NEW_FILE.bak"

echo "$NEW_VER"
