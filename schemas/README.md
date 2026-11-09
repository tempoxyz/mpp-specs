# Schemas

JSON Schemas for MPP protocol values.

- `protocol.schema.json`: Challenge, Credential and Receipt values
  as parsed objects (`request` decoded from base64url), plus the
  operation, error and fixture types the MPP conformance suite uses.
  Copied from [tempoxyz/mpp-tools](https://github.com/tempoxyz/mpp-tools/blob/6cc6b497763e9c50e738834c7447c9771e85e592/conformance/schemas/protocol.schema.json)
  (`conformance/schemas/`) with its `$id` moved to
  `https://paymentauth.org/schemas/`. Change it there first, then
  copy it here.
- The drafts are normative. Where a schema and a draft disagree, the
  draft wins and the schema is the bug.
- JSON Schema draft 2020-12. Nothing in CI validates the drafts'
  examples against these schemas yet.
