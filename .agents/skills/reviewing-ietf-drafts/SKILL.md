---
name: reviewing-ietf-drafts
description: Reviews and critiques IETF Internet-Drafts and RFC submissions for style compliance, technical clarity, prior art gaps, and publication readiness. Use when analyzing existing drafts or providing editorial feedback.
requires:
  - writing-ietf-w3c-specs
---

# IETF Draft Reviewer

Systematic review of Internet-Drafts for RFC publication readiness.

## When to Use

Use this skill when:
- Reviewing an existing Internet-Draft before submission
- Providing editorial feedback on a colleague's draft
- Checking your own draft against IETF requirements
- Evaluating a draft for technical clarity and completeness

## Review Methodology

### Phase 1: Structural Scan

Quick pass to verify all required elements are present.

| Element | Required? | Check |
|---------|-----------|-------|
| Abstract | Yes | Self-contained, no citations |
| Requirements Language (RFC 2119) | If keywords used | Boilerplate in Section 2 |
| Terminology | If domain-specific terms | Definitions before first use |
| Security Considerations | Always | Substantive content |
| IANA Considerations | Always | Even if "no actions" |
| Internationalization | If applicable | Character sets, localization |
| References | Yes | Normative/Informative split |

### Phase 2: Style Compliance (RFC 7322)

Detailed review against RFC Style Guide.

#### Requirement Keywords

| Issue | Example | Severity |
|-------|---------|----------|
| Lowercase normative | "should validate" | HIGH - change to SHOULD |
| MUST in informational text | "Users MUST read the docs" | MEDIUM - use lowercase |
| Ambiguous modal | "may or may not" | HIGH - clarify intent |
| Missing RFC 2119 reference | Keywords used, no boilerplate | HIGH - add Section 2 |

#### Citation Format

| Wrong | Correct |
|-------|---------|
| `[1]` | `[RFC2119]` |
| `(see page 5)` | `(see Section 3.1)` |
| `RFC 2119` inline | `[RFC2119]` |
| Mixed normative/informative | Separate reference sections |

#### Text Format

| Issue | Recommendation |
|-------|----------------|
| Lines > 72 chars in diagrams | Reformat to fit |
| Tabs in source | Convert to spaces |
| Non-ASCII characters | Use ASCII equivalents or declare UTF-8 |
| Orphan headers | Keep header with following paragraph |

### Phase 3: Technical Clarity

Evaluate whether the specification is implementable.

#### Precision Checklist

- [ ] All terms defined before first use
- [ ] Numeric ranges explicit (inclusive/exclusive stated)
- [ ] Units always specified ("30 seconds" not "timeout of 30")
- [ ] Edge cases documented
- [ ] Error conditions enumerated
- [ ] Default values stated for optional parameters
- [ ] State machines have defined transitions

#### Ambiguity Flags

| Pattern | Problem | Fix |
|---------|---------|-----|
| "appropriate" | Undefined | Specify criteria |
| "reasonable" | Subjective | Give bounds |
| "typically" | Non-normative | Use SHOULD or document exceptions |
| "etc." | Incomplete | Enumerate or use "and others" |
| "as needed" | Vague | Define triggers |

### Phase 4: Prior Art & Conflicts

#### Related Work Check

1. **RFC Search**: Does the draft cite all relevant existing RFCs?
2. **I-D Search**: Any active drafts covering similar ground?
3. **WG Conflict**: Is an IETF Working Group already addressing this?
4. **Updates/Obsoletes**: If modifying existing RFC, is metadata correct?

#### Conflict Indicators

| Signal | Risk | Action |
|--------|------|--------|
| Active WG on same topic | High | May get DNP (Do Not Publish) |
| Recent RFC in same area | Medium | Ensure proper citations |
| Competing I-D | Medium | Differentiate or consolidate |
| Patent mentions | Variable | Verify IPR disclosure |

### Phase 5: Publication Readiness

#### Stream Appropriateness

| Stream | Valid Status | Consensus Required |
|--------|--------------|-------------------|
| IETF | Standards Track, BCP, Info, Exp | Yes |
| Independent | Informational, Experimental, Historic | No |
| IRTF | Informational, Experimental | IRSG |
| IAB | Informational | IAB |

#### Blocking Issues

| Issue | Impact | Resolution |
|-------|--------|------------|
| Normative ref to unpublished I-D | MISSREF state | Make informative or wait |
| Missing IANA registry policy | Blocks publication | Add per RFC 8126 |
| No Security Considerations | Rejected | Add substantive section |
| IPR not disclosed | Legal risk | File IPR disclosure |

---

## Review Output Template

When reviewing a draft, produce a report with this structure:

```markdown
# Review: draft-name-version

## Summary
[One paragraph overall assessment]

## Structural Issues
- [ ] Issue 1
- [ ] Issue 2

## Style Violations
| Location | Issue | Recommendation |
|----------|-------|----------------|
| Section X | ... | ... |

## Technical Clarity
[Ambiguities, undefined terms, missing edge cases]

## Prior Art Gaps
[Missing citations, potential conflicts]

## Publication Blockers
[Issues that MUST be resolved before submission]

## Recommendations
1. Priority fix 1
2. Priority fix 2
...
```

---

## Common Issues by Section

### Abstract

| Issue | Example | Fix |
|-------|---------|-----|
| Contains citations | "as defined in [RFC9110]" | Remove, describe inline |
| Undefined acronyms | "TLS" | Expand: "Transport Layer Security (TLS)" |
| Too long | > 200 words | Condense to essential description |
| Not self-contained | "See Section 3" | Remove cross-references |

### Security Considerations

| Issue | Example | Fix |
|-------|---------|-----|
| Empty/trivial | "No security considerations" | Never acceptable; find real issues |
| Generic | Copy-paste boilerplate | Tailor to specific protocol |
| Missing threat model | Lists attacks without context | Add threat model section |
| No mitigations | Identifies risks, no solutions | Add recommended countermeasures |

**Required Coverage:**
- Threat model assumptions
- Authentication/authorization
- Confidentiality/integrity
- Replay protection
- Denial of service
- Privacy implications

### IANA Considerations

| Issue | Example | Fix |
|-------|---------|-----|
| Missing when needed | Defines new registry values | Add IANA section |
| Wrong registration policy | Uses "First Come First Served" for security-sensitive | Use "Specification Required" |
| Missing template | New registry without fields | Add registration template |
| Placeholder not resolved | "TBD" in final draft | Get actual values |

### References

| Issue | Example | Fix |
|-------|---------|-----|
| Normative ref to I-D | Blocks on unpublished work | Reconsider dependency |
| Missing DOI | RFC without DOI | Add DOI |
| Outdated RFC | Cites obsoleted RFC | Update to current |
| URL-only reference | External spec by URL only | Add full bibliographic entry |

---

## Quick Reference: Severity Levels

| Severity | Description | Action |
|----------|-------------|--------|
| BLOCKER | Prevents publication | Must fix before submission |
| HIGH | Violates IETF requirements | Should fix, may cause IESG review issues |
| MEDIUM | Style guide violation | Recommended fix |
| LOW | Editorial suggestion | Optional improvement |

---

## Reviewer Workflow

```
1. Read abstract and introduction
   └─> Understand scope and claims

2. Structural scan (Phase 1)
   └─> Verify all required sections present

3. Read Security and IANA sections
   └─> Most common failure points

4. Detailed style review (Phase 2)
   └─> Check RFC 7322 compliance

5. Technical deep-dive (Phase 3)
   └─> Implementability assessment

6. Prior art search (Phase 4)
   └─> Conflict and citation check

7. Publication assessment (Phase 5)
   └─> Stream appropriateness, blockers

8. Generate report
   └─> Use template, prioritize findings
```

---

## References

- **RFC 7322**: RFC Style Guide
- **RFC 7991**: xml2rfc v3 Vocabulary  
- **RFC 8126**: Guidelines for IANA Considerations
- **RFC 2119 / 8174**: Requirements Language
- **RFC Editor Publication Process**: https://www.rfc-editor.org/pubprocess/
- **I-D Guidelines**: https://www.ietf.org/standards/ids/guidelines/
