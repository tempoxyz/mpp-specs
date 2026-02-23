---
name: writing-ietf-w3c-specs
description: Writes technical specifications in IETF RFC and W3C style. Use when asked to write a spec, RFC, protocol specification, or technical standard document.
---

# IETF/W3C Specification Writer

Write technical specifications following IETF RFC and W3C conventions.

## Document Structure

Follow this canonical RFC structure (note: Security Considerations comes BEFORE IANA Considerations per IETF convention):

```
Title
Abstract
Status of This Memo (auto-generated)
Copyright Notice (auto-generated)
Table of Contents

1. Introduction
   1.1. Relationship to Other Specifications (optional)
2. Requirements Language (RFC 2119 boilerplate)
3. Terminology
4. [Protocol/Feature Overview]
5. [Detailed Specification Sections]
...
N-3. Internationalization Considerations
N-2. Security Considerations
N-1. IANA Considerations
N.   References
     N.1. Normative References
     N.2. Informative References
Appendix A. [ABNF Collected]
Appendix B. [Examples]
Acknowledgements
Authors' Addresses
```

### Section Ordering

The order of the final sections is important:

1. **Internationalization Considerations** (if applicable)
2. **Security Considerations** (REQUIRED - always before IANA)
3. **IANA Considerations** (REQUIRED - even if empty)
4. **References**

This ordering matches RFC 7617 and current IETF conventions.

## Requirements Language (RFC 2119/8174)

Include this boilerplate in section 1.1:

> The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in BCP 14 [RFC2119] [RFC8174] when, and only when, they appear in all capitals, as shown here.

### Keyword Meanings

| Keyword | Meaning |
|---------|---------|
| MUST, REQUIRED, SHALL | Absolute requirement |
| MUST NOT, SHALL NOT | Absolute prohibition |
| SHOULD, RECOMMENDED | Valid reasons may exist to ignore, but implications must be understood |
| SHOULD NOT, NOT RECOMMENDED | Valid reasons may exist to allow, but implications must be understood |
| MAY, OPTIONAL | Truly optional; implementations must interoperate with or without |

Use sparingly—only where interoperability or harm prevention requires it.

## Writing Style

### Precision
- Define all terms before use
- Use consistent terminology throughout
- Be explicit about edge cases and error conditions
- Specify exact behavior, not approximate

### Voice and Tense
- Use present tense for normative statements
- Use passive voice for protocol descriptions: "The message is sent..." not "The client sends..."
- Use active voice for implementation requirements: "Implementations MUST validate..."

### Avoid Ambiguity
- Never use "should" lowercase for normative requirements
- Avoid "may or may not"—use "MAY" or be explicit
- Define numeric ranges explicitly: "between 1 and 100 inclusive"
- Specify units: "timeout of 30 seconds" not "timeout of 30"

## ABNF Grammar (RFC 5234)

Use Augmented Backus-Naur Form for syntax definitions:

```abnf
; Rules are case-insensitive by default
rule-name = elements

; Terminal values
DIGIT   = %x30-39        ; 0-9
ALPHA   = %x41-5A / %x61-7A  ; A-Z / a-z
CRLF    = %x0D.0A        ; carriage return + line feed
SP      = %x20           ; space
HTAB    = %x09           ; horizontal tab

; Operators
sequence    = element1 element2     ; concatenation
alternative = option1 / option2     ; alternatives
optional    = [element]             ; 0 or 1
repetition  = *element              ; 0 or more
one-plus    = 1*element             ; 1 or more
specific    = 3element              ; exactly 3
range       = 2*5element            ; 2 to 5

; Example: HTTP field value
field-value = *( field-content / obs-fold )
field-content = field-vchar [ 1*( SP / HTAB ) field-vchar ]
field-vchar = VCHAR / obs-text
```

### ABNF Conventions
- Rule names: lowercase with hyphens
- Comments: semicolon to end of line
- Case-sensitive strings: use `%s"text"` (RFC 7405)
- Collect all ABNF in an appendix for reference

## ASCII Diagrams

Use ASCII art for protocol diagrams. Keep within 72 characters width.

### Message Format Diagram

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|Version|  IHL  |    DSCP   |ECN|         Total Length          |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|         Identification        |Flags|     Fragment Offset     |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

### Flow Diagram

```
   Client                                 Server
      |                                      |
      |  -------- Request Message -------->  |
      |                                      |
      |  <------- Response Message -------   |
      |                                      |
```

### Sequence Diagram

```
  Alice                         Bob                         Carol
    |                            |                            |
    |  (1) Hello                 |                            |
    |---------------------------->                            |
    |                            |                            |
    |                            |  (2) Forward               |
    |                            |---------------------------->
    |                            |                            |
    |                            |  (3) Acknowledge           |
    |                            |<----------------------------
    |                            |                            |
    |  (4) Confirmation          |                            |
    |<----------------------------                            |
    |                            |                            |
```

### State Machine

```
                     +-------+
              +----->| IDLE  |<-----+
              |      +-------+      |
              |          |          |
              |    recv SYN         |
              |          |          |
              |          v          |
              |      +-------+      |
       timeout|      | INIT  |      |close
              |      +-------+      |
              |          |          |
              |    recv ACK         |
              |          |          |
              |          v          |
              |      +-------+      |
              +------| OPEN  |------+
                     +-------+
```

### Architecture Diagram

```
+-------------------+     +-------------------+
|                   |     |                   |
|   Application     |     |   Application     |
|                   |     |                   |
+--------+----------+     +----------+--------+
         |                           |
         |         Protocol          |
         +<------------------------->+
         |                           |
+--------+----------+     +----------+--------+
|                   |     |                   |
|    Transport      |     |    Transport      |
|                   |     |                   |
+-------------------+     +-------------------+
```

## Required Sections

### Internationalization Considerations

Include when the spec involves:
- Character encoding (specify UTF-8 per RFC 3629)
- Human-readable text fields
- Locale-sensitive data

Example coverage:
- JSON payloads mandate UTF-8 (RFC 8259)
- Parameters like `realm` SHOULD use ASCII for interoperability
- Human-readable fields MAY use `Accept-Language` for localization

### Security Considerations

REQUIRED in all RFCs. Address:
- **Threat model**: What attackers can do (observe traffic, inject messages, etc.)
- **Transport security**: TLS requirements (MUST use TLS 1.3+)
- **Authentication and authorization**
- **Confidentiality and integrity**
- **Replay protection**: Nonces, timestamps, single-use tokens
- **Denial of service**: Rate limiting guidance
- **Privacy implications**: Logging, correlation, pseudonymity
- **Caching**: `Cache-Control` headers for sensitive responses
- **Cross-origin considerations**: CORS, origin display for user consent

Never write "This protocol has no security considerations."

### IANA Considerations

Required if the spec defines:
- New registries (specify registration policy per RFC 8126)
- New values in existing registries
- Protocol parameters
- Header fields
- Well-known URIs
- Authentication schemes

**Registry Registration Template:**

```markdown
### X.1. [Registry Name] Registration

This document registers the following in the "[Registry Name]":

- **[Field Name]**: [Value]
- **Reference**: This document, Section Y
- **Notes**: [Optional notes]
```

**Common Registrations for HTTP Specs:**

| Registry | When to Register |
|----------|------------------|
| HTTP Authentication Scheme Registry | New auth schemes |
| HTTP Field Name Registry | New headers |
| Well-Known URIs | New `/.well-known/` endpoints |
| Media Types | New content types |

If none: "This document has no IANA actions." (removed in final RFC)

## References

### Normative vs Informative

**Normative**: Required to implement the specification
```
[RFC2119]  Bradner, S., "Key words for use in RFCs to Indicate
           Requirement Levels", BCP 14, RFC 2119,
           DOI 10.17487/RFC2119, March 1997,
           <https://www.rfc-editor.org/info/rfc2119>.
```

**Informative**: Background, related work, examples
```
[REST]     Fielding, R.T., "Architectural Styles and the Design of
           Network-based Software Architectures", Doctoral
           Dissertation, University of California, Irvine,
           September 2000.
```

### Reference Format
- Use bracketed tags: [RFC9110], [HTTP]
- Include DOI when available
- Include URL for online resources
- Reference most current RFC unless specific version needed

## W3C Specific Conventions

W3C specs share RFC conventions but add:

### Document Types
- Working Draft (WD): Early stage
- Candidate Recommendation (CR): Feature-complete, seeking implementation
- Proposed Recommendation (PR): Implementation proven
- Recommendation (REC): Final standard

### Tools
- **Bikeshed**: Preferred for new specs
- **ReSpec**: JavaScript-based spec generator

### W3C-Specific Sections
- Conformance (what it means to implement)
- Privacy Considerations (alongside Security)
- Accessibility Considerations

### WebIDL for APIs

```webidl
[Exposed=Window]
interface ExampleInterface {
  constructor(DOMString name);
  
  readonly attribute DOMString name;
  attribute unsigned long count;
  
  undefined doSomething(optional ExampleOptions options = {});
};

dictionary ExampleOptions {
  boolean flag = false;
  sequence<DOMString> items;
};
```

## Example Sections

### Example: Introduction

```markdown
1. Introduction

   This document specifies the Foobar Protocol, a mechanism for
   exchanging widget metadata between networked devices.

   The protocol addresses the problem of [specific problem] by
   providing [specific solution].

1.1. Requirements Language

   The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
   "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and
   "OPTIONAL" in this document are to be interpreted as described in
   BCP 14 [RFC2119] [RFC8174] when, and only when, they appear in all
   capitals, as shown here.

1.2. Terminology

   Widget:  A discrete unit of metadata as defined in [RFC9999].

   Foobar Node:  A network endpoint implementing this protocol.
```

### Example: Protocol Definition

```markdown
3. Message Format

   All Foobar messages consist of a fixed header followed by a
   variable-length payload.

3.1. Header Format

    0                   1                   2                   3
    0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
   +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   |    Version    |     Type      |            Length             |
   +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+

   Version (8 bits):  Protocol version. This document defines
      version 1.

   Type (8 bits):  Message type. See Section 3.2.

   Length (16 bits):  Total message length in octets, including
      the header. MUST be at least 4.

3.2. Message Types

   The following message types are defined:

   +-------+----------+---------------------------+
   | Value | Name     | Description               |
   +-------+----------+---------------------------+
   | 0x01  | REQUEST  | Widget request message    |
   | 0x02  | RESPONSE | Widget response message   |
   | 0x03  | ERROR    | Error indication          |
   +-------+----------+---------------------------+

   Receivers MUST ignore messages with unknown Type values.
```

### Example: Security Considerations

```markdown
7. Security Considerations

7.1. Threat Model

   This protocol assumes that attackers may:
   
   -  Observe all network traffic (passive attack)
   -  Inject, modify, or replay messages (active attack)
   -  Compromise individual nodes

7.2. Authentication

   Implementations MUST authenticate peers before processing
   messages. This specification does not mandate a specific
   authentication mechanism; however, implementations SHOULD
   support TLS 1.3 [RFC8446] with mutual authentication.

7.3. Confidentiality

   Widget metadata MAY contain sensitive information.
   Implementations MUST encrypt messages in transit using
   TLS 1.3 or equivalent.

7.4. Denial of Service

   An attacker may attempt to exhaust server resources by
   sending many REQUEST messages. Implementations SHOULD
   implement rate limiting and MAY reject connections from
   sources exceeding a configurable threshold.
```

## HTTP Authentication Scheme Specifications

When writing an HTTP authentication scheme (like RFC 7617 "Basic"), follow these patterns:

### Reference Spec: RFC 7617

RFC 7617 is the canonical example for auth scheme specs. Key sections:

1. Introduction
2. The '[Scheme]' Authentication Scheme
   - Challenge parameters
   - Credential format
   - Reusing Credentials
3. Internationalization Considerations
4. Security Considerations
5. IANA Considerations
6. References

### Challenge Syntax (WWW-Authenticate)

Use RFC 7235 `auth-param` syntax with OWS (optional whitespace):

```abnf
challenge       = "Payment" [ 1*SP auth-params ]
auth-params     = auth-param *( OWS "," OWS auth-param )
auth-param      = token BWS "=" BWS ( token / quoted-string )
```

**Do NOT:**
- Hardcode parameter order (parameters are unordered)
- Omit OWS/BWS around delimiters
- Re-define core grammar (`quoted-string`, etc.) — import from RFC 9110

### Credential Syntax (Authorization)

For single-blob credentials, use `token68`:

```abnf
credentials = "Payment" 1*SP token68
token68     = 1*( ALPHA / DIGIT / "-" / "." / "_" / "~" / "+" / "/" ) *"="
```

### Required Subsections

1. **Required Parameters**: List with MUST requirements
2. **Optional Parameters**: List, note "unknown parameters MUST be ignored"
3. **Reusing Credentials**: Define scope and reuse semantics
4. **Example Challenge**: Full HTTP example

### Parameter Best Practices

| Parameter | Purpose | Example |
|-----------|---------|---------|
| `realm` | Protection space scope | `realm="api.example.com"` |
| `id` | Challenge correlation | `id="ch_abc123"` (128+ bits entropy) |

For `realm`, provide multiple examples:
- `realm="api.example.com"` — domain scope
- `realm="api.example.com/v1"` — path scope
- `realm="Premium Content"` — tier scope
- `realm="Acme Corp API"` — branded scope

### IANA Registration

Register in "HTTP Authentication Scheme Registry" (RFC 7235):

```markdown
- **Authentication Scheme Name**: [Scheme]
- **Reference**: This document, Section X
- **Notes**: [Brief description]
```

## Checklist

Before finalizing a specification:

### Structure
- [ ] Abstract is self-contained (no citations)
- [ ] RFC 2119 boilerplate included if using keywords
- [ ] All terms defined before first use
- [ ] Section order: Security → IANA → References
- [ ] Internationalization Considerations included (if applicable)

### ABNF
- [ ] ABNF syntax is valid (if used)
- [ ] Core rules imported from RFC 9110/5234, not re-defined
- [ ] ABNF collected in appendix
- [ ] Uses OWS/BWS for whitespace flexibility

### Content
- [ ] ASCII diagrams within 72 characters
- [ ] Examples validate against specified syntax
- [ ] Edge cases and error handling specified
- [ ] Status code semantics clearly defined

### Security
- [ ] Threat model stated
- [ ] TLS requirements specified
- [ ] Replay protection addressed
- [ ] Caching guidance provided
- [ ] Privacy/logging considerations included

### IANA
- [ ] All registrations listed with required fields
- [ ] Registration policy specified for new registries (RFC 8126)
- [ ] Header fields registered in HTTP Field Name Registry
- [ ] Authentication schemes registered in HTTP Auth Scheme Registry

### References
- [ ] All references formatted correctly
- [ ] Normative/Informative references separated
- [ ] RFC 8126 referenced if creating registries

---

## Prior Art Discovery

Before writing a new specification, search for related work to avoid duplication
and ensure proper citations.

### Search Resources

| Resource | URL | Use For |
|----------|-----|---------|
| RFC Index | https://www.rfc-editor.org/rfc-index.html | Published RFCs |
| Datatracker | https://datatracker.ietf.org/ | Active I-Ds, WG status |
| RFC Editor Queue | https://www.rfc-editor.org/current_queue.php | In-progress documents |
| IANA Registries | https://www.iana.org/protocols | Existing registrations |

### Conflict Check Process

1. **Search by keyword** in Datatracker for related drafts
2. **Check Working Groups** — is any WG chartered for this topic?
3. **Review recent RFCs** in the same area (last 3-5 years)
4. **Check independent submissions** for similar work

### Updates and Obsoletes

If your spec modifies an existing RFC:

```markdown
Updates: XXXX            ← In document header metadata
```

In the Introduction, explain:
- What specific sections are updated
- Why the update is needed
- Backward compatibility implications

### Warning Signs

| Signal | Risk | Action |
|--------|------|--------|
| Active WG on same topic | High | Contact WG chairs before proceeding |
| Recent RFC in same area | Medium | Ensure differentiation and proper citation |
| Pending I-D with overlap | Medium | Consider collaboration or differentiation |

---

## Publication Process

### Streams and Status

| Stream | Who Approves | Valid Status Options |
|--------|--------------|----------------------|
| **IETF** | IESG | Standards Track, BCP, Informational, Experimental |
| **Independent** | ISE + IESG | Informational, Experimental, Historic |
| **IRTF** | IRSG | Informational, Experimental |
| **IAB** | IAB | Informational |

### IETF Stream Process

```
Internet-Draft → WG Adoption → WG Last Call → IETF Last Call → IESG Review → RFC Editor → AUTH48 → Publication
```

### Independent Submission Process

```
Internet-Draft → Submit to ISE → ISE Review → IESG Conflict Review → RFC Editor → AUTH48 → Publication
```

**Timeline:** 6-18 months typical for independent submissions.

### Queue States

| State | Meaning | Your Action |
|-------|---------|-------------|
| EDIT | RFC Editor editing | Wait |
| RFC-EDITOR | In editing queue | Wait |
| MISSREF | Waiting on normative references | Resolve dependencies |
| AUTH48 | Final author review | Review and approve changes |
| AUTH48-DONE | Author approved | Publication imminent |

### Choosing a Stream

**Use IETF stream when:**
- Work fits an existing WG charter
- Seeking IETF consensus / Standards Track status
- Protocol interoperability is critical

**Use Independent stream when:**
- No relevant WG exists
- Work is informational/experimental
- IETF consensus not required
- Documenting existing practice

---

## Independent Submissions

### Requirements

Independent submissions have specific constraints:

- **Status**: Only Informational, Experimental, or Historic
- **No IETF consensus**: Cannot claim IETF endorsement
- **Conflict review**: IESG checks for overlap with IETF work
- **Technical competence**: ISE reviews for quality

### Cover Letter

When submitting to ISE, include:

1. **Intended status** (Informational/Experimental/Historic)
2. **Target audience** and use case
3. **Related IETF work** (if any) and how this differs
4. **Suggested reviewers** (2-3 names with expertise)
5. **IANA requirements** (if any)
6. **IPR status** (any known patents)

### Rights and Licensing (RFC 5744)

Independent submissions have three rights options:

| Option | Allows | Use When |
|--------|--------|----------|
| **Full rights** | Derivative works, modifications | Default for most specs |
| **No modification** | Verbatim copies only | Preserving exact text matters |
| **No derivatives** | No derivative works | Rare; limits utility |

Include the appropriate trust statement in boilerplate.

### Common Rejection Reasons

| Reason | Prevention |
|--------|------------|
| Conflicts with WG work | Check Datatracker before starting |
| Poor technical quality | Get expert review before submission |
| Inadequate security analysis | Include thorough Security Considerations |
| Missing IANA details | Complete IANA section per RFC 8126 |

---

## Common Mistakes

### Requirements Language

| Wrong | Right | Issue |
|-------|-------|-------|
| "Implementations should..." | "Implementations SHOULD..." | Lowercase not normative |
| "must not be used" | "MUST NOT be used" | Missing capitalization |
| "MUST read the documentation" | "should read the documentation" | Overuse of MUST |
| "may or may not" | "MAY" or explicit prose | Ambiguous |

### Abstract

| Wrong | Right |
|-------|-------|
| "See Section 3 for details" | Self-contained description |
| "TLS" without expansion | "Transport Layer Security (TLS)" |
| "[RFC9110]" citation | Remove citations from abstract |
| > 200 words | Condense to essential description |

### References

| Wrong | Right |
|-------|-------|
| `[1]` numeric reference | `[RFC2119]` mnemonic tag |
| "see page 15" | "see Section 3.2" |
| I-D without version | `draft-name-07` with version |
| Mixed normative/informative | Separate sections |

### Security Considerations

| Wrong | Right |
|-------|-------|
| "No security considerations" | Never acceptable |
| Generic boilerplate | Protocol-specific analysis |
| Lists attacks without mitigations | Include countermeasures |
| Missing threat model | State attacker capabilities |

### IANA Considerations

| Wrong | Right |
|-------|-------|
| Missing when creating values | Add complete registration |
| TBD in final submission | Resolve before publication |
| Wrong registry name | Verify exact name in IANA |
| Missing registration policy | Specify per RFC 8126 |

### Formatting

| Wrong | Right |
|-------|-------|
| Lines > 72 chars in diagrams | Reformat to fit |
| Tabs in source | Convert to spaces |
| Non-ASCII without declaration | Use ASCII or declare UTF-8 |
| Inconsistent indentation | Use consistent spacing |

---

## Reference Documents

See the `references/` directory for:

- **[common-rfcs-to-cite.md](references/common-rfcs-to-cite.md)** — Copy-paste reference entries
- **[iana-registration-templates.md](references/iana-registration-templates.md)** — IANA section templates  
- **[section-templates.md](references/section-templates.md)** — Boilerplate for common sections

---

## External Resources

- **RFC Style Guide**: https://www.rfc-editor.org/styleguide/
- **I-D Guidelines**: https://www.ietf.org/standards/ids/guidelines/
- **Publication Process**: https://www.rfc-editor.org/pubprocess/
- **Independent Submissions**: https://www.rfc-editor.org/about/independent/
- **IETF Author Tools**: https://author-tools.ietf.org/
- **Datatracker**: https://datatracker.ietf.org/
