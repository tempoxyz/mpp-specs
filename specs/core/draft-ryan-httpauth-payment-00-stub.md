---
title: The "Payment" HTTP Authentication Scheme
abbrev: Payment Auth Scheme
docname: draft-ryan-httpauth-payment-00
version: 00
category: exp
ipr: trust200902
submissiontype: independent
consensus: false

author:
  - name: Brendan Ryan
    ins: B. Ryan
    email: brendan@tempo.xyz
    org: Tempo Labs
  - name: Jake Moxey
    ins: J. Moxey
    email: jake@tempo.xyz
    org: Tempo Labs
  - name: Tom Meagher
    ins: T. Meagher
    email: thomas@tempo.xyz
    org: Tempo Labs
  - name: Jeff Weinstein
    ins: J. Weinstein
    email: jweinstein@stripe.com
    org: Stripe
  - name: Steve Kaliski
    ins: S. Kaliski
    email: stevekaliski@stripe.com
    org: Stripe

normative:
  RFC2119:
  RFC8174:
  RFC9110:
---

--- abstract

This document defines the "Payment" HTTP authentication scheme,
enabling HTTP resources to require a payment challenge to be
fulfilled before access. The scheme uses the HTTP 402 "Payment
Required" status code with the WWW-Authenticate and Authorization
headers to negotiate payment between clients and servers.

The protocol is payment-method agnostic; specific payment methods
are defined in separate specifications.

--- middle

# Introduction

HTTP 402 "Payment Required" was reserved in HTTP/1.1 {{RFC9110}}
for future use but never standardized. This specification defines
the "Payment" authentication scheme that gives 402 concrete
semantics.

A server requiring payment responds with 402 and a
`WWW-Authenticate: Payment` challenge describing the payment
requirements. The client fulfills the payment and retries with
an `Authorization: Payment` credential. The server verifies the
credential and grants access.

Payment methods, intents, and protocol details are defined in
subsequent revisions of this document and companion
specifications.

# Requirements Language

{::boilerplate bcp14-tagged}

# Security Considerations

Payment credentials authorize financial transactions and MUST
be treated as sensitive bearer tokens. Implementations MUST use
TLS for all Payment authentication flows. Detailed security
analysis will be provided in a future revision.

# IANA Considerations

This document registers the "Payment" authentication scheme in
the "Hypertext Transfer Protocol (HTTP) Authentication Scheme
Registry" established by {{RFC9110}}:

- **Authentication Scheme Name**: Payment
- **Reference**: This document
- **Notes**: Used with HTTP 402 for proof-of-payment flows

Future revisions will request creation of additional registries
for payment methods and payment intents.

--- back

# Acknowledgements

TBD
