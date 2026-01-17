#!/bin/bash
set -e

# Build presto wheel and copy to public directory
# Usage: ./scripts/build-wheel.sh [path-to-presto-repo]

PRESTO_REPO="${1:-../../../presto}"
PUBLIC_DIR="$(dirname "$0")/../public"

mkdir -p "$PUBLIC_DIR"

# If presto repo exists locally, build from it
if [ -d "$PRESTO_REPO" ]; then
    echo "Building from local presto repo: $PRESTO_REPO"
    cd "$PRESTO_REPO"
    uv build
    cp dist/*.whl "$PUBLIC_DIR/"
    cp dist/*.tar.gz "$PUBLIC_DIR/"
else
    # Clone and build
    echo "Cloning presto repo..."
    TEMP_DIR=$(mktemp -d)
    git clone --depth 1 https://github.com/tempoxyz/presto.git "$TEMP_DIR"
    cd "$TEMP_DIR"
    uv build
    cp dist/*.whl "$PUBLIC_DIR/"
    cp dist/*.tar.gz "$PUBLIC_DIR/"
    rm -rf "$TEMP_DIR"
fi

echo "Wheel files copied to $PUBLIC_DIR:"
ls -la "$PUBLIC_DIR"
