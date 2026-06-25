#!/usr/bin/env python3
"""Dev server that serves pages/ and artifacts/ directly. No copying needed."""

import http.server
import posixpath
import sys
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGES = ROOT / "pages"
ARTIFACTS = ROOT / "artifacts"
INVALID_PATH = PAGES / "__invalid_path__"


def clean_request_parts(path):
    path = urllib.parse.unquote(path.split("?", 1)[0].split("#", 1)[0])
    if ".." in path.lstrip("/").split("/"):
        return None

    path = posixpath.normpath(path).lstrip("/")
    if path in ("", "."):
        return []

    parts = path.split("/")
    if any(part in ("", ".", "..") for part in parts):
        return None
    return parts


def resolve_under(root, *parts):
    candidate = root.joinpath(*parts).resolve()
    try:
        candidate.relative_to(root)
    except ValueError:
        return INVALID_PATH
    return candidate


class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        parts = clean_request_parts(path)
        if parts is None:
            return str(INVALID_PATH)

        if parts == [] or parts == ["index.html"]:
            return str(PAGES / "index.html")
        if parts[0] == "fonts":
            return str(resolve_under(PAGES, *parts))
        if parts[0] == "problems":
            # Serve problem pages with directory-style index.html
            candidate = resolve_under(PAGES, *parts)
            if candidate.is_dir():
                return str(candidate / "index.html")
            return str(candidate)
        return str(resolve_under(ARTIFACTS, *parts))


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    server = http.server.HTTPServer(("127.0.0.1", port), Handler)
    print(f"Serving at http://localhost:{port}")
    print(f"  pages/    -> index.html")
    print(f"  artifacts/ -> everything else")
    server.serve_forever()
