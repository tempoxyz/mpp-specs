# IANA Registration Templates

Copy-paste templates for common IANA registrations in IETF submissions.

## Registration Policies (RFC 8126)

Choose the appropriate policy for your registry:

| Policy | Meaning | Use When |
|--------|---------|----------|
| Private Use | Not registered | Local/experimental values |
| First Come First Served | Any request granted | Low-risk, high-volume |
| Expert Review | Designated expert approves | Moderate risk |
| Specification Required | Publicly available spec needed | Most protocol registries |
| RFC Required | Must be in an RFC | High-assurance registries |
| IETF Review | IETF consensus needed | Core protocol parameters |
| Standards Action | Standards Track RFC | Highest assurance |

---

## HTTP Authentication Scheme

```markdown
### X.1. Authentication Scheme Registration

This document registers the "[SCHEME]" authentication scheme in the
"Hypertext Transfer Protocol (HTTP) Authentication Scheme Registry"
established by [RFC7235]:

- **Authentication Scheme Name**: [Scheme]
- **Reference**: This document, Section Y
- **Notes**: [Brief description of usage]
```

**Example:**

```markdown
### 13.1. Authentication Scheme Registration

This document registers the "Payment" authentication scheme in the
"Hypertext Transfer Protocol (HTTP) Authentication Scheme Registry"
established by [RFC7235]:

- **Authentication Scheme Name**: Payment
- **Reference**: This document, Section 5
- **Notes**: Used with HTTP 402 status code for proof-of-payment flows
```

---

## HTTP Header Field

```markdown
### X.2. Header Field Registration

This document registers the following header fields in the "Hypertext
Transfer Protocol (HTTP) Field Name Registry":

| Field Name | Status | Reference |
|------------|--------|-----------|
| [Header-Name] | permanent | This document, Section Y |
```

**Example:**

```markdown
### 13.2. Header Field Registration

This document registers the following header fields in the "Hypertext
Transfer Protocol (HTTP) Field Name Registry":

| Field Name | Status | Reference |
|------------|--------|-----------|
| Payment-Receipt | permanent | This document, Section 5.3 |
| Payment-Authorization | permanent | This document, Section 5.4 |
```

---

## Well-Known URI

```markdown
### X.3. Well-Known URI Registration

This document registers the following well-known URI in the "Well-Known
URIs" registry established by [RFC8615]:

- **URI Suffix**: [suffix]
- **Change Controller**: IETF
- **Reference**: This document, Section Y
- **Status**: permanent
- **Related Information**: [Optional notes]
```

**Example:**

```markdown
### 13.5. Well-Known URI Registration

This document registers the following well-known URI in the "Well-Known
URIs" registry established by [RFC8615]:

- **URI Suffix**: payment
- **Change Controller**: IETF
- **Reference**: This document, Section 9.1
- **Status**: permanent
- **Related Information**: None
```

---

## New Registry Creation

```markdown
### X.4. [Registry Name] Registry

This document establishes the "[Registry Name]" registry. This registry
uses the "[Policy]" policy defined in [RFC8126].

#### X.4.1. Registration Template

Registration requests must include:

- **[Field 1]**: [Description]
- **[Field 2]**: [Description]
- **Reference**: Reference to the specification document
- **Contact**: Contact information for the registrant

#### X.4.2. Initial Registry Contents

| [Field 1] | [Field 2] | Reference | Contact |
|-----------|-----------|-----------|---------|
| [value]   | [value]   | This document | [contact] |
```

**Example:**

```markdown
### 13.3. Payment Method Registry

This document establishes the "HTTP Payment Methods" registry. This
registry uses the "Specification Required" policy defined in [RFC8126].

#### 13.3.1. Registration Template

Registration requests must include:

- **Method Identifier**: Unique lowercase ASCII string
- **Description**: Brief description of the payment method
- **Reference**: Reference to the specification document
- **Contact**: Contact information for the registrant

#### 13.3.2. Initial Registry Contents

| Identifier | Description | Reference | Contact |
|------------|-------------|-----------|---------|
| `tempo` | Tempo Network | [Tempo Payment Method] | jake@tempo.xyz |
| `lightning` | Bitcoin Lightning Network | [Lightning Payment Method] | TBD |
```

---

## Media Type Registration

```markdown
### X.5. Media Type Registration

This document registers the "[type/subtype]" media type:

- **Type name**: [type]
- **Subtype name**: [subtype]
- **Required parameters**: [None / list]
- **Optional parameters**: [None / list]
- **Encoding considerations**: [binary / 8bit / etc.]
- **Security considerations**: See Section Y of this document
- **Interoperability considerations**: [Notes]
- **Published specification**: This document
- **Applications that use this media type**: [List]
- **Fragment identifier considerations**: [Notes]
- **Additional information**:
  - **Magic number(s)**: [None / values]
  - **File extension(s)**: [.ext]
  - **Macintosh file type code(s)**: [None / values]
- **Person & email address to contact for further information**: [Contact]
- **Intended usage**: COMMON
- **Restrictions on usage**: [None / notes]
- **Author**: [Author name]
- **Change controller**: IETF
```

---

## URI Scheme Registration

```markdown
### X.6. URI Scheme Registration

This document registers the "[scheme]" URI scheme per [RFC7595]:

- **Scheme name**: [scheme]
- **Status**: [Permanent / Provisional]
- **Applications/protocols that use this scheme**: [Description]
- **Contact**: [Contact info]
- **Change controller**: [IETF / other]
- **Reference**: This document, Section Y
```

---

## No IANA Actions

If your document truly has no IANA considerations:

```markdown
## X. IANA Considerations

This document has no IANA actions.
```

**Note:** This statement is typically removed by RFC Editor in the final
published RFC. Include it in drafts to explicitly indicate you've
considered IANA requirements.

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Missing policy | Unclear how to register | Specify RFC 8126 policy |
| TBD not resolved | Blocks publication | Get actual values before final |
| Wrong registry name | Registration fails | Verify exact registry name |
| Missing Contact | Incomplete registration | Add email contact |
| No initial values | Empty registry | Add at least one initial entry |
