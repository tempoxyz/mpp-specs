#!/usr/bin/env python3
"""Check that the base64url examples in the specs decode to the JSON shown for them.

Each complete encoded value in a code block (request="...", opaque="...",
"Authorization: Payment ..." and "Payment-Receipt: ...") must be unpadded
base64url of JSON. A value cut short with "..." and an upper-case placeholder
such as BASE64URL_JCS_RECEIPT are skipped. Values may wrap
across lines; the whitespace between the pieces is removed.

When a paragraph mentioning "decoded" sits between the code block and the next
JSON block, that JSON must equal the value it names: request or opaque when the
paragraph names them, the credential for "credential", the receipt for
"receipt", and otherwise the block's last encoded value. In the JSON, a string
with "..." stands for any string with the same text around it, and one in angle
brackets for any string; JSON that does not parse is skipped.
"""

from __future__ import annotations

import base64
import binascii
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPECS_DIR = ROOT / "specs"

FENCE = re.compile(r"^(~~~|\x60\x60\x60)\s*([\w+-]*)")
B64 = r"[A-Za-z0-9_-]"
QUOTED = re.compile(rf'\b(request|opaque)="({B64}[A-Za-z0-9_\-\s]*?)(\.\.\.|…)?"')
HEADER = re.compile(
    r"^\s*(Authorization: Payment|Payment-Authorization: Payment|Payment-Receipt:)"
    rf"\s+({B64}+(?:\n[ \t]+{B64}+)*)(\.\.\.|…)?[ \t]*$",
    re.MULTILINE,
)
PLACEHOLDER = re.compile(r"^[A-Z0-9_]+$")  # such as BASE64URL_JCS_RECEIPT
KIND = {
    "Authorization: Payment": "credential",
    "Payment-Authorization: Payment": "credential",
    "Payment-Receipt:": "receipt",
}


@dataclass
class Block:
    lang: str
    start: int  # 1-based line number of the block's first content line
    text: str
    prose_before: str


@dataclass
class Encoded:
    kind: str
    line: int
    value: str


def blocks(text: str) -> list[Block]:
    out: list[Block] = []
    lines = text.split("\n")
    prose: list[str] = []
    i = 0
    while i < len(lines):
        m = FENCE.match(lines[i])
        if not m:
            prose.append(lines[i])
            i += 1
            continue
        fence, lang = m.group(1), m.group(2).lower()
        j = i + 1
        while j < len(lines) and not lines[j].startswith(fence):
            j += 1
        out.append(Block(lang, i + 2, "\n".join(lines[i + 1 : j]), "\n".join(prose)))
        prose = []
        i = j + 1
    return out


def encoded_values(block: Block) -> list[Encoded]:
    found: list[tuple[int, Encoded]] = []
    for m in QUOTED.finditer(block.text):
        if m.group(3):
            continue
        line = block.start + block.text.count("\n", 0, m.start(2))
        found.append((m.start(), Encoded(m.group(1), line, re.sub(r"\s+", "", m.group(2)))))
    for m in HEADER.finditer(block.text):
        if m.group(3):
            continue
        line = block.start + block.text.count("\n", 0, m.start(2))
        found.append((m.start(), Encoded(KIND[m.group(1)], line, re.sub(r"\s+", "", m.group(2)))))
    return [e for _, e in sorted(found, key=lambda p: p[0]) if not PLACEHOLDER.match(e.value)]


def decode(value: str) -> object:
    try:
        raw = base64.b64decode(value + "=" * (-len(value) % 4), altchars=b"-_", validate=True)
    except (binascii.Error, ValueError) as e:
        raise ValueError(f"not base64url: {e}") from None
    try:
        return json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        raise ValueError(f"does not decode to JSON: {e}") from None


ELLIPSIS = re.compile(r"\.\.\.|…")


def matches(shown: object, actual: object) -> bool:
    """Whether the JSON shown describes the decoded value.

    A shown string with "..." matches any string with the same text around it, and
    a shown string in angle brackets, such as "<JWE compact>", matches any string.
    """
    if isinstance(shown, dict) and isinstance(actual, dict):
        return shown.keys() == actual.keys() and all(matches(shown[k], actual[k]) for k in shown)
    if isinstance(shown, list) and isinstance(actual, list):
        return len(shown) == len(actual) and all(map(matches, shown, actual))
    if isinstance(shown, str) and isinstance(actual, str):
        if shown.startswith("<") and shown.endswith(">"):
            return True
        pieces = ELLIPSIS.split(shown)
        if len(pieces) > 1:
            pattern = ".*".join(re.escape(p) for p in pieces)
            return re.fullmatch(pattern, actual, re.DOTALL) is not None
    return type(shown) is type(actual) and shown == actual


def decoded_target(prose: str, values: list[Encoded]) -> Encoded | None:
    """The value a "Decoded ..." paragraph describes, or None when there is none."""
    paragraph = prose.strip().split("\n\n")[-1].lower()
    if "decoded" not in paragraph:
        return None
    for kind in ("request", "opaque", "credential", "receipt"):
        if kind in paragraph:
            matching = [v for v in values if v.kind == kind]
            return matching[-1] if matching else None
    return values[-1]


def lint_text(text: str, name: str) -> list[str]:
    errors: list[str] = []
    previous: list[Encoded] = []
    for block in blocks(text):
        if block.lang == "json" and previous:
            target = decoded_target(block.prose_before, previous)
            previous = []
            if target is not None:
                try:
                    shown = json.loads(block.text)
                    actual = decode(target.value)
                except (json.JSONDecodeError, ValueError):
                    pass  # placeholders in the JSON, or a bad value reported below
                else:
                    if not matches(shown, actual):
                        compact = json.dumps(actual, separators=(",", ":"))
                        errors.append(
                            f"{name}:{target.line}: {target.kind} decodes to {compact}, "
                            f"not the JSON shown at line {block.start}"
                        )
        values = encoded_values(block)
        for value in values:
            try:
                decode(value.value)
            except ValueError as e:
                errors.append(f"{name}:{value.line}: {value.kind}: {e}")
        if values:
            previous = values
    return errors


def main(argv: list[str]) -> int:
    paths = [Path(a).resolve() for a in argv] or sorted(SPECS_DIR.rglob("*.md"))
    errors: list[str] = []
    for path in paths:
        name = str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path)
        errors += lint_text(path.read_text(encoding="utf-8"), name)
    for e in errors:
        print(e, file=sys.stderr)
    if errors:
        print(f"✗ {len(errors)} encoded example error(s)", file=sys.stderr)
        return 1
    print("✓ All encoded examples decode to the JSON shown")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
