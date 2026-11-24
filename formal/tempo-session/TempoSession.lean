-- Root module: imports the whole model. check.sh builds every module under TempoSession/ and
-- runs the axiom audit (Audit.lean) over each of them.
import TempoSession.Model
import TempoSession.Invariant
import TempoSession.Properties
import TempoSession.Counterexamples
import TempoSession.Witnesses
