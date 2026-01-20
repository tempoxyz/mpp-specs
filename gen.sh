#!/bin/bash
set -euo pipefail

# Check dependencies
if ! command -v npx &> /dev/null; then
  echo "❌ npx not found. Install Node.js from https://nodejs.org/"
  exit 1
fi

if ! command -v xml2rfc &> /dev/null; then
  echo "❌ xml2rfc not found. Install with: pip3 install xml2rfc"
  exit 1
fi

# Validate markdown specs before conversion
errors=0
for md in draft-*.md; do
  [[ -f "$md" ]] || continue
  
  # Check for required frontmatter fields
  if ! grep -q "^title:" "$md"; then
    echo "❌ $md: missing 'title:' in frontmatter"
    errors=1
  fi
  if ! grep -qi "^docname:" "$md"; then
    echo "❌ $md: missing 'docName:' in frontmatter"
    errors=1
  fi
done

if [[ $errors -eq 1 ]]; then
  echo "❌ Validation failed. Fix the above errors before generating."
  exit 1
fi

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
