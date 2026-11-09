"""Tests for gen_codeowners.py."""

from gen_codeowners import HEADER, login_from_email, owner_pattern, render


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
    assert "* @brendanjryan" in lines
    assert "/specs/core/draft-httpauth-payment-*.md @brendanjryan" in lines
    assert "/specs/methods/solana/draft-solana-charge-*.md @lgalabru @brendanjryan" in lines
    assert "/specs/methods/x/draft-x-charge-*.md @brendanjryan" in lines
