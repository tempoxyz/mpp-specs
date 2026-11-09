# Schemas

JSON Schemas for MPP protocol values.

- `protocol.schema.json`: Challenge, Credential and Receipt values
  as parsed objects (`request` decoded from base64url), plus the
  operation, error and fixture types the MPP conformance suite uses.
  Copied from [tempoxyz/mpp-tools](https://github.com/tempoxyz/mpp-tools/blob/6cc6b497763e9c50e738834c7447c9771e85e592/conformance/schemas/protocol.schema.json)
  (`conformance/schemas/`) with its `$id` moved to
  `https://paymentauth.org/schemas/`. Change it there first, then
  copy it here.
- The `$id` URL is not served yet: the Pages deploy (`.github/workflows/deploy.yml`)
  does not copy `schemas/` into `_site`. Until it does, read the schema from
  this repository.
- Intentional differences from mpp-tools, which should follow:
  - Receipt `status` is `const: "success"`, as the core draft's
    Receipt Status Semantics require.
  - Receipt requires `method`, as the core draft's Receipt fields do.
  - Challenge and ChallengeIdInput `header` are
    `const: "Payment-Authorization"`.
  - Credential `source` is a string.
  - http.payment_request `payment.source` is a string or null, matching Credential `source`.
  - `TempoProofTypedData` pins domain `name` "MPP", `version` "3", `primaryType`
    "Proof" and the `Proof` type, per the tempo-charge draft.
  - `PaymentMethodId` has pattern `^[a-z]+$` and `IntentId` has
    `^[A-Za-z0-9-]+$`, per the core draft's method and intent grammar.
    Challenge, ChallengeIdInput, ServerVerifyRequest and Receipt use
    them for `method` and, where present, `intent`.
  - HttpServerOffer `method` is a `PaymentMethodId`, narrowed from
    `^[a-z][a-z0-9-]*$`.
  - Challenge allows extra members as strings
    (`additionalProperties: {type: string}`): custom parameters are
    auth-params (token or quoted-string), and receivers ignore unknown ones.
  - Challenge `expires`, Receipt `timestamp` and HttpServerOffer
    `expires` use `DateTime`: `format: date-time` plus an RFC 3339
    pattern, since 2020-12 validators treat `format` as an annotation
    by default.
  - Credential allows extra members of any type
    (`additionalProperties: true`), since receivers ignore unknown fields.
- The drafts are normative. Where a schema and a draft disagree, the
  draft wins and the schema is the bug.
- JSON Schema draft 2020-12. Nothing in CI validates the drafts'
  examples against these schemas yet.
