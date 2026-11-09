#!/usr/bin/env bash
# Build the model from clean and fail unless every proof checks and only Lean's standard
# axioms are used. CI runs this; so can you (needs elan, see README.md).
set -euo pipefail
cd "$(dirname "$0")"

# The axiom audit only sees modules that TempoSession/Audit.lean imports. lakefile.toml
# builds every module either way (globs), so a module missing there would be type-checked
# but not audited. The audit prints the modules it saw, from Lean's own environment, and
# the end of this script compares that list with the files below.
expected=$(for file in TempoSession/*.lean; do
  module="TempoSession.$(basename "$file" .lean)"
  [ "$module" = TempoSession.Audit ] || echo "$module"
done | LC_ALL=C sort | tr '\n' ' ' | sed 's/ $//')
# Lake's globs could also pick up hidden or symlinked files that the list above skips or
# follows differently, so allow only regular, visible files and no symlinks.
if [ -n "$(find TempoSession.lean TempoSession \( -type l -o -name '.*' \) -print)" ]; then
  echo "FAIL: no symlinks or hidden files under TempoSession/"
  exit 1
fi
if [ -n "$(find TempoSession -mindepth 2 -name '*.lean')" ]; then
  echo "FAIL: keep modules directly under TempoSession/ (the import check reads only that level)"
  exit 1
fi
# The root module imports Audit, so it is elaborated after the audit runs: anything declared
# there would be built but never audited. Allow only whole lines holding one import, a
# -- comment, or both: Lean's header ends at the first token that isn't an import, so text
# after an import on the same line would be an ordinary, unaudited command.
if grep -vE '^[[:space:]]*(import[[:space:]]+[A-Za-z0-9_.]+[[:space:]]*)?(--.*)?$' TempoSession.lean; then
  echo "FAIL: TempoSession.lean may contain only import lines and -- comments (it is not audited)"
  exit 1
fi
# No file may change options: set_option could raise maxHeartbeats or turn off warningAsError
# (lakefile.toml). A match inside a comment or string fails too, which errs on the safe side.
if grep -n 'set_option' TempoSession.lean TempoSession/*.lean; then
  echo "FAIL: set_option is not allowed (options live in lakefile.toml)"
  exit 1
fi
# The audit reads declarations already in the environment and doesn't re-check them in the
# kernel, so code that skips the kernel check (debug.skipKernelTC, set through Lean's API
# rather than set_option) would pass it. Only Audit.lean may import Lean or run
# metaprograms; the model and proofs are plain Lean. The audit enforces the imports from
# Lean's own header data; the greps below are a quick first pass.
if grep -n 'skipKernelTC' TempoSession.lean TempoSession/*.lean; then
  echo "FAIL: skipKernelTC is not allowed"
  exit 1
fi
for file in TempoSession/*.lean; do
  [ "$file" = TempoSession/Audit.lean ] && continue
  if grep -nE '^[[:space:]]*import[[:space:]]+Lean([.[:space:]]|$)' "$file" \
    || grep -nwE 'elab|elab_rules|macro|macro_rules|syntax|notation|infix|infixl|infixr|prefix|postfix|run_cmd|run_elab|run_meta|#eval|initialize|builtin_initialize|unsafe|implemented_by|extern' "$file" \
    || grep -nE '(@\[|attribute[[:space:]]*\[)[^]]*\b(init|builtin_init)\b' "$file"; then
    echo "FAIL: $file may not import Lean or use metaprogramming (only Audit.lean may)"
    exit 1
  fi
done
# Declarations below the audit command would escape it.
if [ "$(grep -v '^[[:space:]]*$' TempoSession/Audit.lean | tail -n 1)" != "#audit_tempo_session" ]; then
  echo "FAIL: #audit_tempo_session must be the last line of TempoSession/Audit.lean"
  exit 1
fi

rm -rf .lake
log=$(lake build 2>&1) || { echo "$log"; exit 1; }
echo "$log"
# Read the audit's lines only from Audit.lean's own messages: any module can print text
# (#print "..."), and a forged line from elsewhere must not stand in for the audit's.
audit_log=$(grep -E '^info: TempoSession/Audit\.lean:[0-9]+:[0-9]+: ' <<<"$log" | sed -E 's/^info: [^ ]+ //' || true)
summary=$(grep -oE '^axiom audit: [0-9]+ theorems use only standard axioms$' <<<"$audit_log" || true)
[ "$(grep -c . <<<"$summary")" -le 1 ] || { echo "FAIL: the axiom audit reported more than once"; exit 1; }
[ -n "$summary" ] || { echo "FAIL: the axiom audit did not run"; exit 1; }
# Lean prints the list on the info line, unquoted and space-separated.
audited=$(grep -o '^audited modules: .*' <<<"$audit_log" | head -n 1 | sed 's/^audited modules: //' \
  | tr ' ' '\n' | LC_ALL=C sort | tr '\n' ' ' | sed 's/ $//')
if [ "$audited" != "$expected" ]; then
  echo "FAIL: the audit saw modules [$audited], but TempoSession/ holds [$expected]"
  exit 1
fi
echo "OK: $summary"
