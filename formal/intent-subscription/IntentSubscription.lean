-- Root module: imports the whole model. check.sh builds every module under
-- IntentSubscription/ and runs the axiom audit (Audit.lean) over each of them.
import IntentSubscription.Model
import IntentSubscription.Invariant
import IntentSubscription.Properties
import IntentSubscription.Counterexamples
import IntentSubscription.Witnesses
