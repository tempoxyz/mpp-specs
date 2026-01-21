#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
OUT_DIR="$ROOT_DIR/artifacts"

# Check for --docker flag
if [[ "${1:-}" == "--docker" ]]; then
  docker run --rm -v "$ROOT_DIR":/data ietf-spec-tools /data/scripts/check.sh
  exit $?
fi

"$SCRIPT_DIR/gen.sh"

echo ""
echo "Running rfclint on generated specs..."
echo ""

ERRORS=0

while read -r xml; do
  [ -e "$xml" ] || continue
  name="$(basename "$xml")"
  echo "Checking $name..."
  if ! rfclint --no-spell --no-rng "$xml"; then
    ERRORS=$((ERRORS + 1))
  fi
  echo ""
done < <(find "$OUT_DIR" -name "draft-*.xml")

if [ $ERRORS -gt 0 ]; then
  echo "rfclint found issues in $ERRORS file(s)"
  exit 1
fi

echo "All specs passed validation!"
