---
name: markdown-to-xml2rfc
description: Converts Markdown documents to xml2rfc v3 format (RFC 7991). Use when converting spec markdown files to XML for RFC/Internet-Draft submission.
metadata:
  id: SKILL-32904
requires:
  - SKILL-A3743  # writing-ietf-w3c-specs
---

# Markdown to xml2rfc Converter

Converts Markdown documents to xml2rfc v3 vocabulary as defined in [RFC 7991](https://www.rfc-editor.org/rfc/rfc7991).

## Quick Start

Use the `md2rfc` tool located at `tools/md2rfc` (relative to this skill).

### Usage

```bash
# 1. Convert Markdown to XML
bun .agents/skills/markdown-to-xml2rfc/tools/md2rfc/src/Cli.ts draft-ietf-httpauth-payment.md

# 2. Generate output formats with xml2rfc
xml2rfc --text --html draft-ietf-httpauth-payment.xml
```

## XML to Output Formats (xml2rfc CLI)

Use the [xml2rfc](https://github.com/ietf-tools/xml2rfc) CLI to convert XML to text, HTML, or PDF.

### Installation

```bash
# Basic install
pip install xml2rfc

# With PDF support
pip install 'xml2rfc[pdf]'

# Or using pipx
pipx install xml2rfc
```

### Output Formats

```bash
# Text output (RFC canonical format)
xml2rfc --text draft.xml

# HTML output
xml2rfc --html draft.xml

# PDF output (requires pdf extra + fonts)
xml2rfc --pdf draft.xml

# Multiple formats at once
xml2rfc --text --html draft.xml

# Specify output filename
xml2rfc --text -o draft.txt draft.xml
```

### Common Options

```bash
# Validate v3 XML without generating output
xml2rfc --v3 --check draft.xml

# Convert v2 to v3 XML
xml2rfc --v2v3 draft-v2.xml -o draft-v3.xml

# Run preptool (prepare for submission)
xml2rfc --preptool draft.xml

# Quiet mode (suppress warnings)
xml2rfc --quiet --text draft.xml

# Show all options
xml2rfc --help
```

### Docker Usage

```bash
# Using slim image (no PDF)
docker run --rm -v $(pwd):/data ghcr.io/ietf-tools/xml2rfc-slim xml2rfc --text /data/draft.xml

# Using base image (with PDF)
docker run --rm -v $(pwd):/data ghcr.io/ietf-tools/xml2rfc-base xml2rfc --pdf /data/draft.xml
```

### Full Pipeline: Markdown → XML → TXT

```bash
# 1. Convert markdown to XML (manual or using this skill)
# 2. Generate text output
xml2rfc --text --v3 draft.xml -o draft.txt

# 3. Validate
xml2rfc --check draft.xml
```

### Online Tools

- **Author Tools**: https://author-tools.ietf.org/ - Web-based xml2rfc
- **Datatracker**: https://datatracker.ietf.org/ - Submit drafts

## Reference

See [references/rfc7991-elements.md](references/rfc7991-elements.md) for complete element reference.
