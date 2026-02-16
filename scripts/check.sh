#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
OUT_DIR="$ROOT_DIR/artifacts"

# Parse flags
DOCKER=false
VERBOSE=false
for arg in "$@"; do
  case $arg in
    --docker) DOCKER=true ;;
    --verbose|-v) VERBOSE=true ;;
  esac
done

# Check for --docker flag
if $DOCKER; then
  DOCKER_ARGS=""
  $VERBOSE && DOCKER_ARGS="--verbose"
  docker run --rm -v "$ROOT_DIR":/data ietf-spec-tools /data/scripts/check.sh $DOCKER_ARGS
  exit $?
fi

# First run build
VERBOSE_FLAG=""
$VERBOSE && VERBOSE_FLAG="--verbose"
"$SCRIPT_DIR/gen.sh" $VERBOSE_FLAG

echo ""
echo "Running rfclint on generated specs..."
echo ""

ERRORS=0

for xml in "$OUT_DIR"/draft-*.xml; do
  name="$(basename "$xml")"
  echo "Checking $name..."
  if ! rfclint --no-rng --no-spell "$xml"; then
    ERRORS=$((ERRORS + 1))
  fi
  echo ""
done

if [ $ERRORS -gt 0 ]; then
  echo "rfclint found issues in $ERRORS file(s)"
  exit 1
fi

echo "All specs passed validation!"
