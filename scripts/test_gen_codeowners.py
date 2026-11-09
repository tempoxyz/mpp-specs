"""Tests for gen_codeowners.py."""

from urllib.error import HTTPError

import gen_codeowners
from gen_codeowners import (
    HEADER,
    login_from_email,
    owner,
    owner_pattern,
    render,
    submitter,
)


def test_owner_pattern_survives_revision_bumps():
    assert owner_pattern("specs/methods/tempo/draft-tempo-charge-00.md") == (
        "/specs/methods/tempo/draft-tempo-charge-*.md"
    )
    assert owner_pattern("specs/core/draft-httpauth-payment-01.md") == ("/specs/core/draft-httpauth-payment-*.md")


def test_login_from_noreply_email():
    assert login_from_email("1572504+brendanjryan@users.noreply.github.com") == "brendanjryan"
    assert login_from_email("brendanjryan@users.noreply.github.com") == "brendanjryan"
    assert login_from_email("ludo@example.org") is None


def test_render_adds_defaults_without_duplicates():
    content = render(
        {
            "specs/methods/solana/draft-solana-charge-00.md": "lgalabru",
            "specs/core/draft-httpauth-payment-01.md": "brendanjryan",
            "specs/methods/x/draft-x-charge-00.md": None,
        },
        ["@brendanjryan"],
    )
    assert content.startswith(HEADER)
    lines = content.splitlines()
    assert not any(line.startswith("*") for line in lines)
    assert lines.index("/specs/ @brendanjryan") < lines.index(
        "/specs/core/draft-httpauth-payment-*.md @brendanjryan"
    )
    assert "/specs/core/draft-httpauth-payment-*.md @brendanjryan" in lines
    assert "/specs/methods/solana/draft-solana-charge-*.md @lgalabru @brendanjryan" in lines
    assert "/specs/methods/x/draft-x-charge-*.md @brendanjryan" in lines


def test_submitter_falls_back_when_github_fails(monkeypatch):
    def fail(url):
        raise HTTPError(url, 403, "rate limited", None, None)

    monkeypatch.setattr(gen_codeowners, "github", fail)
    assert submitter("abc123", "1572504+brendanjryan@users.noreply.github.com") == "brendanjryan"
    assert submitter("abc123", "ludo@example.org") is None


def test_owner_of_uncommitted_spec_is_none(monkeypatch):
    monkeypatch.setattr(gen_codeowners, "first_commit", lambda path: None)
    assert owner("specs/methods/x/draft-x-charge-00.md") is None


def test_revisions_glob_matches_by_draft_name():
    assert (
        gen_codeowners.revisions_glob("specs/methods/tempo/draft-tempo-charge-01.md")
        == ":(glob)specs/**/draft-tempo-charge-[0-9][0-9].md"
    )
