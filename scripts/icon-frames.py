#!/usr/bin/env python3
"""Measure how much empty canvas each raster logo carries.

Favicons arrive with wildly different amounts of transparent padding: measured
against the 48×48 canvas, the visible mark ranges from 46% to 100% of the box.
The panel draws them at 22px, so the smallest ones end up as specks.

Instead of upscaling every asset (which re-inflates the bundle), this records the
visible bounding box and writes `icons/frames.json`. The client then scales that
one image up with a CSS transform so every mark lands at the same optical size,
and unchanged assets stay byte-identical.

`scripts/gen-icons.mjs` inlines the result as `PROVIDER_ICON_FRAMES`.

Run: python3 scripts/icon-frames.py   (after adding or replacing raster logos)
"""

import json
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = os.path.join(ROOT, 'icons')
FRAMES = os.path.join(ICONS, 'frames.json')

CANVAS = 48
CONTENT = 44
ALPHA_FLOOR = 8
NO_ZOOM_ABOVE = 0.86


def measure_frame(path):
    image = Image.open(path).convert('RGBA')
    alpha = image.getchannel('A').point(lambda value: 255 if value > ALPHA_FLOOR else 0)
    box = alpha.getbbox()
    if box is None:
        return None
    width, height = box[2] - box[0], box[3] - box[1]
    ratio = max(width, height) / CANVAS
    if ratio >= NO_ZOOM_ABOVE:
        return None
    scale = CONTENT / (ratio * CANVAS)
    # Offset between the mark centre and the canvas centre, in canvas units.
    centre_x = (box[0] + box[2]) / 2
    centre_y = (box[1] + box[3]) / 2
    shift_x = -(centre_x - CANVAS / 2) / CANVAS * 100
    shift_y = -(centre_y - CANVAS / 2) / CANVAS * 100
    return {
        'scale': round(scale, 3),
        'x': round(shift_x, 2),
        'y': round(shift_y, 2),
    }


def main():
    frames = {}
    for name in sorted(os.listdir(ICONS)):
        if not name.endswith('.webp'):
            continue
        frame = measure_frame(os.path.join(ICONS, name))
        if frame is not None:
            frames[name[: -len('.webp')]] = frame
    with open(FRAMES, 'w', encoding='utf-8') as handle:
        json.dump(frames, handle, indent=2, sort_keys=True)
        handle.write('\n')
    print(f'icons/frames.json: {len(frames)} framed')


if __name__ == '__main__':
    main()
