#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
SPECS_DIR="$ROOT_DIR/specs"
OUT_DIR="$ROOT_DIR/artifacts"

# Config file path (differs inside Docker vs local)
if [[ -d /data/specs ]]; then
  CONFIG_FILE="/data/xml2rfc.conf"
  IN_DOCKER=true
else
  CONFIG_FILE="$ROOT_DIR/xml2rfc.conf"
  IN_DOCKER=false
fi

# Check dependencies when running locally
if ! $IN_DOCKER; then
  missing=""
  if ! command -v kramdown-rfc &>/dev/null; then
    missing="${missing}  - kramdown-rfc (gem install kramdown-rfc, requires Ruby 3.x)\n"
  fi
  if ! command -v xml2rfc &>/dev/null; then
    missing="${missing}  - xml2rfc (pip install -r requirements.txt)\n"
  fi
  if [[ -n "$missing" ]]; then
    echo "ERROR: Missing dependencies for local build:" >&2
    echo -e "$missing" >&2
    echo "TIP: Use 'make build' to build with Docker instead." >&2
    exit 1
  fi
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

  echo "    [kramdown-rfc] Converting Markdown to XML..."
  if $VERBOSE; then
    if ! kramdown-rfc "$md" > "$OUT_DIR/${name}.xml"; then
      echo "ERROR: kramdown-rfc failed for $name" >&2
      exit 1
    fi
  else
    if ! kramdown-rfc "$md" > "$OUT_DIR/${name}.xml" 2>/dev/null; then
      echo "ERROR: kramdown-rfc failed for $name" >&2
      exit 1
    fi
  fi

  echo "    [xml2rfc] Generating HTML..."
  xml2rfc --html --no-pagination $XML2RFC_OPTS "$OUT_DIR/${name}.xml" -o "$OUT_DIR/${name}.html"

  echo "    [xml2rfc] Generating TXT..."
  xml2rfc --text --no-pagination $XML2RFC_OPTS "$OUT_DIR/${name}.xml" -o "$OUT_DIR/${name}.txt"

  echo "    [xml2rfc] Generating PDF..."
  xml2rfc --pdf $XML2RFC_OPTS "$OUT_DIR/${name}.xml" -o "$OUT_DIR/${name}.pdf"

done < <(find "$SPECS_DIR" -name "draft-*.md")

# Generate index.html using Python/Jinja2 templating
echo "==> Generating index.html"
python3 "$SCRIPT_DIR/gen_index.py"

echo ""
echo "Done. Output in $OUT_DIR/"
