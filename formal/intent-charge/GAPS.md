# Spec gaps

Each row is a rule the drafts leave out. With its guard off, `IntentCharge/Counterexamples.lean` holds a `decide`-checked trace that breaks the named property; with every guard on, the same trace's credential is refused at that step (`rejectedAt`), or for row 5 both clients are served. Rows 6–8 are wording gaps; the model takes the reading in the last column.

| # | Where | Gap | Guard (`Cfg`) | Breaks | Counterexample |
|---|---|---|---|---|---|
| 1 | core §Challenge Binding, charge §Server Responsibilities | The binding covers no resource (URI, HTTP method), and the server need not check that the echoed request is its price for the current request: a cheap route's challenge buys a dear route | `checkTarget` | P5 | `G1_violates_P5`, `G1_guard_rejects` |
| 2 | charge §Server Responsibilities, §Currency Verification | The server checks amount and recipient, not currency; only clients must check currency: 1 unit of a worthless token pays 1 USD | `checkCurrency` | P5 | `G2_violates_P5`, `G2_guard_rejects` |
| 3 | charge §Server Responsibilities step 3, core §Replay Protection | The proof need not commit to the challenge: a public payment for A's challenge redeems B's, and A is then refused as spent | `bindProof` | P1 | `G3_violates_P1`, `G3_payer_locked_out`, `G3_guard_rejects` |
| 4 | core §Optional Parameters (`expires` SHOULD), charge §Server Responsibilities step 2 | Without `expires` a challenge never expires: it is redeemed 10^6 s later at its old price | `ttl` = `some _` | P3 | `G4_violates_P3`, `G4_guard_rejects` |
| 5 | core §HMAC-SHA256 Binding, §Required Parameters (`id`) | The recommended id has no nonce: identical parameters (same route, same second) give the same id, and the second client pays and is refused as already used | `uniqueIds` (nonce in `opaque`) | P8, payer served | `G5_violates_P8`, `G5_paid_not_served`, `G5_guard_serves_both` |
| 6 | core §Challenge Binding vs §Status Codes, charge §Replay Protection | Stateless HMAC verification is allowed, but single use needs a per-id used store; without `expires` it grows forever | modelled: a used-id store | wording | — |
| 7 | core §Idempotency and Side Effects vs charge §Single-Use | An Idempotency-Key retry "with a valid Payment credential" SHOULD get the original response, but that credential is used and MUST be rejected | modelled: a retry is a cache hit with no new effect (`P7_retry_no_effect`); a resubmit is rejected | wording | — |
| 8 | core §HMAC-SHA256 Binding, §Character Encoding | The `\|`-joined input is ambiguous if a slot contains `\|`; `realm` may. Every collision found needs another slot to be ill-formed, so strict parsing of echoed fields blocks it; the draft doesn't require that | none: the model's MAC is injective | binding | `Gap8_hmac_input_collision` |

- Row 1: `digest` (SHOULD) binds the body, not the route; a stateful server that stores the target with the id closes the gap the same way as `checkTarget`.
- Row 3: methods that bind the challenge (a memo or the signed authorization naming the id) satisfy the guard; ledger-hash proofs need it stated.
- Row 5: `expires` to the second does not separate concurrent requests; any per-challenge nonce in `opaque` does.

