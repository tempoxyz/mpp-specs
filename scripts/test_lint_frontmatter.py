#!/usr/bin/env python3
"""Tests for lint_frontmatter.py"""

import tempfile
from pathlib import Path

import pytest

from lint_frontmatter import lint_file, REQUIRED_FIELDS


def write_spec(tmp_path: Path, content: str) -> Path:
    """Write a spec file and return its path."""
    spec_dir = tmp_path / "specs"
    spec_dir.mkdir()
    spec_file = spec_dir / "test-spec.md"
    spec_file.write_text(content)
    return spec_file


class TestRequiredFields:
    def test_all_required_fields_present(self, tmp_path):
        content = """---
title: Test Spec
abbrev: Test
docname: draft-test-00
version: "00"
category: info
ipr: noModificationTrust200902
submissiontype: IETF
consensus: true
author:
  - name: Test Author
    ins: T. Author
    email: test@example.com
    org: Test Org
---
"""
        spec = write_spec(tmp_path, content)
        errors = lint_file(spec)
        assert errors == []

    def test_missing_required_field(self, tmp_path):
        content = """---
title: Test Spec
abbrev: Test
docname: draft-test-00
version: "00"
category: info
ipr: noModificationTrust200902
submissiontype: IETF
consensus: true
---
"""
        spec = write_spec(tmp_path, content)
        errors = lint_file(spec)
        assert any("missing required field 'author'" in e for e in errors)


class TestVersionFormat:
    def test_version_string_00(self, tmp_path):
        content = """---
title: Test Spec
abbrev: Test
docname: draft-test-00
version: "00"
category: info
ipr: noModificationTrust200902
submissiontype: IETF
consensus: true
author:
  - name: Test Author
    ins: T. Author
    email: test@example.com
    org: Test Org
---
"""
        spec = write_spec(tmp_path, content)
        errors = lint_file(spec)
        assert not any("version" in e for e in errors)

    def test_version_int_0(self, tmp_path):
        content = """---
title: Test Spec
abbrev: Test
docname: draft-test-00
version: 0
category: info
ipr: noModificationTrust200902
submissiontype: IETF
consensus: true
author:
  - name: Test Author
    ins: T. Author
    email: test@example.com
    org: Test Org
---
"""
        spec = write_spec(tmp_path, content)
        errors = lint_file(spec)
        assert not any("version" in e for e in errors)

    def test_version_invalid(self, tmp_path):
        content = """---
title: Test Spec
abbrev: Test
docname: draft-test-00
version: 1
category: info
ipr: noModificationTrust200902
submissiontype: IETF
consensus: true
author:
  - name: Test Author
    ins: T. Author
    email: test@example.com
    org: Test Org
---
"""
        spec = write_spec(tmp_path, content)
        errors = lint_file(spec)
        assert any("version should be" in e for e in errors)


class TestTitleCapitalization:
    def test_title_capitalized(self, tmp_path):
        content = """---
title: Proper Title Case
abbrev: Test
docname: draft-test-00
version: "00"
category: info
ipr: noModificationTrust200902
submissiontype: IETF
consensus: true
author:
  - name: Test Author
    ins: T. Author
    email: test@example.com
    org: Test Org
---
"""
        spec = write_spec(tmp_path, content)
        errors = lint_file(spec)
        assert not any("capital letter" in e for e in errors)

    def test_title_lowercase_start(self, tmp_path):
        content = """---
title: lowercase start is wrong
abbrev: Test
docname: draft-test-00
version: "00"
category: info
ipr: noModificationTrust200902
submissiontype: IETF
consensus: true
author:
  - name: Test Author
    ins: T. Author
    email: test@example.com
    org: Test Org
---
"""
        spec = write_spec(tmp_path, content)
        errors = lint_file(spec)
        assert any("capital letter" in e for e in errors)


class TestAuthorFieldOrder:
    def test_correct_order(self, tmp_path):
        content = """---
title: Test Spec
abbrev: Test
docname: draft-test-00
version: "00"
category: info
ipr: noModificationTrust200902
submissiontype: IETF
consensus: true
author:
  - name: Test Author
    ins: T. Author
    email: test@example.com
    org: Test Org
---
"""
        spec = write_spec(tmp_path, content)
        errors = lint_file(spec)
        assert not any("field order" in e for e in errors)

    def test_wrong_order(self, tmp_path):
        content = """---
title: Test Spec
abbrev: Test
docname: draft-test-00
version: "00"
category: info
ipr: noModificationTrust200902
submissiontype: IETF
consensus: true
author:
  - ins: T. Author
    name: Test Author
    email: test@example.com
    org: Test Org
---
"""
        spec = write_spec(tmp_path, content)
        errors = lint_file(spec)
        assert any("field order" in e for e in errors)


class TestIPR:
    def test_correct_ipr(self, tmp_path):
        content = """---
title: Test Spec
abbrev: Test
docname: draft-test-00
version: "00"
category: info
ipr: noModificationTrust200902
submissiontype: IETF
consensus: true
author:
  - name: Test Author
    ins: T. Author
    email: test@example.com
    org: Test Org
---
"""
        spec = write_spec(tmp_path, content)
        errors = lint_file(spec)
        assert not any("ipr" in e for e in errors)

    def test_wrong_ipr(self, tmp_path):
        content = """---
title: Test Spec
abbrev: Test
docname: draft-test-00
version: "00"
category: info
ipr: trust200902
submissiontype: IETF
consensus: true
author:
  - name: Test Author
    ins: T. Author
    email: test@example.com
    org: Test Org
---
"""
        spec = write_spec(tmp_path, content)
        errors = lint_file(spec)
        assert any("ipr should be 'noModificationTrust200902'" in e for e in errors)


class TestConsensusSubmissiontype:
    def test_independent_with_consensus_false(self, tmp_path):
        content = """---
title: Test Spec
abbrev: Test
docname: draft-test-00
version: "00"
category: info
ipr: noModificationTrust200902
submissiontype: independent
consensus: false
author:
  - name: Test Author
    ins: T. Author
    email: test@example.com
    org: Test Org
---
"""
        spec = write_spec(tmp_path, content)
        errors = lint_file(spec)
        assert not any("consensus" in e for e in errors)

    def test_independent_with_consensus_true(self, tmp_path):
        content = """---
title: Test Spec
abbrev: Test
docname: draft-test-00
version: "00"
category: info
ipr: noModificationTrust200902
submissiontype: independent
consensus: true
author:
  - name: Test Author
    ins: T. Author
    email: test@example.com
    org: Test Org
---
"""
        spec = write_spec(tmp_path, content)
        errors = lint_file(spec)
        assert any("consensus must be false for independent" in e for e in errors)


class TestAuthorOrganization:
    def test_org_is_correct(self, tmp_path):
        content = """---
title: Test Spec
abbrev: Test
docname: draft-test-00
version: "00"
category: info
ipr: noModificationTrust200902
submissiontype: IETF
consensus: true
author:
  - name: Test Author
    ins: T. Author
    email: test@example.com
    org: Test Org
---
"""
        spec = write_spec(tmp_path, content)
        errors = lint_file(spec)
        assert not any("organization" in e for e in errors)

    def test_organization_flagged(self, tmp_path):
        content = """---
title: Test Spec
abbrev: Test
docname: draft-test-00
version: "00"
category: info
ipr: noModificationTrust200902
submissiontype: IETF
consensus: true
author:
  - name: Test Author
    ins: T. Author
    email: test@example.com
    organization: Test Org
---
"""
        spec = write_spec(tmp_path, content)
        errors = lint_file(spec)
        assert any("'organization' instead of 'org'" in e for e in errors)


class TestIDReference:
    def test_valid_id_reference(self, tmp_path):
        content = """---
title: Test Spec
abbrev: Test
docname: draft-test-00
version: "00"
category: info
ipr: noModificationTrust200902
submissiontype: IETF
consensus: true
author:
  - name: Test Author
    ins: T. Author
    email: test@example.com
    org: Test Org
normative:
  I-D.httpauth-payment:
    title: "The 'Payment' HTTP Authentication Scheme"
    target: https://datatracker.ietf.org/doc/draft-ryan-httpauth-payment/
    author:
      - name: Jake Moxey
    date: 2026-01
---
"""
        spec = write_spec(tmp_path, content)
        errors = lint_file(spec)
        assert not any("I-D.httpauth-payment" in e for e in errors)

    def test_missing_target(self, tmp_path):
        content = """---
title: Test Spec
abbrev: Test
docname: draft-test-00
version: "00"
category: info
ipr: noModificationTrust200902
submissiontype: IETF
consensus: true
author:
  - name: Test Author
    ins: T. Author
    email: test@example.com
    org: Test Org
normative:
  I-D.httpauth-payment:
    title: "The 'Payment' HTTP Authentication Scheme"
    author:
      - name: Jake Moxey
    date: 2026-01
---
"""
        spec = write_spec(tmp_path, content)
        errors = lint_file(spec)
        assert any("missing 'target'" in e for e in errors)

    def test_wrong_author_format(self, tmp_path):
        content = """---
title: Test Spec
abbrev: Test
docname: draft-test-00
version: "00"
category: info
ipr: noModificationTrust200902
submissiontype: IETF
consensus: true
author:
  - name: Test Author
    ins: T. Author
    email: test@example.com
    org: Test Org
normative:
  I-D.httpauth-payment:
    title: "The 'Payment' HTTP Authentication Scheme"
    target: https://datatracker.ietf.org/doc/draft-ryan-httpauth-payment/
    author:
      - ins: J. Moxey
    date: 2026-01
---
"""
        spec = write_spec(tmp_path, content)
        errors = lint_file(spec)
        assert any("should use 'name'" in e for e in errors)

    def test_wrong_target_url(self, tmp_path):
        content = """---
title: Test Spec
abbrev: Test
docname: draft-test-00
version: "00"
category: info
ipr: noModificationTrust200902
submissiontype: IETF
consensus: true
author:
  - name: Test Author
    ins: T. Author
    email: test@example.com
    org: Test Org
normative:
  I-D.httpauth-payment:
    title: "The 'Payment' HTTP Authentication Scheme"
    target: https://datatracker.ietf.org/doc/draft-ietf-httpauth-payment/
    author:
      - name: Jake Moxey
    date: 2026-01
---
"""
        spec = write_spec(tmp_path, content)
        errors = lint_file(spec)
        assert any("target should be" in e for e in errors)
