"""Core spec changes must flow into the existing problem-page generator."""

import json
from html import unescape
import re

import pytest

import gen_problems


def test_new_spec_error_generates_page_and_index_entry(tmp_path, monkeypatch):
    spec = tmp_path / "draft-httpauth-payment-99.md"
    spec.write_text("""## Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `future-error` | 400 | A new error from the spec |

## Retry Behavior

| `not-an-error-code` | 500 | Not part of the error table |
""")
    problems = gen_problems.read_core_problems(spec)
    assert len(problems) == 1
    monkeypatch.setattr(gen_problems, "CORE_PROBLEMS", problems)
    monkeypatch.setattr(gen_problems, "ALL_PROBLEMS", problems)
    monkeypatch.setattr(gen_problems, "PAGES_DIR", str(tmp_path / "pages"))
    gen_problems.main()
    page = (tmp_path / "pages/future-error/index.html").read_text()
    assert "draft-httpauth-payment-99.html" in page
    assert "<h1>Future Error</h1>" in page
    example = json.loads(unescape(re.search(r'<pre class="example">(.*?)</pre>', page, re.S)[1]))
    assert example["type"] == "https://paymentauth.org/problems/future-error"
    assert example["status"] == 400
    assert 'href="/problems/future-error"' in (tmp_path / "pages/index.html").read_text()


def test_core_spec_defines_missing_sdk_errors():
    errors = {p["slug"]: p["http_status"] for p in gen_problems.CORE_PROBLEMS}
    assert {slug: errors[slug] for slug in (
        "bad-request", "invalid-payload", "internal-payment-error", "payment-action-required"
    )} == {
        "bad-request": 400,
        "invalid-payload": 402,
        "internal-payment-error": 500,
        "payment-action-required": 402,
    }


@pytest.mark.parametrize("rows", [
    "",
    "| `bad-request` | unknown | Invalid status |",
    "| `bad-request` | 400 | Duplicate |\n| `bad-request` | 400 | Duplicate |",
])
def test_invalid_error_table_fails_build(tmp_path, rows):
    spec = tmp_path / "draft-httpauth-payment-99.md"
    spec.write_text("## Error Codes\n" + rows)
    with pytest.raises(ValueError):
        gen_problems.read_core_problems(spec)
