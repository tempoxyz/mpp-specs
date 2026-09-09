"""Tests for bump_and_rename.sh."""

import subprocess
from pathlib import Path

import pytest


@pytest.mark.parametrize(("current", "expected"), [("00", "01"), ("09", "10")])
def test_bump_updates_filename_and_frontmatter(tmp_path: Path, current: str, expected: str):
    root = tmp_path
    scripts = root / "scripts"
    core = root / "specs" / "core"
    scripts.mkdir()
    core.mkdir(parents=True)
    source_script = Path(__file__).with_name("bump_and_rename.sh")
    script = scripts / source_script.name
    script.write_bytes(source_script.read_bytes())

    current_file = core / f"draft-httpauth-payment-{current}.md"
    current_file.write_text(
        "---\n"
        f"docname: draft-httpauth-payment-{current}\n"
        f'version: "{current}"\n'
        "---\n",
        encoding="utf-8",
    )
    subprocess.run(["git", "init", "--quiet"], cwd=root, check=True)
    subprocess.run(["git", "add", "."], cwd=root, check=True)

    result = subprocess.run(
        ["bash", str(script)], cwd=root, check=True, capture_output=True, text=True
    )

    updated_file = core / f"draft-httpauth-payment-{expected}.md"
    assert result.stdout.strip() == expected
    assert not current_file.exists()
    assert updated_file.read_text(encoding="utf-8") == (
        "---\n"
        f"docname: draft-httpauth-payment-{expected}\n"
        f'version: "{expected}"\n'
        "---\n"
    )
