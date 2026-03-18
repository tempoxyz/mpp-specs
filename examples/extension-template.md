---
title: "{Feature}" Extension for HTTP Payment Authentication
abbrev: "{Feature}" Extension
docname: draft-payment-{feature}-00
version: 00
category: info
ipr: noModificationTrust200902
submissiontype: IETF
consensus: true

author:
  - name: Your Name
    ins: Y. Name
    email: you@example.com
    org: Your Organization
---

## Abstract

This document defines the "{feature}" extension for the Payment HTTP
Authentication Scheme [I-D.httpauth-payment]. It specifies [one-sentence
description of what this extension provides].

## Status of This Memo

This Internet-Draft is submitted in full conformance with the provisions
of BCP 78 and BCP 79.

## Copyright Notice

Copyright (c) 2025 IETF Trust and the persons identified as the document
authors. All rights reserved.

## Table of Contents

1. [Introduction](#1-introduction)
2. [Requirements Language](#2-requirements-language)
3. [Extension Overview](#3-extension-overview)
4. [Specification](#4-specification)
5. [Security Considerations](#5-security-considerations)
6. [IANA Considerations](#6-iana-considerations)
7. [References](#7-references)
8. [Authors' Addresses](#authors-addresses)

---

## 1. Introduction

[Describe the problem this extension solves]

This extension is OPTIONAL. Servers MAY implement this extension to
[benefit]. Clients MUST NOT require this extension to function.

### 1.1. Motivation

[Why is this extension needed? What use cases does it enable?]

### 1.2. Scope

This extension:

- DOES: [What it does]
- DOES NOT: [What it explicitly doesn't do]

### 1.3. Relationship to Core Specification

This document extends [I-D.httpauth-payment]. Implementations of this
extension MUST also implement the core specification.

---

## 2. Requirements Language

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and
"OPTIONAL" in this document are to be interpreted as described in
BCP 14 [RFC2119] [RFC8174] when, and only when, they appear in all
capitals, as shown here.

---

## 3. Extension Overview

### 3.1. Architecture

[Describe how this extension fits into the overall architecture]

```
   Client                           Server
      │                                │
      │  [Diagram showing extension    │
      │   interaction with core        │
      │   protocol]                    │
      │                                │
```

### 3.2. Capabilities

This extension provides:

1. **Capability 1**: Description
2. **Capability 2**: Description
3. **Capability 3**: Description

---

## 4. Specification

### 4.1. [Component 1]

[Detailed specification of component 1]

#### 4.1.1. Request

[If applicable]

#### 4.1.2. Response

[If applicable]

#### 4.1.3. Example

```http
[Example request/response]
```

### 4.2. [Component 2]

[Detailed specification of component 2]

### 4.3. Error Handling

[How errors are handled in this extension]

---

## 5. Security Considerations

### 5.1. [Security Topic 1]

[Describe security consideration and mitigation]

### 5.2. [Security Topic 2]

[Describe security consideration and mitigation]

### 5.3. Privacy Considerations

[If applicable, describe privacy implications]

---

## 6. IANA Considerations

[If this extension requires IANA registrations, describe them]

### 6.1. [Registration Type]

This document registers the following in the "[Registry Name]" registry:

| Field | Value |
|-------|-------|
| Name | Value |
| Reference | This document |

---

## 7. References

### 7.1. Normative References

- **[RFC2119]** Bradner, S., "Key words for use in RFCs to Indicate
  Requirement Levels", BCP 14, RFC 2119, March 1997.

- **[RFC8174]** Leiba, B., "Ambiguity of Uppercase vs Lowercase in
  RFC 2119 Key Words", BCP 14, RFC 8174, May 2017.

- **[I-D.httpauth-payment]** Moxey, J., "The 'Payment' HTTP Authentication
  Scheme", draft-httpauth-payment-00.

### 7.2. Informative References

[Add any informative references]

---

## Authors' Addresses

Your Name
Your Organization
Email: you@example.com
