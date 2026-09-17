import base64
import hashlib
import hmac
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
VECTORS = ROOT / "test-vectors" / "core-hmac-sha256.json"


def b64url_json(value: object) -> str:
    data = json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode()
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def test_core_hmac_sha256_vectors() -> None:
    fixture = json.loads(VECTORS.read_text())
    secret = fixture["secret"].encode()

    for vector in fixture["vectors"]:
        challenge = vector["challenge"]
        request = b64url_json(challenge["request"])
        opaque = (
            b64url_json(challenge["opaque"])
            if challenge["opaque"] is not None
            else ""
        )
        parts = [
            challenge["realm"],
            challenge["method"],
            challenge["intent"],
            request,
            challenge["expires"] or "",
            challenge["digest"] or "",
        ]
        if challenge["header"] is not None:
            parts.append(challenge["header"])
        parts.append(opaque)
        hmac_input = "|".join(parts)
        challenge_id = base64.urlsafe_b64encode(
            hmac.new(secret, hmac_input.encode(), hashlib.sha256).digest()
        ).decode().rstrip("=")

        assert request == vector["requestB64url"], vector["name"]
        assert opaque == vector["opaqueB64url"], vector["name"]
        assert hmac_input == vector["hmacInput"], vector["name"]
        assert challenge_id == vector["id"], vector["name"]
