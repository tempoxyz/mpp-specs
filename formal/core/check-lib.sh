#!/usr/bin/env bash
# Shared gate for every Lean project under formal/: build it from clean and fail unless every
# proof checks and only Lean's standard axioms are used. Each project's check.sh runs
#   bash ../core/check-lib.sh <Library>
# from its own directory; core/check.sh runs it for MppCore. A model is audited together with
# MppCore, which it requires (lakefile.toml).
set -euo pipefail
lib="$1"
core="$(cd "$(dirname "$0")" && pwd)"

# The libraries to gate: the project's own and, for a model, MppCore.
dirs=(".")
libs=("$lib")
if [ "$lib" != MppCore ]; then
  dirs+=("$core")
  libs+=(MppCore)
fi

modules=""
for i in "${!libs[@]}"; do
  dir="${dirs[$i]}"
  name="${libs[$i]}"
  sources=("$dir/$name.lean" "$dir/$name/"*.lean)
  # The modules to audit: the root and every file under <Library>/. lakefile.toml builds the
  # same set (globs), and Audit.lean loads exactly these, so every built module is audited.
  modules="$modules $name $(for file in "$dir/$name/"*.lean; do
    echo "$name.$(basename "$file" .lean)"
  done | LC_ALL=C sort | tr '\n' ' ' | sed 's/ $//')"
  # Lake's globs could also pick up hidden or symlinked files that the list above skips or
  # follows differently, so allow only regular, visible files and no symlinks.
  if [ -n "$(find "$dir/$name.lean" "$dir/$name" \( -type l -o -name '.*' \) -print)" ]; then
    echo "FAIL: no symlinks or hidden files under $name/"
    exit 1
  fi
  if [ -n "$(find "$dir/$name" -mindepth 2 -name '*.lean')" ]; then
    echo "FAIL: keep modules directly under $name/ (the module list reads only that level)"
    exit 1
  fi
  # Every module must be a regular file: grep exits 2 on a directory named *.lean, which the
  # 'if grep' gates below would read as "no match" and pass.
  if [ -n "$(find "$dir/$name.lean" "$dir/$name" -maxdepth 1 -name '*.lean' ! -type f -print)" ]; then
    echo "FAIL: every module under $name/ must be a regular file"
    exit 1
  fi
  # The root module holds only imports: allow only whole lines holding one import, a -- comment,
  # or both.
  if grep -vE '^[[:space:]]*(import[[:space:]]+[A-Za-z0-9_.]+[[:space:]]*)?(--.*)?$' "$dir/$name.lean"; then
    echo "FAIL: $name.lean may contain only import lines and -- comments"
    exit 1
  fi
  # No file may change options: set_option could raise maxHeartbeats or turn off warningAsError
  # (lakefile.toml). A match inside a comment or string fails too, which errs on the safe side.
  if grep -n 'set_option' "${sources[@]}"; then
    echo "FAIL: set_option is not allowed (options live in lakefile.toml)"
    exit 1
  fi
  # The model and proofs are plain Lean: no module may import Lean or run metaprograms.
  # Audit.lean enforces the imports from Lean's own header data and replays every declaration
  # in the kernel; the greps below are a quick first pass, and also keep out syntax extensions,
  # commands that run code at build time, and initializers.
  if grep -n 'skipKernelTC' "${sources[@]}"; then
    echo "FAIL: skipKernelTC is not allowed"
    exit 1
  fi
  for file in "${sources[@]}"; do
    if grep -nE '^[[:space:]]*import[[:space:]]+Lean([.[:space:]]|$)' "$file" \
      || grep -nE '#(eval|exit)' "$file" \
      || grep -nwE 'elab|elab_rules|macro|macro_rules|syntax|declare_syntax_cat|notation|infix|infixl|infixr|prefix|postfix|binder_predicate|run_cmd|run_elab|run_meta|initialize|builtin_initialize|unsafe|implemented_by|extern' "$file" \
      || grep -nE '(@\[|attribute[[:space:]]*\[)[^]]*\b(init|builtin_init)\b' "$file"; then
      echo "FAIL: $file may not import Lean or use metaprogramming"
      exit 1
    fi
  done
done

rm -rf .lake "$core/.lake"
lake build
# Audit.lean imports only Lean and loads the built modules at run time, so nothing in them can
# change how it parses or print in its place; its exit code is the result.
lib_args=()
for name in "${libs[@]}"; do lib_args+=(--lib "$name"); done
# shellcheck disable=SC2086 # the module list is space-separated names
lake env lean --run "$core/Audit.lean" "${lib_args[@]}" $modules || { echo "FAIL: axiom audit"; exit 1; }
echo "OK: audited$modules"
