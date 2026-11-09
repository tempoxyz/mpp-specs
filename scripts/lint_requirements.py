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

It reads each draft the way the build does: kramdown-rfc renders it to
XML, and the paragraphs, list items, table cells, headings and anchors
come from that XML. Reading the Markdown by hand kept getting kramdown's
rules wrong (IALs, ALDs, comments, code spans and blocks, lists, tables,
setext headings). The Markdown source is only used to turn what the XML
says back into line numbers (SourceMap) and to notice requirement IDs that
kramdown dropped, which the XML can't show.
"""

from __future__ import annotations

import argparse
import bisect
import os
import re
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPECS_DIR = ROOT / "specs"
# The renderer the build uses (scripts/gen.sh); KRAMDOWN_RFC overrides it, such as for a
# bundle exec wrapper.
KRAMDOWN_RFC = os.environ.get("KRAMDOWN_RFC", "kramdown-rfc")
# Seconds a draft may take to render. kramdown resolves attribute list definitions without
# memoising them, so ALDs that name each other repeatedly take exponential time (and a cycle
# overflows its stack); such a draft can't be built either, and the lint says so.
RENDER_TIMEOUT = 120

# Letters and digits only around a keyword, not \b: '_' is a word character, and kramdown
# leaves an intraword _ (M_UST_) as text.
KEYWORD = re.compile(r"(?<![A-Za-z0-9])(?:MUST|REQUIRED|SHALL|SHOULD|RECOMMENDED|MAY|OPTIONAL)(?![A-Za-z0-9])")
# A keyword in double quotes is named, not used: the BCP 14 boilerplate ('The key words
# "MUST", "MUST NOT", ...') and prose about a keyword. Removing just the quoted names keeps a
# real requirement appended to the boilerplate paragraph visible. Curly quotes too, in case
# kramdown-rfc's typography is on.
QUOTED_KEYWORDS = re.compile(
    r'["\u201c](?:MUST NOT|SHALL NOT|SHOULD NOT|NOT RECOMMENDED|MUST|REQUIRED|SHALL|SHOULD|'
    r'RECOMMENDED|MAY|OPTIONAL)["\u201d]'
)
# A table cell that only marks a field present or absent: the marker alone or
# ending its own clause ("REQUIRED", "OPTIONAL. Defaults to 0", "OPTIONAL: Units
# consumed"). A marker that opens a condition ("REQUIRED if jwksUri is absent",
# "REQUIRED for v2") is a rule and stays.
PRESENCE_MARKER = re.compile(r"^(?:REQUIRED|OPTIONAL|RECOMMENDED)(?:[.:]|$)")
# What follows a marker and makes it a condition after all ("REQUIRED: if d is absent").
CONDITION = re.compile(r"^\W*(?:if|when|unless|for|only|except|where|while)\b", re.IGNORECASE)

# Words as SourceMap compares them: runs of letters and digits. Punctuation and markup
# differ between Markdown and XML; the words in between don't.
WORD = re.compile(r"[^\W_]+")
# A requirement ID in the Markdown, wherever it is written ({: #id}, id="id", {#id}, an ALD).
# Python's \w takes in other scripts' letters and digits, so a whole mistyped ID is read.
SOURCE_ID = re.compile(r"(?<![\w:-])(req-[\w:-]*)")
# An ID kramdown can anchor ([A-Za-z][\w:-]*, with Ruby's ASCII-only \w). With anything else
# in it, kramdown drops the whole IAL.
KRAMDOWN_ID = re.compile(r"[A-Za-z][A-Za-z0-9_:-]*")
# An attribute list definition line ({:name: ...}): it names attributes for IALs that refer
# to it, and sets nothing where it stands.
ALD_LINE = re.compile(r"^ {0,3}\{:\w[\w-]*:")
# The name an ALD line defines.
ALD_NAME = re.compile(r"^ {0,3}\{:(\w[\w-]*):")
# The body of an IAL ({: ...} or {:...}, not an extension {::...}), and a bare ALD reference
# inside it: a word that isn't #id, .class or key=value.
IAL_BODY = re.compile(r"\{:(?!:)([^}]*)\}")
ALD_REF = re.compile(r"\w[\w-]*")
# kramdown-rfc's line marker processing instruction. <?line N?> starts each part of the file
# (--- abstract, --- middle, --- back) and N is the line of its --- line, counted in the
# input after {::boilerplate} expansion. Each expansion is followed by <?line -K?>: it added
# K lines, so later markers are K too high.
LINE_PI = re.compile(r"^line\s+(-?\d+)\s*$")
# External entities kramdown-rfc declares for bibxml references (<!ENTITY RFC2119 SYSTEM
# "https://...">). ElementTree can't load them, and references aren't linted.
SYSTEM_ENTITY = re.compile(r"<!ENTITY\s+([\w.:-]+)\s+SYSTEM\b")

# kramdown-rfc's output mixes RFC XML v2 and v3 elements (xml2rfc converts the rest), so
# both spellings are handled: <list>/<ul>, <texttable>/<table>, <spanx style="verb">/<tt>.
TEXT_CONTAINERS = {"t", "li", "dd", "dt"}
LISTS = {"list", "ul", "ol", "dl"}
CODE = {"artwork", "sourcecode"}
TABLES = {"texttable", "table"}
QUOTES = {"blockquote", "aside"}
BLOCKS = TEXT_CONTAINERS | LISTS | CODE | TABLES | QUOTES | {"figure", "section", "note"}
# Front matter generated from the YAML header, and references, are not in the Markdown body.
SKIPPED = {"title", "author", "date", "area", "workgroup", "keyword", "seriesInfo", "references", "boilerplate"}
# Elements that may carry an anchor kramdown-rfc made up or that hold the whole document.
STRUCTURE = {"rfc", "front", "middle", "back", "abstract"}


@dataclass
class Item:
    """One thing the rendered XML says, in document order.

    kind is "text" (a paragraph, list item or definition: what can be a requirement), "row"
    (a table row), "heading", "code", "anchor" (a requirement ID kramdown put somewhere
    other than a paragraph or list item: where says on what) or "line" (kramdown-rfc's
    line marker).
    """

    kind: str
    words: list[str] = field(default_factory=list)
    # Rendered text without code spans, whitespace collapsed: what the keyword check reads.
    text: str = ""
    cells: list[str] = field(default_factory=list)
    anchor: str | None = None
    where: str = ""
    number: int = 0
    # Source lines SourceMap matched, or 0 when it found none.
    start: int = 0
    end: int = 0

    @property
    def is_requirement(self) -> bool:
        return bool(KEYWORD.search(QUOTED_KEYWORDS.sub("", self.text)))


def words(text: str) -> list[str]:
    """Return the words SourceMap matches on."""
    return WORD.findall(text)


def collapse(text: str) -> str:
    """Collapse runs of whitespace (newlines, U+2028, tabs) to one space.

    A keyword pair such as "SHALL NOT" may wrap across lines in the XML.
    """
    return " ".join(text.split())


class RenderError(RuntimeError):
    """kramdown-rfc is missing, failed, or wrote XML that doesn't parse."""


def render(path: Path) -> str:
    """Render a draft with kramdown-rfc, the way scripts/gen.sh does, and return the XML."""
    if shutil.which(KRAMDOWN_RFC) is None:
        raise RenderError(
            f"{KRAMDOWN_RFC} not found; install the kramdown-rfc gem (see Gemfile) or run "
            "the lint in the ietf-spec-tools Docker image"
        )
    with tempfile.TemporaryDirectory() as cache:
        # Offline with a throwaway reference cache: the lint never needs reference
        # contents, so it never touches the network or leaves a .refcache behind. The draft's
        # own directory is the working directory, where kramdown-rfc resolves includes.
        env = {**os.environ, "KRAMDOWN_OFFLINE": "1", "KRAMDOWN_REFCACHEDIR": cache}
        try:
            result = subprocess.run(
                [KRAMDOWN_RFC, str(path)],
                capture_output=True,
                cwd=path.parent,
                encoding="utf-8",
                errors="replace",
                env=env,
                check=False,
                timeout=RENDER_TIMEOUT,
            )
        except subprocess.TimeoutExpired as error:
            raise RenderError(
                f"kramdown-rfc did not finish rendering the draft in {RENDER_TIMEOUT} s"
            ) from error
    if result.returncode != 0:
        # Its last line is the reason (a Ruby exception such as SystemStackError on an ALD
        # cycle); the rest is a backtrace.
        lines = [line for line in result.stderr.splitlines() if line.strip()]
        reason = lines[-1].strip() if lines else f"exit status {result.returncode}"
        for line in lines:
            if "Error" in line or "error" in line:
                reason = line.strip()
                break
        raise RenderError(f"kramdown-rfc could not render the draft: {reason[:300]}")
    return result.stdout


def parse(xml: str) -> ET.Element:
    """Parse kramdown-rfc's XML, keeping its line marker processing instructions."""
    names = SYSTEM_ENTITY.findall(xml)
    if names:
        xml = re.sub("&(?:" + "|".join(map(re.escape, names)) + ");", "", xml)
    parser = ET.XMLParser(target=ET.TreeBuilder(insert_pis=True))
    try:
        parser.feed(xml)
        return parser.close()
    except ET.ParseError as error:
        raise RenderError(f"kramdown-rfc wrote XML that doesn't parse: {error}") from error


def is_verbatim(el: ET.Element) -> bool:
    """Whether an inline element is a code span: its text is verbatim, never a rule."""
    return el.tag in ("tt", "code") or (el.tag == "spanx" and el.get("style") == "verb")


def flatten(el: ET.Element, plain: list[str], match: list[str], items: list[Item]) -> None:
    """Append an inline element's rendered text (not its tail).

    plain gets what the keyword check reads (a code span becomes a space), match what
    SourceMap matches (code spans included: their words are in the source too). A span IAL
    with a requirement ID (*text*{: #req-x}) becomes an "anchor" item.
    """
    anchor = el.get("anchor")
    if anchor:
        items.append(Item("anchor", anchor=anchor, where="span"))
    if is_verbatim(el):
        plain.append(" ")
        match.append(" " + "".join(el.itertext()) + " ")
        return
    if el.tag in (ET.PI, ET.Comment):
        return
    plain.append(el.text or "")
    match.append(el.text or "")
    for child in el:
        flatten(child, plain, match, items)
        plain.append(child.tail or "")
        match.append(child.tail or "")


def walk_container(el: ET.Element, items: list[Item]) -> None:
    """Turn a <t>, <li>, <dd> or <dt> into "text" items, and walk the blocks inside it.

    kramdown-rfc merges a loose list item's paragraphs into one <t>, separated by
    <vspace blankLines="1"/>, so each run between those is its own paragraph, as in the
    Markdown. A paragraph with an IAL keeps its own nested <t anchor="...">.
    """
    plain: list[str] = []
    match: list[str] = []
    anchor = el.get("anchor")

    def flush() -> None:
        nonlocal anchor
        text, joined = collapse("".join(plain)), "".join(match)
        plain.clear()
        match.clear()
        if text or words(joined):
            items.append(Item("text", words(joined), text, anchor=anchor))
            anchor = None

    plain.append(el.text or "")
    match.append(el.text or "")
    for child in el:
        if child.tag is ET.PI or child.tag in BLOCKS:
            flush()
            walk(child, items)
        elif child.tag == "vspace" and child.get("blankLines", "0") not in ("", "0"):
            flush()
        else:
            flatten(child, plain, match, items)
        plain.append(child.tail or "")
        match.append(child.tail or "")
    flush()
    if anchor:
        # An anchor on a container with no text of its own (only blocks inside).
        items.append(Item("anchor", anchor=anchor, where="block"))


def table_rows(el: ET.Element, items: list[Item]) -> None:
    """Turn a table into one "row" item per row, header included."""
    rows: list[list[ET.Element]] = []
    if el.tag == "texttable":
        # v2: the <ttcol> headers, then every body cell (<c>) in row order.
        header = [c for c in el if c.tag == "ttcol"]
        body = [c for c in el if c.tag == "c"]
        width = max(len(header), 1)
        rows = [header] + [body[i : i + width] for i in range(0, len(body), width)]
    else:
        rows = [[c for c in tr if c.tag in ("td", "th")] for tr in el.iter("tr")]
    for row in rows:
        cells, joined = [], []
        for cell in row:
            plain: list[str] = []
            match: list[str] = []
            flatten(cell, plain, match, items)
            cells.append(collapse("".join(plain)))
            joined.append("".join(match))
        if cells:
            items.append(Item("row", words(" ".join(joined)), cells=cells))


def walk(el: ET.Element, items: list[Item]) -> None:
    """Append the items of an element and everything in it, in document order."""
    tag = el.tag
    if tag is ET.PI:
        marker = LINE_PI.match(el.text or "")
        if marker:
            items.append(Item("line", number=int(marker.group(1))))
        return
    if tag is ET.Comment or tag in SKIPPED:
        return
    if tag in TEXT_CONTAINERS:
        walk_container(el, items)
        return
    anchor = el.get("anchor")
    if tag == "section":
        for child in el:
            if child.tag == "name":
                items.append(Item("heading", words("".join(child.itertext())), anchor=anchor))
            else:
                walk(child, items)
        return
    if anchor and tag not in STRUCTURE:
        if tag in LISTS:
            # kramdown-rfc writes a blockquote as an unbulleted list (<ul empty="true">).
            where = "quote" if tag == "ul" and el.get("empty") == "true" else "list"
        else:
            where = "quote" if tag in QUOTES else "block"
        items.append(Item("anchor", anchor=anchor, where=where))
    if tag in CODE:
        items.append(Item("code", words("".join(el.itertext()))))
        return
    if tag in TABLES:
        table_rows(el, items)
        return
    for child in el:
        walk(child, items)


def extract(root: ET.Element) -> list[Item]:
    """Return the items of a rendered draft in document order."""
    items: list[Item] = []
    walk(root, items)
    return items


class SourceMap:
    """Find where rendered text came from in the Markdown source.

    kramdown-rfc doesn't record source lines in its XML beyond a marker at each section
    of the file (<?line N?>), so the lint matches words: the words of each rendered item,
    taken in document order, appear in the source in the same order. Markup, entities and
    link targets add or change a few words, so the match is approximate: an item starts
    where the first few of its words (up to HEAD) appear close together after the
    previous item's end, and ends at the last of its words found within GAP words of the
    one before. Items whose words don't appear (such as expanded boilerplate) leave the
    position unchanged, and kramdown-rfc's line markers move it forward.
    """

    HEAD = 8
    HEAD_GAP = 16
    GAP = 40
    # Short items ("a | x", a one-word term) match only near the current position, so a
    # coincidence far ahead can't move it past text still to come.
    NEAR = 400
    CANDIDATES = 500

    def __init__(self, lines: list[str], start_line: int = 1):
        self.words: list[str] = []
        self.line_of: list[int] = []
        self.positions: dict[str, list[int]] = defaultdict(list)
        # first[n] is the index of the first word on line n or after it.
        self.first = [0]
        for number, line in enumerate(lines, start=1):
            self.first.append(len(self.words))
            for word in WORD.findall(line):
                self.positions[word].append(len(self.words))
                self.words.append(word)
                self.line_of.append(number)
        self.first.append(len(self.words))
        self.cursor = self.first[min(start_line, len(lines) + 1)]
        self.last_line = start_line

    def floor(self, line: int) -> None:
        """Move to a line kramdown-rfc marked, unless already past it."""
        if 1 <= line < len(self.first):
            self.cursor = max(self.cursor, self.first[line])
            self.last_line = max(self.last_line, line)

    def _next(self, word: str, start: int, limit: int) -> int | None:
        found = self.positions.get(word)
        if not found:
            return None
        i = bisect.bisect_left(found, start)
        return found[i] if i < len(found) and found[i] < limit else None

    def _start(self, head: list[str]) -> int | None:
        found = self.positions.get(head[0], [])
        rest = head[1:]
        # Allow a quarter of the following words to be missing (entities, typography).
        need = len(rest) - len(rest) // 4
        limit = self.cursor + self.NEAR if len(head) < 4 else len(self.words)
        i = bisect.bisect_left(found, self.cursor)
        for p in found[i : i + self.CANDIDATES]:
            if p >= limit:
                break
            pos, hits = p, 0
            for word in rest:
                q = self._next(word, pos + 1, pos + 1 + self.HEAD_GAP)
                if q is not None:
                    pos, hits = q, hits + 1
            if hits >= need:
                return p
        return None

    def locate(self, item_words: list[str]) -> tuple[int, int] | None:
        """Return the first and last source lines of an item's words, and move past them."""
        for skip in range(min(3, len(item_words))):
            start = self._start(item_words[skip : skip + self.HEAD])
            if start is not None:
                break
        else:
            return None
        pos = start
        for word in item_words[skip + 1 :]:
            q = self._next(word, pos + 1, pos + 1 + self.GAP)
            if q is not None:
                pos = q
        self.cursor = pos + 1
        self.last_line = self.line_of[pos]
        return self.line_of[start], self.line_of[pos]


@dataclass
class Report:
    """Lint results for one draft."""

    path: Path
    tagged: int = 0
    untagged: list[int] = field(default_factory=list)
    # (line, message); line is None for a problem with the whole draft.
    problems: list[tuple[int | None, str]] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    @property
    def total(self) -> int:
        return self.tagged + len(self.untagged)

    @property
    def errors(self) -> list[str]:
        return [m if n is None else f"line {n}: {m}" for n, m in self.problems]

    def error(self, line: int | None, message: str) -> None:
        self.problems.append((line, message))


def short_name(path: Path) -> str:
    """Return the ID prefix part for a draft: draft-tempo-charge-01 -> tempo-charge."""
    name = re.sub(r"-\d{2}$", "", path.stem)
    name = name.removeprefix("draft-")
    if name == "httpauth-payment":
        return "core"
    return name.removeprefix("payment-")


# A tab after a space in a line's indentation (see lint_file).
MIXED_INDENT = re.compile(r"^[ \t]*(?:> ?)*[ \t]* \t")


def kramdown_comment_lines(lines: list[str]) -> set[int]:
    """Return the lines inside {::comment} ... {:/comment} blocks, roughly.

    Only used to stay quiet about requirement IDs in them, which kramdown drops without
    leaving anything in the XML to recognise them by.
    """
    inside: set[int] = set()
    opened = False
    for number, line in enumerate(lines, start=1):
        stripped = line.strip()
        if not opened and stripped.startswith("{::comment") and "{:/" not in stripped:
            opened = True
        elif opened and ("{:/comment}" in stripped or stripped.startswith("{:/}")):
            opened = False
        elif opened:
            inside.add(number)
    return inside


def body_start(lines: list[str]) -> int:
    """Return the first line after the YAML header (1 if there is none).

    kramdown-rfc's header runs from a leading --- to the next line starting with ---
    (a bare --- or a section line such as --- middle).
    """
    if lines and lines[0].strip() == "---":
        for number in range(2, len(lines) + 1):
            if lines[number - 1].startswith("---"):
                return number
    return 1


def lint_file(path: Path) -> Report:
    """Lint one draft."""
    report = Report(path)
    prefix = f"req-{short_name(path)}-"
    # [0-9], not \d: Python's \d matches any Unicode digit, which kramdown's ASCII-only ID
    # pattern never anchors.
    id_pattern = re.compile(rf"^{re.escape(prefix)}([0-9]{{3}})\Z")
    # Split on \n only, as kramdown does: str.splitlines also splits on U+2028 and other
    # separators that kramdown keeps inside a line, which would shift every line number.
    lines = [line.removesuffix("\r") for line in path.read_text(encoding="utf-8").split("\n")]
    try:
        xml = render(path)
        root = parse(xml)
        items = extract(root)
    except RenderError as error:
        report.error(None, str(error))
        return report

    start = body_start(lines)
    source = SourceMap(lines, start)
    inserted = 0
    for item in items:
        if item.kind == "line" and item.number < 0:
            inserted -= item.number
        elif item.kind == "line":
            source.floor(item.number - inserted)
        elif item.kind != "anchor":
            found = source.locate(item.words)
            # Unmatched, an item is reported where the match last was: close to its place.
            item.start, item.end = found or (source.last_line, source.last_line)

    # Every line each requirement ID is written on, outside the YAML header.
    id_lines: dict[str, list[int]] = defaultdict(list)
    for number in range(start, len(lines) + 1):
        for found_id in SOURCE_ID.findall(lines[number - 1]):
            id_lines[found_id].append(number)
    anchors = {el.get("anchor") for el in root.iter() if el.get("anchor")}
    # IDs shown as code (examples of the syntax) or kept in an XML comment were never meant
    # as anchors.
    quiet_ids: set[str] = set()
    for el in root.iter():
        if el.tag in CODE or is_verbatim(el):
            quiet_ids.update(SOURCE_ID.findall("".join(el.itertext())))
    for comment in re.findall(r"<!--(.*?)-->", xml, re.DOTALL):
        quiet_ids.update(SOURCE_ID.findall(comment))
    rendered_ids = set(SOURCE_ID.findall(xml))

    def written_before(req_id: str, item: Item) -> int | None:
        """The line of a block's ID when written before the block's text, else None.

        kramdown puts an IAL that doesn't directly follow a block (a blank line before it)
        on the next block; the lint reports that instead of counting it, as STYLE.md asks
        for the ID right after the paragraph. An ID only written before it, or only in an
        ALD (which IALs anywhere can name), is taken as written: kramdown put it here.
        """
        found = id_lines.get(req_id, [])
        if not found or any(n >= item.start for n in found):
            return None
        before = [n for n in found if not ALD_LINE.match(lines[n - 1])]
        return before[-1] if before else None

    texts = [item for item in items if item.kind == "text"]
    starts = [item.start for item in texts]
    # IDs written in an IAL that are no anchor in the XML. kramdown keeps only the last ID of
    # a block's IALs, so an earlier one is dropped; a stray IAL is dropped or rendered as
    # text. Not reported: IDs only on ALD lines (unused definitions), mentioned in prose
    # rather than an IAL, or inside a {::comment} block (kramdown drops it without a trace,
    # so the lint looks for its tags in the source: kramdown_comment_lines).
    commented = kramdown_comment_lines(lines)
    # ALD names that some IAL or ALD references (a bare word in {: ...}), outside {::comment}.
    ald_uses: set[str] = set()
    # An ALD can name other ALDs too, so its references count.
    for number in range(start, len(lines) + 1):
        if number in commented:
            continue
        line = lines[number - 1]
        bodies = [line[ALD_NAME.match(line).end() :].split("}", 1)[0]] if ALD_LINE.match(line) else IAL_BODY.findall(line)
        for body in bodies:
            ald_uses.update(t for t in body.split() if ALD_REF.fullmatch(t))
    lost: dict[int, list[str]] = defaultdict(list)
    for req_id, found in id_lines.items():
        if req_id in anchors or req_id in quiet_ids:
            continue
        for number in found:
            line = lines[number - 1]
            if number in commented:
                continue
            ald = ALD_NAME.match(line)
            if ald:
                # An ALD only defines attributes; it tags a block when an IAL names it. If
                # some IAL names it and its ID still isn't an anchor, the block also set an
                # ID of its own, and kramdown kept only that one. Unused ALDs stay quiet.
                if ald.group(1) in ald_uses:
                    report.error(
                        number,
                        f"{req_id} in ALD {ald.group(1)} is replaced by another ID on the block that uses it",
                    )
                continue
            if not re.search(r"\{[^}]*" + re.escape(req_id), line):
                continue
            if not KRAMDOWN_ID.fullmatch(req_id):
                report.error(number, f"malformed ID {req_id} (expected {prefix}NNN)")
                continue
            if req_id in rendered_ids:
                report.error(number, f"{req_id} is not directly after a paragraph or list item, so it renders as text")
                continue
            # The block it was meant for: the last one starting above it, if it has an
            # anchor (the ID that replaced this one) and only non-blank lines (its text and
            # IAL lines) are in between.
            owner = bisect.bisect_left(starts, number) - 1
            if (
                owner >= 0
                and texts[owner].anchor
                and all(lines[k - 1].strip() for k in range(texts[owner].end + 1, number))
            ):
                lost[owner].append(req_id)
            else:
                report.error(number, f"{req_id} is not directly after a paragraph or list item")

    for number, raw in enumerate(lines, start=1):
        if number >= start and MIXED_INDENT.match(raw):
            # kramdown-rfc expands tabs before kramdown reads the draft and warns that
            # "undefined behavior will ensue": a tab after spaces lands on a column the
            # author rarely meant, even in a code block.
            report.error(number, "tab after a space in the indentation; indent with spaces")

    for item in items:
        if item.kind not in ("anchor", "heading") or not (item.anchor or "").startswith("req-"):
            continue
        # A heading's anchor that isn't written in the source was made from its text.
        found = id_lines.get(item.anchor, [])
        if not found:
            continue
        number = found[0]
        if item.kind == "heading" and "{#" in lines[number - 1]:
            report.error(number, f"requirement ID {item.anchor} on a heading; put it on the normative paragraph only")
        elif item.where == "list":
            report.error(
                number,
                f"{item.anchor} is not indented to its list item's text, so kramdown puts it on the whole list",
            )
        elif item.where == "span":
            report.error(number, f"{item.anchor} is a span IAL inside the text; put it on its own line after the block")
        else:
            report.error(number, f"{item.anchor} is not directly after a paragraph or list item")

    for item in items:
        if item.kind != "row":
            continue
        for cell in item.cells:
            text = PRESENCE_MARKER.sub("", cell)
            if KEYWORD.search(text) or (text != cell and CONDITION.match(text)):
                report.error(item.start, "keyword in a table cell; state the rule in a tagged paragraph")
                break

    seen: dict[str, int] = {}
    last = 0
    for index, item in enumerate(texts):
        ids = list(lost.get(index, []))
        if item.anchor:
            detached = written_before(item.anchor, item) if item.anchor.startswith("req-") else None
            if detached is not None:
                report.error(detached, f"{item.anchor} is not directly after a paragraph or list item")
            else:
                ids.append(item.anchor)
        req_ids = [i for i in ids if i.startswith("req-")]
        if item.is_requirement:
            if req_ids:
                report.tagged += 1
            else:
                report.untagged.append(item.start)
        elif req_ids:
            report.error(
                item.start,
                f"{req_ids[0]} is on text with no BCP 14 keyword; drop the ID or restore the keyword",
            )
        if len(req_ids) > 1:
            report.error(item.start, f"more than one requirement ID ({', '.join(req_ids)})")
        elif req_ids and len(ids) > 1:
            # kramdown anchors the block with the last id only, so another id replaces it.
            report.error(
                item.start,
                f"{req_ids[0]} shares its block with another ID ({', '.join(ids)}); kramdown keeps only the last",
            )
        for req_id in req_ids:
            match = id_pattern.match(req_id)
            if not match:
                report.error(item.start, f"malformed ID {req_id} (expected {prefix}NNN)")
                continue
            if req_id in seen:
                report.error(item.start, f"duplicate ID {req_id} (first on line {seen[req_id]})")
                continue
            seen[req_id] = item.start
            value = int(match.group(1))
            if value <= last:
                # Not an error: a rule added later takes the next free number.
                report.notes.append(f"line {item.start}: {req_id} goes backwards (after {prefix}{last:03d})")
            last = value
    return report


def escape_data(text: str) -> str:
    """Escape a workflow command's message as GitHub requires."""
    return text.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")


def annotation(path: str, line: int | None, message: str) -> str:
    """Return a GitHub Actions warning annotation for one problem.

    GitHub shows it on that line of the pull request's diff. Property values escape ':'
    and ',' as well, which would otherwise end them.
    """

    def prop(value: str) -> str:
        return escape_data(value).replace(":", "%3A").replace(",", "%2C")

    where = f"file={prop(path)}" + (f",line={line}" if line else "")
    return f"::warning {where},title={prop('Requirement lint')}::{escape_data(message)}"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "paths",
        nargs="*",
        type=Path,
        help="drafts to check (default: every draft in specs/)",
    )
    parser.add_argument("--strict", action="store_true", help="exit 1 if any problem is found")
    parser.add_argument("--verbose", "-v", action="store_true", help="list every untagged requirement")
    args = parser.parse_args(argv)

    if shutil.which(KRAMDOWN_RFC) is None:
        print(
            f"error: {KRAMDOWN_RFC} not found; install the kramdown-rfc gem (see Gemfile) or run "
            "the lint in the ietf-spec-tools Docker image",
            file=sys.stderr,
        )
        return 2
    # In GitHub Actions, each warning also becomes an annotation on the PR diff. GitHub
    # shows at most 10 warning annotations per step; the full list stays in the log. So
    # annotations print after the report, drafts being tagged first: warnings on drafts
    # nobody is tagging yet would otherwise use up the 10 on every pull request.
    annotate = bool(os.environ.get("GITHUB_ACTIONS"))
    annotations: list[tuple[bool, str]] = []

    paths = [p.resolve() for p in args.paths] or sorted(SPECS_DIR.rglob("*.md"))
    # Rendering is most of the time and runs kramdown-rfc as a subprocess, so drafts render
    # in parallel; reports print in path order.
    with ThreadPoolExecutor(max_workers=min(8, os.cpu_count() or 1)) as pool:
        reports = list(pool.map(lint_file, paths))
    problems = 0
    print("Requirement IDs (tagged/requirements):")
    for path, report in zip(paths, reports):
        try:
            rel = path.relative_to(ROOT).as_posix()
        except ValueError:
            rel = path.as_posix()
        print(f"  {rel}: {report.tagged}/{report.total} tagged, {len(report.untagged)} untagged")
        warnings: list[tuple[int | None, str]] = []
        # List untagged lines for drafts that are being tagged, or on request.
        if report.untagged and (args.verbose or args.strict or report.tagged):
            for number in report.untagged:
                print(f"    line {number}: untagged requirement")
                warnings.append((number, "untagged requirement"))
        for (number, message), error in zip(report.problems, report.errors):
            print(f"    {error}")
            warnings.append((number, message))
        for note in report.notes:
            print(f"    note: {note}")
        for number, message in warnings:
            annotations.append((report.tagged == 0, annotation(rel, number, message)))
        problems += len(report.untagged) + len(report.problems)
    if annotate:
        # sorted is stable, so each group keeps path and line order.
        for _, line in sorted(annotations, key=lambda item: item[0]):
            print(line)

    if problems and args.strict:
        print(f"\n{problems} requirement ID problem(s). See STYLE.md (Requirement IDs).")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
