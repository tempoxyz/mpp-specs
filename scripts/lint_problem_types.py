#!/usr/bin/env python3
"""Ensure every problem type URI a spec cites has a published page.

Problem type URIs under https://paymentauth.org/problems/ are dereferenceable:
scripts/gen_problems.py renders one static page per registered type and
deploy.yml publishes them. A spec that cites a type missing from that registry
ships a URI that 404s, which defeats the purpose of an RFC 9457 `type` value.

This lint collects the types cited under specs/ and fails when any of them has
no page.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
ROOT = SCRIPTS_DIR.parent
SPECS_DIR = ROOT / "specs"

sys.path.insert(0, str(SCRIPTS_DIR))

from gen_problems import ALL_PROBLEMS, BASE_URI  # noqa: E402

# The full URI, as used in prose and in JSON examples.
ABSOLUTE_RE = re.compile(re.escape(BASE_URI) + r"(?P<slug>[a-z0-9][a-z0-9/-]*)")
# A slug on its own, as tables use once the base URI is given in prose. The
# leading `.../` is optional: both spellings appear across the session specs.
SLUG_RE = re.compile(r"\A`(?P<relative>\.\.\./)?(?P<slug>[a-z0-9][a-z0-9-]*(?:/[a-z0-9][a-z0-9-]*)*)`\Z")
# A table that registers types names the column holding them. Both spellings
# are in use; only these columns are read, so that a table of method or intent
# names in backticks is never mistaken for a list of problem types.
URI_COLUMN_RE = re.compile(r"\A(?:type uri|problem type|type)\Z")
# A spec defining its own type does so in the same `Code | HTTP | Description`
# table the core spec uses.
CODE_COLUMN_RE = re.compile(r"\A(?:code|error code)\Z")
STATUS_COLUMN_RE = re.compile(r"\A(?:http|http status|status)\Z")


def registered_slugs() -> set[str]:
    """Problem type slugs that gen_problems.py publishes a page for."""
    return {problem["slug"] for problem in ALL_PROBLEMS}


def _cells(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def _is_separator(line: str) -> bool:
    return bool(re.fullmatch(r"\|[\s:|-]+\|", line.strip()))


def slugs_in_text(content: str) -> set[str]:
    """Problem type slugs cited by a single markdown document."""
    slugs: set[str] = set()

    def record(slug: str) -> None:
        slug = slug.rstrip("-")
        # A bare namespace (e.g. ".../problems/lightning/") is not a type.
        if slug and not slug.endswith("/"):
            slugs.add(slug)

    for match in ABSOLUTE_RE.finditer(content):
        record(match.group("slug"))

    # Tables are read column-wise: the header fixes which column holds types,
    # and whether a bare slug in it counts as a citation.
    columns: list[int] = []
    bare_slugs_count = False
    lines = content.splitlines()
    for index, line in enumerate(lines):
        if not line.strip().startswith("|"):
            columns = []
            continue
        if _is_separator(line):
            continue
        cells = _cells(line)
        if index + 1 < len(lines) and _is_separator(lines[index + 1]):
            headers = [cell.lower() for cell in cells]
            columns = [i for i, header in enumerate(headers) if URI_COLUMN_RE.match(header)]
            # A `Code | HTTP | Description` table defines types rather than
            # referring to them, so its unqualified slugs are citations.
            if any(STATUS_COLUMN_RE.match(header) for header in headers):
                code_columns = [i for i, h in enumerate(headers) if CODE_COLUMN_RE.match(h)]
                bare_slugs_count = bool(code_columns)
                columns += code_columns
            else:
                # Elsewhere an unqualified slug is shorthand for a type the
                # document registers in full, so only qualified ones count.
                bare_slugs_count = False
            continue
        for column in columns:
            if column >= len(cells):
                continue
            match = SLUG_RE.match(cells[column])
            if not match:
                continue
            qualified = bool(match.group("relative")) or "/" in match.group("slug")
            if qualified or bare_slugs_count:
                record(match.group("slug"))

    return slugs


def cited_slugs(specs_dir: Path = SPECS_DIR) -> dict[str, set[str]]:
    """Map each cited problem slug to the spec files citing it."""
    cited: dict[str, set[str]] = {}
    for path in sorted(specs_dir.rglob("*.md")):
        for slug in slugs_in_text(path.read_text(encoding="utf-8")):
            cited.setdefault(slug, set()).add(path.relative_to(specs_dir).as_posix())
    return cited


def main() -> int:
    registered = registered_slugs()
    cited = cited_slugs()

    missing = {slug: specs for slug, specs in cited.items() if slug not in registered}
    if missing:
        print("Problem type URIs cited by specs but not published as pages:\n")
        for slug in sorted(missing):
            print(f"  x {BASE_URI}{slug}")
            for spec in sorted(missing[slug]):
                print(f"      cited in specs/{spec}")
        print(
            "\nAdd each type to the registry in scripts/gen_problems.py so the URI"
            " resolves instead of returning 404."
        )
        return 1

    print(f"All {len(cited)} problem type URIs cited by specs have published pages.")

    uncited = sorted(registered - set(cited))
    if uncited:
        print("\nPublished but not cited by any spec (informational):")
        for slug in uncited:
            print(f"  - {slug}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
