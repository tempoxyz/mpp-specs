#!/usr/bin/env bash
# Build the model from clean and fail unless every proof checks and only Lean's standard
# axioms are used. CI runs this; so can you (needs elan, see README.md).
set -euo pipefail
cd "$(dirname "$0")"

# The modules to audit: the root and every file under TempoSession/. lakefile.toml builds the
# same set (globs), and Audit.lean loads exactly these, so every built module is audited.
modules="TempoSession $(for file in TempoSession/*.lean; do
  echo "TempoSession.$(basename "$file" .lean)"
done | LC_ALL=C sort | tr '\n' ' ' | sed 's/ $//')"
# Lake's globs could also pick up hidden or symlinked files that the list above skips or
# follows differently, so allow only regular, visible files and no symlinks.
if [ -n "$(find TempoSession.lean TempoSession \( -type l -o -name '.*' \) -print)" ]; then
  echo "FAIL: no symlinks or hidden files under TempoSession/"
  exit 1
fi
if [ -n "$(find TempoSession -mindepth 2 -name '*.lean')" ]; then
  echo "FAIL: keep modules directly under TempoSession/ (the module list reads only that level)"
  exit 1
fi
# Every module must be a regular file: grep exits 2 on a directory named *.lean, which the
# 'if grep' gates below would read as "no match" and pass.
if [ -n "$(find TempoSession.lean TempoSession -maxdepth 1 -name '*.lean' ! -type f -print)" ]; then
  echo "FAIL: every module under TempoSession/ must be a regular file"
  exit 1
fi
# The root module holds only imports: allow only whole lines holding one import, a -- comment,
# or both.
if grep -vE '^[[:space:]]*(import[[:space:]]+[A-Za-z0-9_.]+[[:space:]]*)?(--.*)?$' TempoSession.lean; then
  echo "FAIL: TempoSession.lean may contain only import lines and -- comments"
  exit 1
fi
# No file may change options: set_option could raise maxHeartbeats or turn off warningAsError
# (lakefile.toml). A match inside a comment or string fails too, which errs on the safe side.
if grep -n 'set_option' TempoSession.lean TempoSession/*.lean; then
  echo "FAIL: set_option is not allowed (options live in lakefile.toml)"
  exit 1
fi
# The audit reads declarations already built and doesn't re-check them in the kernel, so code
# that skips the kernel check (debug.skipKernelTC, set through Lean's API rather than
# set_option) would pass it. The model and proofs are plain Lean: no module may import Lean or
# run metaprograms. Audit.lean enforces the imports from Lean's own header data; the greps
# below are a quick first pass, and also keep out syntax extensions, commands that run code
# at build time, and initializers.
if grep -n 'skipKernelTC' TempoSession.lean TempoSession/*.lean; then
  echo "FAIL: skipKernelTC is not allowed"
  exit 1
fi
for file in TempoSession.lean TempoSession/*.lean; do
  if grep -nE '^[[:space:]]*import[[:space:]]+Lean([.[:space:]]|$)' "$file" \
    || grep -nwE 'elab|elab_rules|macro|macro_rules|syntax|declare_syntax_cat|notation|infix|infixl|infixr|prefix|postfix|binder_predicate|run_cmd|run_elab|run_meta|#eval|#exit|initialize|builtin_initialize|unsafe|implemented_by|extern' "$file" \
    || grep -nE '(@\[|attribute[[:space:]]*\[)[^]]*\b(init|builtin_init)\b' "$file"; then
    echo "FAIL: $file may not import Lean or use metaprogramming"
    exit 1
  fi
done

rm -rf .lake
lake build
# Audit.lean imports only Lean and loads the built modules at run time, so nothing in them can
# change how it parses or print in its place; its exit code is the result.
lake env lean --run Audit.lean $modules || { echo "FAIL: axiom audit"; exit 1; }
echo "OK: audited $modules"
