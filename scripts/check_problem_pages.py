"""Check mppx error coverage and optionally verify published problem pages.

The mppx reader deliberately supports only its current literal property syntax.
Unsupported declarations fail the check rather than silently skipping errors.
It reads SDK source as data; no SDK code or dependencies are executed.
"""

import argparse
import html
import re
import sys
from pathlib import Path
from urllib.request import urlopen

from problem_registry import load_registry


def read_mppx_errors(source):
    base = re.search(r"^export abstract class PaymentError extends Error \{(.*?)^\}", source, re.M | re.S)
    if not base:
        raise ValueError("Cannot find mppx PaymentError base class")
    default = re.search(r"^\s+readonly status: number = (\d+);?\s*$", base[1], re.M)
    if not default:
        raise ValueError("Cannot read mppx default HTTP status")
    classes = re.findall(r"^export class (\w+) extends (\w+) \{(.*?)^\}", source, re.M | re.S)
    if not classes or len(classes) != len(re.findall(r"^export class ", source, re.M)):
        raise ValueError("Cannot read all mppx error classes")
    errors = {}
    for name, parent, body in classes:
        if parent != "PaymentError":
            raise ValueError(f"Unsupported error inheritance: {name}")
        uri = re.search(r"^\s+(?:override )?readonly type = (['\"])(https://paymentauth\.org/problems/[^'\"]+)\1;?\s*$", body, re.M)
        if not uri:
            raise ValueError(f"Cannot read literal problem URI: {name}")
        status = re.search(r"^\s+(?:override )?readonly status(?:: number)? = (\d+);?\s*$", body, re.M)
        if not status and re.search(r"\bstatus\b\s*(?:[=:]|\()", body):
            raise ValueError(f"Cannot read HTTP status: {name}")
        if uri[2] in errors:
            raise ValueError(f"Duplicate SDK problem URI: {uri[2]}")
        errors[uri[2]] = int(status[1] if status else default[1])
    return errors


def check_coverage(registry, errors):
    registered = {registry["base_uri"] + p["slug"]: p for p in registry["problems"]}
    failures = []
    for uri, status in errors.items():
        if uri not in registered:
            failures.append(f"Missing problem page: {uri}")
        elif registered[uri]["http_status"] != status:
            failures.append(f"HTTP status mismatch: {uri} (registry {registered[uri]['http_status']}, SDK {status})")
    return failures


def check_published(registry, base_url):
    failures = []
    for problem in registry["problems"]:
        url = base_url.rstrip("/") + "/problems/" + problem["slug"]
        try:
            with urlopen(url, timeout=20) as response:
                body = response.read().decode("utf-8")
                if response.status != 200 or f"<h1>{html.escape(problem['title'])}</h1>" not in body or registry["base_uri"] + problem["slug"] not in body:
                    failures.append(f"Wrong problem page at {url}")
        except (OSError, UnicodeError) as error:
            failures.append(f"Cannot fetch {url}: {error}")
    return failures


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mppx-errors", type=Path, help="Path to mppx src/Errors.ts")
    parser.add_argument("--base-url", help="Site origin to check after generation/deployment")
    args = parser.parse_args()
    if not args.mppx_errors and not args.base_url:
        parser.error("Supply --mppx-errors and/or --base-url")
    registry = load_registry()
    failures = []
    if args.mppx_errors:
        errors = read_mppx_errors(args.mppx_errors.read_text())
        failures.extend(check_coverage(registry, errors))
        print(f"Checked {len(errors)} mppx error definitions")
    if args.base_url:
        failures.extend(check_published(registry, args.base_url))
        print(f"Checked {len(registry['problems'])} published problem pages")
    if failures:
        print("\n".join(failures), file=sys.stderr)
        return 1
    print("Problem page checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
