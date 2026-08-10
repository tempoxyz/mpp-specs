# 📜 MPP Specification & Schema Validator Suite

An automated schema validation toolkit, header generator, and interactive Web Studio for **Machine Payments Protocol (MPP)** specifications co-authored by **Stripe** and **Tempo**.

---

## 🌟 Features

- 🔍 **RFC Header Validator**: Verify `WWW-Authenticate`, `Authorization`, and `Payment-Receipt` headers against the MPP specification.
- 📦 **Intent & Method Inspector**: Validate `charge`, `stream`, and `session` intent schemas.
- 🌐 **Interactive Web Studio**: Real-time header validator, intent explorer, and header generator on `http://localhost:3408`.
- ⌨️ **Universal CLI (`mpp-specs-cli`)**: Terminal utility for validation and compliant header generation.

---

## 🚀 Quickstart

```bash
# Launch Specs Web Studio
npm start
# Open http://localhost:3408

# Or use CLI
node bin/mpp-specs-cli.js validate
node bin/mpp-specs-cli.js gen challenge
```
