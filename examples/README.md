# Specification Templates

This directory contains templates for each type of specification in the Payment HTTP Auth ecosystem.

## Templates

| Template | Track | Use When |
|----------|-------|----------|
| [intent-template.md](intent-template.md) | Standards Track | Defining a new payment intent |
| [method-template.md](method-template.md) | Informational | Adding support for a payment network |
| [extension-template.md](extension-template.md) | Informational | Adding optional protocol extensions |

## Required Sections by Track

### Standards Track (Core, Intents)

```
├── Abstract                    # REQUIRED
├── Status of This Memo         # REQUIRED (boilerplate)
├── Copyright Notice            # REQUIRED (boilerplate)
├── Table of Contents           # REQUIRED
├── Introduction                # REQUIRED
├── Requirements Language       # REQUIRED (RFC 2119)
├── Terminology                 # RECOMMENDED
├── [Technical Sections]        # REQUIRED
├── Security Considerations     # REQUIRED
├── IANA Considerations         # REQUIRED
├── References                  # REQUIRED
│   ├── Normative References
│   └── Informative References
└── Authors' Addresses          # REQUIRED
```

### Informational (Methods, Extensions)

```
├── Abstract                    # REQUIRED
├── Status of This Memo         # REQUIRED (boilerplate)
├── Copyright Notice            # REQUIRED (boilerplate)
├── Table of Contents           # REQUIRED
├── Introduction                # REQUIRED
├── Requirements Language       # RECOMMENDED
├── [Technical Sections]        # REQUIRED
├── Security Considerations     # REQUIRED
├── IANA Considerations         # REQUIRED (if registering identifiers)
├── References                  # REQUIRED
└── Authors' Addresses          # REQUIRED
```

## Frontmatter Fields

```yaml
---
title: Document Title
docName: draft-author-topic-00        # Versioned document name
version: 00                           # Current version
category: std | info | exp            # IETF track
ipr: trust200902                      # IPR declaration
submissionType: IETF                  # Submission type
consensus: true                       # WG consensus required

author:
  - fullname: Author Name
    email: author@example.com
    organization: Organization Name
---
```

## Category Values

| Value | Track | Use For |
|-------|-------|---------|
| `std` | Standards Track | Core spec, intents |
| `info` | Informational | Methods, extensions |
| `exp` | Experimental | Early-stage ideas |

## Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Core | `draft-httpauth-payment-XX` | `draft-httpauth-payment-00` |
| Intent | `draft-payment-intent-{name}-XX` | `draft-payment-intent-charge-00` |
| Method | `draft-{network}-payment-method-XX` | `draft-tempo-payment-method-00` |
| Extension | `draft-payment-{feature}-XX` | `draft-payment-discovery-00` |
