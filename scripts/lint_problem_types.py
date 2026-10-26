#!/usr/bin/env python3
"""Ensure every problem type URI a spec cites has a published page.

Problem type URIs under https://paymentauth.org/problems/ are dereferenceable:
scripts/gen_problems.py renders one static page per registered type and
deploy.yml publishes them. A spec that cites a type missing from that registry
ships a URI that 404s, which defeats the purpose of an RFC 9457 `type` value.

This lint collects the types cited under specs/ and fails when any of them has
no page, or when a spec's table gives a type a different HTTP status than its
page does.
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
DEFINITION_RE = re.compile(
    r"^`?" + re.escape(BASE_URI) + r"(?P<slug>[a-z0-9][a-z0-9/-]*)`?[ \t]*\n"
    r":[ \t]*HTTP[ \t]+(?P<status>[1-5][0-9]{2})\b",
    re.MULTILINE,
)
# A type in a table cell: the full URI, or a slug on its own once the base URI
# is given in prose. The leading `.../` is optional: all three spellings appear
# across the session specs.
SLUG_RE = re.compile(
    r"\A`(?P<relative>\.\.\./|" + re.escape(BASE_URI) + r")?"
    r"(?P<slug>[a-z0-9][a-z0-9-]*(?:/[a-z0-9][a-z0-9-]*)*)`\Z"
)
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


def registered_statuses() -> dict[str, int]:
    """The HTTP status each published page gives its type."""
    return {problem["slug"]: problem["http_status"] for problem in ALL_PROBLEMS}


def _cells(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def _is_separator(line: str) -> bool:
    return bool(re.fullmatch(r"\|[\s:|-]+\|", line.strip()))


def _is_shorthand(slug: str) -> bool:
    """Whether an unqualified slug abbreviates a registered namespaced type.

    draft-evm-session-00 writes `channel-finalized` in a mapping table for the
    `session/channel-finalized` it registers in full. A slug that is neither a
    registered root type nor such an abbreviation is a citation, so a typo in
    a `Condition | Problem type` table still fails the lint.
    """
    registered = registered_slugs()
    if slug in registered:
        return False
    return any(other.endswith("/" + slug) for other in registered)


def citations_in_text(content: str) -> list[tuple[str, int | None]]:
    """Problem types cited by a single markdown document, each with the HTTP
    status the citing table gives it, or None where no status is given."""
    citations: list[tuple[str, int | None]] = []

    def record(slug: str, status: int | None = None) -> None:
        slug = slug.rstrip("-")
        # A bare namespace (e.g. ".../problems/lightning/") is not a type.
        if slug and not slug.endswith("/"):
            citations.append((slug, status))

    for match in ABSOLUTE_RE.finditer(content):
        record(match.group("slug"))

    # A definition list entry gives the status on the line after the URI, as
    # in draft-lightning-charge-00: the URI alone, then `: HTTP 402. ...`.
    for match in DEFINITION_RE.finditer(content):
        record(match.group("slug"), int(match.group("status")))

    # Tables are read column-wise: the header fixes which column holds types,
    # and whether a bare slug in it counts as a citation.
    columns: list[int] = []
    status_column: int | None = None
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
            status_column = next(
                (i for i, header in enumerate(headers) if STATUS_COLUMN_RE.match(header)), None
            )
            # A `Code | HTTP | Description` table defines types rather than
            # referring to them, so its unqualified slugs are citations.
            if status_column is not None:
                code_columns = [i for i, h in enumerate(headers) if CODE_COLUMN_RE.match(h)]
                bare_slugs_count = bool(code_columns)
                columns += code_columns
            else:
                # Elsewhere an unqualified slug counts unless it is shorthand
                # for a namespaced type (see _is_shorthand).
                bare_slugs_count = False
            continue
        for column in columns:
            if column >= len(cells):
                continue
            match = SLUG_RE.match(cells[column])
            if not match:
                continue
            qualified = bool(match.group("relative")) or "/" in match.group("slug")
            if qualified or bare_slugs_count or not _is_shorthand(match.group("slug")):
                status = None
                if status_column is not None and status_column < len(cells):
                    digits = re.fullmatch(r"`?([1-5][0-9]{2})`?", cells[status_column])
                    status = int(digits.group(1)) if digits else None
                record(match.group("slug"), status)

    return citations


def slugs_in_text(content: str) -> set[str]:
    """Problem type slugs cited by a single markdown document."""
    return {slug for slug, _ in citations_in_text(content)}


def cited_slugs(specs_dir: Path = SPECS_DIR) -> dict[str, set[str]]:
    """Map each cited problem slug to the spec files citing it."""
    cited: dict[str, set[str]] = {}
    for path in sorted(specs_dir.rglob("*.md")):
        for slug in slugs_in_text(path.read_text(encoding="utf-8")):
            cited.setdefault(slug, set()).add(path.relative_to(specs_dir).as_posix())
    return cited


def cited_statuses(specs_dir: Path = SPECS_DIR) -> dict[str, dict[int, set[str]]]:
    """Map each type a spec's table gives a status to that status and the
    spec files giving it."""
    statuses: dict[str, dict[int, set[str]]] = {}
    for path in sorted(specs_dir.rglob("*.md")):
        spec = path.relative_to(specs_dir).as_posix()
        for slug, status in citations_in_text(path.read_text(encoding="utf-8")):
            if status is not None:
                statuses.setdefault(slug, {}).setdefault(status, set()).add(spec)
    return statuses


def status_mismatches(
    statuses: dict[str, dict[int, set[str]]], registry: dict[str, int]
) -> dict[str, dict[int, set[str]]]:
    """Types whose page gives a status some citing spec's table does not."""
    return {
        slug: by_status
        for slug, by_status in statuses.items()
        if slug in registry and set(by_status) != {registry[slug]}
    }


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

    registry = registered_statuses()
    mismatched = status_mismatches(cited_statuses(), registry)
    if mismatched:
        print("Problem type pages whose HTTP status disagrees with the specs:\n")
        for slug in sorted(mismatched):
            print(f"  x {BASE_URI}{slug} (page says {registry[slug]})")
            for status, specs in sorted(mismatched[slug].items()):
                for spec in sorted(specs):
                    print(f"      {status} in specs/{spec}")
        print(
            "\nMake the status in scripts/gen_problems.py match the specs, or fix"
            " the spec that disagrees."
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
