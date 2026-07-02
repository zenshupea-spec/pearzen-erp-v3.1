#!/usr/bin/env python3
"""Export per-item PNGs from SHAVEEN (12).pdf for tasha.lk menu upload."""

from __future__ import annotations

import json
import re
import sys
from io import BytesIO
from pathlib import Path

import fitz

try:
    from PIL import Image
except ImportError:
    print("Pillow required: pip install Pillow", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PDF = Path.home() / "Downloads" / "SHAVEEN (12).pdf"
OUT_DIR = ROOT / "audit-evidence" / "cvs" / "tasha-menu-images"

# (page_0based, xref, column_count, [slug, ...])
STRIP_ROWS: list[tuple[int, int, int, list[str]]] = [
    (
        0,
        16,
        5,
        [
            "beef-patty-bagel",
            "chicken-patty-bagel",
            "veggie-patty-bagel",
            "roast-beef-baguette",
            "tandoori-chicken-baguette",
        ],
    ),
    (0, 22, 2, ["egg-baguette", "tuna-baguette"]),
    (
        0,
        25,
        5,
        [
            "crinkle-fries",
            "fish-and-chips",
            "crispy-chicken-and-fries",
            "veggie-patty-waffle",
            "chicken-patty-waffle",
        ],
    ),
    (
        0,
        14,
        4,
        [
            "beef-patty-waffle",
            "strawberry-and-cream-waffle",
            "nutella-strawberry-and-cream-waffle",
            "caramel-and-cream-waffle",
        ],
    ),
    (
        1,
        46,
        5,
        [
            "watermelon-pineapple-coconut-smoothie",
            "peanut-butter-dates-smoothie",
            "spinach-cucumber-coconut-smoothie",
            "mango-matcha-caramel-smoothie",
            "espresso-banana-caramel-smoothie",
        ],
    ),
    (
        1,
        47,
        5,
        ["americano", "cappuccino", "cafe-latte", "flat-white", "cafe-mocha"],
    ),
    (
        1,
        48,
        5,
        ["espresso", "dopio", "hot-chocolate", "matcha-latte", "matcha-hot-chocolate"],
    ),
    (1, 49, 3, ["milk-tea", "black-tea", "hot-milo"]),
    (
        2,
        57,
        5,
        [
            "nutella-shake",
            "lotus-biscoff-shake",
            "choc-cookie-shake",
            "carrot-cake-shake",
            "brownie-shake",
        ],
    ),
    (
        2,
        59,
        5,
        [
            "strawberry-latte-and-cream",
            "blueberry-latte-and-cream",
            "caramel-latte-and-cream",
            "hazelnut-latte-and-cream",
            "vanilla-latte-and-cream",
        ],
    ),
    (
        2,
        60,
        5,
        [
            "shaken-americano",
            "iced-cappuccino",
            "iced-latte",
            "affogato",
            "iced-mocha-and-cream",
        ],
    ),
    (
        2,
        61,
        5,
        [
            "iced-milo-and-cream",
            "iced-matcha-latte-and-cream",
            "iced-matcha-chocolate-and-cream",
            "iced-matcha-strawberry-and-cream",
            "iced-matcha-blueberry-and-cream",
        ],
    ),
    (2, 62, 3, ["ice-tea-lemon", "ice-tea-peach", "ice-tea-strawberry"]),
]


def slugify(name: str) -> str:
    s = name.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def extract_xref_image(doc: fitz.Document, xref: int) -> Image.Image:
    base = doc.extract_image(xref)
    return Image.open(BytesIO(base["image"])).convert("RGB")


def split_strip(img: Image.Image, columns: int) -> list[Image.Image]:
    w, h = img.size
    cell_w = w // columns
    cells: list[Image.Image] = []
    for i in range(columns):
        left = i * cell_w
        right = w if i == columns - 1 else (i + 1) * cell_w
        cells.append(img.crop((left, 0, right, h)))
    return cells


def main() -> int:
    pdf_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PDF
    if not pdf_path.is_file():
        print(f"PDF not found: {pdf_path}", file=sys.stderr)
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    refs_dir = OUT_DIR / "_reference-pages"
    refs_dir.mkdir(exist_ok=True)

    doc = fitz.open(pdf_path)
    manifest: dict[str, object] = {
        "sourcePdf": str(pdf_path),
        "outputDir": str(OUT_DIR),
        "items": [],
        "referencePages": [],
    }

    for pno in range(doc.page_count):
        page = doc[pno]
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        ref_name = f"page-{pno + 1}.png"
        pix.save(refs_dir / ref_name)
        manifest["referencePages"].append(ref_name)

    exported = 0
    for page_idx, xref, cols, slugs in STRIP_ROWS:
        if len(slugs) != cols:
            print(f"Skip xref {xref}: slug count {len(slugs)} != cols {cols}", file=sys.stderr)
            continue
        img = extract_xref_image(doc, xref)
        cells = split_strip(img, cols)
        for slug, cell in zip(slugs, cells):
            out_path = OUT_DIR / f"{slug}.png"
            cell.save(out_path, format="PNG", optimize=True)
            manifest["items"].append(
                {
                    "slug": slug,
                    "file": out_path.name,
                    "sourcePage": page_idx + 1,
                    "xref": xref,
                    "width": cell.width,
                    "height": cell.height,
                }
            )
            exported += 1
            print(f"  {out_path.name} ({cell.width}x{cell.height})")

    manifest_path = OUT_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"\nExported {exported} item PNGs -> {OUT_DIR}")
    print(f"Reference pages -> {refs_dir}")
    print(f"Manifest -> {manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
