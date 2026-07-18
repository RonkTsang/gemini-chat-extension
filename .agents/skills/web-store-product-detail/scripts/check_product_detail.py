#!/usr/bin/env python3
"""Validate Web Store product-detail locale coverage and character limits."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate docs/web-store/product_detail against src/locales.",
    )
    parser.add_argument(
        "--repo",
        type=Path,
        required=True,
        help="Repository root containing src/locales and docs/web-store/product_detail.",
    )
    parser.add_argument(
        "--max-chars",
        type=int,
        default=3500,
        help="Maximum characters per product-detail file (default: 3500).",
    )
    return parser.parse_args()


def locale_stems(directory: Path, extension: str) -> set[str]:
    return {path.stem for path in directory.glob(f"*{extension}") if path.is_file()}


def main() -> int:
    args = parse_args()
    repo = args.repo.resolve()
    locale_dir = repo / "src" / "locales"
    detail_dir = repo / "docs" / "web-store" / "product_detail"

    if args.max_chars < 1:
        print("--max-chars must be positive.", file=sys.stderr)
        return 2
    if not locale_dir.is_dir() or not detail_dir.is_dir():
        print(
            "Expected src/locales and docs/web-store/product_detail under "
            f"{repo}.",
            file=sys.stderr,
        )
        return 2

    source_locales = locale_stems(locale_dir, ".json")
    detail_locales = locale_stems(detail_dir, ".txt")
    missing = sorted(source_locales - detail_locales)
    unexpected = sorted(detail_locales - source_locales)
    failures = False

    print("Product-detail character counts:")
    for locale in sorted(detail_locales):
        path = detail_dir / f"{locale}.txt"
        count = len(path.read_text(encoding="utf-8"))
        status = "OK" if count <= args.max_chars else "OVER LIMIT"
        print(f"  {locale}: {count}/{args.max_chars} {status}")
        failures = failures or count > args.max_chars

    if missing:
        print(f"Missing product-detail locales: {', '.join(missing)}", file=sys.stderr)
        failures = True
    if unexpected:
        print(f"Unexpected product-detail locales: {', '.join(unexpected)}", file=sys.stderr)
        failures = True

    if failures:
        return 1

    print("Locale parity: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
