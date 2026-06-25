"""Tests for the local site server path handling."""

import pytest

from serve import ARTIFACTS, INVALID_PATH, PAGES, clean_request_parts, resolve_under


@pytest.mark.parametrize(
    ("path", "parts"),
    [
        ("/draft-example.html?download=1#section", ["draft-example.html"]),
        ("/%2e%2e/LICENSE.md", None),
        ("/problems/../LICENSE.md", None),
        ("/problems/session/channel-not-found/", ["problems", "session", "channel-not-found"]),
    ],
)
def test_clean_request_parts(path, parts):
    assert clean_request_parts(path) == parts


def test_resolve_under_accepts_child_path():
    assert resolve_under(PAGES, "problems") == PAGES / "problems"


def test_resolve_under_rejects_parent_escape():
    assert resolve_under(ARTIFACTS, "..", "LICENSE.md") == INVALID_PATH
