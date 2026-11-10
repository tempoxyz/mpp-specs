#!/usr/bin/env bash
# Build MppCore from clean and audit it on its own. CI runs this with every model's check.sh.
set -euo pipefail
cd "$(dirname "$0")"
exec bash ./check-lib.sh MppCore
