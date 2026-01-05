#!/usr/bin/env python3
"""Dev server that serves pages/ and artifacts/ directly. No copying needed."""

import http.server
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = os.path.join(ROOT, "pages")
ARTIFACTS = os.path.join(ROOT, "artifacts")


class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        path = path.split("?", 1)[0].split("#", 1)[0]
        path = path.strip("/")
        if path == "" or path == "index.html":
            return os.path.join(PAGES, "index.html")
        if path.startswith("fonts/"):
            return os.path.join(PAGES, path)
        if path.startswith("problems"):
            # Serve problem pages with directory-style index.html
            candidate = os.path.join(PAGES, path)
            if os.path.isdir(candidate):
                return os.path.join(candidate, "index.html")
            return candidate
        return os.path.join(ARTIFACTS, path)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    server = http.server.HTTPServer(("", port), Handler)
    print(f"Serving at http://localhost:{port}")
    print(f"  pages/    -> index.html")
    print(f"  artifacts/ -> everything else")
    server.serve_forever()
