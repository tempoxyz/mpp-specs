#!/usr/bin/env python3
"""Generate the specs index page from the specs/ directory tree.

Reads YAML frontmatter from every *.md file under specs/ and produces
pages/index.html using the Jinja2 template at pages/templates/index.html.

This replaces the old hand-maintained index.html so that new specs
(e.g. Lightning) appear automatically after merge.
"""

import os
import re

from jinja2 import Environment, FileSystemLoader

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPECS_DIR = os.path.join(ROOT, "specs")
TEMPLATES_DIR = os.path.join(ROOT, "pages", "templates")
PAGES_DIR = os.path.join(ROOT, "pages")


def parse_frontmatter(path):
    """Extract title, abbrev, and docname from YAML frontmatter."""
    with open(path) as f:
        text = f.read()
    m = re.match(r"^---\s*\n(.*?)\n---", text, re.DOTALL)
    if not m:
        return None
    block = m.group(1)
    data = {}
    for key in ("title", "abbrev", "docname"):
        km = re.search(rf'^{key}:\s*["\']?(.*?)["\']?\s*$', block, re.MULTILINE)
        if km:
            data[key] = km.group(1)
    return data if "docname" in data else None


def collect_specs():
    """Walk specs/ and return a list of spec metadata dicts."""
    specs = []
    for dirpath, _, filenames in os.walk(SPECS_DIR):
        for fn in sorted(filenames):
            if not fn.endswith(".md"):
                continue
            path = os.path.join(dirpath, fn)
            meta = parse_frontmatter(path)
            if not meta:
                continue
            rel = os.path.relpath(dirpath, SPECS_DIR)
            parts = rel.split(os.sep) if rel != "." else []
            meta["category"] = parts[0] if parts else "core"
            meta["subcategory"] = "/".join(parts[1:]) if len(parts) > 1 else ""
            specs.append(meta)
    return specs


def build_tree(specs):
    """Organize specs into the display structure.

    Returns a list of section dicts:
      { "title": ..., "docname": ... or None, "children": [...] }

    The hierarchy is:
      - core spec (standalone)
      - intents (each intent is a section, with methods as children)
      - extensions (standalone sections)
    """
    core = [s for s in specs if s["category"] == "core"]
    intents = [s for s in specs if s["category"] == "intents"]
    methods = [s for s in specs if s["category"] == "methods"]
    extensions = [s for s in specs if s["category"] == "extensions"]

    sections = []

    # Core spec — use the full title
    for s in core:
        sections.append({
            "title": s["title"],
            "docname": s["docname"],
            "children": [],
        })

    # Intent sections: group methods under their intent
    intent_map = {}
    for s in intents:
        # e.g. "draft-payment-intent-charge-00" -> "charge"
        m = re.search(r"intent-(\w+)", s["docname"])
        intent_name = m.group(1) if m else s["docname"]
        intent_map[intent_name] = s

    # Group methods by intent they implement
    # e.g. "draft-tempo-charge-00" -> intent "charge"
    #       "draft-stripe-charge-00" -> intent "charge"
    #       "draft-tempo-session-00" -> intent "session"
    method_by_intent = {}
    for s in methods:
        # Extract intent from docname: draft-{provider}-{intent}-00
        parts = s["docname"].replace("draft-", "").rsplit("-", 1)[0]  # remove version
        # parts is like "tempo-charge" or "stripe-charge" or "lightning-session"
        tokens = parts.split("-")
        provider = tokens[0]
        intent_name = "-".join(tokens[1:])
        s["provider"] = provider.capitalize()
        method_by_intent.setdefault(intent_name, []).append(s)

    # Build intent sections — use short intent name as title (e.g. "Charge")
    all_intents = sorted(set(list(intent_map.keys()) + list(method_by_intent.keys())))
    for intent_name in all_intents:
        intent_spec = intent_map.get(intent_name)
        children = sorted(
            method_by_intent.get(intent_name, []),
            key=lambda s: s.get("provider", ""),
        )

        section = {
            "title": intent_name.capitalize(),
            "docname": intent_spec["docname"] if intent_spec else None,
            "children": [
                {
                    "title": c["provider"],
                    "docname": c["docname"],
                }
                for c in children
            ],
        }
        sections.append(section)

    # Extensions — strip "Payment " prefix for short display titles
    for s in extensions:
        title = s.get("abbrev") or s["title"]
        title = re.sub(r"^Payment\s+", "", title)
        sections.append({
            "title": title,
            "docname": s["docname"],
            "children": [],
        })

    return sections


def main():
    env = Environment(loader=FileSystemLoader(TEMPLATES_DIR), autoescape=False)
    tpl = env.get_template("index.html")

    specs = collect_specs()
    sections = build_tree(specs)

    html = tpl.render(sections=sections)
    out_path = os.path.join(PAGES_DIR, "index.html")
    with open(out_path, "w") as f:
        f.write(html)

    print(f"==> Generated index.html ({len(specs)} specs, {len(sections)} sections)")


if __name__ == "__main__":
    main()
