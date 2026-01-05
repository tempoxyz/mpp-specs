#!/usr/bin/env python3
"""Generate static HTML pages for paymentauth.org/problems/ URIs.

Reads Jinja2 templates from pages/templates/ and produces one HTML page per
problem type, plus an index page.  Output goes to pages/problems/ using the
directory-with-index.html convention so that GitHub Pages serves clean URLs
(e.g. /problems/payment-required -> /problems/payment-required/index.html).

Jinja2 is already available via xml2rfc's dependencies.
"""

import json
import os

from jinja2 import Environment, FileSystemLoader

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATES_DIR = os.path.join(ROOT, "pages", "templates")
PAGES_DIR = os.path.join(ROOT, "pages", "problems")

BASE_URI = "https://paymentauth.org/problems/"

# ── Problem definitions ─────────────────────────────────────────────────────

CORE_PROBLEMS = [
    {"slug": "payment-required", "title": "Payment Required", "http_status": 402,
     "description": "The requested resource requires payment. The server has included a WWW-Authenticate challenge describing acceptable payment methods.",
     "spec_label": "draft-httpauth-payment"},
    {"slug": "payment-insufficient", "title": "Payment Insufficient", "http_status": 402,
     "description": "The payment amount provided is too low to satisfy the server's price for this resource.",
     "spec_label": "draft-httpauth-payment"},
    {"slug": "payment-expired", "title": "Payment Expired", "http_status": 402,
     "description": "The challenge or authorization has expired. The client should request a fresh challenge and retry.",
     "spec_label": "draft-httpauth-payment"},
    {"slug": "verification-failed", "title": "Verification Failed", "http_status": 402,
     "description": "The payment proof included in the credential could not be verified by the server.",
     "spec_label": "draft-httpauth-payment"},
    {"slug": "method-unsupported", "title": "Method Unsupported", "http_status": 400,
     "description": "The payment method specified by the client is not accepted by this server.",
     "spec_label": "draft-httpauth-payment"},
    {"slug": "malformed-credential", "title": "Malformed Credential", "http_status": 402,
     "description": "The credential format is invalid and could not be parsed by the server.",
     "spec_label": "draft-httpauth-payment"},
    {"slug": "invalid-challenge", "title": "Invalid Challenge", "http_status": 402,
     "description": "The challenge ID is unknown, expired, or has already been used.",
     "spec_label": "draft-httpauth-payment"},
]

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
    env = Environment(loader=FileSystemLoader(TEMPLATES_DIR), autoescape=False)
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
