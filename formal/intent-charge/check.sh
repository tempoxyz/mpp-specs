#!/usr/bin/env bash
# Build the model from clean and fail unless every proof checks and only Lean's standard axioms
# are used. CI runs this; so can you (needs elan, see README.md). The gates live in
# ../core/check-lib.sh, shared by every model.
set -euo pipefail
cd "$(dirname "$0")"
exec bash ../core/check-lib.sh IntentCharge
