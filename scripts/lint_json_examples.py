#!/usr/bin/env python3
"""Ensure the JSON examples in specs parse as JSON.

Readers and implementers copy examples straight out of the drafts, and SDK
conformance tests load them, so a ~~~json block that is not valid JSON is a
bug. The common slip is wrapping a long string across lines, either as two
adjacent string literals or as a literal newline inside one.

Blocks that use placeholders on purpose, such as `{ ... }` or
`<challenge methodDetails.chainId>` outside a string, are illustrative and
skipped.
"""

from __future__ import annotations

import json
import re
import sys
import textwrap
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPECS_DIR = ROOT / "specs"

FENCE_RE = re.compile(r"\A(?P<indent>[ \t]*)(?P<fence>~~~|```)[ \t]*json[ \t]*\Z")
# Strings may span lines here: a string wrapped with a literal newline is still
# one string, so placeholder-like text inside it is not taken for a placeholder.
STRING_RE = re.compile(r'"(?:[^"\\]|\\.)*"')
# An elision (`...`) or an angle-bracket placeholder outside a string.
PLACEHOLDER_RE = re.compile(r"\.\.\.|…|<[^<>\n]+>")


@dataclass
class InvalidExample:
    line: int
    error: str


def json_blocks(content: str) -> list[tuple[int, str]]:
    """Each JSON block in a markdown document with the line its body starts on."""
    blocks: list[tuple[int, str]] = []
    lines = content.splitlines()
    index = 0
    while index < len(lines):
        opening = FENCE_RE.match(lines[index])
        index += 1
        if not opening:
            continue
        start = index
        closing = opening.group("indent") + opening.group("fence")
        while index < len(lines) and lines[index].rstrip() != closing:
            index += 1
        blocks.append((start + 1, textwrap.dedent("\n".join(lines[start:index]))))
        index += 1
    return blocks


def is_illustrative(block: str) -> bool:
    return bool(PLACEHOLDER_RE.search(STRING_RE.sub('""', block)))


def _reject_constant(name: str) -> None:
    # json.loads accepts NaN and Infinity, which are not JSON (RFC 8259).
    raise json.JSONDecodeError(f"{name} is not valid JSON", name, 0)


def invalid_examples(content: str) -> list[InvalidExample]:
    invalid: list[InvalidExample] = []
    for start, block in json_blocks(content):
        if is_illustrative(block):
            continue
        try:
            json.loads(block, parse_constant=_reject_constant)
        except json.JSONDecodeError as error:
            invalid.append(InvalidExample(start + error.lineno - 1, error.msg))
    return invalid


def main() -> int:
    failures = 0
    for path in sorted(SPECS_DIR.rglob("*.md")):
        for example in invalid_examples(path.read_text(encoding="utf-8")):
            failures += 1
            print(f"{path.relative_to(ROOT).as_posix()}:{example.line}: {example.error}")

    if failures:
        print(
            f"\n{failures} JSON example(s) do not parse. Join strings wrapped across"
            " lines into one literal, or mark an illustrative block with a"
            " placeholder such as { ... }."
        )
        return 1

    print("All JSON examples in specs parse.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
