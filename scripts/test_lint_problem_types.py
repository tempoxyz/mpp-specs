"""A problem type URI a spec cites must have a page, or it 404s once published."""

from pathlib import Path

import gen_problems
from lint_problem_types import (
    cited_slugs,
    cited_statuses,
    registered_slugs,
    registered_statuses,
    slugs_in_text,
    status_mismatches,
)

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


class TestBareSlugsInMappingTables:
    def test_registered_root_type_is_a_citation(self):
        # draft-nearintents-charge-01 maps conditions to core types this way.
        content = (
            "| Condition | Problem type |\n"
            "|---|---|\n"
            "| bad challenge | `invalid-challenge` |\n"
        )
        assert slugs_in_text(content) == {"invalid-challenge"}

    def test_misspelled_type_is_a_citation_and_fails(self):
        content = (
            "| Condition | Problem type |\n"
            "|---|---|\n"
            "| bad challenge | `invalid-challange` |\n"
        )
        assert slugs_in_text(content) - registered_slugs() == {"invalid-challange"}


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


class TestCitedStatuses:
    TABLE = (
        "| Type URI | Title | Status |\n"
        "|----------|-------|--------|\n"
        "| `.../session/channel-finalized` | Channel Finalized | {status} |\n"
    )

    def test_a_table_status_is_read(self, tmp_path):
        write_spec(tmp_path, self.TABLE.format(status="410"))

        assert cited_statuses(tmp_path / "specs") == {
            "session/channel-finalized": {410: {"methods/test/draft-test-00.md"}}
        }

    def test_a_page_with_another_status_is_detected(self, tmp_path):
        # The 402 these pages carried while three session specs said 410.
        write_spec(tmp_path, self.TABLE.format(status="410"))
        statuses = cited_statuses(tmp_path / "specs")

        assert status_mismatches(statuses, {"session/channel-finalized": 410}) == {}
        assert status_mismatches(statuses, {"session/channel-finalized": 402}) == {
            "session/channel-finalized": {410: {"methods/test/draft-test-00.md"}}
        }

    def test_a_full_uri_in_a_table_carries_its_status(self, tmp_path):
        # draft-tempo-session-00 writes the whole URI in its IANA table.
        write_spec(tmp_path, self.TABLE.replace(".../", BASE_URI).format(status="410"))

        assert cited_statuses(tmp_path / "specs") == {
            "session/channel-finalized": {410: {"methods/test/draft-test-00.md"}}
        }

    def test_a_definition_list_status_is_read(self, tmp_path):
        # draft-lightning-charge-00 defines its types this way.
        write_spec(tmp_path, f"{BASE_URI}lightning/expired-invoice\n: HTTP 402. The invoice expired.\n")

        assert cited_statuses(tmp_path / "specs") == {
            "lightning/expired-invoice": {402: {"methods/test/draft-test-00.md"}}
        }

    def test_a_citation_without_a_status_is_not_checked(self, tmp_path):
        write_spec(tmp_path, f'"type": "{BASE_URI}session/channel-finalized"\n')

        assert cited_statuses(tmp_path / "specs") == {}


class TestRepositorySpecs:
    def test_every_cited_type_has_a_page(self):
        assert sorted(set(cited_slugs()) - registered_slugs()) == []

    def test_every_page_status_matches_the_specs(self):
        assert status_mismatches(cited_statuses(), registered_statuses()) == {}

    def test_slugs_are_unique(self):
        slugs = [problem["slug"] for problem in gen_problems.ALL_PROBLEMS]
        assert sorted(slugs) == sorted(set(slugs))
