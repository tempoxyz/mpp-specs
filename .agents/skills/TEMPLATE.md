# Skill Template

Use this template when creating new skills. Skills follow the [Agent Skills Specification](https://agentskills.io/specification).

## Generating the Skill ID

The skill ID is derived from the skill name using keccak256:

```bash
cast keccak "<skill-name>" | cut -c3-7 | tr 'a-f' 'A-F'
```

Format: `SKILL-{first 5 hex chars of keccak256(name)}`

Example:
```bash
$ cast keccak "my-new-skill" | cut -c3-7 | tr 'a-f' 'A-F'
# Output: 1A2B3
# Skill ID: SKILL-1A2B3
```

---

## SKILL.md Template

```yaml
---
name: my-skill-name
description: A clear description of what this skill does and when to use it. Include keywords that help agents identify relevant tasks.
metadata:
  id: SKILL-XXXXX
requires:  # optional - list skill IDs this skill depends on
  - SKILL-89260  # tempo-developer
  - SKILL-A3743  # writing-ietf-w3c-specs
---
```

### Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | 1-64 chars, lowercase alphanumeric + hyphens, must match directory name |
| `description` | Yes | 1-1024 chars, describe what the skill does and when to use it |
| `metadata.id` | Yes* | `SKILL-{keccak256(name)[0:5]}` (*our extension) |
| `requires` | No | List of skill IDs this skill depends on (*our extension) |
| `license` | No | License name or reference to bundled license file |
| `compatibility` | No | Environment requirements (1-500 chars) |
| `allowed-tools` | No | Space-delimited list of pre-approved tools |

### Body Content

After the frontmatter, write markdown instructions for the agent. Recommended sections:

- Overview/context
- Step-by-step instructions
- Examples
- Common edge cases
- References to scripts/assets

Keep under 500 lines. Move detailed reference material to `references/` directory.

---

## Directory Structure

```
my-skill-name/
├── SKILL.md              # Required - main skill file
├── scripts/              # Optional - executable scripts
├── references/           # Optional - additional documentation
└── assets/               # Optional - templates, images, data files
```

---

## Existing Skills

| Skill | ID | Description |
|-------|-----|-------------|
| `402-protocol-developer` | `SKILL-D9B5F` | HTTP 402 payment protocol extensions |
| `tempo-developer` | `SKILL-89260` | Tempo blockchain EVM development |
| `writing-ietf-w3c-specs` | `SKILL-A3743` | IETF RFC and W3C specifications |
