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
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPECS_DIR = ROOT / "specs"
ALLOWLIST_PATH = Path(__file__).resolve().with_name("allowed_external_section_refs.txt")

PATTERN = re.compile(r"Section\s+\d+(?:\.\d+)*\s+of\s+\{\{I-D\.[^}]+\}\}")


def _normalize_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def load_allowlist() -> Counter[str]:
    if not ALLOWLIST_PATH.exists():
        return Counter()

    # Repeating the same entry increases its allowed occurrence count.
    allowed: Counter[str] = Counter()
    for line in ALLOWLIST_PATH.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        allowed[stripped] += 1
    return allowed


def collect_occurrences() -> Counter[str]:
    found: Counter[str] = Counter()
    for file_path in sorted(SPECS_DIR.rglob("*.md")):
        rel = file_path.relative_to(ROOT).as_posix()
        content = file_path.read_text(encoding="utf-8")
        for match in PATTERN.finditer(content):
            reference = _normalize_whitespace(match.group(0))
            found[f"{rel}::{reference}"] += 1
    return found


def main() -> int:
    allowed = load_allowlist()
    found = collect_occurrences()

    all_keys = sorted(set(found) | set(allowed))
    new_refs = [(key, found[key] - allowed[key]) for key in all_keys if found[key] > allowed[key]]
    stale_allowlist = [(key, allowed[key] - found[key]) for key in all_keys if allowed[key] > found[key]]

    if not new_refs and not stale_allowlist:
        print("No new hardcoded external section references found.")
        return 0

    if new_refs:
        print("Found new hardcoded external section references:")
        for ref, extra_count in new_refs:
            print(f"  + {ref} (new occurrences: +{extra_count})")
        print(
            "\nUse stable cross-references (anchors/labels) instead of numeric section"
            " references where possible."
        )

    if stale_allowlist:
        print("\nAllowlist contains entries no longer present:")
        for ref, missing_count in stale_allowlist:
            print(f"  - {ref} (stale occurrences: -{missing_count})")
        print("\nRemove stale entries from scripts/allowed_external_section_refs.txt.")

    return 1


if __name__ == "__main__":
    sys.exit(main())
