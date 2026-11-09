"""Tests for gen_codeowners.py."""

import os
import subprocess
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
        "/specs/methods/tempo/draft-tempo-charge-??.md"
    )
    assert owner_pattern("specs/core/draft-httpauth-payment-01.md") == ("/specs/core/draft-httpauth-payment-??.md")


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
        "/specs/core/draft-httpauth-payment-??.md @brendanjryan"
    )
    assert "/specs/core/draft-httpauth-payment-??.md @brendanjryan" in lines
    assert "/specs/methods/solana/draft-solana-charge-??.md @lgalabru @brendanjryan" in lines
    assert "/specs/methods/x/draft-x-charge-??.md @brendanjryan" in lines
    # The review policy is owned too, so it can't be changed without a default owner.
    assert "/.github/CODEOWNERS @brendanjryan" in lines
    assert "/scripts/gen_codeowners.py @brendanjryan" in lines


def test_submitter_falls_back_when_github_fails(monkeypatch):
    def fail(url):
        raise HTTPError(url, 403, "rate limited", None, None)

    monkeypatch.setattr(gen_codeowners, "github", fail)
    monkeypatch.setattr(gen_codeowners, "LOOKUP_FAILURES", [])
    assert submitter("abc123", "1572504+brendanjryan@users.noreply.github.com") == "brendanjryan"
    assert submitter("abc123", "ludo@example.org") is None
    # A rate limit is recorded, so main() refuses to write a partial CODEOWNERS.
    assert gen_codeowners.LOOKUP_FAILURES


def test_submitter_prefers_current_login_over_noreply_email(monkeypatch):
    def lookup(url):
        if url.endswith("/pulls"):
            return []
        return {"author": {"login": "renamed"}}

    monkeypatch.setattr(gen_codeowners, "github", lookup)
    monkeypatch.setattr(gen_codeowners, "LOOKUP_FAILURES", [])
    # The noreply email still names the old login; the API's current one wins.
    assert submitter("abc123", "1572504+oldname@users.noreply.github.com") == "renamed"


def test_submitter_ignores_unmerged_pull_requests(monkeypatch):
    def lookup(url):
        if url.endswith("/pulls"):
            return [{"merged_at": None, "user": {"login": "someone-else"}}]
        return {"author": {"login": "brendanjryan"}}

    monkeypatch.setattr(gen_codeowners, "github", lookup)
    monkeypatch.setattr(gen_codeowners, "LOOKUP_FAILURES", [])
    assert submitter("abc123", "ludo@example.org") == "brendanjryan"


def test_revisions_glob_is_exact_for_non_drafts():
    assert gen_codeowners.revisions_glob("specs/methods/bar/README.md") == ":(literal)specs/methods/bar/README.md"


def test_unpushed_commit_is_not_a_lookup_failure(monkeypatch):
    def missing(url):
        raise HTTPError(url, 404, "not found", None, None)

    monkeypatch.setattr(gen_codeowners, "github", missing)
    monkeypatch.setattr(gen_codeowners, "LOOKUP_FAILURES", [])
    assert submitter("abc123", "ludo@example.org") is None
    assert gen_codeowners.LOOKUP_FAILURES == []


def test_safe_path_rejects_pattern_syntax():
    assert gen_codeowners.SAFE_PATH.match("specs/core/draft-httpauth-payment-01.md")
    for bad in ("specs/core/draft-httpauth-payment-01 #.md", "specs/a*.md", "specs/a b.md"):
        assert not gen_codeowners.SAFE_PATH.match(bad)


def test_owner_of_uncommitted_spec_is_none(monkeypatch):
    monkeypatch.setattr(gen_codeowners, "first_commit", lambda path: None)
    assert owner("specs/methods/x/draft-x-charge-00.md") is None


def test_revisions_glob_matches_by_draft_name():
    assert (
        gen_codeowners.revisions_glob("specs/methods/tempo/draft-tempo-charge-01.md")
        == ":(glob)specs/**/draft-tempo-charge-[0-9][0-9].md"
    )


def test_owner_pattern_does_not_match_extended_names():
    import fnmatch

    pattern = owner_pattern("specs/methods/solana/draft-solana-charge-00.md")
    assert fnmatch.fnmatch("/specs/methods/solana/draft-solana-charge-01.md", pattern)
    assert not fnmatch.fnmatch("/specs/methods/solana/draft-solana-charge-delegated-00.md", pattern)


def test_first_commit_ignores_backdated_descendants(tmp_path, monkeypatch):
    # A later revision committed with a date older than the draft's real first commit
    # must not be taken as the submitter's commit: --topo-order lists children first.
    def run(*args, date=None):
        env = dict(os.environ, GIT_AUTHOR_NAME="t", GIT_COMMITTER_NAME="t")
        if date:
            env.update(GIT_AUTHOR_DATE=date, GIT_COMMITTER_DATE=date)
        subprocess.run(["git", *args], cwd=tmp_path, env=env, check=True, capture_output=True)

    run("init", "-q")
    (tmp_path / "specs").mkdir()
    (tmp_path / "specs/draft-a-00.md").write_text("a")
    run("add", ".")
    run("-c", "user.email=first@x", "commit", "-qm", "add", date="2024-01-01T00:00:00")
    (tmp_path / "specs/draft-a-01.md").write_text("b")
    run("add", ".")
    run("-c", "user.email=late@x", "commit", "-qm", "bump", date="2020-01-01T00:00:00")
    monkeypatch.chdir(tmp_path)
    added = gen_codeowners.first_commit("specs/draft-a-01.md")
    assert added is not None and added[1] == "first@x"
