#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
SPECS_DIR="$ROOT_DIR/specs"
OUT_DIR="$ROOT_DIR/artifacts"

# Check for --docker flag
if [[ "${1:-}" == "--docker" ]]; then
  docker run --rm -v "$ROOT_DIR":/data ietf-spec-tools /data/scripts/gen.sh
  exit $?
fi

mkdir -p "$OUT_DIR"

while read -r md; do
  name="$(basename "${md%.md}")"

  echo "Generating $name..."

  if ! kramdown-rfc "$md" > "$OUT_DIR/${name}.xml"; then
    echo "ERROR: kramdown-rfc failed for $name" >&2
    exit 1
  fi

  xml2rfc --html --no-pagination "$OUT_DIR/${name}.xml" -o "$OUT_DIR/${name}.html"

  xml2rfc --text --no-pagination "$OUT_DIR/${name}.xml" -o "$OUT_DIR/${name}.txt"

  xml2rfc --pdf "$OUT_DIR/${name}.xml" -o "$OUT_DIR/${name}.pdf"
done < <(find "$SPECS_DIR" -name "draft-*.md")

echo "Done. Output in $OUT_DIR/"
