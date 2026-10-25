"""JSON examples in specs must parse, unless they use a placeholder on purpose."""

from lint_json_examples import invalid_examples, json_blocks


def lines_of(content: str) -> list[int]:
    return [example.line for example in invalid_examples(content)]


class TestBlocks:
    def test_tilde_and_backtick_fences(self):
        content = '~~~json\n{"a": 1}\n~~~\n\n```json\n{"b": 2}\n```\n'
        assert [block for _, block in json_blocks(content)] == ['{"a": 1}', '{"b": 2}']

    def test_indented_block_in_a_list(self):
        content = '1. Send:\n\n   ~~~ json\n   {"a": 1}\n   ~~~\n'
        assert json_blocks(content) == [(4, '{"a": 1}')]

    def test_other_languages_are_ignored(self):
        assert json_blocks('~~~http\nHTTP/1.1 402\n~~~\n') == []


class TestInvalid:
    def test_valid_json_passes(self):
        assert lines_of('~~~json\n{\n  "a": "0xabc..."\n}\n~~~\n') == []

    def test_adjacent_string_literals_fail(self):
        content = '~~~json\n{\n  "channelId":\n    "0x6d0f"\n    "1f6a"\n}\n~~~\n'
        assert lines_of(content) == [5]

    def test_newline_inside_a_string_fails(self):
        content = '~~~json\n{\n  "description": "Price varies by model\n    and token count."\n}\n~~~\n'
        assert lines_of(content) == [3]


    def test_non_json_constants_fail(self):
        assert lines_of('~~~json\n{\n  "a": NaN\n}\n~~~\n') != []
        assert lines_of('~~~json\n{\n  "a": -Infinity\n}\n~~~\n') != []

    def test_wrapped_string_with_an_ellipsis_still_fails(self):
        # The wrapped text is inside a string, so it is not a placeholder.
        content = '~~~json\n{\n  "detail": "See <https://example.com/...>\n    for more."\n}\n~~~\n'
        assert lines_of(content) == [3]


class TestIllustrative:
    def test_elided_object_is_skipped(self):
        assert lines_of('~~~json\n{\n  "_meta": { ... }\n}\n~~~\n') == []

    def test_angle_bracket_placeholder_is_skipped(self):
        assert lines_of('~~~json\n{\n  "chainId": <challenge chainId>\n}\n~~~\n') == []

    def test_ellipsis_inside_a_string_is_not_a_placeholder(self):
        content = '~~~json\n{\n  "a": "0xabc..."\n  "b": 1\n}\n~~~\n'
        assert lines_of(content) == [4]


class TestRepositorySpecs:
    def test_every_spec_example_parses(self):
        from lint_json_examples import SPECS_DIR

        failures = [
            (path.name, example.line)
            for path in sorted(SPECS_DIR.rglob("*.md"))
            for example in invalid_examples(path.read_text(encoding="utf-8"))
        ]
        assert failures == []
