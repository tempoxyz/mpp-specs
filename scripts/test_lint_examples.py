"""Tests for lint_examples.py."""

import base64
import json

from lint_examples import lint_text


def encode(obj: object) -> str:
    raw = json.dumps(obj, sort_keys=True, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


REQUEST = {"amount": "1000", "currency": "usd"}


def challenge(request: str) -> str:
    return f'~~~http\nWWW-Authenticate: Payment id="abc",\n    request="{request}"\n~~~\n'


def decoded(obj: object, label: str = "Decoded `request`:") -> str:
    return f"\n{label}\n\n~~~json\n{json.dumps(obj, indent=2)}\n~~~\n"


def test_matching_request_passes():
    assert lint_text(challenge(encode(REQUEST)) + decoded(REQUEST), "x.md") == []


def test_mismatched_request_fails():
    text = challenge(encode({"amount": "1000", "currency": "USD"})) + decoded(REQUEST)
    errors = lint_text(text, "x.md")
    assert len(errors) == 1
    assert errors[0].startswith("x.md:3: request decodes to")


def test_wrapped_value_is_joined():
    value = encode(REQUEST)
    wrapped = value[:20] + "\n      " + value[20:]
    assert lint_text(challenge(wrapped) + decoded(REQUEST), "x.md") == []


def test_wrapped_header_value_is_joined():
    credential = {"challenge": {"id": "abc"}, "payload": {"hash": "0x1"}}
    value = encode(credential)
    text = (
        f"~~~http\nAuthorization: Payment {value[:16]}\n  {value[16:]}\n~~~\n"
        + decoded(credential, "Decoded credential:")
    )
    assert lint_text(text, "x.md") == []


def test_truncated_and_placeholder_values_are_skipped():
    text = challenge("eyJhbW91bnQiOiIx...") + "~~~http\nPayment-Receipt: BASE64URL_JCS_RECEIPT\n~~~\n"
    assert lint_text(text + decoded(REQUEST), "x.md") == []


def test_value_that_is_not_json_fails():
    errors = lint_text(challenge("bm90IGpzb24"), "x.md")
    assert errors == ["x.md:3: request: does not decode to JSON: Expecting value: line 1 column 1 (char 0)"]


def test_ellipsis_and_angle_brackets_in_shown_json_match_any_text():
    actual = {"hash": "0xabcdef0123", "blob": "eyJhbGciOi"}
    shown = {"hash": "0xabc...0123", "blob": "<JWE compact>"}
    assert lint_text(challenge(encode(actual)) + decoded(shown), "x.md") == []


def test_json_without_decoded_prose_is_not_compared():
    text = challenge(encode({"amount": "1"})) + "\nThe response body:\n\n~~~json\n{}\n~~~\n"
    assert lint_text(text, "x.md") == []


def test_characters_outside_base64url_fail():
    errors = lint_text(challenge("eyJ@@@"), "x.md")
    assert errors == ["x.md:3: request: not base64url: invalid characters '@'"]


def test_padded_value_fails():
    padded = encode({"a": "1"}) + "=="
    assert lint_text(challenge(padded), "x.md") == ["x.md:3: request: base64url must not be padded"]


def test_bad_header_value_fails():
    text = "~~~http\nAuthorization: Payment @@@\n~~~\n"
    assert lint_text(text, "x.md") == ["x.md:2: credential: not base64url: invalid characters '@'"]


def test_request_must_be_jcs():
    raw = json.dumps({"currency": "usd", "amount": "1"}, separators=(",", ":")).encode()
    value = base64.urlsafe_b64encode(raw).rstrip(b"=").decode()
    errors = lint_text(challenge(value), "x.md")
    assert errors == ['x.md:3: request: not JCS-serialized; expected {"amount":"1","currency":"usd"}']


def test_each_value_gets_its_own_decoded_block():
    credential = {"challenge": {"id": "abc"}, "payload": {"hash": "0x1"}}
    receipt = {"status": "success"}
    text = (
        f"~~~http\nAuthorization: Payment {encode(credential)}\n\n"
        f"HTTP/1.1 200 OK\nPayment-Receipt: {encode(receipt)}\n~~~\n"
        + decoded(receipt, "Decoded receipt:")
        + decoded({**credential, "source": "did:key:z6Mk"}, "Decoded credential:")
    )
    errors = lint_text(text, "x.md")
    assert len(errors) == 1
    assert errors[0].startswith("x.md:2: credential decodes to")


def test_values_are_forgotten_after_a_heading():
    text = challenge(encode(REQUEST)) + "\n## Next example\n" + decoded({"amount": "2"})
    assert lint_text(text, "x.md") == []
