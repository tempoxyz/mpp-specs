# MPP — PQC credential binding + ZKP receipt in production

**Type:** Production deployment notice
**Related open PRs:** mpp-specs#230, #262, #264, #258 · mpp#633

---

## Production status

AlgoVoi's MPP payment verification is **live in production** with ZKP-bound payment evidence for Phase 2 ATB-credentialled agents as of 2026-06-04. AlgoVoi operates across 7 chains (Algorand, VOI, Hedera, Stellar, Base, Solana, Tempo).

---

## New response headers on MPP payment verification (Phase 2 ATB sessions only)

```http
HTTP/1.1 200 OK
X-PAYMENT-RECEIPT: eyJ...
X-ZKP-Receipt-Payload: <base64url unsigned ZKP receipt>
X-Composite-Trust-Verdict: TRUSTED

{"verified": true, "settlement_attestation": {"settlement_result": "SETTLED", ...}}
```

`X-ZKP-Receipt-Payload` and `X-Composite-Trust-Verdict` are **only present for Phase 2 ATB sessions**. All existing MPP flows — including `Authorization: Payment` proof-based requests — are unaffected.

---

## Agent credential flow for MPP

AlgoVoi MPP supports two auth paths on every resource endpoint:

- **Standard:** `Authorization: Bearer <api_key>` + `X-Tenant-Id` — unchanged
- **Agent session:** `Authorization: Bearer <session_token>` from `POST /auth/token` with ATB ZKP cert or federation token

Full Phase 2 flow:

```
1. Agent → POST /auth/token
   Headers: X-Tenant-Id, Authorization: Bearer <api_key>
   Body: { "atb_zk_credential": "<Falcon-1024 Phase 2 cert>", "spend_cap_usd": 25.0 }
   ← session JWT issued; ZKP commitment + proof bound to session; spend cap initialised

2. Agent → GET /mpp/{resource_id}
   Headers: Authorization: Bearer <session_token>
   ← 402 Payment Required (x402/MPP challenge, normal flow)

3. Agent pays on-chain, submits proof:
   Agent → GET /mpp/{resource_id}
   Headers: Authorization: Bearer <session_token>
              X-PAYMENT: <base64-encoded payment proof>
   ← 200 OK with X-ZKP-Receipt-Payload + X-Composite-Trust-Verdict
      Spend cap decremented by confirmed payment amount
```

The session token replaces the API key for all subsequent MPP calls within the session. Once `spend_cap_usd` is exhausted, further payments return `402 agent_spend_cap_exceeded` — enforced in-process before the facilitator is called.

---

## Composite trust verdict

The `X-Composite-Trust-Verdict` header is derived by composing the MPP settlement attestation with the ZKP receipt at confirmation time. The same verdict is independently reproducible via the hosted endpoint:

```http
POST https://api.algovoi.co.uk/compliance/trust-query
Content-Type: application/json

{
  "receipts": [
    {
      "settlement_result": "SETTLED",
      "settlement_provider_did": "did:web:api.algovoi.co.uk"
    },
    {
      "type": "zkp_receipt",
      "threshold_met": true,
      "bench_issuer": "did:web:agent-trust-bench.algovoi.co.uk"
    }
  ]
}
```

```json
{
  "trust_outcome": "TRUSTED",
  "composite_hash": "36042eb288b6557aed801ed9a2fe6e077b31bd7261a4dffbe8107ef078867f10",
  "receipt_count": 2,
  "ctq_response": { ... }
}
```

Possible verdicts: `TRUSTED` (settlement confirmed + ZKP threshold met) · `PROVISIONAL` (`PENDING_FINALITY`) · `INSUFFICIENT_EVIDENCE` · `UNTRUSTED` (threshold not met or reversed).

Specified in [`draft-hopley-x402-composite-trust-query`](https://datatracker.ietf.org/doc/draft-hopley-x402-composite-trust-query/).

---

## Validation stages

**Stage 1 — Specification**

| Reference | Subject |
|---|---|
| [`draft-hopley-x402-pqc-credential-binding-00`](https://datatracker.ietf.org/doc/draft-hopley-x402-pqc-credential-binding/) | Falcon-1024 / ML-DSA-65 (NIST FIPS 204/206) credential binding to MPP payment authorization — under editor review |
| [`draft-hopley-x402-federation-zkp-00`](https://datatracker.ietf.org/doc/draft-hopley-x402-federation-zkp/) | Cross-issuer ZKP composition; composite commitment: `SHA-256(domain ‖ comm_0 ‖ … ‖ nonce)` — under editor review |
| [`draft-hopley-x402-composite-trust-query`](https://datatracker.ietf.org/doc/draft-hopley-x402-composite-trust-query/) | Composite trust verdict over receipt chains |
| [IACR ePrint 2026/109852](https://eprint.iacr.org/2026/109852) | *"Agent Trust Bench: Adversarial Payment Profiling for Autonomous Agents with Post-Quantum Credential Binding and Cross-Issuer Federation"* — under IACR editor review |

**Stage 2 — Implementation**

Production deployment to `api.algovoi.co.uk` as of 2026-06-04:
- `algovoi-federation-validator` v0.1.1 — 59/59 tests pass
- `algovoi-zkp-receipt` v0.1.0 — 13/13 tests pass
- Gateway agent auth + ZKP receipt pipeline — 75/75 tests pass
- ATB ZKP service (Rust / Bulletproofs / Ristretto255) — live, commitment 32 bytes, proof ~672 bytes

**Stage 3 — Cross-language conformance**

`zkp_receipt_v1` canonicalisation validated byte-for-byte — 8/8 PASS × 8 languages:

| Language | Library | Result |
|---|---|---|
| Python | `rfc8785 0.1.4` | **8/8 PASS** |
| Node.js | `canonicalize 3.0.0` | **8/8 PASS** |
| Ruby | `json-canonicalization 1.0.0` | **8/8 PASS** |
| PHP | `root23/php-json-canonicalization 1.0.1` | **8/8 PASS** |
| Go | `gowebpki/jcs v1.0.1` | **8/8 PASS** |
| Rust | `serde_jcs 0.2.0` | By transitivity — 320/320 prior attestation |
| Java | `java-json-canonicalization` | By transitivity — 320/320 prior attestation |
| .NET | `Baqhub.JsonCanonicalization 1.0.1` | By transitivity — 320/320 prior attestation |

Attestation: [`2026-06-04-zkp-receipt-v1-cross-validation.md`](https://github.com/chopmob-cloud/algovoi-jcs-conformance-vectors/blob/main/_attestations/2026-06-04-zkp-receipt-v1-cross-validation.md)
Cumulative: **664/664** byte-for-byte agreements across 9 vector sets, 8 JCS implementations.

```bash
git clone https://github.com/chopmob-cloud/algovoi-jcs-conformance-vectors
cd algovoi-jcs-conformance-vectors/_attestations/2026-05-25-8-impl-5-format-cross-validation
bash run_all.sh ../../vectors/zkp_receipt_v1/zkp_receipt_v1.json
# Expect: 8/8 PASS × 8 languages
```

**Stage 4 — Live production smoke**

- 13/13 service checks pass (gateway, compliance, CTQ, ATB bench, docs)
- CTQ live: `TRUSTED / UNTRUSTED / PROVISIONAL / INSUFFICIENT_EVIDENCE` all verified
- ATB bench score: 128/138 (92.8%) across 138 adversarial payment profiles
- 7 chains live: Algorand, VOI, Hedera, Stellar, Base, Solana, Tempo

---

## Licensing — these packages are not open source

The MPP gateway API is available under the standard AlgoVoi 0.50% transaction fee. No additional licence required to consume the headers.

The **self-hosted implementation packages are proprietary and will not be open-sourced under any circumstances**:

| Package | Licence |
|---|---|
| `algovoi-federation-validator` | **AlgoVoi Commercial License v1.0 — not open source** |
| `algovoi-zkp-receipt` | **AlgoVoi Commercial License v1.0 — not open source** |

There is no Apache, MIT, or community-licence path for these packages. Production deployment or commercial integration requires a written Commercial Licence Agreement. Evaluation and non-commercial research is free. Contact [hello@algovoi.co.uk](mailto:hello@algovoi.co.uk).

All 31 AlgoVoi substrate packages remain Apache 2.0.

---

*AlgoVoi (chopmob-cloud) -- [docs.algovoi.co.uk/pqc-substrate](https://docs.algovoi.co.uk/pqc-substrate)*
