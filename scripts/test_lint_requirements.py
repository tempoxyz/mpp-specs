"""Tests for lint_requirements.py"""

from pathlib import Path

from lint_requirements import ROOT, annotation, lint_file, main, short_name, strip_code_spans


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

    def test_reused_id_replaced_by_another_id(self, tmp_path):
        # The second block repeats 001 and then sets 002; kramdown keeps 002, so the repeat
        # of 001 must still be reported even though 001 anchors the first block.
        spec = write_spec(
            tmp_path,
            "A MUST b.\n{: #req-test-charge-001}\n\n"
            "C MUST d.\n{: #req-test-charge-001}\n{: #req-test-charge-002}\n",
        )
        report = lint_file(spec)
        assert any("req-test-charge-001" in e and "req-test-charge-002" in e for e in report.errors), report.errors

    def test_malformed_ids(self, tmp_path):
        spec = write_spec(
            tmp_path,
            "A MUST b.\n{: #req-test-charge-1}\n\nC MUST d.\n{: #req-other-002}\n",
        )
        report = lint_file(spec)
        assert sum("malformed ID" in e for e in report.errors) == 2

    def test_non_ascii_digit_ids_are_malformed(self, tmp_path):
        # kramdown anchors only ASCII IDs; Python's \d and \w match other scripts' digits.
        for digits in ("\u0660\u0660\u0661", "\uff10\uff10\uff11"):
            spec = write_spec(tmp_path, f"A MUST b.\n{{: #req-test-charge-{digits}}}\n")
            report = lint_file(spec)
            assert any("malformed ID" in e for e in report.errors), digits

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

    # Each case below was checked against kramdown-rfc's own output (RFC2629Kramdown input).
    def test_fence_after_list_is_not_reopened_by_indented_tildes(self, tmp_path):
        spec = write_spec(
            tmp_path,
            "- a MUST x.\n  {: #req-test-charge-001}\n\n~~~\ncode\n~~~\n\n    ~~~\n\nP MUST y.\n",
        )
        report = lint_file(spec)
        assert len(report.untagged) == 1

    def test_closing_fence_indented_four_does_not_close(self, tmp_path):
        spec = write_spec(tmp_path, "~~~\ncode\n    ~~~\nmore MUST\n~~~\n\nP MUST y.\n")
        report = lint_file(spec)
        assert report.total == 1

    def test_tab_indented_tildes_are_code(self, tmp_path):
        spec = write_spec(tmp_path, "Intro.\n\n\t~~~\n\nP MUST y.\n")
        report = lint_file(spec)
        assert len(report.untagged) == 1

    def test_blockquoted_fence_is_code(self, tmp_path):
        spec = write_spec(tmp_path, "> ~~~\n> C MUST z.\n> {: #req-test-charge-009}\n> ~~~\n")
        report = lint_file(spec)
        assert report.total == 0
        assert report.errors == []

    def test_lazy_continuation_id_goes_on_the_list(self, tmp_path):
        spec = write_spec(
            tmp_path,
            "- Item MUST a.\n  {: #req-test-charge-001}\nlazy MUST b.\n{: #req-test-charge-002}\n",
        )
        report = lint_file(spec)
        assert any("req-test-charge-002 is not indented" in e for e in report.errors)

    def test_backtick_pair_is_inline_verbatim_not_a_fence(self, tmp_path):
        spec = write_spec(tmp_path, "Intro.\n\n```\ncode MUST\n```\n\nP MUST y.\n")
        report = lint_file(spec)
        assert report.total == 1

    def test_requirement_appended_to_boilerplate_is_seen(self, tmp_path):
        spec = write_spec(
            tmp_path,
            'The key words "MUST", "MUST NOT" and "MAY" are to be interpreted as described '
            "in BCP 14. Clients MUST send x.\n",
        )
        report = lint_file(spec)
        assert len(report.untagged) == 1

    def test_boilerplate_alone_is_not_a_requirement(self, tmp_path):
        spec = write_spec(
            tmp_path,
            'The key words "MUST", "MUST NOT", "NOT RECOMMENDED" and "OPTIONAL" are to be '
            "interpreted as described in BCP 14 when, and only when, they appear in all capitals.\n",
        )
        assert lint_file(spec).total == 0

    def test_table_after_list_nested_fence_is_checked(self, tmp_path):
        # kramdown closes a fence only at the item's text column, so the ~~~ at column 4 closes
        # nothing and the opener is item text; the table after the item must still be checked.
        spec = write_spec(
            tmp_path,
            "- item\n\n  ~~~\n  code\n    ~~~\n\n| f | MUST be set if x |\n",
        )
        report = lint_file(spec)
        assert any("table cell" in e for e in report.errors)

    def test_emphasised_keyword_is_a_keyword(self, tmp_path):
        spec = write_spec(tmp_path, "Clients _MUST_ reject it.\n\nServers *SHOULD* log.\n")
        assert len(lint_file(spec).untagged) == 2

    def test_block_end_lines_end_the_paragraph(self, tmp_path):
        # kramdown drops the ID after ^, so it tags nothing.
        spec = write_spec(tmp_path, "A MUST b.\n^\n{: #req-test-charge-001}\n")
        report = lint_file(spec)
        assert report.tagged == 0
        assert any("not directly after" in e for e in report.errors)
        # An unclosed <div> swallows the rest of the draft as raw HTML: kramdown-rfc's XML
        # doesn't parse, and xml2rfc couldn't build it either.
        spec = write_spec(tmp_path, "A MUST b.\n<div>\n{: #req-test-charge-001}\n")
        assert any("doesn't parse" in e for e in lint_file(spec).errors)

    def test_rule_line_after_paragraph_text_stays_in_it(self, tmp_path):
        # kramdown-rfc keeps a *** right after a paragraph line as that paragraph's text.
        spec = write_spec(tmp_path, "A MUST b.\n***\n{: #req-test-charge-001}\n")
        assert lint_file(spec).tagged == 1

    def test_quote_in_list_item_keeps_the_list_open(self, tmp_path):
        spec = write_spec(
            tmp_path,
            "- Item MUST a.\n  {: #req-test-charge-001}\n\n  > quoted\n\n  More MUST b.\n{: #req-test-charge-002}\n",
        )
        report = lint_file(spec)
        assert any("req-test-charge-002 is not indented" in e for e in report.errors)

    def test_long_paragraph_is_linear(self, tmp_path):
        import time
        spec = write_spec(tmp_path, "Clients MUST x\n" + "word " * 20 + "\n" * 0 + ("more text\n" * 40000))
        start = time.perf_counter()
        lint_file(spec)
        assert time.perf_counter() - start < 2

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


# Below, each draft body is linted through kramdown-rfc. write_spec puts 7 lines before the
# body, so body line n is draft line n + 7 (at).
def lint_body(tmp_path, *lines: str):
    return lint_file(write_spec(tmp_path, "\n".join(lines) + "\n"))


def at(*numbers: int) -> list[int]:
    return [n + 7 for n in numbers]


def test_ial_indented_four_past_text_is_paragraph_text(tmp_path):
    # kramdown reads an IAL only up to three columns in; deeper, it is more text, so the ID
    # shows in the rendered text instead of anchoring anything.
    report = lint_body(tmp_path, "A rule MUST hold.", "    {: #req-test-charge-001}", "", "* item MUST x.", "      {: #req-test-charge-002}")
    assert report.untagged == at(1, 4)
    assert sum("renders as text" in e for e in report.errors) == 2


def test_block_html_comment_hides_keywords_and_ids(tmp_path):
    report = lint_body(
        tmp_path, "Intro.", "", "<!--", "A hidden rule MUST hold.", "{: #req-test-charge-003}", "| MUST | x |", "-->", "", "Visible SHOULD x."
    )
    assert report.untagged == at(9)
    assert report.errors == []


def test_one_line_html_comment_does_not_open_a_block(tmp_path):
    report = lint_body(tmp_path, "<!-- note -->", "A rule MUST hold.", "{: #req-test-charge-001}")
    assert report.tagged == 1 and report.errors == []


def test_fence_inside_html_comment_is_comment_text(tmp_path):
    # The ~~~ is inside the comment, so it opens no fence and the rule after --> is prose.
    assert lint_body(tmp_path, "<!--", "~~~", "-->", "", "A rule MUST hold.").untagged == at(5)


def test_unclosed_html_comment_is_a_render_error(tmp_path):
    # kramdown-rfc copies a <!-- with no --> into its XML, which then doesn't parse: no such
    # draft builds. Inside a blockquote kramdown escapes it as text instead.
    report = lint_body(tmp_path, "Intro.", "", "<!-- unclosed note", "", "A rule MUST hold.", "{: #req-test-charge-001}")
    assert len(report.errors) == 1 and "doesn't parse" in report.errors[0]
    report = lint_body(tmp_path, "Intro.", "", "> <!-- unclosed note", "", "A rule MUST hold.", "{: #req-test-charge-001}")
    assert report.tagged == 1 and report.untagged == [] and report.errors == []


def test_code_span_and_math_pair_in_kramdown_order(tmp_path):
    # kramdown takes the span that starts first: a backtick in $$...$$ pairs with nothing
    # outside it, and a $$ in a code span opens no formula.
    for line in ["Servers $$a`b$$ MUST verify `x`.", "And `a $$` SHOULD `$$ b`."]:
        assert lint_body(tmp_path, "Intro.", "", line).untagged == at(3), line
    report = lint_body(tmp_path, "| a | b |", "|---|---|", "| x | $$`$$ MUST ` |")
    assert any(e.startswith(f"line {at(3)[0]}: keyword in a table cell") for e in report.errors)


def test_escaped_or_commented_dollars_open_no_math(tmp_path):
    # \$$ is a literal dollar, and a $$ inside an earlier comment is comment text, so neither
    # opens a formula that would hide the keyword after it.
    for line in ["A \\$$ MUST $$ x.", "B <!-- $$ --> SHOULD $$ y.", "C $$ <!-- $$ MAY -->."]:
        assert lint_body(tmp_path, "Intro.", "", line).untagged == at(3), line
    report = lint_body(tmp_path, "| a | b |", "|---|---|", "| x | <!-- $$ --> MUST $$ |")
    assert any("table cell" in e for e in report.errors)


def test_dollars_in_link_destination_open_no_math(tmp_path):
    for line in ["A [x](https://e.x/$$a) MUST $$ b.", "B [y]($$) SHOULD $$."]:
        assert lint_body(tmp_path, "Intro.", "", line).untagged == at(3), line
    report = lint_body(tmp_path, "| a | b |", "|---|---|", "| x | [y]($$) MUST $$ |")
    assert any("table cell" in e for e in report.errors)


def test_link_destination_with_parentheses_or_title_stays_literal(tmp_path):
    for line in [
        "A [x](https://e.x/a_(b)) MUST $$ y $$.",
        "B [x](<https://e.x/$$)>) SHOULD $$.",
        'C [x](https://e.x/ "t)$$") MAY $$.',
    ]:
        assert lint_body(tmp_path, "Intro.", "", line).untagged == at(3), line


def test_nomarkdown_block_body_is_raw(tmp_path):
    # kramdown copies a {::nomarkdown} body raw, so an IAL line in it tags nothing: it is
    # text in the XML, which the lint reports.
    report = lint_body(tmp_path, "Intro.", "", "A rule MUST hold.", "", "{::nomarkdown}", "{: #req-test-charge-001}", "{:/nomarkdown}")
    assert report.tagged == 0 and report.untagged == at(3)
    assert any("renders as text" in e for e in report.errors)


def test_unclosed_html_comment_opener_line_is_prose_in_a_quote(tmp_path):
    # In a blockquote kramdown renders the unclosed <!-- line itself as paragraph text.
    assert lint_body(tmp_path, "Intro.", "", "> <!-- Servers MUST verify it.", "", "More text.").untagged == at(3)


def test_quoted_unclosed_comment_does_not_borrow_a_later_closer(tmp_path):
    report = lint_body(tmp_path, "Intro.", "", "> <!-- quoted unclosed", "", "A rule MUST hold.", "", "<!-- real -->")
    assert report.untagged == at(5)


def test_requirement_id_on_heading_is_an_error(tmp_path):
    draft = tmp_path / "draft-hd-00.md"
    draft.write_text("# Heading {#req-hd-001}\n\nA rule MUST hold.\n{: #req-hd-001}\n")
    report = lint_file(draft)
    assert any("on a heading" in e for e in report.errors)


def test_quoted_html_comment_closes_inside_its_quote(tmp_path):
    report = lint_body(tmp_path, "> <!--", "> hidden MUST x.", "> -->", "", "A rule MUST hold.", "{: #req-test-charge-001}")
    assert report.tagged == 1 and report.total == 1 and report.errors == []


def test_quoted_id_attribute_sets_the_id(tmp_path):
    # kramdown reads id="..." and id='...' (not unquoted id=x) and anchors the block with
    # the last id, so id="wrong" after a requirement ID replaces its anchor.
    spec = write_spec(
        tmp_path,
        'A MUST b.\n{: #req-test-charge-001 id="wrong"}\n\n'
        "C MUST d.\n{: id='req-test-charge-002'}\n\n"
        "E MUST f.\n{: id=wrong #req-test-charge-003}\n\n"
        "G MUST h.\n{: id=\"req-test-charge-002\"}\n",
    )
    report = lint_file(spec)
    assert report.tagged == 4
    assert any("req-test-charge-001 shares its block" in e for e in report.errors)
    assert any("duplicate ID req-test-charge-002" in e for e in report.errors)
    assert len(report.errors) == 2


def test_block_kramdown_comment_hides_keywords_and_ids(tmp_path):
    report = lint_body(tmp_path, "Intro.", "", "{::comment}", "Hidden MUST x.", "{: #req-test-charge-001}", "{:/comment}", "", "Visible SHOULD y.")
    assert report.untagged == at(8) and report.errors == []


def test_kramdown_comment_in_a_paragraph_is_a_span(tmp_path):
    # Right after a paragraph line kramdown reads {::comment} as a span: the paragraph goes
    # on, the comment drops out, and the IAL after its stop tag tags the paragraph.
    report = lint_body(
        tmp_path, "P MUST one.", "{::comment}", "x MUST", "{:/comment}", "{: #req-test-charge-001}", "", "A {::comment}MAY{:/comment} b."
    )
    assert report.tagged == 1 and report.total == 1 and report.errors == []


def test_kramdown_comment_tag_with_text_after_it_is_a_paragraph(tmp_path):
    report = lint_body(
        tmp_path, "{::comment}x{:/comment} The client MUST go.", "{: #req-test-charge-001}", "", "{::comment}y MUST{:/comment}"
    )
    assert report.tagged == 1 and report.total == 1 and report.errors == []


def test_unclosed_or_cross_quote_kramdown_comment_hides_nothing(tmp_path):
    # Without a {:/comment} line (in the same quote) kramdown renders the tag as text.
    report = lint_body(
        tmp_path, "> {::comment}", "> hidden MUST", "", "{:/comment}", "", "{::comment}", "Rule MUST hold.", "{: #req-test-charge-001}"
    )
    assert report.untagged == at(1) and report.tagged == 1


def test_tab_after_space_in_indentation_is_an_error(tmp_path):
    # kramdown-rfc expands tabs before kramdown reads the draft ("undefined behavior will
    # ensue"), so a tab after spaces is reported wherever it is.
    spec = write_spec(tmp_path, "* a\n\n  \tpara MUST x.\n  \t{: #req-test-charge-001}\n")
    report = lint_file(spec)
    assert sum("tab after a space" in e for e in report.errors) == 2
    # Leading tabs alone expand the same way in both.
    spec = write_spec(tmp_path, "* a\n\n\tpara MUST x.\n\t{: #req-test-charge-001}\n")
    assert lint_file(spec).errors == []


def test_kramdown_comment_stop_tag_must_be_in_the_openers_container(tmp_path):
    # A stop tag that is quoted, indented four or more, or outside the opener's list item
    # closes nothing, so the opener is text and the rule after it renders. Up to three
    # spaces in, in the same quote or item, it closes.
    for closer in ("> {:/comment}", "    {:/comment}"):
        report = lint_body(tmp_path, "{::comment}", "", "Servers MUST verify.", "", closer, "", "After.")
        assert report.untagged == at(3), closer
    report = lint_body(tmp_path, "- item", "", "  {::comment}", "", "Servers MUST verify.", "", "{:/comment}")
    assert report.untagged == at(5)
    report = lint_body(tmp_path, "{::comment}", "hidden MUST", "   {:/comment}", "", "> {::comment}", "> hid MUST", ">    {:/}", "", "Kept MUST x.")
    assert report.untagged == at(9)


def test_kramdown_comment_block_in_a_loose_list_item_is_a_render_error(tmp_path):
    # kramdown-rfc 1.7 crashes (NoMethodError in convert_li) on a {::comment} block between a
    # list item's paragraphs, so no such draft builds.
    report = lint_body(tmp_path, "- item", "", "  {::comment}", "  gone MUST", "  {:/comment}", "", "  Kept MUST x.")
    assert len(report.errors) == 1 and report.errors[0].startswith("kramdown-rfc could not render the draft")


def test_fence_follows_kramdown_rules(tmp_path):
    # Each ~~~ below opens no fence (no closer in its container, an indented opener, two info
    # words, or right after paragraph text), so the rule after it is prose.
    for body in (
        ["~~~", "x MUST a"],  # no closer
        ["```text", "~~~", "x MUST a", "```"],  # a ~~~ inside a backtick pair
        [" ~~~", "x MUST a", " ~~~"],  # indented: kramdown fences only at column 0
        ["~~~ a b", "x MUST a", "~~~"],  # more than one info word
        ["> ~~~", "> x MUST a"],  # its closer is outside the quote
    ):
        tail = [] if body[0] == "~~~" else ["", "~~~"]
        report = lint_body(tmp_path, "Intro.", "", *body, "", "Rule MUST hold.", *tail)
        assert at(4 + len(body))[0] in report.untagged, body
    # A fence can't interrupt a paragraph or list item text: the ~~~ lines are its text.
    report = lint_body(tmp_path, "P x.", "~~~", "code MUST", "~~~", "", "- i", "  ~~~", "  y MUST", "  ~~~")
    assert report.untagged == at(1, 6)
    # Its closer must be in the opener's list item, at the item's text column.
    report = lint_body(tmp_path, "- item", "", "  ~~~", "  code", "", "Rule MUST hold.", "", "~~~")
    assert report.untagged == at(6)
    # A shorter run, an indented run or a run with text after it doesn't close the fence.
    report = lint_body(tmp_path, "~~~~", "~~~", "  ~~~~", "~~~~ x", "a MUST b", "~~~~~", "", "Rule MUST hold.")
    assert report.untagged == at(8)


def test_character_references_are_keywords(tmp_path):
    # kramdown renders &#77;UST and &#x4d;UST as MUST (also in a table cell), but not &#X4D;AY,
    # &#77UST (no ';') or a reference inside a code span; &quot;MUST&quot; names the keyword.
    spec = write_spec(
        tmp_path,
        "A &#77;UST b.\n\nC &#x4d;UST d.\n\nE &#0083;HOULD f.\n\n"
        "G &#X4D;AY &#77UST `&#77;UST ` &quot;MUST&quot; h.\n\n| f | &#x4d;AY be set |\n",
    )
    report = lint_file(spec)
    assert report.untagged == at(1, 3, 5)
    assert any("table cell" in e for e in report.errors)


def test_huge_decimal_character_reference_stays_as_written(tmp_path):
    # More digits than Python's int-from-string limit: kramdown leaves it as text.
    report = lint_body(tmp_path, "X &#" + "7" * 5000 + ";UST y.")
    assert report.total == 0


def test_fence_on_a_list_marker_line(tmp_path):
    # The text after "- ", "1. " or ": " starts the item's first block, so "- ~~~" opens a
    # fence there, and the rule after it renders.
    for marker in ("- ", "1. ", "-   "):
        pad = " " * len(marker)
        report = lint_body(tmp_path, f"{marker}~~~", f"{pad}code", "", f"{pad}~~~", "", f"{pad}Clients MUST verify.", f"{pad}~~~")
        assert report.untagged == at(6), marker
    # Right after a sibling item, a parent item or a definition's term, it opens one too.
    for before, marker in (("- Item", "- "), ("- Item", "  - "), ("Term", ": ")):
        pad = " " * len(marker)
        report = lint_body(tmp_path, before, f"{marker}~~~", f"{pad}code", "", f"{pad}~~~", "", f"{pad}Clients MUST verify.", f"{pad}~~~")
        assert report.untagged == at(7), marker
    # Not after top-level paragraph text, which a list can't interrupt: all of it is text.
    assert lint_body(tmp_path, "Text", "- ~~~", "  Servers MUST x.", "  ~~~").untagged == at(1)


def test_split_keyword_in_inline_markup_is_a_requirement(tmp_path):
    # Emphasis, a link or an HTML comment or tag inside the keyword still renders MUST. An
    # intraword _ stays as text (M_UST_), as does \U.
    spec = write_spec(
        tmp_path,
        "A M**UST** b.\n\nC M<!-- x -->UST d.\n\nE [MU](https://x.example)ST f.\n\n"
        "G M*UST h*.\n\nI M<span>UST</span> j.\n\nK M_UST_ l.\n\nM M\\UST n.\n\nO _M_UST p.\n",
    )
    assert lint_file(spec).untagged == [8, 10, 12, 14, 16]


def test_fence_opener_backtracks_to_a_shorter_run(tmp_path):
    # With no closer as long as ~~~~~~, kramdown opens with a shorter run and reads the
    # dropped tildes as the info word, so ~~~~ closes it and the rule renders.
    report = lint_body(tmp_path, "~~~~~~", "x", "~~~", "", "~~~~", "Servers MUST verify the token.", "~~~~")
    assert report.untagged == at(6)
    # The other way: everything up to a later ~~~ is code, so the ID tags nothing.
    report = lint_body(tmp_path, "~~~~~~", "Servers MUST x.", "{: #req-test-charge-001}", "~~~")
    assert report.total == 0 and report.errors == []
    # An info word glued to the tildes backtracks too; one after a space doesn't.
    assert lint_body(tmp_path, "~~~~~json", "x", "~~~~", "", "Servers MUST verify.").untagged == at(5)
    report = lint_body(tmp_path, "~~~~~~ json", "x", "~~~", "", "~~~~", "Hidden MUST x.", "~~~~")
    assert report.total == 0


def test_paragraph_after_a_misindented_id_is_outside_the_list(tmp_path):
    # The column-0 ID ends the list and anchors it; the next paragraph, indented or lazy, is
    # top-level, so its column-0 ID attaches to it.
    for gap in ("\n  ", "\n"):
        spec = write_spec(
            tmp_path,
            f"- Item MUST a.\n{{: #req-test-charge-001}}\n{gap}Para MUST b.\n{{: #req-test-charge-002}}\n",
        )
        report = lint_file(spec)
        assert report.tagged == 1 and len(report.errors) == 1, gap
        assert "req-test-charge-001 is not indented" in report.errors[0]
    # A fence at column 0 ends the list the same way.
    spec = write_spec(tmp_path, "- Item.\n\n~~~\ncode\n~~~\n\n  Indented para MUST x.\n{: #req-test-charge-001}\n")
    report = lint_file(spec)
    assert report.tagged == 1 and report.errors == []


def test_extension_tag_inside_a_paragraph_keeps_it_open(tmp_path):
    # {::options /} or {::nomarkdown} right after paragraph text is a span, so the ~~~ lines
    # after it are still that paragraph's text and the rule shows.
    for tag in ('{::options toc_levels="2" /}', "{::nomarkdown}x{:/nomarkdown}", "{:/}"):
        report = lint_body(tmp_path, "Intro text.", tag, "~~~", "Servers MUST verify.", "~~~")
        assert report.untagged == at(1), tag
    # At the start of a block it is one, and the fence after it opens.
    report = lint_body(tmp_path, '{::options toc_levels="2" /}', "~~~", "Servers MUST verify.", "~~~")
    assert report.total == 0


def test_indented_block_inside_a_list_item_keeps_the_list_open(tmp_path):
    # A comment, table, extension or HTML block indented to the item's text stays in the
    # item, so a column-0 ID after the next paragraph lands on the list. A thematic break
    # ends the list instead.
    for block in ("<!-- note -->", "| x | y |", '{::options toc_levels="2" /}', "<div>"):
        spec = write_spec(
            tmp_path,
            f"- A MUST b.\n  {{: #req-test-charge-001}}\n\n  {block}\n\n  C MUST d.\n{{: #req-test-charge-002}}\n",
        )
        report = lint_file(spec)
        assert any("req-test-charge-002 is not indented" in e for e in report.errors), block
    spec = write_spec(tmp_path, "- A MUST b.\n  {: #req-test-charge-001}\n\n  ***\n\n  C MUST d.\n{: #req-test-charge-002}\n")
    assert lint_file(spec).errors == []


def test_heading_inside_a_list_item_is_a_render_error(tmp_path):
    # kramdown-rfc writes a <section> inside the list for it, which isn't well-formed XML;
    # xml2rfc can't build that draft either.
    spec = write_spec(tmp_path, "- A MUST b.\n  {: #req-test-charge-001}\n\n  # Head\n\n  C MUST d.\n")
    report = lint_file(spec)
    assert len(report.errors) == 1 and "doesn't parse" in report.errors[0]
    assert main(["--strict", str(spec)]) == 1


def test_ids_from_attribute_list_definitions(tmp_path):
    # {: name} applies the ALD {:name: ...}, defined before or after it (not inside code), and
    # a reference may name another ALD.
    spec = write_spec(
        tmp_path,
        "{:reused: #req-test-charge-001}\n\nSome note.\n{: reused}\n\n"
        "Servers MUST x.\n{: #req-test-charge-001}\n",
    )
    errors = lint_file(spec).errors
    assert any("no BCP 14 keyword" in e for e in errors) and any("duplicate ID" in e for e in errors)
    spec = write_spec(tmp_path, "Servers MUST x.\n{: a}\n\n{:a: b}\n{:b: #req-test-charge-001}\n")
    report = lint_file(spec)
    assert report.tagged == 1 and report.errors == []
    spec = write_spec(tmp_path, "~~~\n{:tag: #req-test-charge-001}\n~~~\n\nServers MUST x.\n{: tag}\n")
    assert lint_file(spec).untagged == [12]
    # A literal ID after a referenced one wins: kramdown keeps the last ID, so the ALD's ID
    # is dropped and reported on its definition.
    spec = write_spec(tmp_path, "Servers MUST x.\n{: tag #req-test-charge-002}\n\n{:tag: #req-test-charge-001}\n")
    report = lint_file(spec)
    assert report.tagged == 1
    assert report.errors == ["line 11: req-test-charge-001 in ALD tag is replaced by another ID on the block that uses it"]


def test_ald_cycle_is_a_render_error(tmp_path):
    # kramdown overflows its stack on a reference cycle, so no such draft builds.
    spec = write_spec(tmp_path, "{:a: b}\n{:b: a #req-test-charge-001}\n\nP MUST x.\n{: a}\n")
    report = lint_file(spec)
    assert len(report.errors) == 1 and report.errors[0].startswith("kramdown-rfc could not render the draft")


def test_unmatched_longer_backtick_run_shows_keyword(tmp_path):
    # kramdown closes a code span only at a run of the same length.
    assert lint_body(tmp_path, "R ``MUST` x.").untagged == at(1)


def test_ial_at_another_quote_depth_tags_nothing(tmp_path):
    # '> {: #id}' after unquoted text is paragraph text; an unquoted IAL after a quoted
    # paragraph goes on the blockquote.
    report = lint_body(tmp_path, "P MUST a.", "> {: #req-test-charge-001}")
    assert report.untagged == at(1) and any("renders as text" in e for e in report.errors)
    report = lint_body(tmp_path, "> Q MUST b.", "{: #req-test-charge-002}")
    assert report.untagged == at(1)
    assert report.errors == [f"line {at(2)[0]}: req-test-charge-002 is not directly after a paragraph or list item"]


def test_consecutive_ials_tag_the_same_block(tmp_path):
    # kramdown applies both IAL lines to the paragraph and keeps the last ID.
    report = lint_body(tmp_path, "Servers MUST verify.", "{: #req-test-charge-045}", "{: #alternate}")
    assert report.tagged == 1
    assert report.errors == [
        f"line {at(1)[0]}: req-test-charge-045 shares its block with another ID "
        "(req-test-charge-045, alternate); kramdown keeps only the last"
    ]


def test_indented_ald_in_a_paragraph_defines_nothing(tmp_path):
    report = lint_body(tmp_path, "P MUST a.", "    {:ref: #req-test-charge-003}", "{: ref}")
    assert report.untagged == at(1) and any("renders as text" in e for e in report.errors)


def test_escaped_backslash_before_backticks_opens_a_code_span(tmp_path):
    # '\\\\' renders one backslash, so the backticks after it delimit code.
    assert lint_body(tmp_path, "Code \\\\`MUST` here.").total == 0
    # '\\`' is a literal backtick, so MUST stays prose.
    assert lint_body(tmp_path, "Tick \\`MUST here.").untagged == at(1)


def test_second_ial_left_of_item_text_does_not_tag_the_item(tmp_path):
    report = lint_body(tmp_path, "- Servers MUST verify.", "  {: .foo}", "{: #req-test-charge-044}")
    assert report.untagged == at(1) and report.tagged == 0
    assert len(report.errors) == 1 and "req-test-charge-044" in report.errors[0]


def test_ald_looking_prose_line_is_paragraph_text(tmp_path):
    # Text after the first } makes it no definition: kramdown renders the line as prose.
    assert lint_body(tmp_path, "{:ref: x} Servers MUST verify.").untagged == at(1)
    assert lint_body(tmp_path, "P a.", "{:ref: x} Servers MUST verify.").untagged == at(1)


def test_comment_inside_table_cell_does_not_hide_a_condition(tmp_path):
    report = lint_body(tmp_path, "| f | g |", "|---|---|", "| a | REQUIRED: <!--hidden-->if mode is payment |", "| b | REQUIRED |")
    assert report.errors == [f"line {at(3)[0]}: keyword in a table cell; state the rule in a tagged paragraph"]


def test_escaped_comment_opener_in_table_cell_still_flags(tmp_path):
    report = lint_body(tmp_path, "| f | g |", "|---|---|", "| a | Clients \\<!-- MUST --> verify |", "| b | X \\{::comment}MUST{:/comment} y |")
    assert [e.split(":")[0] for e in report.errors] == [f"line {n}" for n in at(3, 4)]


def test_exponential_ald_references_time_out(tmp_path, monkeypatch):
    # kramdown expands ALD references without memoising them: a chain where each ALD names
    # the previous one twice takes exponential time, so the lint stops waiting.
    import lint_requirements

    monkeypatch.setattr(lint_requirements, "RENDER_TIMEOUT", 3)
    alds = "".join(f"{{:a{n}: a{n - 1} a{n - 1}}}\n" for n in range(1, 40))
    spec = write_spec(tmp_path, "{:a0: #req-test-charge-001}\n" + alds + "\nP MUST x.\n{: a39}\n")
    report = lint_file(spec)
    assert report.errors == ["kramdown-rfc did not finish rendering the draft in 3 s"]


def test_keywords_inside_comments_are_hidden(tmp_path):
    assert lint_body(tmp_path, "Note <!-- Servers MUST verify. -->").total == 0
    assert lint_body(tmp_path, "Note {::comment}Servers MUST verify.{:/comment}").total == 0
    # An escaped opener renders literally, keyword included.
    assert lint_body(tmp_path, "Note \\<!-- MUST -->").untagged == at(1)
    report = lint_body(tmp_path, "| f | g |", "|---|---|", "| a | <!-- Servers MUST verify. --> |", "| b | {::comment}MUST{:/comment} |")
    assert report.errors == []


def test_wide_ald_references_resolve_quickly(tmp_path):
    import time

    ids = " ".join(f"#req-test-charge-{n:03d}" for n in range(1, 201))
    spec = write_spec(tmp_path, f"{{:a: {ids}}}\n{{:b: {' '.join(['a'] * 200)}}}\n\nP MUST x.\n{{: b}}\n")
    start = time.monotonic()
    report = lint_file(spec)
    assert time.monotonic() - start < 10
    # kramdown keeps the last ID; the other 199 are dropped, each reported on the ALD line.
    assert report.tagged == 1 and report.notes == []
    assert len(report.errors) == 199
    assert all(e.startswith("line 8: ") and "is replaced by another ID" in e for e in report.errors)


def test_comment_markers_inside_math_hide_nothing(tmp_path):
    # kramdown-rfc renders "Servers <!-- MUST verify -->." here: the markers are math.
    assert lint_body(tmp_path, "Servers $$<!--$$ MUST verify $$-->$$.").untagged == at(1)
    report = lint_body(tmp_path, "| a | b |", "|---|---|", "| x | $$<!--$$ MUST $$-->$$ |")
    assert any("table cell" in e for e in report.errors)


class TestRenderedConstructs:
    """Constructs the hand-written Markdown parser got wrong; kramdown-rfc decides them now."""

    def test_ald_id_replaced_by_a_literal_id_is_reported(self, tmp_path):
        # kramdown keeps only the block's last ID, so the ALD's ID never becomes an anchor.
        report = lint_body(tmp_path, "{:tag: #req-test-charge-001}", "", "A rule MUST hold.", "{: tag #req-test-charge-002}")
        assert report.tagged == 1
        assert report.errors == [f"line {at(1)[0]}: req-test-charge-001 in ALD tag is replaced by another ID on the block that uses it"]

    def test_unused_ald_id_stays_quiet(self, tmp_path):
        report = lint_body(tmp_path, "{:tag: #req-test-charge-001}", "", "A rule MUST hold.", "{: #req-test-charge-002}")
        assert report.tagged == 1 and report.errors == []

    def test_span_ial_id_is_reported(self, tmp_path):
        # A span IAL anchors the span, not the paragraph.
        report = lint_body(tmp_path, "Clients *MUST*{: #req-test-charge-001} retry.")
        assert report.untagged == at(1)
        assert report.errors == [f"line {at(1)[0]}: req-test-charge-001 is a span IAL inside the text; put it on its own line after the block"]

    def test_ial_with_classes_and_attributes_tags(self, tmp_path):
        report = lint_body(tmp_path, "Clients MUST retry.", '{: .note title="x" #req-test-charge-001}')
        assert report.tagged == 1 and report.errors == []

    def test_many_alds_lint_quickly(self, tmp_path):
        # Thousands of definitions and references: kramdown resolves them, in linear time.
        import time

        alds = "".join(f"{{:d{n}: .c{n}}}\n" for n in range(2000))
        body = "".join(f"Rule {n} MUST hold.\n{{: d{n} #req-test-charge-{n + 1:03d}}}\n\n" for n in range(300))
        spec = write_spec(tmp_path, alds + "\n" + body)
        start = time.monotonic()
        report = lint_file(spec)
        assert time.monotonic() - start < 20
        assert report.tagged == 300 and report.errors == [] and report.notes == []

    def test_reference_style_links(self, tmp_path):
        # The link text renders; the definition (and a keyword in its title) renders nothing.
        report = lint_body(tmp_path, "See [the spec][s]; servers MUST follow it.", "{: #req-test-charge-001}", "", '[s]: https://e.x "Clients MUST"')
        assert report.tagged == 1 and report.total == 1 and report.errors == []
        report = lint_body(tmp_path, "[MU][s]ST be split.", "", "[s]: https://e.x")
        assert report.untagged == at(1)

    def test_html_comment_inside_a_list_item(self, tmp_path):
        report = lint_body(tmp_path, "- item", "  <!-- c MUST -->", "  more.", "", "- Next MUST x.", "  {: #req-test-charge-001}")
        assert report.tagged == 1 and report.total == 1 and report.errors == []

    def test_hash_lines_in_code_blocks_are_not_headings(self, tmp_path):
        report = lint_body(tmp_path, "~~~", "# Servers MUST {#req-test-charge-009}", "~~~", "", "    # Indented MUST {#req-test-charge-008}", "", "Rule MUST x.")
        assert report.untagged == at(7) and report.errors == []

    def test_thematic_breaks(self, tmp_path):
        # A break between paragraphs separates them; after a list it ends the list, so the
        # column-0 ID tags the paragraph after it.
        report = lint_body(tmp_path, "A MUST b.", "", "- - -", "", "C MUST d.", "{: #req-test-charge-001}")
        assert report.untagged == at(1) and report.tagged == 1
        report = lint_body(tmp_path, "- item", "", "***", "", "  Para MUST x.", "{: #req-test-charge-001}")
        assert report.tagged == 1 and report.errors == []

    def test_table_rows_map_to_their_lines(self, tmp_path):
        # Rows with the same cells in two tables: each is reported on its own line.
        report = lint_body(
            tmp_path, "| f | g |", "|---|---|", "| a | REQUIRED |", "| b | MUST be set |", "",
            "Text between.", "", "| f | g |", "|---|---|", "| a | REQUIRED |", "| b | MUST be set |",
        )
        assert [e.split(":")[0] for e in report.errors] == [f"line {n}" for n in at(4, 11)]

    def test_setext_headings_are_headings(self, tmp_path):
        report = lint_body(tmp_path, "Servers MUST heading", "====================", "", "Sub MUST", "--------", "", "Rule MUST x.")
        assert report.untagged == at(7)
        report = lint_body(tmp_path, "Heading {#req-test-charge-001}", "===============================", "", "Rule MUST x.")
        assert any("on a heading" in e for e in report.errors)

    def test_line_separator_does_not_split_lines(self, tmp_path):
        # kramdown splits lines on \n only; str.splitlines would also split on U+2028 and
        # shift every line number after it.
        report = lint_body(tmp_path, "A\u2028B text.", "", "Servers MUST x.", "", "C\u2029D text.", "", "Clients MUST y.")
        assert report.untagged == at(3, 7)

    def test_requirement_after_code_with_the_same_words(self, tmp_path):
        # The code repeats the rule's words; the rule maps to its own line, not the code's.
        report = lint_body(tmp_path, "~~~", "Servers MUST reject expired credentials.", "~~~", "", "Servers MUST reject expired credentials.")
        assert report.untagged == at(5)

    def test_lines_after_boilerplate_and_in_back(self, tmp_path):
        # {::boilerplate} expands to more lines; kramdown-rfc's later line markers count them.
        spec = tmp_path / "draft-test-charge-00.md"
        spec.write_text(
            "---\ntitle: T\n---\n\n--- middle\n\n# Language\n\n{::boilerplate bcp14-tagged}\n\n"
            "# Body\n\nServers MUST x.\n\n--- back\n\n# Example\n\nNote: values MUST be full.\n"
        )
        assert lint_file(spec).untagged == [13, 19]


class TestAnnotations:
    def test_escaping(self):
        assert annotation("specs/a,b:c.md", 12, "100% sure\r\nnext") == (
            "::warning file=specs/a%2Cb%3Ac.md,line=12,title=Requirement lint::100%25 sure%0D%0Anext"
        )
        assert annotation("specs/x.md", None, "whole draft") == "::warning file=specs/x.md,title=Requirement lint::whole draft"

    def test_github_actions_prints_one_annotation_per_warning(self, tmp_path, monkeypatch, capsys):
        spec = write_spec(tmp_path, "A MUST b.\n{: #req-test-charge-001}\n\nC MUST d.\n\nPlain.\n{: #req-test-charge-002}\n")
        monkeypatch.setenv("GITHUB_ACTIONS", "true")
        assert main([str(spec)]) == 0
        out = capsys.readouterr().out
        warnings = [line for line in out.splitlines() if line.startswith("::warning")]
        path = spec.as_posix()
        assert warnings == [
            f"::warning file={path},line=11,title=Requirement lint::untagged requirement",
            f"::warning file={path},line=13,title=Requirement lint::req-test-charge-002 is on text with no BCP 14 "
            "keyword; drop the ID or restore the keyword",
        ]
        # The plain output is unchanged.
        assert "    line 11: untagged requirement" in out

    def test_drafts_being_tagged_are_annotated_first(self, tmp_path, monkeypatch, capsys):
        # GitHub shows only the first 10 annotations, so an untagged draft that sorts first
        # must not crowd out the draft a pull request is tagging.
        untagged = write_spec(tmp_path, "C MUST d.\n", "draft-alpha-charge-00.md")
        tagged = write_spec(tmp_path, "A MUST b.\n{: #req-test-charge-001}\n\nC MUST d.\n")
        monkeypatch.setenv("GITHUB_ACTIONS", "true")
        main(["--strict", str(untagged), str(tagged)])
        out = capsys.readouterr().out
        files = [line.split(",")[0] for line in out.splitlines() if line.startswith("::warning")]
        assert files == [f"::warning file={tagged.as_posix()}", f"::warning file={untagged.as_posix()}"]

    def test_no_annotations_outside_github_actions(self, tmp_path, monkeypatch, capsys):
        spec = write_spec(tmp_path, "C MUST d.\n")
        monkeypatch.delenv("GITHUB_ACTIONS", raising=False)
        main(["--strict", str(spec)])
        assert "::warning" not in capsys.readouterr().out

    def test_repo_relative_path(self, monkeypatch, capsys):
        drafts = sorted((ROOT / "specs/methods/tempo").glob("draft-tempo-session-*.md"))
        monkeypatch.setenv("GITHUB_ACTIONS", "1")
        main(["--strict", str(drafts[-1])])
        out = capsys.readouterr().out
        assert "::warning file=specs/methods/tempo/" in out


def test_id_shown_as_code_is_still_checked_where_misused(tmp_path):
    # The ID appears as a syntax example in a code span and a code block; its real IAL on a
    # block that another ID replaces is still reported.
    report = lint_body(
        tmp_path,
        "Write `{: #req-test-charge-001}` after a paragraph.",
        "",
        "~~~",
        "{: #req-test-charge-001}",
        "~~~",
        "",
        "A rule MUST hold.",
        "{: #req-test-charge-001}",
        "{: #req-test-charge-002}",
    )
    assert any("req-test-charge-001" in e for e in report.errors)


def test_id_only_in_code_stays_quiet(tmp_path):
    report = lint_body(
        tmp_path,
        "Write `{: #req-test-charge-009}` after a paragraph.",
        "",
        "~~~",
        "{: #req-test-charge-009}",
        "~~~",
        "",
        "A rule MUST hold.",
        "{: #req-test-charge-001}",
    )
    assert report.errors == []


def test_ial_before_its_block_is_reported_despite_later_mentions(tmp_path):
    # A later mention of the ID in prose or code is no IAL, so it doesn't place the ID.
    for mention in ("See req-test-charge-001 above.", "See `req-test-charge-001` above.", ""):
        report = lint_body(tmp_path, "Intro.", "", "{: #req-test-charge-001}", "P MUST x.", "", mention)
        assert report.errors == [f"line {at(3)[0]}: req-test-charge-001 is not directly after a paragraph or list item"]
        assert report.untagged == at(4)


def test_strip_code_spans():
    assert strip_code_spans("a `x` b ``y`z`` c") == "a   b   c"
    # An unmatched run stays literal, and a span closes only at a run of its own length.
    assert strip_code_spans("a ``x` b") == "a ``x` b"
    assert strip_code_spans("`a``b`") == " "


def test_strip_code_spans_is_linear_on_backtick_runs():
    import time

    start = time.monotonic()
    strip_code_spans("`" * 64000)
    strip_code_spans("` " * 32000)
    assert time.monotonic() - start < 2
