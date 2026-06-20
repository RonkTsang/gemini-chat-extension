#!/usr/bin/env python3
"""Validate Gemini Power Kit What's New config and image assets."""

from __future__ import annotations

import argparse
import json
import re
import struct
import sys
from pathlib import Path


EXPECTED_SIZE = (750, 180)
IMAGE_EXTENSIONS = {".webp", ".png", ".jpg", ".jpeg"}
KEBAB_CASE_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def read_png_size(data: bytes) -> tuple[int, int] | None:
    if not data.startswith(b"\x89PNG\r\n\x1a\n") or len(data) < 24:
        return None
    return struct.unpack(">II", data[16:24])


def read_jpeg_size(data: bytes) -> tuple[int, int] | None:
    if not data.startswith(b"\xff\xd8"):
        return None
    index = 2
    while index + 9 < len(data):
        if data[index] != 0xFF:
            index += 1
            continue
        marker = data[index + 1]
        index += 2
        if marker in {0xD8, 0xD9}:
            continue
        if index + 2 > len(data):
            return None
        length = struct.unpack(">H", data[index:index + 2])[0]
        if length < 2 or index + length > len(data):
            return None
        if 0xC0 <= marker <= 0xCF and marker not in {0xC4, 0xC8, 0xCC}:
            if length < 7:
                return None
            height, width = struct.unpack(">HH", data[index + 3:index + 7])
            return width, height
        index += length
    return None


def read_webp_size(data: bytes) -> tuple[int, int] | None:
    if len(data) < 30 or data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        return None
    chunk = data[12:16]
    if chunk == b"VP8X" and len(data) >= 30:
        width = 1 + int.from_bytes(data[24:27], "little")
        height = 1 + int.from_bytes(data[27:30], "little")
        return width, height
    if chunk == b"VP8 " and len(data) >= 30:
        start = data.find(b"\x9d\x01\x2a", 20)
        if start == -1 or start + 7 > len(data):
            return None
        width = struct.unpack("<H", data[start + 3:start + 5])[0] & 0x3FFF
        height = struct.unpack("<H", data[start + 5:start + 7])[0] & 0x3FFF
        return width, height
    if chunk == b"VP8L" and len(data) >= 25 and data[20] == 0x2F:
        bits = int.from_bytes(data[21:25], "little")
        width = (bits & 0x3FFF) + 1
        height = ((bits >> 14) & 0x3FFF) + 1
        return width, height
    return None


def read_image_size(path: Path) -> tuple[int, int] | None:
    data = path.read_bytes()
    return read_png_size(data) or read_jpeg_size(data) or read_webp_size(data)


def nested_has_key(data: object, dotted_key: str) -> bool:
    current = data
    for part in dotted_key.split("."):
        if not isinstance(current, dict) or part not in current:
            return False
        current = current[part]
    return True


def validate_assets(repo: Path, selected_assets: list[Path]) -> list[str]:
    errors: list[str] = []
    asset_dir = repo / "src/assets/whatsnew"
    assets = selected_assets or [
        path for path in asset_dir.iterdir()
        if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
    ]
    for path in assets:
        if not path.is_absolute():
            path = repo / path
        if not path.exists():
            errors.append(f"Missing asset: {path}")
            continue
        if not KEBAB_CASE_RE.match(path.stem):
            errors.append(f"Asset filename must be kebab-case: {path.name}")
        size = read_image_size(path)
        if size is None:
            errors.append(f"Could not read image dimensions: {path}")
            continue
        if size != EXPECTED_SIZE:
            errors.append(f"Invalid image size for {path.name}: {size[0]}x{size[1]} (expected 750x180)")
    return errors


def validate_config_and_locales(repo: Path) -> list[str]:
    errors: list[str] = []
    config_path = repo / "src/entrypoints/content/overlay/whats-new/config.ts"
    if not config_path.exists():
        return [f"Missing config: {config_path}"]
    config = config_path.read_text()
    release_note_body = re.search(r"CURRENT_RELEASE_NOTES:\s*ReleaseNote\[\]\s*=\s*\[(.*)\]\s*$", config, re.S)
    if release_note_body:
        item_count = len(re.findall(r"titleKey\s*:", release_note_body.group(1)))
        if item_count > 2:
            errors.append(f"CURRENT_RELEASE_NOTES has {item_count} items; expected at most 2")
    keys = sorted(set(re.findall(r"(?:titleKey|descriptionKey|actionLabelKey):\s*'([^']+)'", config)))
    locale_paths = sorted((repo / "src/locales").glob("*.json"))
    for locale_path in locale_paths:
        try:
            locale_data = json.loads(locale_path.read_text())
        except json.JSONDecodeError as error:
            errors.append(f"Invalid JSON in {locale_path}: {error}")
            continue
        for key in keys:
            if not nested_has_key(locale_data, key):
                errors.append(f"Missing {key} in {locale_path.name}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--asset", action="append", type=Path, default=[])
    args = parser.parse_args()

    repo = args.repo.resolve()
    errors = validate_assets(repo, args.asset)
    errors.extend(validate_config_and_locales(repo))
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print("What's New validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
