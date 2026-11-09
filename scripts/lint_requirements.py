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
import html.entities
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
# Not {::name} or {:/name}: those are extension tags (kramdown IAL_BLOCK).
IAL_LINE = re.compile(r"^\s*\{:(?![:/])\s*([^}]*)\}\s*$")
# An attribute-list definition ({:name: ...}) only names attributes for later use;
# it attaches nothing to the block above it.
ALD_LINE = re.compile(r"^\s*\{:[\w-]+:")
# Its name and attributes, as kramdown reads them (ALD_START). An IAL naming it (a bare
# word, {: name}) gets its attributes, wherever in the draft it is defined.
ALD_DEF = re.compile(r"^\s*\{:(\w[\w-]*):((?:\\\}|[^}])+)\}\s*$")
# One attribute of an IAL, as kramdown scans them (ALD_TYPE_ANY): a quoted key-value pair
# (only id= sets an id, and title="#req-x" none), a reference to an ALD by name, a run of
# #id and .class names, or any other whitespace-separated token. kramdown ignores unquoted
# values such as id=x.
IAL_ATTR = re.compile(
    r"""(?:^|(?<=\s))(?:(\w[\w-]*)=(?:"([^"]*)"|'([^']*)')|(\w[\w-]*)(?=\s|$)|"""
    r"""((?:#[A-Za-z][\w:-]*|\.[^\s.#]+)+)(?=\s|$)|\S+)"""
)
# Bullets, numbered items and definition-list definitions (": text"); each is its own block.
LIST_MARKER = re.compile(r"^\s*(?:[-*+]|\d+\.|:)\s+")
# kramdown (and kramdown-rfc) fence code with ~~~ only. A ``` line is ordinary text: a ```
# pair renders as inline verbatim, which strip_code_spans already removes from the prose.
FENCE = re.compile(r"^( *)(~{3,})(.*)$")
# A fence opener as kramdown reads it (FENCED_CODEBLOCK_MATCH): at its container's column 0,
# with at most one info word ("~~~ json", not "~~~ a b").
FENCE_OPEN = re.compile(r"^(~{3,})(\s*\S*\s*)$")
# A line that is only a kramdown block extension tag ({::name attrs}, {::name /}, {:/name} or
# {:/}). Anything after the tag makes the line paragraph text instead.
EXT_BLOCK = re.compile(r"^\{::(\w+)(?:\s(?:\\\}|[^}])*?)?(/)?\}\s*$|^\{:/(?:\w[\w-]*)?\}\s*$")
# The line closing a block {::comment} (kramdown's EXT_BLOCK_STOP_STR), relative to the
# opener's container: at most three spaces in. kramdown drops everything up to it.
EXT_COMMENT_STOP = re.compile(r"^ {0,3}\{:/(?:comment)?\}\s*$")
# A span {::comment}...{:/comment} (or {:/}): kramdown drops it from the paragraph.
EXT_COMMENT_SPAN = re.compile(r"\{::comment(?:\s[^}]*?)?(?<!/)\}.*?\{:/(?:comment)?\}")
# A run of backticks that is not backslash-escaped: a code span may open there.
BACKTICKS = re.compile(r"(?<!\\)`+")
# Inline markup that renders as nothing between letters: * emphasis, link brackets and
# targets, HTML comments and tags, and span IALs and extension tags. Removing it shows a
# keyword split by markup (M**UST**, [MU](x)ST, M<!-- -->UST), which renders whole.
# Not _: kramdown leaves an intraword _ as text.
INLINE_MARKUP = re.compile(r"<!--.*?-->|</?[A-Za-z][^>]*>|\{:[^}]*\}|\]\([^)]*\)|\]\[[^\]]*\]|[*\[\]]")
# A character reference as kramdown decodes it (HTML_ENTITY_RE): &name;, &#77; or &#x4d;.
# &#X4D; (capital X) and references without their ';' stay literal text.
CHAR_REF = re.compile(r"&([\w:][\-\w.:]*);|&#(\d+);|&#x([0-9a-fA-F]+);")
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


def decode_refs(text: str) -> str:
    """Decode character references the way kramdown renders them.

    &#77;UST shows as MUST, so it has to count as the keyword. Unknown names and code
    points Python can't represent stay as written, as kramdown leaves them.
    """

    def char(match: re.Match[str]) -> str:
        name, decimal, hexa = match.groups()
        # int() is inside the try too: a decimal reference of thousands of digits trips
        # Python's int-from-string digit limit (ValueError) and must stay as written.
        try:
            if name is not None:
                code = html.entities.name2codepoint.get(name)
            else:
                code = int(decimal) if decimal is not None else int(hexa, 16)
            return chr(code) if code is not None else match.group(0)
        except (ValueError, OverflowError):
            return match.group(0)

    return CHAR_REF.sub(char, text)


def code_span_end(text: str, start: int, end: int) -> int | None:
    """Return where the code span opened by the backtick run text[start:end] ends.

    Mirrors kramdown's parse_codespan (kramdown 2.4) and mpp-tools' gap report: the span
    closes only at a later run of exactly as many backticks, so ``MUST` x shows MUST
    as prose (checked with kramdown-rfc). None means the run is literal text: nothing
    closes it, or it is a single backtick with whitespace (or the start of the text)
    before it and whitespace after it.
    """
    run = end - start
    if run == 1 and (start == 0 or text[start - 1].isspace()) and end < len(text) and text[end].isspace():
        return None
    close = text.find("`" * run, end)
    return None if close < 0 else close + run


def strip_code_spans(text: str) -> str:
    """Replace each kramdown code span with a space; its text is verbatim, never a rule.

    Pairing any two backtick runs with one regex would hide a keyword after
    an opener that nothing of its length closes, which kramdown prints as text.
    """
    pieces: list[str] = []
    position = 0
    while match := BACKTICKS.search(text, position):
        close = code_span_end(text, match.start(), match.end())
        if close is None:
            pieces.append(text[position : match.end()])
            position = match.end()
            continue
        pieces.append(text[position : match.start()])
        pieces.append(" ")
        position = close
    pieces.append(text[position:])
    return "".join(pieces)


@dataclass
class Segment:
    """A paragraph or list item and the requirement IDs attached to it."""

    line: int
    first: str
    end: int = 0
    ids: list[str] = field(default_factory=list)
    # The attribute strings of its IALs; segments() turns them into ids at the end, once it
    # has seen every ALD they may name.
    ials: list[str] = field(default_factory=list)
    # Column of a list item's text; an IAL indented less applies to the whole list.
    indent: int = 0
    # Blockquote depth of its first line: an IAL at another depth doesn't tag it.
    quote: int = 0
    # Continuation lines, joined only when read (appending to one string is quadratic).
    rest: list[str] = field(default_factory=list)

    @property
    def text(self) -> str:
        return " ".join([self.first, *self.rest])

    @property
    def is_requirement(self) -> bool:
        text = EXT_COMMENT_SPAN.sub("", strip_code_spans(self.text))
        # Decoded after code spans go: inside one, &#77; is shown literally.
        text = decode_refs(text)
        # The source and the text with inline markup removed: a keyword in either counts, so
        # the markup check only ever adds requirements.
        return any(KEYWORD.search(QUOTED_KEYWORDS.sub("", t)) for t in (text, INLINE_MARKUP.sub("", text)))


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


def ial_ids(
    attrs: str, alds: dict[str, list[str]] | None = None, seen: frozenset[str] = frozenset()
) -> list[str]:
    """Return the IDs a block IAL sets, in order: #id names and quoted id="..." values.

    kramdown keeps only the last one as the block's anchor. A name of an ALD in alds (its
    definitions' attribute strings) brings in that ALD's IDs first, as kramdown applies
    referenced ALDs before the IAL's own attributes. seen stops a reference cycle.
    """
    ids: list[str] = []
    referenced: list[str] = []
    for match in IAL_ATTR.finditer(attrs):
        key, double, single, ref, names = match.groups()
        if key == "id":
            ids.append(double if double is not None else single)
        elif names:
            ids.extend(re.findall(r"#([A-Za-z][\w:-]*)", names))
        elif ref and alds and ref in alds and ref not in seen:
            for definition in alds[ref]:
                referenced.extend(ial_ids(definition, alds, seen | {ref}))
    return referenced + ids


def quote_depth(raw: str) -> int:
    """Return how many blockquote markers (>) open a line."""
    match = re.match(r"^ {0,3}((?:> ?)+)", raw.expandtabs(4))
    return match.group(1).count(">") if match else 0


def comment_closes(lines: list[str], number: int, last_close: int) -> bool:
    """Whether the <!-- opening line number is closed by a later -->, as kramdown sees it.

    At the top level kramdown matches a comment across the rest of the source, so any later
    --> closes it. Inside a blockquote kramdown parses the quote's lines on their own, so only
    a --> on a following line of that same quote counts; a <!-- with none is paragraph text.
    """
    depth = quote_depth(lines[number - 1])
    if depth == 0:
        return last_close > number
    for text in lines[number:]:
        if quote_depth(text) != depth:
            return False
        if "-->" in text:
            return True
    return False


def container_text(raw: str, depth: int) -> str:
    """Return raw as the segments loop reads it: tabs expanded and, in a blockquote, one >
    marker dropped. Outside a quote nothing is dropped, so a > line never reads as a tag."""
    line = raw.expandtabs(4)
    return re.sub(r"^( *)> ?", r"\1", line) if depth else line


def container_end(lines: list[str], number: int, base: int, closes: re.Pattern[str]) -> int:
    """Return the first line after line number that closes matches in the same container,
    or 0 if the container ends first.

    kramdown parses a blockquote's lines, and a list item's lines with its text column
    (base) removed, as their own source, and looks for a fence's closer or a {::comment}'s
    stop tag only there. So the closer must be at the opener's quote depth and is matched
    from column base on. A line at a smaller quote depth leaves the quote, and a non-blank
    line indented less than base leaves the item. Without a closer kramdown renders the
    opener as text, so the lint must not hide anything either.
    """
    depth = quote_depth(lines[number - 1])
    for later in range(number + 1, len(lines) + 1):
        raw = lines[later - 1]
        level = quote_depth(raw)
        if level < depth:
            return 0
        text = container_text(raw, depth)
        if text.strip() and len(text) - len(text.lstrip()) < base:
            return 0
        if level == depth and closes.match(text[base:]):
            return later
    return 0


def fence_end(lines: list[str], number: int, base: int) -> int:
    """Return the line closing a ~~~ fence opened on line number, or 0 if it opens none.

    As kramdown (FENCED_CODEBLOCK_MATCH): opener and closer sit at the container's column 0
    (base), and only a run at least as long as the opener with nothing after it closes. So
    a ``` line or an indented ~~~ inside the block is code, and a ~~~ with no closer is text.
    """
    raw = lines[number - 1]
    opener = FENCE_OPEN.match(container_text(raw, quote_depth(raw))[base:])
    if not opener:
        return 0
    run, info = opener.groups()
    # kramdown's regex backtracks: with no closer as long as the whole run, it tries a shorter
    # run, down to ~~~, and reads the tildes it drops as the start of the info word
    # (~~~~~~ is ~~~~ with info ~~). That works only with no space between them.
    for length in range(len(run), 2, -1):
        if length < len(run) and info.strip() and info[0].isspace():
            break
        end = container_end(lines, number, base, re.compile(rf"^~{{{length}}}~*\s*$"))
        if end:
            return end
    return 0


# A kramdown header ID ({#id} at the end of a heading line). A requirement ID there would be a
# second anchor for the same ID, or an ID on text that states no rule.
HEADING_ID = re.compile(r"^ {0,3}(?:> ?)*#{1,6}\s.*\{#(req-[^}\s]+)\}\s*$")
# A tab after a space in a line's indentation. kramdown strips a list item's indentation
# first and then expands such a tab from there, so expandtabs(4) can misplace the line.
MIXED_INDENT = re.compile(r"^[ \t]*(?:> ?)*[ \t]* \t")


def close_items(list_stack: list[int], column: int) -> None:
    """Close the open list items whose text starts right of column: a block there is
    outside them."""
    while list_stack and list_stack[-1] > column:
        list_stack.pop()


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
    # IAL attribute strings not attached to a segment, resolved to IDs at the end like
    # Segment.ials.
    detached_ials: list[tuple[int, str]] = []
    misindented_ials: list[tuple[int, str]] = []
    # ALD definitions by name, in draft order. kramdown resolves references after parsing,
    # so an ALD applies to IALs before it too.
    alds: dict[str, list[str]] = {}
    current: Segment | None = None
    # Text columns of the open list items, outermost first. They survive blank lines,
    # so a later paragraph indented to one (a loose-list continuation) still belongs
    # to that item, even after a nested item has closed.
    list_stack: list[int] = []
    code_lines: set[int] = set()
    # The line closing the open ~~~ fence (fence_end), or 0 outside one.
    fence_close = 0
    # Text column of a list item whose ID line just closed it. kramdown still reads the next
    # line as that item's text (a lazy continuation) unless a blank line comes first.
    lazy_indent = 0
    # Inside a block HTML comment (a line opening with <!-- and no --> after it). kramdown
    # drops everything up to the line holding -->, so its keywords and IDs don't count.
    in_comment = False
    # The {:/comment} line closing the open block {::comment} (container_end), or 0 outside
    # one. kramdown drops everything up to it, the same way.
    ext_comment_close = 0
    # The last line holding -->. A <!-- with no --> after it opens nothing: kramdown renders
    # it as paragraph text and goes on reading the rest of the draft as usual.
    last_close = max((i for i, text in enumerate(lines, start=1) if "-->" in text), default=0)
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
        if in_comment:
            # Checked before fences: a ~~~ inside a comment is comment text, and treating it
            # as a fence would leave the rest of the draft "in code" past the -->.
            code_lines.add(number)
            in_comment = "-->" not in line
            continue
        if ext_comment_close:
            code_lines.add(number)
            if number == ext_comment_close:
                ext_comment_close = 0
            continue
        if fence_close:
            code_lines.add(number)
            if number == fence_close:
                fence_close = 0
            continue
        if current is None and FENCE.match(line):
            # A fence can't interrupt a paragraph: kramdown keeps a ~~~ right after paragraph
            # text as more of that text. A fence less indented than an open item's text ends
            # that item's list.
            while list_stack and list_stack[-1] > column:
                list_stack.pop()
            fence_close = fence_end(lines, number, list_stack[-1] if list_stack else 0)
            if fence_close:
                code_lines.add(number)
                lazy_indent = 0
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
        if ial and current is not None and quote_depth(raw) != current.quote:
            if quote_depth(raw) > current.quote:
                # '> {: #id}' after unquoted text: a blockquote can't interrupt a paragraph,
                # so kramdown reads the line as more of it (with its '>'); it tags nothing.
                current.rest.append(raw.strip())
                current.end = number
                continue
            # Less quoted than the paragraph: kramdown ends the quote here and puts the IAL
            # on the blockquote, not the paragraph inside it (checked with kramdown-rfc).
            detached_ials.append((number, ial.group(1)))
            current = None
            continue
        if ial:
            lazy_indent = 0
            if current is not None and column < current.indent:
                # kramdown ends the list here and puts the IAL on the list, not the item. The
                # items it closes take no more blocks, and no lazy line follows: a paragraph
                # after it is outside the list.
                misindented_ials.append((number, ial.group(1)))
                close_items(list_stack, column)
            elif current is not None:
                current.ials.append(ial.group(1))
                # The item stays open: kramdown still reads the next line as its text.
                lazy_indent = current.indent
            else:
                detached_ials.append((number, ial.group(1)))
            # kramdown ends the block at the IAL: the next line starts a new one.
            current = None
            continue
        lazy, lazy_indent = lazy_indent, 0
        if not stripped:
            current = None
            continue
        ext = EXT_BLOCK.match(stripped)
        if ext and current is not None:
            # Extension tags don't end a kramdown paragraph (PARAGRAPH_END): inside one,
            # kramdown reads {::comment}, {::options /}, {::nomarkdown} and stop tags as spans
            # and the paragraph goes on, so a ~~~ after them is still its text.
            # EXT_COMMENT_SPAN drops a comment from that text.
            current.rest.append(stripped)
            current.end = number
            continue
        if ext and ext.group(1) == "comment" and not ext.group(2):
            # The stop tag must be in the opener's own quote and list item (container_end).
            # The comment doesn't end that item's list, but one less indented does.
            stack = [c for c in list_stack if c <= column]
            ext_comment_close = container_end(lines, number, stack[-1] if stack else 0, EXT_COMMENT_STOP)
            if ext_comment_close:
                code_lines.add(number)
                list_stack[:] = stack
                continue
        if (
            stripped.startswith(("#", "|", "<!--"))
            or (ext and not (ext.group(1) == "comment" and not ext.group(2)))
            or re.match(r"^---\s*\w*$", stripped)
        ):
            if stripped.startswith("<!--") and "-->" not in stripped[4:] and comment_closes(lines, number, last_close):
                code_lines.add(number)
                in_comment = True
            current = None
            if stripped.startswith("---"):
                # A thematic break (or a kramdown-rfc section line) ends every open list.
                list_stack.clear()
            else:
                # A heading, table, comment or extension indented to an open item's text is
                # more of that item: only the items it is less indented than end.
                close_items(list_stack, column)
            continue
        if ALD_LINE.match(line):
            ald = ALD_DEF.match(line)
            if ald:
                alds.setdefault(ald.group(1), []).append(ald.group(2))
            current = None
            continue
        if BLOCK_END.match(stripped):
            current = None
            if not stripped.startswith("^"):
                close_items(list_stack, column)
            continue
        if current is None and THEMATIC_BREAK.match(stripped):
            list_stack.clear()
            continue
        marker = LIST_MARKER.match(line)
        if not marker and current is None and lazy and column < lazy:
            # Lazy continuation: still the item's text, so its ID must be indented to it.
            current = Segment(number, stripped, number, indent=lazy, quote=quote_depth(raw))
            result.append(current)
            continue
        if marker:
            # Close items whose text starts right of this marker: it is their sibling or
            # belongs to an outer list.
            while list_stack and list_stack[-1] > column:
                list_stack.pop()
            list_stack.append(marker.end())
            # The item's first block can be a fence: kramdown reads the text after the marker
            # from the item's column 0 (- ~~~). Only where kramdown starts an item here: a
            # definition (:) always does, a bullet or number not inside top-level paragraph
            # text, which it can't interrupt.
            if current is None or current.indent or stripped.startswith(":"):
                fence_close = fence_end(lines, number, marker.end())
                if fence_close:
                    code_lines.add(number)
                    current = None
                    continue
            current = Segment(number, stripped, number, indent=marker.end(), quote=quote_depth(raw))
            result.append(current)
        elif current is None:
            # A paragraph continues the innermost open item it is indented to; items
            # indented further are closed, and with none left the list has ended.
            while list_stack and list_stack[-1] > column:
                list_stack.pop()
            indent = list_stack[-1] if list_stack else 0
            current = Segment(number, stripped, number, indent=indent, quote=quote_depth(raw))
            result.append(current)
        else:
            current.rest.append(stripped)
            current.end = number

    def req_ids(found: list[tuple[int, str]]) -> list[tuple[int, str]]:
        return [(n, i) for n, attrs in found for i in ial_ids(attrs, alds) if i.startswith("req-")]

    for segment in result:
        segment.ids = [i for attrs in segment.ials for i in ial_ids(attrs, alds)]
    return result, req_ids(detached_ials), req_ids(misindented_ials), code_lines


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
            cell = decode_refs(strip_code_spans(cell)).strip()
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

    for number, raw in enumerate(lines, start=1):
        heading = None if number in code_lines else HEADING_ID.match(raw.expandtabs(4))
        if heading:
            report.errors.append(
                f"line {number}: requirement ID {heading.group(1)} on a heading; "
                "put it on the normative paragraph only"
            )

    for number, raw in enumerate(lines, start=1):
        if number not in code_lines and MIXED_INDENT.match(raw):
            report.errors.append(f"line {number}: tab after a space in the indentation; indent with spaces")

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
        elif req_ids and len(segment.ids) > 1:
            # kramdown anchors the block with the last id only, so another id can replace it.
            report.errors.append(
                f"line {segment.line}: {req_ids[0]} shares its block with another ID "
                f"({', '.join(segment.ids)}); kramdown keeps only the last"
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
