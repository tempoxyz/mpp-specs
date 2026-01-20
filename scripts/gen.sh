#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
SPECS_DIR="$ROOT_DIR/specs"
OUT_DIR="$ROOT_DIR/artifacts"

# Add Python user bin to PATH for xml2rfc
export PATH="$HOME/Library/Python/3.9/bin:$PATH"

mkdir -p "$OUT_DIR"

# Find all draft-*.md files in specs subdirectories
find "$SPECS_DIR" -name "draft-*.md" | while read -r md; do
  name="$(basename "${md%.md}")"
  
  echo "Generating $name..."
  
  # Convert markdown to xml2rfc XML
  md2xml "$md" -o "$OUT_DIR/${name}.xml"
  
  # Generate HTML
  xml2rfc --html --no-pagination "$OUT_DIR/${name}.xml" -o "$OUT_DIR/${name}.html"
  
  # Generate plain text
  xml2rfc --text --no-pagination "$OUT_DIR/${name}.xml" -o "$OUT_DIR/${name}.txt"
done

echo "Done. Output in $OUT_DIR/"
