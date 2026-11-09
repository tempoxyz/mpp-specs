"""Tests for lint_requirements.py"""

from pathlib import Path

from lint_requirements import ROOT, decode_refs, lint_file, main, segments, short_name, table_keywords


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
        for end in ("^", "<div>"):
            spec = write_spec(tmp_path, f"A MUST b.\n{end}\n{{: #req-test-charge-001}}\n")
            report = lint_file(spec)
            assert report.tagged == 0, end
            assert any("not directly after" in e for e in report.errors), end

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


def test_ial_indented_four_past_text_is_paragraph_text():
    # kramdown reads an IAL only up to three columns in; deeper, it is more text.
    lines = ["A rule MUST hold.", "    {: #req-x-001}", "", "* item MUST x.", "      {: #req-x-002}"]
    found, detached, misindented, _ = segments(lines)
    assert [s.ids for s in found] == [[], []]
    assert detached == [] and misindented == []


def test_block_html_comment_hides_keywords_and_ids():
    lines = ["Intro.", "", "<!--", "A hidden rule MUST hold.", "{: #req-x-003}", "| MUST | x |", "-->", "", "Visible SHOULD x."]
    found, detached, _, code = segments(lines)
    assert [s.first for s in found] == ["Intro.", "Visible SHOULD x."]
    assert detached == []
    assert {3, 4, 5, 6, 7} <= code
    assert table_keywords(lines, code) == []


def test_one_line_html_comment_does_not_open_a_block():
    lines = ["<!-- note -->", "A rule MUST hold.", "{: #req-x-001}"]
    found, _, _, _ = segments(lines)
    assert [s.ids for s in found] == [["req-x-001"]]


def test_fence_inside_html_comment_is_comment_text():
    # The ~~~ is inside the comment, so it opens no fence and the rule after --> is prose.
    lines = ["<!--", "~~~", "-->", "", "A rule MUST hold."]
    found, _, _, code = segments(lines)
    assert [s.first for s in found] == ["A rule MUST hold."]
    assert 5 not in code


def test_unclosed_html_comment_hides_nothing():
    # kramdown renders a <!-- with no --> as text, so the rule after it still needs its ID.
    lines = ["Intro.", "", "<!-- unclosed note", "", "A rule MUST hold.", "{: #req-x-001}"]
    found, _, _, code = segments(lines)
    assert found[-1].ids == ["req-x-001"]
    assert 5 not in code


def test_code_span_and_math_pair_in_kramdown_order():
    # kramdown takes the span that starts first (checked with kramdown-rfc): a backtick in
    # $$...$$ pairs with nothing outside it, and a $$ in a code span opens no formula.
    for line in ["Servers $$a`b$$ MUST verify `x`.", "And `a $$` SHOULD `$$ b`."]:
        found, _, _, _ = segments(["Intro.", "", line])
        assert [s.line for s in found if s.is_requirement] == [3]
    assert table_keywords(["| a | b |", "|---|---|", "| x | $$`$$ MUST ` |"]) == [3]


def test_unclosed_html_comment_opener_line_is_prose():
    # kramdown renders the unclosed <!-- line itself as paragraph text (checked with
    # kramdown-rfc), so its keyword is a requirement that needs an ID, quoted or not.
    for opener in ["<!-- Servers MUST verify it.", "> <!-- Servers MUST verify it."]:
        found, _, _, code = segments(["Intro.", "", opener, "", "More text."])
        assert [s.line for s in found if s.is_requirement] == [3]
        assert 3 not in code


def test_quoted_unclosed_comment_does_not_borrow_a_later_closer():
    # kramdown parses the quote alone: its <!-- has no --> there, so it is text and the
    # rule after the quote is still prose.
    lines = ["Intro.", "", "> <!-- quoted unclosed", "", "A rule MUST hold.", "", "<!-- real -->"]
    found, _, _, code = segments(lines)
    assert "A rule MUST hold." in [s.first for s in found]
    assert 5 not in code


def test_requirement_id_on_heading_is_an_error(tmp_path):
    draft = tmp_path / "draft-hd-00.md"
    draft.write_text("# Heading {#req-hd-001}\n\nA rule MUST hold.\n{: #req-hd-001}\n")
    report = lint_file(draft)
    assert any("on a heading" in e for e in report.errors)

def test_quoted_html_comment_closes_inside_its_quote():
    # A --> on a following line of the same quote closes it: only the quote is hidden.
    lines = ["> <!--", "> hidden MUST x.", "> -->", "", "A rule MUST hold.", "{: #req-x-001}"]
    found, _, _, code = segments(lines)
    assert [s.ids for s in found] == [["req-x-001"]]
    assert {1, 2, 3} <= code and 5 not in code


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


def test_block_kramdown_comment_hides_keywords_and_ids():
    lines = ["Intro.", "", "{::comment}", "Hidden MUST x.", "{: #req-x-001}", "{:/comment}", "", "Visible SHOULD y."]
    found, detached, _, code = segments(lines)
    assert [s.first for s in found] == ["Intro.", "Visible SHOULD y."]
    assert detached == [] and {3, 4, 5, 6} <= code


def test_kramdown_comment_in_a_paragraph_is_a_span():
    # Right after a paragraph line kramdown reads {::comment} as a span: the paragraph goes
    # on, the comment drops out, and the IAL after its stop tag tags the paragraph.
    lines = ["P MUST one.", "{::comment}", "x MUST", "{:/comment}", "{: #req-x-001}", "", "A {::comment}MAY{:/comment} b."]
    found, detached, _, _ = segments(lines)
    assert [s.ids for s in found] == [["req-x-001"], []]
    assert detached == [] and not found[1].is_requirement


def test_kramdown_comment_tag_with_text_after_it_is_a_paragraph():
    lines = ["{::comment}x{:/comment} The client MUST go.", "{: #req-x-001}", "", "{::comment}y MUST{:/comment}"]
    found, detached, _, _ = segments(lines)
    assert found[0].ids == ["req-x-001"] and detached == []
    assert not found[1].is_requirement


def test_unclosed_or_cross_quote_kramdown_comment_hides_nothing():
    # Without a {:/comment} line (in the same quote) kramdown renders the tag as text.
    lines = ["> {::comment}", "> hidden MUST", "", "{:/comment}", "", "{::comment}", "Rule MUST hold.", "{: #req-x-001}"]
    found, _, _, code = segments(lines)
    assert found[0].is_requirement and found[-1].ids == ["req-x-001"]
    assert not {1, 2, 6, 7} & code


def test_tab_after_space_in_indentation_is_an_error(tmp_path):
    # kramdown expands "  \t" after stripping the item's two columns, making this a code
    # block; expandtabs(4) would read it as the item's tagged paragraph.
    spec = write_spec(tmp_path, "* a\n\n  \tpara MUST x.\n  \t{: #req-test-charge-001}\n")
    report = lint_file(spec)
    assert sum("tab after a space" in e for e in report.errors) == 2
    # Leading tabs alone expand the same way in both.
    spec = write_spec(tmp_path, "* a\n\n\tpara MUST x.\n\t{: #req-test-charge-001}\n")
    assert lint_file(spec).errors == []


def test_kramdown_comment_stop_tag_must_be_in_the_openers_container():
    # Checked against kramdown-rfc: a stop tag that is quoted, indented four or more, or
    # outside the opener's list item closes nothing, so the opener is text and the rule after
    # it renders. Up to three spaces in, in the same quote or item, it closes.
    for closer in ("> {:/comment}", "    {:/comment}"):
        lines = ["{::comment}", "", "Servers MUST verify.", "", closer, "", "After."]
        found, _, _, code = segments(lines)
        assert [s.first for s in found if s.is_requirement] == ["Servers MUST verify."], closer
        assert not {1, 2, 3} & code, closer
    lines = ["- item", "", "  {::comment}", "", "Servers MUST verify.", "", "{:/comment}"]
    found, _, _, code = segments(lines)
    assert "Servers MUST verify." in [s.first for s in found] and not {3, 5} & code
    lines = ["{::comment}", "hidden MUST", "   {:/comment}", "", "> {::comment}", "> hid MUST", ">    {:/}",
             "", "- item", "", "  {::comment}", "  gone MUST", "     {:/comment}", "", "  Kept MUST x."]
    found, _, _, code = segments(lines)
    assert [s.first for s in found if s.is_requirement] == ["Kept MUST x."]
    assert {1, 2, 3, 5, 6, 7, 11, 12, 13} <= code
    # The comment doesn't end its item's list: the paragraph after it is still the item's.
    assert found[-1].indent == 2


def test_fence_follows_kramdown_rules():
    # Checked against kramdown-rfc. Each ~~~ below opens no fence (no closer in its container,
    # an indented opener, two info words, or right after paragraph text), so the rule after
    # it is prose; before this, the lint hid everything to the end of the draft.
    for body in (
        ["~~~", "x MUST a"],  # no closer
        ["```text", "~~~", "x MUST a", "```"],  # a ~~~ inside a backtick pair
        [" ~~~", "x MUST a", " ~~~"],  # indented: kramdown fences only at column 0
        ["~~~ a b", "x MUST a", "~~~"],  # more than one info word
        ["> ~~~", "> x MUST a"],  # its closer is outside the quote
    ):
        # A closer after the rule, which only the quoted opener can't reach; the first opener
        # would take it, as kramdown does.
        tail = [] if body[0] == "~~~" else ["", "~~~"]
        lines = ["Intro.", "", *body, "", "Rule MUST hold.", *tail]
        found, _, _, code = segments(lines)
        assert "Rule MUST hold." in [s.first for s in found], body
        assert not code & set(range(3, 3 + len(body))), body
    # A fence can't interrupt a paragraph or list item text: the ~~~ lines are its text.
    found, _, _, code = segments(["P x.", "~~~", "code MUST", "~~~", "", "- i", "  ~~~", "  y MUST", "  ~~~"])
    assert [s.is_requirement for s in found] == [True, True] and not code
    # Its closer must be in the opener's list item, at the item's text column.
    lines = ["- item", "", "  ~~~", "  code", "", "Rule MUST hold.", "", "~~~"]
    found, _, _, code = segments(lines)
    assert "Rule MUST hold." in [s.first for s in found] and 6 not in code
    # A shorter run, an indented run or a run with text after it doesn't close the fence.
    lines = ["~~~~", "~~~", "  ~~~~", "~~~~ x", "a MUST b", "~~~~~", "", "Rule MUST hold."]
    found, _, _, code = segments(lines)
    assert [s.first for s in found] == ["Rule MUST hold."] and set(range(1, 7)) <= code


def test_character_references_are_keywords(tmp_path):
    # kramdown renders &#77;UST and &#x4d;UST as MUST (also in a table cell), but not &#X4D;AY,
    # &#77UST (no ';') or a reference inside a code span; &quot;MUST&quot; names the keyword.
    spec = write_spec(
        tmp_path,
        "A &#77;UST b.\n\nC &#x4d;UST d.\n\nE &#0083;HOULD f.\n\n"
        "G &#X4D;AY &#77UST `&#77;UST ` &quot;MUST&quot; h.\n\n| f | &#x4d;AY be set |\n",
    )
    report = lint_file(spec)
    assert len(report.untagged) == 3
    assert any("table cell" in e for e in report.errors)


def test_huge_decimal_character_reference_stays_as_written():
    # More digits than Python's int-from-string limit: left as text, no crash.
    ref = "&#" + "7" * 5000 + ";"
    assert decode_refs(ref + "UST") == ref + "UST"

def test_fence_on_a_list_marker_line(tmp_path):
    # Checked against kramdown-rfc (finding: a fence opening on its item's marker line). The
    # text after "- ", "1. " or ": " starts the item's first block, so "- ~~~" opens a fence
    # there. Missing it, the lint read the real closer as an opener that took the ~~~ after
    # the rule, and hid a rendered rule.
    for marker in ("- ", "1. ", "-   "):
        pad = " " * len(marker)
        lines = [f"{marker}~~~", f"{pad}code", "", f"{pad}~~~", "", f"{pad}Clients MUST verify.", f"{pad}~~~"]
        found, _, _, code = segments(lines)
        assert [s.first for s in found if s.is_requirement] == ["Clients MUST verify."], marker
        assert code == {1, 2, 3, 4}, marker
    # Right after a sibling item, a parent item or a definition's term, it opens one too.
    for before, marker in (("- Item", "- "), ("- Item", "  - "), ("Term", ": ")):
        pad = " " * len(marker)
        lines = [before, f"{marker}~~~", f"{pad}code", "", f"{pad}~~~", "", f"{pad}Clients MUST verify.", f"{pad}~~~"]
        found, _, _, code = segments(lines)
        assert "Clients MUST verify." in [s.first for s in found], marker
        assert code == {2, 3, 4, 5}, marker
    # Not after top-level paragraph text, which a list can't interrupt: all of it is text.
    found, _, _, code = segments(["Text", "- ~~~", "  Servers MUST x.", "  ~~~"])
    assert any(s.is_requirement for s in found) and not code


def test_split_keyword_in_inline_markup_is_a_requirement(tmp_path):
    # Checked against kramdown-rfc: emphasis, a link or an HTML comment or tag inside the
    # keyword still renders MUST. An intraword _ stays as text (M_UST_), as does \U.
    spec = write_spec(
        tmp_path,
        "A M**UST** b.\n\nC M<!-- x -->UST d.\n\nE [MU](https://x.example)ST f.\n\n"
        "G M*UST h*.\n\nI M<span>UST</span> j.\n\nK M_UST_ l.\n\nM M\\UST n.\n\nO _M_UST p.\n",
    )
    assert lint_file(spec).untagged == [8, 10, 12, 14, 16]


def test_fence_opener_backtracks_to_a_shorter_run(tmp_path):
    # Checked against kramdown-rfc: with no closer as long as ~~~~~~, kramdown opens with a
    # shorter run and reads the dropped tildes as the info word, so ~~~~ closes it. Lines 1-5
    # are code and the rule renders; the lint used to pair lines 5 and 7 and hide it.
    lines = ["~~~~~~", "x", "~~~", "", "~~~~", "Servers MUST verify the token.", "~~~~"]
    found, _, _, code = segments(lines)
    assert [s.first for s in found] == ["Servers MUST verify the token."] and code == {1, 2, 3, 4, 5}
    # The other way: everything up to a later ~~~ is code, so the ID tags nothing.
    found, _, _, code = segments(["~~~~~~", "Servers MUST x.", "{: #req-x-001}", "~~~"])
    assert found == [] and code == {1, 2, 3, 4}
    # An info word glued to the tildes backtracks too; one after a space doesn't.
    found, _, _, code = segments(["~~~~~json", "x", "~~~~", "", "Servers MUST verify."])
    assert code == {1, 2, 3}
    found, _, _, code = segments(["~~~~~~ json", "x", "~~~", "", "~~~~", "Hidden MUST x.", "~~~~"])
    assert code == {5, 6, 7} and not any(s.is_requirement for s in found)


def test_paragraph_after_a_misindented_id_is_outside_the_list(tmp_path):
    # Checked against kramdown-rfc: the column-0 ID ends the list and anchors it; the next
    # paragraph, indented or lazy, is top-level, so its column-0 ID attaches to it.
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


def test_extension_tag_inside_a_paragraph_keeps_it_open():
    # Checked against kramdown-rfc: {::options /} or {::nomarkdown} right after paragraph text
    # is a span, so the ~~~ lines after it are still that paragraph's text and the rule shows.
    for tag in ('{::options toc_levels="2" /}', "{::nomarkdown}x{:/nomarkdown}", "{:/}"):
        found, _, _, code = segments(["Intro text.", tag, "~~~", "Servers MUST verify.", "~~~"])
        assert found[0].is_requirement and not code, tag
    # At the start of a block it is one, and the fence after it opens.
    found, _, _, code = segments(['{::options toc_levels="2" /}', "~~~", "Servers MUST verify.", "~~~"])
    assert found == [] and code == {2, 3, 4}


def test_indented_block_inside_a_list_item_keeps_the_list_open(tmp_path):
    # Checked against kramdown-rfc: a comment, table, heading, extension or HTML block
    # indented to the item's text stays in the item, so a column-0 ID after the next
    # paragraph lands on the list. A thematic break ends the list instead.
    for block in ("<!-- note -->", "| x | y |", "# Head", '{::options toc_levels="2" /}', "<div>"):
        spec = write_spec(
            tmp_path,
            f"- A MUST b.\n  {{: #req-test-charge-001}}\n\n  {block}\n\n  C MUST d.\n{{: #req-test-charge-002}}\n",
        )
        report = lint_file(spec)
        assert any("req-test-charge-002 is not indented" in e for e in report.errors), block
    spec = write_spec(tmp_path, "- A MUST b.\n  {: #req-test-charge-001}\n\n  ***\n\n  C MUST d.\n{: #req-test-charge-002}\n")
    assert lint_file(spec).errors == []


def test_ids_from_attribute_list_definitions(tmp_path):
    # Checked against kramdown-rfc: {: name} applies the ALD {:name: ...}, defined before or
    # after it (not inside code), and a reference may name another ALD.
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
    # A literal ID next to a referenced one is a second requirement ID.
    spec = write_spec(tmp_path, "Servers MUST x.\n{: tag #req-test-charge-002}\n\n{:tag: #req-test-charge-001}\n")
    assert any("more than one requirement ID" in e for e in lint_file(spec).errors)
    # kramdown overflows its stack on a reference cycle, so the lint reports one.
    spec = write_spec(tmp_path, "{:a: b}\n{:b: a #req-test-charge-001}\n\nP MUST x.\n{: a}\n")
    assert any("refers back to itself" in e for e in lint_file(spec).errors)


def test_unmatched_longer_backtick_run_shows_keyword():
    # kramdown closes a code span only at a run of the same length, so the keyword after an
    # unclosed double backtick is prose (checked with kramdown-rfc).
    assert segments(["R ``MUST` x."])[0][0].is_requirement


def test_ial_at_another_quote_depth_tags_nothing():
    # '> {: #id}' after unquoted text is paragraph text; an unquoted IAL after a quoted
    # paragraph goes on the blockquote (checked with kramdown-rfc).
    found, detached, _, _ = segments(["P MUST a.", "> {: #req-test-charge-001}"])
    assert [s.ids for s in found] == [[]]
    found, detached, _, _ = segments(["> Q MUST b.", "{: #req-test-charge-002}"])
    assert [s.ids for s in found] == [[]]
    assert [i for _, i in detached] == ["req-test-charge-002"]


def test_consecutive_ials_tag_the_same_block():
    # kramdown applies both IAL lines to the paragraph and keeps the last ID.
    found, detached, _, _ = segments(["Servers MUST verify.", "{: #req-test-charge-045}", "{: #alternate}"])
    assert [s.ids for s in found] == [["req-test-charge-045", "alternate"]]
    assert detached == []


def test_indented_ald_in_a_paragraph_defines_nothing():
    found, _, _, _ = segments(["P MUST a.", "    {:ref: #req-test-charge-003}", "{: ref}"])
    assert [s.ids for s in found] == [[]]


def test_escaped_backslash_before_backticks_opens_a_code_span():
    # '\\\\' renders one backslash, so the backticks after it delimit code.
    assert not segments(["Code \\\\`MUST` here."])[0][0].is_requirement
    # '\\`' is a literal backtick, so MUST stays prose.
    assert segments(["Tick \\`MUST here."])[0][0].is_requirement


def test_second_ial_left_of_item_text_does_not_tag_the_item():
    found, detached, _, _ = segments(["- Servers MUST verify.", "  {: .foo}", "{: #req-test-charge-044}"])
    assert [s.ids for s in found] == [[]]
    assert [i for _, i in detached] == ["req-test-charge-044"]


def test_ald_looking_prose_line_is_paragraph_text():
    # Text after the first } makes it no definition: kramdown renders the line as prose.
    found, _, _, _ = segments(["{:ref: x} Servers MUST verify."])
    assert [s.is_requirement for s in found] == [True]
    found, _, _, _ = segments(["P a.", "{:ref: x} Servers MUST verify."])
    assert len(found) == 1 and found[0].is_requirement


def test_comment_inside_table_cell_does_not_hide_a_condition():
    lines = ["| f | g |", "|---|---|", "| a | REQUIRED: <!--hidden-->if mode is payment |", "| b | REQUIRED |"]
    assert table_keywords(lines) == [3]


def test_escaped_comment_opener_in_table_cell_still_flags():
    lines = ["| f | g |", "|---|---|", "| a | Clients \\<!-- MUST --> verify |", "| b | X \\{::comment}MUST{:/comment} y |"]
    assert table_keywords(lines) == [3, 4]


def test_repeated_ald_references_resolve_quickly():
    import time
    from lint_requirements import ial_ids
    alds = {"a0": ["#req-test-charge-001"]}
    for n in range(1, 40):
        alds[f"a{n}"] = [f"a{n - 1} a{n - 1}"]
    start = time.monotonic()
    assert ial_ids("a39", alds) == ["req-test-charge-001"]
    assert time.monotonic() - start < 1


def test_keywords_inside_comments_are_hidden():
    assert not segments(["Note <!-- Servers MUST verify. -->"])[0][0].is_requirement
    assert not segments(["Note {::comment}Servers MUST verify.{:/comment}"])[0][0].is_requirement
    # An escaped opener renders literally, keyword included.
    assert segments(["Note BB<!-- MUST -->".replace("BB", chr(92))])[0][0].is_requirement
    lines = ["| f | g |", "|---|---|", "| a | <!-- Servers MUST verify. --> |", "| b | {::comment}MUST{:/comment} |"]
    assert table_keywords(lines) == []


def test_wide_ald_references_resolve_quickly():
    import time
    from lint_requirements import ial_ids
    alds = {"a": [" ".join(f"#req-test-charge-{n:03d}" for n in range(1, 201))], "b": [" ".join(["a"] * 200)]}
    start = time.monotonic()
    ids = ial_ids("b", alds)
    assert len(ids) == 200 and ids[-1] == "req-test-charge-200"
    assert time.monotonic() - start < 1


def test_comment_markers_inside_math_hide_nothing():
    # kramdown-rfc renders "Servers <!-- MUST verify -->." here: the markers are math.
    assert segments(["Servers $$<!--$$ MUST verify $$-->$$."])[0][0].is_requirement
    lines = ["| a | b |", "|---|---|", "| x | $$<!--$$ MUST $$-->$$ |"]
    assert table_keywords(lines) == [3]
