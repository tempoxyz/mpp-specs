"""Tests for lint_requirements.py"""

from pathlib import Path

from lint_requirements import ROOT, lint_file, main, short_name


def write_spec(
    tmp_path: Path, body: str, name: str = "draft-test-charge-00.md"
) -> Path:
    """Write a draft with minimal frontmatter and return its path."""
    spec = tmp_path / name
    spec.write_text("---\ntitle: Test\nversion: 00\n---\n\n--- middle\n\n" + body)
    return spec


class TestShortName:
    def test_core(self):
        assert short_name(Path("draft-httpauth-payment-01.md")) == "core"

    def test_method(self):
        assert short_name(Path("draft-tempo-charge-01.md")) == "tempo-charge"

    def test_intent_and_extension(self):
        assert short_name(Path("draft-payment-intent-charge-00.md")) == "intent-charge"
        assert short_name(Path("draft-payment-discovery-01.md")) == "discovery"


class TestTagging:
    def test_tagged_paragraph_and_list_items(self, tmp_path):
        spec = write_spec(
            tmp_path,
            "Servers MUST verify the\ncredential.\n{: #req-test-charge-001}\n\n"
            "Constraints:\n\n"
            "- Clients SHOULD retry.\n  {: #req-test-charge-002}\n"
            "- No keyword here.\n"
            "1. Servers MAY cache\n   the result.\n   {: #req-test-charge-003}\n",
        )
        report = lint_file(spec)
        assert report.tagged == 3
        assert report.untagged == []
        assert report.errors == []

    def test_untagged_requirement(self, tmp_path):
        spec = write_spec(tmp_path, "Intro text.\n\nClients MUST NOT reuse it.\n")
        report = lint_file(spec)
        assert report.untagged == [10]

    def test_ignores_code_tables_headings_and_boilerplate(self, tmp_path):
        spec = write_spec(
            tmp_path,
            "# Requirements MUST\n\n{::boilerplate bcp14-tagged}\n\n"
            "~~~\nMUST in code\n~~~\n\n"
            "| Field | Required |\n|---|---|\n| a | REQUIRED |\n\n"
            "Use the `MUST` literal.\n\n"
            'The key words "MUST", "MUST NOT" are to be interpreted.\n',
        )
        report = lint_file(spec)
        assert report.total == 0
        assert report.errors == []

    def test_keyword_in_table_cell_is_an_error(self, tmp_path):
        spec = write_spec(
            tmp_path,
            "| Field | Required | Description |\n|---|---|---|\n"
            "| a | OPTIONAL | OPTIONAL. Echoed back. |\n"
            "| b | OPTIONAL | When present, clients MUST use it. |\n"
            "| c | REQUIRED if `d` is absent | Key URL. |\n",
        )
        report = lint_file(spec)
        assert len(report.errors) == 2
        assert report.errors[0].startswith("line 11:")
        # A marker that opens a condition is a rule, not a presence marker.
        assert report.errors[1].startswith("line 12:")

    def test_list_item_id_must_be_indented_to_item_text(self, tmp_path):
        spec = write_spec(
            tmp_path,
            "- A MUST b.\n  {: #req-test-charge-001}\n"
            "- C MUST d.\n{: #req-test-charge-002}\n"
            "1. E MUST f.\n {: #req-test-charge-003}\n",
        )
        report = lint_file(spec)
        assert report.tagged == 1
        assert len(report.untagged) == 2
        assert sum("not indented" in e for e in report.errors) == 2

    def test_loose_list_continuation_id_must_be_indented(self, tmp_path):
        spec = write_spec(
            tmp_path,
            "- First paragraph.\n\n  Second MUST b.\n{: #req-test-charge-001}\n\n"
            "- Item.\n\n  Third MUST c.\n  {: #req-test-charge-002}\n\n"
            "After the list, D MUST e.\n{: #req-test-charge-003}\n",
        )
        report = lint_file(spec)
        # The column-0 ID after a continuation paragraph lands on the list, not the item.
        assert sum("not indented" in e for e in report.errors) == 1
        assert report.tagged == 2
        assert len(report.untagged) == 1

    def test_line_after_ial_is_a_new_block(self, tmp_path):
        spec = write_spec(tmp_path, "A MUST b.\n{: #req-test-charge-001}\nC MUST d.\n")
        report = lint_file(spec)
        assert report.tagged == 1
        assert report.untagged == [10]

    def test_detached_id(self, tmp_path):
        spec = write_spec(
            tmp_path, "Servers MUST do it.\n\n{: #req-test-charge-001}\nNext.\n"
        )
        report = lint_file(spec)
        assert any("not directly after" in e for e in report.errors)


class TestIdProblems:
    def test_duplicate_id(self, tmp_path):
        spec = write_spec(
            tmp_path,
            "A MUST b.\n{: #req-test-charge-001}\n\nC MUST d.\n{: #req-test-charge-001}\n",
        )
        report = lint_file(spec)
        assert any("duplicate ID" in e for e in report.errors)

    def test_malformed_ids(self, tmp_path):
        spec = write_spec(
            tmp_path,
            "A MUST b.\n{: #req-test-charge-1}\n\nC MUST d.\n{: #req-other-002}\n",
        )
        report = lint_file(spec)
        assert sum("malformed ID" in e for e in report.errors) == 2

    def test_backwards_is_a_note(self, tmp_path):
        spec = write_spec(
            tmp_path,
            "A MUST b.\n{: #req-test-charge-002}\n\nC MUST d.\n{: #req-test-charge-001}\n",
        )
        report = lint_file(spec)
        assert report.errors == []
        assert any("goes backwards" in n for n in report.notes)

    def test_non_requirement_ids_are_ignored(self, tmp_path):
        spec = write_spec(tmp_path, "Plain text.\n{: #intro-text}\n")
        report = lint_file(spec)
        assert report.errors == []


    def test_untagged_line_after_ial_is_reported(self, tmp_path):
        spec = write_spec(tmp_path, "A MUST b.\n{: #req-test-charge-001}\nC MUST d.\n")
        report = lint_file(spec)
        assert report.tagged == 1
        assert len(report.untagged) == 1

    def test_ids_in_quotes_or_alds_do_not_tag(self, tmp_path):
        spec = write_spec(
            tmp_path,
            'A MUST b.\n{: title="#req-test-charge-001"}\n\n'
            "C MUST d.\n{:ref: #req-test-charge-002}\n",
        )
        report = lint_file(spec)
        assert report.tagged == 0
        assert len(report.untagged) == 2

    def test_column_zero_id_after_outer_continuation_is_misindented(self, tmp_path):
        spec = write_spec(
            tmp_path,
            "- Outer MUST a.\n  {: #req-test-charge-001}\n"
            "  - Inner MUST b.\n    {: #req-test-charge-002}\n\n"
            "  Outer continuation MUST c.\n{: #req-test-charge-003}\n",
        )
        report = lint_file(spec)
        assert any("req-test-charge-003 is not indented" in e for e in report.errors)
        # Indented to the outer item's text, the same ID attaches to the continuation.
        spec.write_text(spec.read_text().replace("\n{: #req-test-charge-003}", "\n  {: #req-test-charge-003}"))
        report = lint_file(spec)
        assert report.errors == []
        assert report.tagged == 3

    def test_indented_code_block_is_not_prose(self, tmp_path):
        spec = write_spec(tmp_path, "Intro.\n\n    Clients MUST x.\n    {: #req-test-charge-001}\n")
        report = lint_file(spec)
        assert report.total == 0

    def test_mixed_fence_delimiters_stay_code(self, tmp_path):
        # A literal ``` inside a ~~~ block must not close it, and the real closer must.
        spec = write_spec(tmp_path, "~~~\n```\nNot MUST prose.\n~~~\n\nClients MUST x.\n")
        report = lint_file(spec)
        assert len(report.untagged) == 1

    def test_each_definition_is_its_own_block(self, tmp_path):
        spec = write_spec(
            tmp_path,
            "Term\n: Clients MUST a.\n: Servers MUST b.\n  {: #req-test-charge-001}\n",
        )
        report = lint_file(spec)
        assert report.tagged == 1
        assert len(report.untagged) == 1

    def test_id_on_non_normative_text_is_an_error(self, tmp_path):
        spec = write_spec(tmp_path, "Plain text.\n{: #req-test-charge-001}\n")
        report = lint_file(spec)
        assert any("no BCP 14 keyword" in e for e in report.errors)

    def test_conditional_marker_with_punctuation_is_flagged(self, tmp_path):
        spec = write_spec(
            tmp_path,
            "| f | REQUIRED: if d is absent |\n| g | OPTIONAL: Units consumed |\n",
        )
        report = lint_file(spec)
        assert sum("table cell" in e for e in report.errors) == 1

    def test_backticks_in_indented_code_do_not_open_a_fence(self, tmp_path):
        spec = write_spec(tmp_path, "Intro.\n\n    ```\n    code\n\nClients MUST x.\n")
        report = lint_file(spec)
        assert len(report.untagged) == 1

class TestMain:
    def test_warn_mode_exits_zero(self, tmp_path):
        spec = write_spec(tmp_path, "Clients MUST NOT reuse it.\n")
        assert main([str(spec)]) == 0

    def test_strict_mode_exits_one(self, tmp_path):
        spec = write_spec(tmp_path, "Clients MUST NOT reuse it.\n")
        assert main(["--strict", str(spec)]) == 1

    def test_strict_mode_passes_when_tagged(self, tmp_path):
        spec = write_spec(
            tmp_path, "Clients MUST NOT reuse it.\n{: #req-test-charge-001}\n"
        )
        assert main(["--strict", str(spec)]) == 0

    def test_tempo_charge_is_fully_tagged(self):
        drafts = sorted((ROOT / "specs/methods/tempo").glob("draft-tempo-charge-*.md"))
        assert drafts
        assert main(["--strict", str(drafts[-1])]) == 0
