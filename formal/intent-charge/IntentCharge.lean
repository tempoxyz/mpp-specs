-- Root module: imports the whole model. check.sh builds every module under IntentCharge/ and
-- runs the axiom audit (Audit.lean) over each of them.
import IntentCharge.Model
import IntentCharge.Invariant
import IntentCharge.Properties
import IntentCharge.Counterexamples
import IntentCharge.Witnesses
