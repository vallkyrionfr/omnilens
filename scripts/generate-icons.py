#!/usr/bin/env python3
"""
Generate sharp dark monochrome icons for OmniLens in 16x16, 48x48, and 128x128.
Aesthetic: Minimalist, geometric, precision aperture lens with bone-cream accents on deep obsidian.
"""
import os
from PIL import Image, ImageDraw

def create_monochrome_lens_icon(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    margin = max(1, size // 16)
    radius = size // 4

    # Obsidian background
    draw.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=radius,
        fill="#0c0c0d"
    )

    # 1px border outline for high-end definition
    draw.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=radius,
        outline="#27272a",
        width=max(1, size // 32)
    )

    # Center coordinates
    c = size / 2.0
    r_outer = size * 0.32
    r_inner = size * 0.16

    # Precision outer lens circle (bone-cream #f4f3ee)
    outer_width = max(1, size // 16)
    draw.ellipse(
        [c - r_outer, c - r_outer, c + r_outer, c + r_outer],
        outline="#f4f3ee",
        width=outer_width
    )

    # Inner aperture center point / disc
    draw.ellipse(
        [c - r_inner, c - r_inner, c + r_inner, c + r_inner],
        fill="#f4f3ee"
    )

    # Precision viewfinder corner tick marks for size >= 48
    if size >= 48:
        tick_len = size * 0.10
        tick_offset = size * 0.18
        # Horizontal & vertical tick crosshairs
        draw.line([c - tick_offset - tick_len, c, c - tick_offset, c], fill="#71717a", width=max(1, size // 32))
        draw.line([c + tick_offset, c, c + tick_offset + tick_len, c], fill="#71717a", width=max(1, size // 32))
        draw.line([c, c - tick_offset - tick_len, c, c - tick_offset], fill="#71717a", width=max(1, size // 32))
        draw.line([c, c + tick_offset, c, c + tick_offset + tick_len], fill="#71717a", width=max(1, size // 32))

    return img

def main():
    icons_dir = os.path.join(os.path.dirname(__file__), "..", "icons")
    os.makedirs(icons_dir, exist_ok=True)

    for size in [16, 48, 128]:
        icon = create_monochrome_lens_icon(size)
        out_path = os.path.join(icons_dir, f"icon-{size}.png")
        icon.save(out_path, format="PNG")
        print(f"Generated {out_path} ({size}x{size})")

if __name__ == "__main__":
    main()
