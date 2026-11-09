#!/usr/bin/env bash
# Build the model from clean and fail unless every proof checks and only Lean's standard
# axioms are used. CI runs this; so can you (needs elan, see README.md).
set -euo pipefail
cd "$(dirname "$0")"

# The axiom audit only sees modules that TempoSession/Audit.lean imports, so every module
# must be imported there. lakefile.toml builds every module either way (globs), so a module
# missing here would be type-checked but not audited.
for file in TempoSession/*.lean; do
  module="TempoSession.$(basename "$file" .lean)"
  [ "$module" = TempoSession.Audit ] && continue
  if ! grep -qx "import $module" TempoSession/Audit.lean; then
    echo "FAIL: $module is not imported by TempoSession/Audit.lean, so it is not audited"
    exit 1
  fi
done
if [ -n "$(find TempoSession -mindepth 2 -name '*.lean')" ]; then
  echo "FAIL: keep modules directly under TempoSession/ (the import check reads only that level)"
  exit 1
fi
# The root module imports Audit, so it is elaborated after the audit runs: anything declared
# there would be built but never audited. Allow only imports and comments.
if grep -vE '^[[:space:]]*(import[[:space:]]|--|$)' TempoSession.lean; then
  echo "FAIL: TempoSession.lean may contain only import lines and -- comments (it is not audited)"
  exit 1
fi
# No file may change options: set_option could raise maxHeartbeats or turn off warningAsError
# (lakefile.toml). A match inside a comment or string fails too, which errs on the safe side.
if grep -n 'set_option' TempoSession.lean TempoSession/*.lean; then
  echo "FAIL: set_option is not allowed (options live in lakefile.toml)"
  exit 1
fi
# Declarations below the audit command would escape it.
if [ "$(grep -v '^[[:space:]]*$' TempoSession/Audit.lean | tail -n 1)" != "#audit_tempo_session" ]; then
  echo "FAIL: #audit_tempo_session must be the last line of TempoSession/Audit.lean"
  exit 1
fi

rm -rf .lake
log=$(lake build 2>&1) || { echo "$log"; exit 1; }
echo "$log"
summary=$(grep -o 'axiom audit: [0-9]* theorems use only standard axioms' <<<"$log" || true)
[ -n "$summary" ] || { echo "FAIL: the axiom audit did not run"; exit 1; }
echo "OK: $summary"
