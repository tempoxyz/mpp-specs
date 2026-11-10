import Lean
/-
  Axiom audit, run by each model's check.sh (through ../core/check-lib.sh) after 'lake build',
  as a separate program:
    lake env lean --run ../core/Audit.lean --lib <Library>... <module>...
  It is the only gate on proofs: a text grep for sorry/axiom would have to re-implement Lean's
  lexer (nested comments, raw strings, interpolation) and every gap in it would hide code.

  It lives outside every library and imports only Lean, so no model module can change how this
  file parses (a macro or notation in a model module is never in scope here) or print text in
  its place: it loads the modules check-lib.sh names, every file of the model and of MppCore,
  from their built .olean files at run time (importModules, without running any initializers),
  and reports through its exit code.

  It walks every declaration of the libraries named with --lib (any module under one of them,
  plus anything named under one), not only theorems:
  - a declared 'axiom', used or not, fails the audit;
  - for every other declaration (theorem, def, instance, ...) it collects the axioms the
    declaration depends on, transitively (Lean.collectAxioms), and fails if any is not one of
    Lean's three standard axioms (propext, Classical.choice, Quot.sound). That rules out
    'sorry' and 'admit' (sorryAx) and native_decide (Lean.ofReduceBool) anywhere in the
    libraries, even in a definition no theorem uses;
  - every module of the libraries may import only Init and modules of the libraries;
  - every declaration of the libraries is checked again by Lean's kernel, replayed onto a fresh
    environment holding only Init (Lean.Kernel.Environment.replay, as lean4checker does), so a
    declaration that skipped the kernel when it was built (debug.skipKernelTC, or an unchecked
    environment API) fails here;
  - it prints how many theorems it audited, which check-lib.sh reports.
  Private declarations are audited too (their _private prefix is looked through), and so are
  the equation lemmas Lean generates for pattern matches, which is why the theorem count is
  larger than the number of theorems written by hand.
-/
open Lean

/-- The only axioms a declaration of the libraries may depend on. -/
def standardAxioms : List Name := [``propext, ``Classical.choice, ``Quot.sound]

/-- Whether a module or declaration name lies under one of the libraries. -/
def underLibs (libs : List Name) (name : Name) : Bool := libs.any (·.isPrefixOf name)

/-- The module a declaration comes from. -/
def moduleOf (env : Environment) (name : Name) : Option Name :=
  (env.getModuleIdxFor? name).bind fun idx => env.header.moduleNames[idx.toNat]?

/-- Whether a declaration belongs to the libraries: its module or its own name is under one. -/
def inLibrary (libs : List Name) (env : Environment) (name : Name) : Bool :=
  underLibs libs (privateToUserName name) || (moduleOf env name).any (underLibs libs)

/-- Audit the loaded environment: an error message, or the number of theorems audited. -/
def audit (libs : List Name) (env : Environment) : IO (Except String Nat) := do
  let mut audited : Nat := 0
  for (name, info) in env.constants.map₁.toList do
    -- Only the libraries; Lean core is skipped. A module from elsewhere can't smuggle in an
    -- axiom: collectAxioms follows every dependency of the libraries' declarations.
    unless inLibrary libs env name do continue
    if let .axiomInfo _ := info then
      return .error s!"{name} is an axiom declaration; the libraries may declare none"
    let (axioms, _) ← (collectAxioms name : CoreM (Array Name)).toIO
      { fileName := "<audit>", fileMap := default } { env }
    for ax in axioms do
      unless standardAxioms.contains ax do
        return .error s!"{name} depends on non-standard axiom {ax}"
    -- A private declaration is stored as _private.<Module>.0.<name>, which Name.isInternal
    -- treats as internal, so look through that prefix. Names still internal after it
    -- (compiler-generated auxiliaries) are audited above but not counted.
    if let .thmInfo _ := info then
      unless (privateToUserName name).isInternal do audited := audited + 1
  -- Read imports from Lean's own header data, so no spelling of an import (guillemets,
  -- comments, line breaks) gets past it. Without Lean, Lake or Std a module cannot reach the
  -- elaborator API (addDecl, kernel-check options), so every declaration in it goes through
  -- the kernel.
  for mod in env.header.moduleNames, data in env.header.moduleData do
    unless underLibs libs mod do continue
    for imp in data.imports do
      unless imp.module == `Init || underLibs libs imp.module do
        return .error s!"{mod} imports {imp.module}; library modules may import only Init and {libs}"
  return .ok audited

/-- Check every declaration of the libraries' modules again in the kernel, on top of Init alone
  (library modules may import nothing else, which audit checks first). -/
def replay (libs : List Name) (env : Environment) : IO (Except String Unit) := do
  let mut consts : Std.HashMap Name ConstantInfo := {}
  for (name, info) in env.constants.map₁.toList do
    if (moduleOf env name).any (underLibs libs) then consts := consts.insert name info
  let base ← importModules #[{ module := `Init }] {}
  try
    discard <| Kernel.Environment.replay consts base.toKernelEnv
    return .ok ()
  catch e =>
    return .error s!"kernel replay failed: {e}"

/-- Split the command line into the --lib names and the modules to load. -/
def parseArgs : List String → List Name × List Name
  | "--lib" :: lib :: rest => let (ls, ms) := parseArgs rest; (lib.toName :: ls, ms)
  | m :: rest => let (ls, ms) := parseArgs rest; (ls, m.toName :: ms)
  | [] => ([], [])

/-- Load the modules named on the command line and audit them; exit code 0 only on success. -/
def main (args : List String) : IO UInt32 := do
  let (libs, mods) := parseArgs args
  if libs.isEmpty || mods.isEmpty then
    IO.eprintln "usage: lake env lean --run Audit.lean --lib <Library>... <module>..."
    return 2
  initSearchPath (← findSysroot)
  let env ← importModules (mods.toArray.map fun m => { module := m }) {}
  match ← audit libs env with
  | .error msg =>
    IO.eprintln s!"axiom audit: {msg}"
    return 1
  | .ok n =>
    match ← replay libs env with
    | .error msg =>
      IO.eprintln s!"axiom audit: {msg}"
      return 1
    | .ok () =>
      IO.println s!"axiom audit: {n} theorems use only standard axioms, kernel replay passed"
      return 0
