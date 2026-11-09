"""Check requirement IDs on normative statements in the drafts.

A requirement is a paragraph or list item that contains an RFC 2119/8174
keyword in capitals. Each one carries a kramdown block IAL on the line
right after it, such as {: #req-tempo-charge-001} (see STYLE.md).

The lint reports untagged requirements, duplicate IDs, malformed IDs and
IDs whose number goes backwards, and keywords in table cells beyond a
field's REQUIRED/OPTIONAL marker. It only warns by default; --strict
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

# Letters and digits only around a keyword, not \b: '_' is a word character, and _MUST_ or
# *MUST* renders as an emphasised MUST.
KEYWORD = re.compile(r"(?<![A-Za-z0-9])(?:MUST|REQUIRED|SHALL|SHOULD|RECOMMENDED|MAY|OPTIONAL)(?![A-Za-z0-9])")
# Lines that end a kramdown paragraph without being one: the ^ end-of-block marker and a
# block-level HTML tag.
BLOCK_END = re.compile(
    r"^(?:\^|</?(?:address|article|aside|blockquote|details|div|dl|fieldset|"
    r"figure|footer|form|h[1-6]|header|hr|ol|p|pre|section|table|ul)\b[^>]*>?)\s*$",
    re.IGNORECASE,
)
# A thematic break (***, - - -, ___). Only outside a paragraph: right after a paragraph
# line kramdown keeps it as that paragraph's text.
THEMATIC_BREAK = re.compile(r"^([-*_])(?: *\1){2,}\s*$")
IAL_LINE = re.compile(r"^\s*\{:\s*([^}]*)\}\s*$")
# An attribute-list definition ({:name: ...}) only names attributes for later use;
# it attaches nothing to the block above it.
ALD_LINE = re.compile(r"^\s*\{:[\w-]+:")
# Quoted attribute values, removed before looking for IDs: {: title="#req-x"} sets no id.
QUOTED = re.compile(r"\"[^\"]*\"|'[^']*'")
# Bullets, numbered items and definition-list definitions (": text"); each is its own block.
LIST_MARKER = re.compile(r"^\s*(?:[-*+]|\d+\.|:)\s+")
# kramdown (and kramdown-rfc) fence code with ~~~ only. A ``` line is ordinary text: a ```
# pair renders as inline verbatim, which INLINE_CODE already strips from the prose.
FENCE = re.compile(r"^( *)(~{3,})(.*)$")
INLINE_CODE = re.compile(r"`+[^`]*`+")
# A keyword in double quotes is named, not used: the BCP 14 boilerplate ('The key words
# "MUST", "MUST NOT", ...') and prose about a keyword. Removing just the quoted names keeps a
# real requirement appended to the boilerplate paragraph visible.
QUOTED_KEYWORDS = re.compile(r'"(?:MUST NOT|SHALL NOT|SHOULD NOT|NOT RECOMMENDED|MUST|REQUIRED|SHALL|SHOULD|RECOMMENDED|MAY|OPTIONAL)"')
# A table cell that only marks a field present or absent: the marker alone or
# ending its own clause ("REQUIRED", "OPTIONAL. Defaults to 0", "OPTIONAL: Units
# consumed"). A marker that opens a condition ("REQUIRED if jwksUri is absent",
# "REQUIRED for v2") is a rule and stays.
PRESENCE_MARKER = re.compile(r"^(?:REQUIRED|OPTIONAL|RECOMMENDED)(?:[.:]|$)")
# What follows a marker and makes it a condition after all ("REQUIRED: if d is absent").
CONDITION = re.compile(r"^\W*(?:if|when|unless|for|only|except|where|while)\b", re.IGNORECASE)


Fence = tuple[str, int]


def fence_step(line: str, fence: Fence | None, base: int = 0) -> tuple[Fence | None, bool]:
    """Track ~~~ code blocks as kramdown does.

    line has tabs expanded and any blockquote marker removed. fence is the open
    block's delimiter and its base column (the open list item's text column, or 0),
    or None outside one. Returns the new state and whether this line is a fence
    line. A fence opens or closes only when indented at most 3 columns past its
    base: indented further, the line is code (an indented code block, or text
    inside the open block). Only a run at least as long as the opener, with
    nothing after it, closes the block.
    """
    match = FENCE.match(line)
    if not match:
        return fence, False
    indent, run, rest = len(match.group(1)), match.group(2), match.group(3)
    if fence is None:
        if indent > base + 3:
            return None, False
        return (run, base), True
    opener, opener_base = fence
    if indent <= opener_base + 3 and len(run) >= len(opener) and not rest.strip():
        return None, True
    return fence, False


@dataclass
class Segment:
    """A paragraph or list item and the requirement IDs attached to it."""

    line: int
    first: str
    end: int = 0
    ids: list[str] = field(default_factory=list)
    # Column of a list item's text; an IAL indented less applies to the whole list.
    indent: int = 0
    # Continuation lines, joined only when read (appending to one string is quadratic).
    rest: list[str] = field(default_factory=list)

    @property
    def text(self) -> str:
        return " ".join([self.first, *self.rest])

    @property
    def is_requirement(self) -> bool:
        text = INLINE_CODE.sub("", self.text)
        return bool(KEYWORD.search(QUOTED_KEYWORDS.sub("", text)))


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


def ial_ids(attrs: str) -> list[str]:
    """Return the IDs a block IAL sets: whitespace-separated tokens that start with #."""
    return [t[1:] for t in QUOTED.sub(" ", attrs).split() if t.startswith("#") and len(t) > 1]


def short_name(path: Path) -> str:
    """Return the ID prefix part for a draft: draft-tempo-charge-01 -> tempo-charge."""
    name = re.sub(r"-\d{2}$", "", path.stem)
    name = name.removeprefix("draft-")
    if name == "httpauth-payment":
        return "core"
    return name.removeprefix("payment-")


def segments(
    lines: list[str],
) -> tuple[list[Segment], list[tuple[int, str]], list[tuple[int, str]], set[int]]:
    """Split a draft into paragraphs and list items.

    Returns the segments, any requirement IDs that are not attached to a
    segment (an IAL after a blank line applies to the next block), and IDs
    after a list item but indented less than its text (kramdown applies
    those to the whole list), and the numbers of lines that are code (fence lines,
    fenced and indented code), which table_keywords skips with the same rules.
    """
    result: list[Segment] = []
    detached: list[tuple[int, str]] = []
    misindented: list[tuple[int, str]] = []
    current: Segment | None = None
    # Text columns of the open list items, outermost first. They survive blank lines,
    # so a later paragraph indented to one (a loose-list continuation) still belongs
    # to that item, even after a nested item has closed.
    list_stack: list[int] = []
    code_lines: set[int] = set()
    fence: Fence | None = None
    # Text column of a list item whose ID line just closed it. kramdown still reads the next
    # line as that item's text (a lazy continuation) unless a blank line comes first.
    lazy_indent = 0
    # Inside a block HTML comment (a line opening with <!-- and no --> after it). kramdown
    # drops everything up to the line holding -->, so its keywords and IDs don't count.
    in_comment = False
    in_frontmatter = bool(lines) and lines[0].strip() == "---"

    for number, raw in enumerate(lines, start=1):
        if in_frontmatter:
            if number > 1 and raw.strip() == "---":
                in_frontmatter = False
            continue
        # Tabs stop every 4 columns, as kramdown counts them; then drop a blockquote marker,
        # so a quoted fence or list is read like an unquoted one.
        line = re.sub(r"^( *)> ?", r"\1", raw.expandtabs(4))
        stripped = line.strip()
        column = len(line) - len(line.lstrip())
        if fence is None and FENCE.match(line):
            # A fence less indented than an open item's text ends that item's list.
            while list_stack and list_stack[-1] > column:
                list_stack.pop()
        fence, is_fence = fence_step(line, fence, list_stack[-1] if list_stack else 0)
        if is_fence:
            code_lines.add(number)
            current = None
            lazy_indent = 0
            continue
        if fence:
            code_lines.add(number)
            continue
        if in_comment:
            code_lines.add(number)
            in_comment = "-->" not in line
            continue
        if stripped and current is None and column >= (list_stack[-1] if list_stack else 0) + 4:
            # Indented four or more past the open item's text (or the margin) with no
            # paragraph to continue: kramdown renders it as a code block, not prose.
            code_lines.add(number)
            continue
        ial = None if ALD_LINE.match(line) else IAL_LINE.match(line)
        if ial and current is not None and column >= current.indent + 4:
            # Four or more columns past the block's text: kramdown only reads an IAL indented
            # up to three, so this line is more of the paragraph's text and tags nothing.
            current.rest.append(stripped)
            current.end = number
            continue
        if ial:
            ids = ial_ids(ial.group(1))
            if current is not None and column < current.indent:
                # kramdown ends the list here and puts the IAL on the list, not the item.
                misindented.extend((number, i) for i in ids if i.startswith("req-"))
            elif current is not None:
                current.ids.extend(ids)
            else:
                detached.extend((number, i) for i in ids if i.startswith("req-"))
            # kramdown ends the block at the IAL: the next line starts a new one.
            lazy_indent = current.indent if current is not None and current.indent else 0
            current = None
            continue
        lazy, lazy_indent = lazy_indent, 0
        if not stripped:
            current = None
            continue
        if stripped.startswith(("#", "|", "{::", "<!--")) or re.match(r"^---\s*\w*$", stripped):
            if stripped.startswith("<!--") and "-->" not in stripped[4:]:
                code_lines.add(number)
                in_comment = True
            current = None
            list_stack.clear()
            continue
        if ALD_LINE.match(line):
            current = None
            continue
        if BLOCK_END.match(stripped):
            current = None
            if not stripped.startswith("^"):
                list_stack.clear()
            continue
        if current is None and THEMATIC_BREAK.match(stripped):
            list_stack.clear()
            continue
        marker = LIST_MARKER.match(line)
        if not marker and current is None and lazy and column < lazy:
            # Lazy continuation: still the item's text, so its ID must be indented to it.
            current = Segment(number, stripped, number, indent=lazy)
            result.append(current)
            continue
        if marker:
            # Close items whose text starts right of this marker: it is their sibling or
            # belongs to an outer list.
            while list_stack and list_stack[-1] > column:
                list_stack.pop()
            list_stack.append(marker.end())
            current = Segment(number, stripped, number, indent=marker.end())
            result.append(current)
        elif current is None:
            # A paragraph continues the innermost open item it is indented to; items
            # indented further are closed, and with none left the list has ended.
            while list_stack and list_stack[-1] > column:
                list_stack.pop()
            indent = list_stack[-1] if list_stack else 0
            current = Segment(number, stripped, number, indent=indent)
            result.append(current)
        else:
            current.rest.append(stripped)
            current.end = number
    return result, detached, misindented, code_lines


def table_keywords(lines: list[str], code_lines: set[int] | None = None) -> list[int]:
    """Return lines of table rows with a keyword beyond a field's presence marker.

    A table cell can't carry an ID, so such a rule has to move to prose. code_lines
    (from segments) are skipped, so fences nested in list items count as they do there.
    """
    if code_lines is None:
        code_lines = segments(lines)[3]
    found: list[int] = []
    for number, raw in enumerate(lines, start=1):
        line = re.sub(r"^ {0,3}> ?", "", raw.expandtabs(4))
        stripped = line.strip()
        if number in code_lines or not stripped.startswith("|"):
            continue
        for cell in stripped.strip("|").split("|"):
            cell = INLINE_CODE.sub("", cell).strip()
            text = PRESENCE_MARKER.sub("", cell)
            if KEYWORD.search(text) or (text != cell and CONDITION.match(text)):
                found.append(number)
                break
    return found


def lint_file(path: Path) -> Report:
    """Lint one draft."""
    report = Report(path)
    prefix = f"req-{short_name(path)}-"
    id_pattern = re.compile(rf"^{re.escape(prefix)}(\d{{3}})$")
    lines = path.read_text(encoding="utf-8").splitlines()
    found, detached, misindented, code_lines = segments(lines)

    for number in table_keywords(lines, code_lines):
        report.errors.append(
            f"line {number}: keyword in a table cell; state the rule in a tagged paragraph"
        )

    for number, req_id in misindented:
        report.errors.append(
            f"line {number}: {req_id} is not indented to its list item's text, so kramdown "
            "puts it on the whole list"
        )

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
        elif req_ids:
            report.errors.append(
                f"line {segment.line}: {req_ids[0]} is on text with no BCP 14 keyword; "
                "drop the ID or restore the keyword"
            )
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
            last = value
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
