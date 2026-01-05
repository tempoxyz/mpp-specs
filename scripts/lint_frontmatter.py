#!/usr/bin/env python3
"""Lint YAML frontmatter in IETF markdown specs for consistency."""

import sys
from pathlib import Path

import frontmatter

REQUIRED_FIELDS = ["title", "abbrev", "docname", "version", "category", "ipr", "submissiontype", "consensus", "author"]
AUTHOR_FIELD_ORDER = ["name", "ins", "email", "org"]

ID_HTTPAUTH_PAYMENT_TITLE = "The 'Payment' HTTP Authentication Scheme"


def lint_file(path: Path) -> list[str]:
    """Lint a single file and return list of errors."""
    errors = []
    post = frontmatter.load(path)
    meta = post.metadata

    # Check required fields
    for field in REQUIRED_FIELDS:
        if field not in meta:
            errors.append(f"missing required field '{field}'")

    # Check version format (two-digit string like "00", "01", … or int 0)
    version = meta.get("version")
    if not (isinstance(version, int) and 0 <= version <= 99) and not (
        isinstance(version, str) and len(version) == 2 and version.isdigit()
    ):
        errors.append(f"version should be a two-digit revision (e.g. '00'), got '{version}'")

    # Check title starts with capital letter
    title = meta.get("title", "")
    if title and title[0].islower():
        errors.append(f"title should start with capital letter: '{title[:30]}...'")

    # Check author field order
    authors = meta.get("author", [])
    for i, author in enumerate(authors):
        if not isinstance(author, dict):
            continue
        keys = list(author.keys())
        expected = [k for k in AUTHOR_FIELD_ORDER if k in keys]
        actual = [k for k in keys if k in AUTHOR_FIELD_ORDER]
        if actual != expected:
            errors.append(f"author[{i}] field order should be {expected}, got {actual}")

    # Check I-D.httpauth-payment reference format (if present)
    normative = meta.get("normative", {})
    if normative and "I-D.httpauth-payment" in normative:
        ref = normative["I-D.httpauth-payment"]
        if ref:
            if "target" not in ref:
                errors.append("I-D.httpauth-payment missing 'target' field")
            title = ref.get("title", "")
            # Normalize title by stripping outer quotes for comparison
            normalized_title = title.strip('"').strip("'")
            if normalized_title != ID_HTTPAUTH_PAYMENT_TITLE:
                errors.append(f"I-D.httpauth-payment title should be \"{ID_HTTPAUTH_PAYMENT_TITLE}\"")
            author = ref.get("author", [{}])[0] if ref.get("author") else {}
            if "name" not in author and "ins" in author:
                errors.append("I-D.httpauth-payment author should use 'name' not 'ins'")

    return errors


def main() -> int:
    specs_dir = Path("specs")
    if not specs_dir.exists():
        print("Error: specs/ directory not found", file=sys.stderr)
        return 1

    all_errors = []
    for path in sorted(specs_dir.rglob("*.md")):
        errors = lint_file(path)
        for error in errors:
            all_errors.append(f"{path}: {error}")

    if all_errors:
        print("Frontmatter lint errors:\n")
        for error in all_errors:
            print(f"  ✗ {error}")
        print(f"\n{len(all_errors)} error(s) found")
        return 1

    print("✓ All frontmatter checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
