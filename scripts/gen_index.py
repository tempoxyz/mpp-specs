#!/usr/bin/env python3
"""Generate index.html for IETF Payment Auth specs using Jinja2 templating."""

import re
from pathlib import Path

from jinja2 import Environment, FileSystemLoader


# Domain folder configuration
# Nested domains use "/" separator (e.g., "methods/stripe")
DOMAINS = [
    {"folder": "core", "name": "Core"},
    {"folder": "extensions", "name": "Extensions"},
    {"folder": "intents", "name": "Intents"},
    {"folder": "methods/stripe", "name": "Payment_Methods/Stripe"},
    {"folder": "methods/tempo", "name": "Payment_Methods/Tempo"},
    {"folder": "extensions/transports", "name": "Transports"},
]

# Category display names (IETF document categories)
CATEGORIES = {
    "std": "Standards Track",
    "info": "Informational",
    "exp": "Experimental",
    "bcp": "Best Current Practice",
}


def capitalize_title(title: str) -> str:
    """Capitalize the first letter of the title, handling quoted words."""
    if not title:
        return title
    # Handle titles starting with quoted word like "authorize"
    if title.startswith('"') and len(title) > 1:
        # Find the closing quote and capitalize the first letter inside
        return '"' + title[1].upper() + title[2:]
    return title[0].upper() + title[1:]


def parse_frontmatter(md_path: Path) -> dict:
    """Extract YAML frontmatter from a markdown file.

    Uses regex for fields that may have problematic quoting (like title),
    and YAML for structured fields.
    """
    content = md_path.read_text()
    match = re.match(r"^---\n(.*?)\n---", content, re.DOTALL)
    if not match:
        return {}

    frontmatter = match.group(1)
    result = {}

    # Extract title using regex (handles unquoted strings with internal quotes)
    title_match = re.search(r"^title:\s*(.+)$", frontmatter, re.MULTILINE)
    if title_match:
        title = title_match.group(1).strip()
        # Remove wrapping quotes if present
        if (title.startswith('"') and title.endswith('"')) or \
           (title.startswith("'") and title.endswith("'")):
            title = title[1:-1]
        result["title"] = capitalize_title(title)

    # Extract other simple fields using regex (safer than YAML for mixed content)
    for field in ["docName", "category", "version"]:
        field_match = re.search(rf"^{field}:\s*(.+)$", frontmatter, re.MULTILINE)
        if field_match:
            result[field] = field_match.group(1).strip()

    # Extract authors (YAML list structure)
    authors = []
    author_pattern = re.compile(
        r"-\s*fullname:\s*(.+?)$.*?(?:email:\s*(.+?)$)?.*?(?:organization:\s*(.+?)$)?",
        re.MULTILINE | re.DOTALL
    )
    # Find the author block
    author_block = re.search(r"^author:\s*\n((?:\s+-.*?(?:\n|$))+)", frontmatter, re.MULTILINE)
    if author_block:
        # Parse each author entry
        for author_match in re.finditer(r"-\s*fullname:\s*(.+)", author_block.group(1)):
            fullname = author_match.group(1).strip()
            authors.append({"fullname": fullname})
    result["authors"] = authors

    return result


def extract_version(doc_name: str) -> str | None:
    """Extract version number from docName (e.g., draft-foo-00 -> 00)."""
    match = re.search(r"-(\d+)$", doc_name)
    return match.group(1) if match else None


def determine_maturity(meta: dict) -> dict:
    """Determine document maturity from metadata.

    Returns dict with:
      - label: Display text (e.g., "Draft -00", "RFC 9999")
      - level: Maturity level for styling (draft, proposed, rfc)
      - category: Full category name
    """
    doc_name = meta.get("docName", "")
    category = meta.get("category", "std")

    # Check if it's an RFC (future support)
    if doc_name.lower().startswith("rfc"):
        rfc_num = re.search(r"rfc[- ]?(\d+)", doc_name, re.IGNORECASE)
        return {
            "label": f"RFC {rfc_num.group(1)}" if rfc_num else "RFC",
            "level": "rfc",
            "category": CATEGORIES.get(category, category),
        }

    # It's a draft
    version = extract_version(doc_name)
    version_str = f"-{version}" if version else ""

    return {
        "label": f"Draft {version_str}",
        "level": "draft",
        "category": CATEGORIES.get(category, category),
    }


def collect_specs(specs_dir: Path) -> list[dict]:
    """Collect all specs organized by domain."""
    domains = []

    for domain_config in DOMAINS:
        domain_path = specs_dir / domain_config["folder"]
        if not domain_path.exists():
            continue

        specs = []
        for md_file in sorted(domain_path.glob("draft-*.md")):
            meta = parse_frontmatter(md_file)
            name = md_file.stem

            specs.append({
                "name": name,
                "title": meta.get("title", name),
                "maturity": determine_maturity(meta),
                "category": meta.get("category", "std"),
                "doc_name": meta.get("docName", name),
                "authors": meta.get("authors", []),
            })

        if specs:
            domains.append({
                "folder": domain_config["folder"],
                "name": domain_config["name"],
                "specs": specs,
            })

    return domains


def main():
    # Determine paths (handle both local and Docker environments)
    if Path("/data/specs").exists():
        # Docker environment
        specs_dir = Path("/data/specs")
        output_dir = Path("/data/artifacts")
        template_dir = Path("/data/scripts/templates")
        site_public_dir = Path("/data/site/public")
    else:
        # Local environment
        script_dir = Path(__file__).parent
        root_dir = script_dir.parent
        specs_dir = root_dir / "specs"
        output_dir = root_dir / "artifacts"
        template_dir = script_dir / "templates"
        site_public_dir = root_dir / "site" / "public"

    output_dir.mkdir(exist_ok=True)
    site_public_dir.mkdir(exist_ok=True)

    # Collect spec metadata
    domains = collect_specs(specs_dir)

    # Render template
    env = Environment(loader=FileSystemLoader(template_dir), autoescape=True)
    template = env.get_template("index.html.j2")

    html = template.render(domains=domains)

    # Write output
    output_path = output_dir / "index.html"
    output_path.write_text(html)
    print(f"Generated {output_path}")

    # Create symlink in site/public
    site_link = site_public_dir / "index.html"
    site_link.unlink(missing_ok=True)
    site_link.symlink_to("../../artifacts/index.html")
    print(f"Linked {site_link} -> ../../artifacts/index.html")


if __name__ == "__main__":
    main()
