"""Check requirement IDs on normative statements in the drafts.

A requirement is a paragraph or list item that contains an RFC 2119/8174
keyword in capitals. Each one carries a kramdown block IAL on the line
right after it, such as {: #req-tempo-charge-001} (see STYLE.md).

The lint reports untagged requirements, duplicate IDs, malformed IDs and
IDs whose number goes backwards. It only warns by default; --strict
exits 1 on untagged requirements and duplicate or malformed IDs. IDs that
go backwards stay notes, since a rule added later takes the next free
number wherever it goes.
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPECS_DIR = ROOT / "specs"

KEYWORD = re.compile(r"\b(?:MUST|REQUIRED|SHALL|SHOULD|RECOMMENDED|MAY|OPTIONAL)\b")
IAL_LINE = re.compile(r"^\s*\{:\s*([^}]*)\}\s*$")
IAL_ID = re.compile(r"#([^\s}]+)")
LIST_MARKER = re.compile(r"^\s*(?:[-*+]|\d+\.)\s+")
FENCE = re.compile(r"^\s*(~~~|```)")
INLINE_CODE = re.compile(r"`+[^`]*`+")
BOILERPLATE = re.compile(r'The key words "MUST"')


@dataclass
class Segment:
    """A paragraph or list item and the requirement IDs attached to it."""

    line: int
    text: str
    end: int = 0
    ids: list[str] = field(default_factory=list)

    @property
    def is_requirement(self) -> bool:
        text = INLINE_CODE.sub("", self.text)
        return bool(KEYWORD.search(text)) and not BOILERPLATE.search(text)


@dataclass
class Report:
    """Lint results for one draft."""

    path: Path
    tagged: int = 0
    untagged: list[int] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    @property
    def total(self) -> int:
        return self.tagged + len(self.untagged)


def short_name(path: Path) -> str:
    """Return the ID prefix part for a draft: draft-tempo-charge-01 -> tempo-charge."""
    name = re.sub(r"-\d{2}$", "", path.stem)
    name = name.removeprefix("draft-")
    if name == "httpauth-payment":
        return "core"
    return name.removeprefix("payment-")


def segments(lines: list[str]) -> tuple[list[Segment], list[tuple[int, str]]]:
    """Split a draft into paragraphs and list items.

    Returns the segments and any requirement IDs that are not attached to
    a segment (an IAL after a blank line applies to the next block).
    """
    result: list[Segment] = []
    detached: list[tuple[int, str]] = []
    current: Segment | None = None
    in_fence = False
    in_frontmatter = bool(lines) and lines[0].strip() == "---"

    for number, raw in enumerate(lines, start=1):
        if in_frontmatter:
            if number > 1 and raw.strip() == "---":
                in_frontmatter = False
            continue
        if FENCE.match(raw):
            in_fence = not in_fence
            current = None
            continue
        if in_fence:
            continue

        line = re.sub(r"^\s*>\s?", "", raw)
        stripped = line.strip()
        ial = IAL_LINE.match(line)
        if ial:
            ids = IAL_ID.findall(ial.group(1))
            if current is not None:
                current.ids.extend(ids)
            else:
                detached.extend((number, i) for i in ids if i.startswith("req-"))
            # kramdown ends the block at the IAL: the next line starts a new one.
            current = None
            continue
        if (
            not stripped
            or stripped.startswith(("#", "|", "{::", "<!--"))
            or re.match(r"^---\s*\w*$", stripped)
        ):
            current = None
            continue
        if LIST_MARKER.match(line) or current is None:
            current = Segment(number, stripped, number)
            result.append(current)
        else:
            current.text += " " + stripped
            current.end = number
    return result, detached


def lint_file(path: Path) -> Report:
    """Lint one draft."""
    report = Report(path)
    prefix = f"req-{short_name(path)}-"
    id_pattern = re.compile(rf"^{re.escape(prefix)}(\d{{3}})$")
    lines = path.read_text(encoding="utf-8").splitlines()
    found, detached = segments(lines)

    for number, req_id in detached:
        report.errors.append(
            f"line {number}: {req_id} is not directly after a paragraph or list item"
        )

    seen: dict[str, int] = {}
    last = 0
    for segment in found:
        req_ids = [i for i in segment.ids if i.startswith("req-")]
        if segment.is_requirement:
            if req_ids:
                report.tagged += 1
            else:
                report.untagged.append(segment.line)
        if len(req_ids) > 1:
            report.errors.append(
                f"line {segment.line}: more than one requirement ID ({', '.join(req_ids)})"
            )
        for req_id in req_ids:
            match = id_pattern.match(req_id)
            if not match:
                report.errors.append(
                    f"line {segment.line}: malformed ID {req_id} (expected {prefix}NNN)"
                )
                continue
            if req_id in seen:
                report.errors.append(
                    f"line {segment.line}: duplicate ID {req_id} (first on line {seen[req_id]})"
                )
                continue
            seen[req_id] = segment.line
            value = int(match.group(1))
            if value <= last:
                # Not an error: a rule added later takes the next free number.
                report.notes.append(
                    f"line {segment.line}: {req_id} goes backwards (after {prefix}{last:03d})"
                )
            last = max(last, value)
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "paths",
        nargs="*",
        type=Path,
        help="drafts to check (default: every draft in specs/)",
    )
    parser.add_argument(
        "--strict", action="store_true", help="exit 1 if any problem is found"
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true", help="list every untagged requirement"
    )
    args = parser.parse_args(argv)

    paths = [p.resolve() for p in args.paths] or sorted(SPECS_DIR.rglob("*.md"))
    problems = 0
    print("Requirement IDs (tagged/requirements):")
    for path in paths:
        report = lint_file(path)
        try:
            rel = path.relative_to(ROOT).as_posix()
        except ValueError:
            rel = path.as_posix()
        print(
            f"  {rel}: {report.tagged}/{report.total} tagged, {len(report.untagged)} untagged"
        )
        # List untagged lines for drafts that are being tagged, or on request.
        if report.untagged and (args.verbose or args.strict or report.tagged):
            for number in report.untagged:
                print(f"    line {number}: untagged requirement")
        for error in report.errors:
            print(f"    {error}")
        for note in report.notes:
            print(f"    note: {note}")
        problems += len(report.untagged) + len(report.errors)

    if problems and args.strict:
        print(
            f"\n{problems} requirement ID problem(s). See STYLE.md (Requirement IDs)."
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
