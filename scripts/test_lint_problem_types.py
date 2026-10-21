"""A problem type URI a spec cites must have a page, or it 404s once published."""

from pathlib import Path

import gen_problems
from lint_problem_types import cited_slugs, registered_slugs, slugs_in_text

BASE_URI = gen_problems.BASE_URI


def write_spec(tmp_path: Path, content: str, name: str = "draft-test-00.md") -> None:
    spec_dir = tmp_path / "specs" / "methods" / "test"
    spec_dir.mkdir(parents=True, exist_ok=True)
    (spec_dir / name).write_text(content, encoding="utf-8")


class TestCitationForms:
    def test_absolute_uri_in_prose(self):
        assert slugs_in_text(f"See {BASE_URI}payment-required.") == {"payment-required"}

    def test_absolute_uri_in_json_example(self):
        content = f'~~~json\n{{\n  "type": "{BASE_URI}verification-failed"\n}}\n~~~\n'
        assert slugs_in_text(content) == {"verification-failed"}

    def test_namespace_prefix_is_not_a_type(self):
        assert slugs_in_text(f"types under the `{BASE_URI}lightning/` namespace") == set()

    def test_relative_form_in_a_type_uri_table(self):
        content = (
            "| Type URI | Title | Status |\n"
            "|----------|-------|--------|\n"
            "| `.../session/transaction-reverted` | Transaction Reverted | 409 |\n"
        )
        assert slugs_in_text(content) == {"session/transaction-reverted"}

    def test_namespaced_slug_in_a_problem_type_column(self):
        content = (
            "| Condition | Problem type |\n"
            "|---|---|\n"
            "| channel expired | `session/channel-finalized` |\n"
        )
        assert slugs_in_text(content) == {"session/channel-finalized"}

    def test_code_table_defines_an_unqualified_type(self):
        content = (
            "| Code | HTTP | Description |\n"
            "|------|------|-------------|\n"
            "| `settlement-failed` | 402 | Settlement did not complete |\n"
        )
        assert slugs_in_text(content) == {"settlement-failed"}


class TestCitationsNotCounted:
    def test_unqualified_slug_in_a_mapping_column_is_shorthand(self):
        # draft-evm-session maps revert conditions to types it registers in
        # full elsewhere; the short spelling is not a separate type.
        content = (
            "| Revert condition | Problem type |\n"
            "|------------------|--------------|\n"
            "| `ChannelFinalized` | `channel-finalized` |\n"
        )
        assert slugs_in_text(content) == set()

    def test_backticked_names_in_an_unrelated_table(self):
        content = (
            "| Intent | Applicable Methods |\n"
            "|--------|--------------------|\n"
            "| `session` | `lightning` |\n"
        )
        assert slugs_in_text(content) == set()


class TestCitedSlugs:
    def test_every_citing_spec_is_reported(self, tmp_path):
        for name in ("draft-a-00.md", "draft-b-00.md"):
            write_spec(tmp_path, f'"type": "{BASE_URI}session/channel-finalized"\n', name)

        assert cited_slugs(tmp_path / "specs") == {
            "session/channel-finalized": {
                "methods/test/draft-a-00.md",
                "methods/test/draft-b-00.md",
            }
        }

    def test_a_type_with_no_page_is_detected(self, tmp_path):
        write_spec(tmp_path, f'"type": "{BASE_URI}lightning/not-registered"\n')

        assert set(cited_slugs(tmp_path / "specs")) - registered_slugs() == {
            "lightning/not-registered"
        }


class TestRepositorySpecs:
    def test_every_cited_type_has_a_page(self):
        assert sorted(set(cited_slugs()) - registered_slugs()) == []

    def test_slugs_are_unique(self):
        slugs = [problem["slug"] for problem in gen_problems.ALL_PROBLEMS]
        assert sorted(slugs) == sorted(set(slugs))
