import Lean
import TempoSession.Model
import TempoSession.Invariant
import TempoSession.Properties
import TempoSession.Counterexamples
import TempoSession.Witnesses
/-
  Axiom audit, run as part of 'lake build' (see check.sh). It is the only gate on proofs: a
  text grep for sorry/axiom would have to re-implement Lean's lexer (nested comments, raw
  strings, interpolation) and every gap in it would hide code. The kernel has no such gaps.

  It walks every declaration of this library (any TempoSession.* module, including this file's
  own declarations above the command, plus anything named TempoSession.*), not only theorems:
  - a declared 'axiom', used or not, fails the build;
  - for every other declaration (theorem, def, instance, ...) it collects the axioms the
    declaration depends on, transitively (Lean.collectAxioms), and fails the build if any is
    not one of Lean's three standard axioms (propext, Classical.choice, Quot.sound). That
    rules out 'sorry' and 'admit' (sorryAx) and native_decide (Lean.ofReduceBool) anywhere
    in the library, even in a definition no theorem uses;
  - it prints how many theorems it audited, which check.sh reports.
  Private declarations are audited too (their _private prefix is looked through), and so are
  the equation lemmas Lean generates for pattern matches, which is why the theorem count is
  larger than the number of theorems written by hand.
-/
open Lean Elab Command

/-- The only axioms a declaration here may depend on. -/
def standardAxioms : List Name := [``propext, ``Classical.choice, ``Quot.sound]

elab "#audit_tempo_session" : command => do
  let env ← getEnv
  let mut audited : Nat := 0
  -- map₁ holds declarations from imported modules; map₂ holds this file's own (Audit.lean),
  -- so a declaration written here, above the command, is audited like any other.
  let imported := env.constants.map₁.toList.map fun (n, i) => (n, i, false)
  let local_ := env.constants.map₂.toList.map fun (n, i) => (n, i, true)
  for (name, info, isLocal) in imported ++ local_ do
    -- A private declaration is stored as _private.<Module>.0.<name>, which Name.isInternal
    -- treats as internal. Look through that prefix first, so a private declaration is
    -- audited like any other. Names still internal after it (compiler-generated auxiliaries,
    -- or a declaration a user named with a leading _) are audited too, but not counted.
    let userName := privateToUserName name
    -- Only this library: declared in a TempoSession.* module (or in this file), or named
    -- TempoSession.*. Lean core is skipped. A module from elsewhere can't smuggle in an axiom:
    -- collectAxioms follows every dependency of this library's declarations, across modules.
    let inLibrary ← do
      if isLocal then pure true
      else
        let some idx := env.getModuleIdxFor? name | pure false
        let some mod := env.header.moduleNames[idx.toNat]? | pure false
        pure ((`TempoSession).isPrefixOf mod || (`TempoSession).isPrefixOf userName)
    unless inLibrary do continue
    if let .axiomInfo _ := info then
      throwError m!"axiom audit: {name} is an axiom declaration; the library may declare none"
    let axioms ← liftCoreM <| collectAxioms (m := CoreM) name
    for ax in axioms do
      unless standardAxioms.contains ax do
        throwError m!"axiom audit: {name} depends on non-standard axiom {ax}"
    if let .thmInfo _ := info then
      unless userName.isInternal do audited := audited + 1
  -- Only this file may import beyond the library and Init. Read from Lean's own header data,
  -- so no spelling of an import (guillemets, comments, line breaks) gets past it. Without
  -- Lean, Lake or Std a module cannot reach the elaborator API (addDecl, kernel-check options), so
  -- every declaration in it goes through the kernel.
  for mod in env.header.moduleNames, data in env.header.moduleData do
    unless (`TempoSession).isPrefixOf mod && mod != `TempoSession.Audit do continue
    for imp in data.imports do
      unless imp.module == `Init || (`TempoSession).isPrefixOf imp.module do
        throwError m!"axiom audit: {mod} imports {imp.module}; only Audit.lean may import outside TempoSession"
  logInfo m!"axiom audit: {audited} theorems use only standard axioms"
  -- The modules this audit saw, read from the environment rather than from Audit.lean's text
  -- (where a commented-out import would look real). check.sh compares this list with the
  -- files on disk, so a module that is built but not imported here fails the check.
  let mods := env.header.moduleNames.toList.filter (fun m => (`TempoSession).isPrefixOf m)
  let names := (mods.map toString).toArray.qsort (· < ·)
  logInfo m!"audited modules: {" ".intercalate names.toList}"

#audit_tempo_session
