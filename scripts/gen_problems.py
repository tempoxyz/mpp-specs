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

from jinja2 import Environment, FileSystemLoader, select_autoescape

from problem_registry import load_registry

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATES_DIR = os.path.join(ROOT, "pages", "templates")
PAGES_DIR = os.path.join(ROOT, "pages", "problems")

REGISTRY = load_registry()
BASE_URI = REGISTRY["base_uri"]
ALL_PROBLEMS = REGISTRY["problems"]
CORE_PROBLEMS = [p for p in ALL_PROBLEMS if p["group"] == "core"]
SESSION_PROBLEMS = [p for p in ALL_PROBLEMS if p["group"] == "session"]
SDK_PROBLEMS = [p for p in ALL_PROBLEMS if p["group"] == "sdk"]

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
        sdk_problems=SDK_PROBLEMS,
    )
    with open(os.path.join(PAGES_DIR, "index.html"), "w") as f:
        f.write(html)
    print(f"    index")

    print(f"    Done. {len(ALL_PROBLEMS)} problem pages in pages/problems/")


if __name__ == "__main__":
    main()
