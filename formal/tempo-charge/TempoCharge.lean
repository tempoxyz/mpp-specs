-- Root module: imports the whole model. check.sh builds every module under TempoCharge/ and
-- runs the axiom audit (Audit.lean) over each of them.
import TempoCharge.Model
import TempoCharge.Invariant
import TempoCharge.Properties
import TempoCharge.Counterexamples
import TempoCharge.Witnesses
