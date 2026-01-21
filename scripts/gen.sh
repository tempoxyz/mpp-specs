#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
SPECS_DIR="$ROOT_DIR/specs"
OUT_DIR="$ROOT_DIR/artifacts"

# Detect Docker environment
IN_DOCKER=false
if [[ -d /data/specs ]]; then
  IN_DOCKER=true
  CONFIG_FILE="/data/xml2rfc.conf"
else
  CONFIG_FILE="$ROOT_DIR/xml2rfc.conf"
fi

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
  docker run --rm -v "$ROOT_DIR":/data ietf-spec-tools /data/scripts/gen.sh $DOCKER_ARGS
  exit $?
fi

# xml2rfc config file (silences warnings by default)
XML2RFC_OPTS=""
if [[ -f "$CONFIG_FILE" ]] && ! $VERBOSE; then
  XML2RFC_OPTS="--config-file $CONFIG_FILE"
elif $VERBOSE; then
  XML2RFC_OPTS="--skip-config-files"
fi

mkdir -p "$OUT_DIR"

while read -r md; do
  name="$(basename "${md%.md}")"

  echo "==> $name"

  echo "    [md2xml] Converting Markdown to XML..."
  # Use md2xml directly in Docker (pre-installed), npx locally
  MD2XML_CMD="npx md2xml"
  $IN_DOCKER && MD2XML_CMD="md2xml"

  if $VERBOSE; then
    $MD2XML_CMD "$md" -o "$OUT_DIR/${name}.xml"
  else
    $MD2XML_CMD "$md" -o "$OUT_DIR/${name}.xml" 2>/dev/null
  fi

  echo "    [xml2rfc] Generating HTML..."
  xml2rfc --html --no-pagination $XML2RFC_OPTS "$OUT_DIR/${name}.xml" -o "$OUT_DIR/${name}.html"

  echo "    [xml2rfc] Generating TXT..."
  xml2rfc --text --no-pagination $XML2RFC_OPTS "$OUT_DIR/${name}.xml" -o "$OUT_DIR/${name}.txt"

  echo "    [xml2rfc] Generating PDF..."
  xml2rfc --pdf $XML2RFC_OPTS "$OUT_DIR/${name}.xml" -o "$OUT_DIR/${name}.pdf"

done < <(find "$SPECS_DIR" -name "draft-*.md")

# Generate index.html
echo "==> Generating index.html"
cat > "$OUT_DIR/index.html" << 'INDEXEOF'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>IETF Payment Auth Specs</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
    h1 { border-bottom: 2px solid #333; padding-bottom: 0.5rem; }
    table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
    th, td { text-align: left; padding: 0.5rem; border-bottom: 1px solid #ddd; }
    th { background: #f5f5f5; }
    a { color: #0066cc; }
  </style>
</head>
<body>
  <h1>IETF Payment Auth Specifications</h1>
  <table>
    <thead>
      <tr><th>Specification</th><th>HTML</th><th>TXT</th><th>XML</th><th>PDF</th></tr>
    </thead>
    <tbody>
INDEXEOF

for html in "$OUT_DIR"/draft-*.html; do
  name="$(basename "$html" .html)"
  echo "      <tr><td>$name</td><td><a href=\"${name}.html\">HTML</a></td><td><a href=\"${name}.txt\">TXT</a></td><td><a href=\"${name}.xml\">XML</a></td><td><a href=\"${name}.pdf\">PDF</a></td></tr>" >> "$OUT_DIR/index.html"
done

cat >> "$OUT_DIR/index.html" << 'INDEXEOF'
    </tbody>
  </table>
</body>
</html>
INDEXEOF

echo ""
echo "Done. Output in $OUT_DIR/"
