# The "Payment" HTTP Authentication Scheme

This repository contains the specification for the "Payment" HTTP Authentication Scheme ([draft-ietf-httpauth-payment](draft-ietf-httpauth-payment.md)).

## Build

Generate output artifacts in `out/`:

```bash
# Install xml2rfc
pip install xml2rfc

# Convert Markdown to XML.
npx md2rfc draft-ietf-httpauth-payment.md -o out/draft-ietf-httpauth-payment.xml && xml2rfc --text --html out/draft-ietf-httpauth-payment.xml
```

## Agent Skills

The `.agents/skills/` directory contains agent skills for working with this project:

| Skill | Description |
|-------|-------------|
| [`payment-auth-scheme-author`](.agents/skills/payment-auth-scheme-author/) | Author/extend the Payment scheme specification |
| [`writing-ietf-w3c-specs`](.agents/skills/writing-ietf-w3c-specs/) | Write specs in IETF RFC/W3C style |
| [`markdown-to-xml2rfc`](.agents/skills/markdown-to-xml2rfc/) | Convert markdown to xml2rfc format |
| [`tempo-developer`](.agents/skills/tempo-developer/) | Low-level EVM development for Tempo |

Skills are loaded automatically by Amp when relevant tasks are detected.