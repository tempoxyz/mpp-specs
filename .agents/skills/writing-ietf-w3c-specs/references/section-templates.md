# Section Templates

Copy-paste templates for common RFC sections.

## Requirements Language (Section 2)

```markdown
## 2. Requirements Language

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and
"OPTIONAL" in this document are to be interpreted as described in
BCP 14 [RFC2119] [RFC8174] when, and only when, they appear in all
capitals, as shown here.
```

---

## Terminology (Section 3)

```markdown
## 3. Terminology

**[Term 1]**
: [Definition of term 1, written as a sentence.]

**[Term 2]**
: [Definition of term 2, written as a sentence.]

**[Term 3]**
: [Definition of term 3, which may reference [Term 1] or other
  defined terms.]
```

**Example:**

```markdown
## 3. Terminology

**Payment Challenge**
: A `WWW-Authenticate` header with scheme "Payment" indicating the
  payment requirements for accessing a resource.

**Payment Credential**
: An `Authorization` header with scheme "Payment" containing payment
  authorization data.

**Payment Method**
: A mechanism for transferring value, identified by a registered
  identifier (e.g., "tempo", "lightning", "solana").
```

---

## Security Considerations

### Full Template

```markdown
## N. Security Considerations

### N.1. Threat Model

This specification assumes:

- Attackers can observe all network traffic
- Attackers can inject, modify, or replay messages
- Attackers may control malicious servers or clients

### N.2. Transport Security

Implementations MUST use TLS 1.3 [RFC8446] or later when transmitting
[protocol] messages. [Protocol] credentials contain sensitive
authorization data that could result in [harm] if intercepted.

Servers MUST NOT issue [challenges/tokens] over unencrypted HTTP.
Clients MUST NOT send [credentials] over unencrypted HTTP.

### N.3. Authentication

[How parties authenticate each other]

### N.4. Replay Protection

[How the protocol prevents replay attacks: nonces, timestamps, etc.]

### N.5. Denial of Service

Servers SHOULD implement rate limiting on:

- [Resource 1]
- [Resource 2]

### N.6. Privacy

- Servers MUST NOT require [unnecessary user data]
- [Protocol] methods SHOULD support pseudonymous [operations]
- Servers SHOULD NOT log [sensitive data] in plaintext

### N.7. Caching

Servers SHOULD send appropriate cache-control headers:

```http
HTTP/1.1 [status]
Cache-Control: no-store
```
```

### Minimal Template

```markdown
## N. Security Considerations

### N.1. Transport Security

All communication MUST use TLS 1.3 [RFC8446] or later.

### N.2. [Protocol-Specific Concern]

[Address the primary security concern for your protocol]

### N.3. Denial of Service

Implementations SHOULD implement rate limiting to prevent resource
exhaustion attacks.
```

---

## IANA Considerations

### With Registrations

```markdown
## N. IANA Considerations

### N.1. [Registry Type] Registration

This document registers the following in the "[Registry Name]"
established by [RFC####]:

- **[Field 1]**: [Value]
- **Reference**: This document, Section X
- **Notes**: [Optional]

### N.2. [New Registry Name]

This document establishes the "[New Registry]" registry.

This registry uses the "Specification Required" policy defined in
[RFC8126].

Registration requests must include:

- **[Field 1]**: [Description]
- **[Field 2]**: [Description]
- **Reference**: Reference to specification
- **Contact**: Contact information

Initial registry contents:

| [Field 1] | [Field 2] | Reference | Contact |
|-----------|-----------|-----------|---------|
| [value]   | [desc]    | This doc  | [email] |
```

### No Actions

```markdown
## N. IANA Considerations

This document has no IANA actions.
```

---

## Internationalization Considerations

```markdown
## N. Internationalization Considerations

### N.1. Character Encoding

All string values in [protocol] use UTF-8 encoding [RFC3629]:

- [Component 1] payloads are JSON [RFC8259], which mandates UTF-8
- [Identifier type] are restricted to ASCII [subset]
- [Human-readable fields] may contain UTF-8 text

### N.2. Human-Readable Text

The `[field]` parameter and error messages may contain localized text.
Servers SHOULD use the `Accept-Language` request header [RFC9110] to
determine the appropriate language for human-readable content.

### N.3. [Protocol]-Specific Considerations

[Any protocol-specific i18n requirements]
```

---

## Abstract

### Template

```markdown
## Abstract

This document defines [what it defines], enabling [capability]. The
[protocol/mechanism] [key feature 1] and [key feature 2].

[Optional: Brief mention of relationship to other specs or scope
limitations.]
```

### Example

```markdown
## Abstract

This document defines the "Payment" HTTP authentication scheme, enabling
HTTP resources to require a payment challenge to be fulfilled before
access. The scheme extends HTTP Authentication, using the HTTP 402
"Payment Required" status code.

The protocol is payment-method agnostic, supporting any payment network
or currency through registered payment method identifiers.
```

---

## Introduction

### Template

```markdown
## 1. Introduction

[Problem statement: What problem does this solve?]

[Solution overview: How does this specification solve it?]

### 1.1. Relationship to Other Specifications

This specification [updates/extends/complements] [other spec]. It
defines [specific aspect] while [other spec] handles [other aspect].

### 1.2. Document Structure

Section 2 defines [topic]. Section 3 describes [topic]. [Continue for
major sections.]
```

### Example

```markdown
## 1. Introduction

HTTP 402 "Payment Required" was reserved in HTTP/1.1 [RFC9110] for
future use but never standardized. This specification defines the
"Payment" authentication scheme that gives 402 its semantics, enabling
resources to require a payment challenge to be fulfilled before access.

### 1.1. Relationship to Payment Method Specifications

This specification defines the abstract protocol framework. Concrete
payment methods are defined in payment method specifications that:

- Register a payment method identifier
- Define the `WWW-Authenticate` format for that method
- Define the `Authorization` format for that method
- Specify verification procedures
```

---

## References Sections

```markdown
## N. References

### N.1. Normative References

[RFC2119]  Bradner, S., "Key words for use in RFCs to Indicate
           Requirement Levels", BCP 14, RFC 2119,
           DOI 10.17487/RFC2119, March 1997,
           <https://www.rfc-editor.org/info/rfc2119>.

[RFC8174]  Leiba, B., "Ambiguity of Uppercase vs Lowercase in
           RFC 2119 Key Words", BCP 14, RFC 8174,
           DOI 10.17487/RFC8174, May 2017,
           <https://www.rfc-editor.org/info/rfc8174>.

### N.2. Informative References

[REST]     Fielding, R.T., "Architectural Styles and the Design of
           Network-based Software Architectures", Doctoral
           Dissertation, University of California, Irvine,
           September 2000.
```

---

## Appendix: Collected ABNF

```markdown
## Appendix A: ABNF Collected

This appendix collects all ABNF defined in this document per [RFC5234].
Core rules (ALPHA, DIGIT, SP, HTAB, etc.) are imported from [RFC9110],
[RFC7235], and [RFC6750].

```abnf
; [Component 1]
rule-1 = element1 element2
rule-2 = alternative1 / alternative2

; [Component 2]
rule-3 = *element
rule-4 = 1*element
```
```

---

## Authors' Addresses

```markdown
## Authors' Addresses

[Author Name]
[Organization]
Email: [email]

[Author 2 Name]
[Organization 2]
[Street Address]
[City], [Region] [Postal Code]
[Country]
Phone: [phone]
Email: [email]
URI: [website]
```
