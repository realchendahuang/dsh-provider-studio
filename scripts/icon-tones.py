#!/usr/bin/env python3
"""Classify raster logos so every brand mark stays legible on both themes.

The client cannot inspect pixels, so it needs a hint per raster logo:

  ''         the mark reads on its own — no plate, no ring
  'onLight'  the glyph is dark and transparent: paint the light plate behind it
  'onDark'   the glyph is light and transparent: paint the dark plate behind it
  'solid'    the logo fills its own square with a solid colour (an app-icon
             style mark): a plate would be hidden, so draw a hairline ring
             instead to separate it from a panel of the same lightness

Measurements come from `icons/*.webp`; `scripts/gen-icons.mjs` inlines the
result as `PROVIDER_ICON_TONES`.

Run: python3 scripts/icon-tones.py   (after adding or replacing raster logos)
"""

import json
import os
import statistics

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = os.path.join(ROOT, 'icons')
TONES = os.path.join(ICONS, 'tones.json')

ALPHA_FLOOR = 32
CORE_ALPHA = 250
MIN_CONTRAST = 2.5
CORNER_INSET = 3

PANEL = {'dark': (28, 28, 30), 'light': (255, 255, 255)}


def _linear(channel):
    value = channel / 255
    return value / 12.92 if value <= 0.03928 else ((value + 0.055) / 1.055) ** 2.4


def luminance(color):
    red, green, blue = color
    return 0.2126 * _linear(red) + 0.7152 * _linear(green) + 0.0722 * _linear(blue)


def contrast(first, second):
    a, b = luminance(first), luminance(second)
    high, low = max(a, b), min(a, b)
    return (high + 0.05) / (low + 0.05)


def measure_tone(path):
    """Return 'onLight', 'onDark', 'solid' or None for one raster icon."""
    image = Image.open(path).convert('RGBA')
    pixels = list(image.getdata())
    inset = CORNER_INSET
    visible = [(r, g, b) for r, g, b, a in pixels if a > ALPHA_FLOOR]
    if not visible:
        return None
    core = [(r, g, b) for r, g, b, a in pixels if a >= CORE_ALPHA] or visible
    # An app-icon style mark paints its own opaque square, corners included.
    # A dense glyph (say a filled letter) covers most pixels too, but leaving it
    # without a plate would hide it on the matching panel, so only a real tile
    # counts as solid.
    side = image.width
    corners = [
        image.getpixel((inset, inset))[3],
        image.getpixel((side - 1 - inset, inset))[3],
        image.getpixel((inset, side - 1 - inset))[3],
        image.getpixel((side - 1 - inset, side - 1 - inset))[3],
    ]
    if min(corners) > 200:
        return 'solid'
    dark_contrast = statistics.median(contrast(color, PANEL['dark']) for color in core)
    light_contrast = statistics.median(contrast(color, PANEL['light']) for color in core)
    if dark_contrast < MIN_CONTRAST <= light_contrast:
        return 'onLight'
    if light_contrast < MIN_CONTRAST <= dark_contrast:
        return 'onDark'
    return None


def write_tones(tones):
    with open(TONES, 'w', encoding='utf-8') as handle:
        json.dump(tones, handle, indent=2, sort_keys=True)
        handle.write('\n')


def main():
    tones = {}
    for name in sorted(os.listdir(ICONS)):
        if not name.endswith('.webp'):
            continue
        tone = measure_tone(os.path.join(ICONS, name))
        if tone is not None:
            tones[name[: -len('.webp')]] = tone
    write_tones(tones)
    counts = {}
    for tone in tones.values():
        counts[tone] = counts.get(tone, 0) + 1
    print(f'icons/tones.json: {len(tones)} tagged {counts}')


if __name__ == '__main__':
    main()
