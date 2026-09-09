"""Shared, language-neutral registry for generated problem documentation."""

import json
import re
from pathlib import Path

REGISTRY_PATH = Path(__file__).resolve().parents[1] / "pages/problem-types.json"


def load_registry(path=REGISTRY_PATH):
    registry = json.loads(Path(path).read_text())
    if registry["version"] != 1:
        raise ValueError("Unsupported problem registry version")
    if registry["base_uri"] != "https://paymentauth.org/problems/":
        raise ValueError("Unexpected problem URI namespace")
    seen = set()
    if not registry["problems"]:
        raise ValueError("Empty problem registry")
    for problem in registry["problems"]:
        slug = problem["slug"]
        if not re.fullmatch(r"[a-z0-9-]+(?:/[a-z0-9-]+)*", slug):
            raise ValueError(f"Invalid problem slug: {slug}")
        if slug in seen:
            raise ValueError(f"Duplicate problem slug: {slug}")
        seen.add(slug)
        if problem["group"] not in ("core", "session", "sdk"):
            raise ValueError(f"Unknown problem group: {slug}")
        if type(problem["http_status"]) is not int or not 400 <= problem["http_status"] <= 599:
            raise ValueError(f"Invalid HTTP status: {slug}")
        for field in ("title", "description", "spec_label"):
            if not isinstance(problem[field], str) or not problem[field].strip():
                raise ValueError(f"Missing {field}: {slug}")
        if problem["group"] == "sdk" and not problem.get("spec_url", "").startswith("https://"):
            raise ValueError(f"SDK problem needs a source URL: {slug}")
    return registry
