#!/usr/bin/env python3
"""Generate static HTML pages for paymentauth.org/problems/ URIs.

Reads Jinja2 templates from pages/templates/ and produces one HTML page per
problem type, plus an index page.  Output goes to pages/problems/ using the
directory-with-index.html convention so that GitHub Pages serves clean URLs
(e.g. /problems/payment-required -> /problems/payment-required/index.html).

Core problem definitions come from the core specification's Error Codes table.
Jinja2 is already available via xml2rfc's dependencies.
"""

import json
import os
import re
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATES_DIR = os.path.join(ROOT, "pages", "templates")
PAGES_DIR = os.path.join(ROOT, "pages", "problems")

BASE_URI = "https://paymentauth.org/problems/"

# ── Problem definitions ─────────────────────────────────────────────────────

def read_core_problems(spec_path):
    """Read the core spec's Error Codes table as the page definitions."""
    section = spec_path.read_text().split("## Error Codes\n", 1)[1]
    section = re.split(r"\n#{1,2} ", section, maxsplit=1)[0]
    problems = []
    for line in section.splitlines():
        if not line.startswith("| \x60"):
            continue
        row = re.fullmatch(r"\| \x60([a-z0-9-]+)\x60 \| ([45][0-9]{2}) \| (.+) \|", line)
        if not row:
            raise ValueError(f"Invalid core error row: {line}")
        slug, status, description = row.groups()
        if any(p["slug"] == slug for p in problems):
            raise ValueError(f"Duplicate core error code: {slug}")
        problems.append({
            "slug": slug,
            "title": slug.replace("-", " ").title(),
            "http_status": int(status),
            "description": description,
            "spec_label": spec_path.stem.rsplit("-", 1)[0],
            "spec_docname": spec_path.stem,
        })
    if not problems:
        raise ValueError(f"No error codes found in {spec_path}")
    return problems


CORE_SPEC = sorted(Path(ROOT, "specs", "core").glob("draft-httpauth-payment-*.md"))[-1]
CORE_PROBLEMS = read_core_problems(CORE_SPEC)

SESSION_PROBLEMS = [
    {"slug": "session/invalid-signature", "title": "Invalid Signature", "http_status": 402,
     "description": "The voucher or close-request signature could not be verified.",
     "spec_label": "draft-tempo-session"},
    {"slug": "session/signer-mismatch", "title": "Signer Mismatch", "http_status": 402,
     "description": "The signer is not authorized for this payment channel.",
     "spec_label": "draft-tempo-session"},
    {"slug": "session/amount-exceeds-deposit", "title": "Amount Exceeds Deposit", "http_status": 402,
     "description": "The voucher amount exceeds the channel deposit.",
     "spec_label": "draft-tempo-session"},
    {"slug": "session/delta-too-small", "title": "Delta Too Small", "http_status": 402,
     "description": "The amount increase is below the server's minimum voucher delta.",
     "spec_label": "draft-tempo-session"},
    {"slug": "session/channel-not-found", "title": "Channel Not Found", "http_status": 402,
     "description": "No payment channel with this ID exists.",
     "spec_label": "draft-tempo-session"},
    {"slug": "session/channel-finalized", "title": "Channel Finalized", "http_status": 402,
     "description": "The payment channel has been closed and can no longer accept vouchers.",
     "spec_label": "draft-tempo-session"},
    {"slug": "session/challenge-not-found", "title": "Challenge Not Found", "http_status": 402,
     "description": "The challenge ID is unknown or has expired.",
     "spec_label": "draft-tempo-session"},
    {"slug": "session/insufficient-balance", "title": "Insufficient Balance", "http_status": 402,
     "description": "There is insufficient authorized balance in the channel for this request.",
     "spec_label": "draft-tempo-session"},
]

ALL_PROBLEMS = CORE_PROBLEMS + SESSION_PROBLEMS


def make_example(slug, title, http_status):
    return json.dumps({
        "type": f"{BASE_URI}{slug}",
        "title": title,
        "status": http_status,
        "detail": "Human-readable description of the error.",
    }, indent=2)


def main():
    env = Environment(
        loader=FileSystemLoader(TEMPLATES_DIR),
        autoescape=select_autoescape(default_for_string=True, default=True),
    )
    problem_tpl = env.get_template("problem.html")
    index_tpl = env.get_template("problems_index.html")

    print("==> Generating problem type pages")

    for p in ALL_PROBLEMS:
        slug = p["slug"]
        depth = slug.count("/") + 1
        root_prefix = "/".join([".."] * (depth + 1))
        problems_prefix = "/".join([".."] * depth)

        page_dir = os.path.join(PAGES_DIR, slug)
        os.makedirs(page_dir, exist_ok=True)

        html = problem_tpl.render(
            **p,
            type_uri=f"{BASE_URI}{slug}",
            root_prefix=root_prefix,
            problems_prefix=problems_prefix,
            fonts_prefix=root_prefix + "/",
            example=make_example(slug, p["title"], p["http_status"]),
        )
        with open(os.path.join(page_dir, "index.html"), "w") as f:
            f.write(html)
        print(f"    {slug}")

    # Index page
    os.makedirs(PAGES_DIR, exist_ok=True)
    html = index_tpl.render(
        core_problems=CORE_PROBLEMS,
        session_problems=SESSION_PROBLEMS,
    )
    with open(os.path.join(PAGES_DIR, "index.html"), "w") as f:
        f.write(html)
    print(f"    index")

    print(f"    Done. {len(ALL_PROBLEMS)} problem pages in pages/problems/")


if __name__ == "__main__":
    main()
