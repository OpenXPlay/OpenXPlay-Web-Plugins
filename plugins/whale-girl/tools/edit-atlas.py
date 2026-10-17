# SPDX-FileCopyrightText: 2026 OpenXPlay.org
# SPDX-License-Identifier: Apache-2.0 OR MIT
# Created by riko chen on 2026-10-16

"""Remove only blue components enclosed by the white apron; Pillow only.

Usage: python3 tools/edit-atlas.txt SOURCE.webp --contact /absolute/edited-contact.png
The input SHA is pinned to make the cell geometry and detection reproducible.
"""
import argparse
import hashlib
from pathlib import Path
from PIL import Image, ImageDraw

COUNTS = [6, 8, 8, 4, 5, 8, 6, 6, 6, 8, 8]
SOURCE_SHA = 'bfbe0b94d987b6ed5c7a2f2c8ad934fcf4f42fc0ff06c72138abf0a705ed1778'


def white(pixel):
    r, g, b, a = pixel
    return a > 240 and min(r, g, b) > 170 and max(r, g, b) - min(r, g, b) < 55


def emblem_mask(cell):
    """Find blue ink bounded left/right/top/bottom by white, never hair or tail."""
    p = cell.load()
    candidates = set()
    for y in range(123, 164):
        for x in range(48, 140):
            r, g, b, a = p[x, y]
            if a < 240 or b < r + 22 or g < r + 6:
                continue
            # The emblem is a hole in the apron, unlike exterior hair and fins.
            if all(any(white(p[x + dx * d, y + dy * d]) for d in range(1, 23)
                       if 0 <= x + dx * d < 192 and 0 <= y + dy * d < 208)
                   for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1)]):
                candidates.add((x, y))
    components = []
    while candidates:
        component = {candidates.pop()}
        pending = list(component)
        while pending:
            x, y = pending.pop()
            for point in [(x-1,y),(x+1,y),(x,y-1),(x,y+1)]:
                if point in candidates:
                    candidates.remove(point)
                    component.add(point)
                    pending.append(point)
        # Apron emblem is below the bodice and above the skirt hem.
        if 135 <= sum(y for x, y in component) / len(component) <= 153:
            components.append(component)
    candidates = max(components, key=len)
    if not 10 <= len(candidates) <= 300:
        raise ValueError(f'Unexpected emblem area: {len(candidates)}')
    # Include antialiasing fringe, staying strictly inside the white apron.
    mask = set(candidates)
    for x, y in candidates:
        for dx in range(-1, 2):
            for dy in range(-1, 2):
                mask.add((x + dx, y + dy))
    return mask


def clean(cell):
    mask = emblem_mask(cell)
    src = cell.copy().load()
    dst = cell.load()
    for x, y in mask:
        # Interpolate apron shading from the nearest clean white to either side.
        samples = []
        for direction in [-1, 1]:
            for distance in range(1, 30):
                xx = x + direction * distance
                if not 0 <= xx < 192:
                    break
                if (xx, y) not in mask and white(src[xx, y]):
                    samples.append((distance, src[xx, y]))
                    break
        if not samples:
            raise ValueError('No clean apron shading found')
        weights = [1 / distance for distance, _ in samples]
        dst[x, y] = tuple(round(sum(color[c] * w for (_, color), w in zip(samples, weights)) / sum(weights))
                          for c in range(3)) + (src[x, y][3],)
    return cell, len(mask)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--contact', type=Path, required=True)
    args = parser.parse_args()
    if hashlib.sha256(args.source.read_bytes()).hexdigest() != SOURCE_SHA:
        raise ValueError('Source atlas does not match the reviewed source')
    original = Image.open(args.source).convert('RGBA')
    assert original.size == (1536, 2288)
    result = original.copy()
    sheet = Image.new('RGB', (8 * 192, 11 * 232), '#dce8ee')
    pen = ImageDraw.Draw(sheet)
    areas = []
    for row, count in enumerate(COUNTS):
        for col in range(count):
            box = (col * 192, row * 208, (col + 1) * 192, (row + 1) * 208)
            cell, area = clean(original.crop(box))
            result.paste(cell, box[:2])
            sheet.paste(cell, (col * 192, row * 232 + 24), cell)
            pen.text((col * 192 + 8, row * 232 + 6), f'{row}:{col} / {area}px', fill='#234560')
            areas.append(area)
    output = Path(__file__).resolve().parents[1] / 'assets/whale-girl-atlas.webp'
    result.save(output, 'WEBP', lossless=True, method=6, exact=True)
    sheet.save(args.contact)
    print(f'Edited {len(areas)} cells; masks {min(areas)}..{max(areas)} pixels; {output.stat().st_size} bytes')


if __name__ == '__main__':
    main()
