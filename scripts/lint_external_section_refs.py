#!/usr/bin/env python3
"""Prevent new hardcoded section-number references to external documents.

Hardcoded cross-document section references are brittle (e.g., "Section 13.4
of {{I-D.httpauth-payment}}") because section numbers change as drafts evolve.

This lint enforces an allowlist of existing occurrences and fails CI when new
ones are introduced.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPECS_DIR = ROOT / "specs"
ALLOWLIST_PATH = Path(__file__).resolve().with_name("allowed_external_section_refs.txt")

PATTERN = re.compile(r"Section\s+\d+(?:\.\d+)*\s+of\s+\{\{I-D\.[^}]+\}\}")


def _normalize_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def load_allowlist() -> set[str]:
    if not ALLOWLIST_PATH.exists():
        return set()

    allowed: set[str] = set()
    for line in ALLOWLIST_PATH.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        allowed.add(stripped)
    return allowed


def collect_occurrences() -> set[str]:
    found: set[str] = set()
    for file_path in sorted(SPECS_DIR.rglob("*.md")):
        rel = file_path.relative_to(ROOT).as_posix()
        content = file_path.read_text(encoding="utf-8")
        for match in PATTERN.finditer(content):
            reference = _normalize_whitespace(match.group(0))
            found.add(f"{rel}::{reference}")
    return found


def main() -> int:
    allowed = load_allowlist()
    found = collect_occurrences()

    new_refs = sorted(found - allowed)
    stale_allowlist = sorted(allowed - found)

    if not new_refs and not stale_allowlist:
        print("No new hardcoded external section references found.")
        return 0

    if new_refs:
        print("Found new hardcoded external section references:")
        for ref in new_refs:
            print(f"  + {ref}")
        print(
            "\nUse stable cross-references (anchors/labels) instead of numeric section"
            " references where possible."
        )

    if stale_allowlist:
        print("\nAllowlist contains entries no longer present:")
        for ref in stale_allowlist:
            print(f"  - {ref}")
        print("\nRemove stale entries from scripts/allowed_external_section_refs.txt.")

    return 1


if __name__ == "__main__":
    sys.exit(main())
