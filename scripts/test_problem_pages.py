"""Regression coverage for SDK errors missing from generated documentation."""

import copy
import html
import json
import re

import pytest

import gen_problems
from check_problem_pages import check_coverage, check_published, read_mppx_errors
from problem_registry import load_registry

SOURCE = '''
export abstract class PaymentError extends Error {
  readonly status: number = 402
}
export class BadRequestError extends PaymentError {
  override readonly status = 400
  readonly type = 'https://paymentauth.org/problems/bad-request'
}
export class InvalidPayloadError extends PaymentError {
  readonly type = 'https://paymentauth.org/problems/invalid-payload'
}
'''


def test_sdk_coverage_includes_inherited_status():
    errors = read_mppx_errors(SOURCE)
    assert errors == {
        "https://paymentauth.org/problems/bad-request": 400,
        "https://paymentauth.org/problems/invalid-payload": 402,
    }
    assert check_coverage(load_registry(), errors) == []


def test_missing_page_reproduces_original_bug():
    registry = load_registry()
    registry["problems"] = [p for p in registry["problems"] if p["slug"] != "bad-request"]
    assert check_coverage(registry, read_mppx_errors(SOURCE)) == [
        "Missing problem page: https://paymentauth.org/problems/bad-request"
    ]


def test_future_sdk_error_fails_coverage():
    errors = read_mppx_errors(SOURCE.replace("/bad-request'", "/new-error'"))
    assert "Missing problem page: https://paymentauth.org/problems/new-error" in check_coverage(load_registry(), errors)


def test_status_drift_fails_coverage():
    errors = read_mppx_errors(SOURCE.replace("status = 400", "status = 500"))
    assert "HTTP status mismatch" in check_coverage(load_registry(), errors)[0]


@pytest.mark.parametrize("source", [
    "",
    SOURCE.replace("readonly status: number = 402", "readonly status: number = defaultStatus"),
    SOURCE.replace("readonly status = 400", "readonly status = getStatus()"),
    SOURCE.replace("'https://paymentauth.org/problems/bad-request'", "`${base}/bad-request`"),
    SOURCE.replace("BadRequestError extends PaymentError", "BadRequestError extends OtherError"),
])
def test_unrecognized_sdk_source_fails_closed(source):
    with pytest.raises(ValueError):
        read_mppx_errors(source)


@pytest.mark.parametrize("mutation", ["duplicate", "path", "status", "source"])
def test_invalid_registry_is_rejected(tmp_path, mutation):
    registry = load_registry()
    if mutation == "duplicate":
        registry["problems"].append(copy.deepcopy(registry["problems"][0]))
    elif mutation == "path":
        registry["problems"][0]["slug"] = "../escape"
    elif mutation == "status":
        registry["problems"][0]["http_status"] = "402"
    else:
        registry["problems"][-1].pop("spec_url")
    path = tmp_path / "registry.json"
    path.write_text(json.dumps(registry))
    with pytest.raises(ValueError):
        load_registry(path)


def test_every_registry_entry_generates_a_linked_page(tmp_path, monkeypatch):
    monkeypatch.setattr(gen_problems, "PAGES_DIR", str(tmp_path))
    gen_problems.main()
    index = (tmp_path / "index.html").read_text()
    registry = load_registry()
    for problem in registry["problems"]:
        slug = problem["slug"]
        page = (tmp_path / slug / "index.html").read_text()
        assert f'href="/problems/{slug}"' in index
        assert f"<h1>{problem['title']}</h1>" in page
        example = json.loads(html.unescape(re.search(r'<pre class="example">(.*?)</pre>', page, re.S)[1]))
        assert example["type"] == registry["base_uri"] + slug
        assert example["title"] == problem["title"]
        assert example["status"] == problem["http_status"]
        if problem["group"] == "sdk":
            assert f'href="{problem["spec_url"]}"' in page


def test_published_check_rejects_soft_404(monkeypatch):
    class Response:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def read(self):
            return b"<h1>Not Found</h1>"

    monkeypatch.setattr("check_problem_pages.urlopen", lambda *args, **kwargs: Response())
    registry = load_registry()
    failures = check_published(registry, "https://example.test")
    assert len(failures) == len(registry["problems"])
    assert all("Wrong problem page" in failure for failure in failures)
