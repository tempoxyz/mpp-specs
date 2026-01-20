#!/bin/bash
set -euo pipefail

OUT_DIR="docs"
mkdir -p "$OUT_DIR"

for md in draft-*.md; do
  [[ -f "$md" ]] || continue
  name="${md%.md}"
  
  echo "Generating $name..."
  
  # Convert markdown to xml2rfc XML
  npx md2xml "$md" -o "$OUT_DIR/${name}.xml"
  
  # Generate HTML (no pagination)
  xml2rfc --html --no-pagination "$OUT_DIR/${name}.xml" -o "$OUT_DIR/${name}.html"
  
  # Generate plain text (no pagination)
  xml2rfc --text --no-pagination "$OUT_DIR/${name}.xml" -o "$OUT_DIR/${name}.txt"
done

echo "Done. Output in $OUT_DIR/"
