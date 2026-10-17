// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import {describe, it, expect} from 'vitest';
import descriptor from '../pet-atlas.json';
import {codexV1, validateAtlas, frameRect, resolveState} from '../atlas.js';

describe('atlas contract', () => {
  it('ships the 1536 by 1872 Codex v1 preset without sharing mutable defaults', () => {
    const atlas = validateAtlas(descriptor);
    expect(atlas).toEqual(codexV1());
    expect(atlas.columns * atlas.cellWidth).toBe(1536);
    expect(atlas.rows.length * atlas.cellHeight).toBe(1872);
    expect(frameRect(atlas, 'review', 7)).toEqual({x: 1344, y: 1664, width: 192, height: 208});
    atlas.rows[0].fps = 1;
    expect(codexV1().rows[0].fps).toBe(8);
  });
  it('supports eleven variable-length rows and optional-state fallback', () => {
    const input = codexV1(); delete input.columns;
    input.rows.push({state: 'sleeping', frames: 2, fps: 1, loop: true}, {state: 'happy', frames: 3, fps: 6, loop: false});
    const atlas = validateAtlas(input);
    expect(atlas.rows).toHaveLength(11);
    expect(frameRect(atlas, 'happy', 2).y).toBe(2080);
    expect(resolveState(atlas, 'absent', 'sleeping')).toBe('sleeping');
    expect(frameRect(atlas, 'absent')).toEqual(frameRect(atlas, 'idle'));
    expect(() => frameRect(atlas, 'happy', 3)).toThrow();
  });
  it.each([
    atlas => { atlas.rows[0].fps = 31; },
    atlas => { atlas.rows[0].fps = 0; },
    atlas => { atlas.rows[0].frames = 9; },
    atlas => { atlas.rows[0].frames = 1.5; },
    atlas => { atlas.rows[0].loop = 'true'; },
    atlas => { atlas.rows[1].state = 'idle'; },
    atlas => { atlas.rows[0].state = 'absent'; },
    atlas => { atlas.cellWidth = 0; },
    atlas => { atlas.image = ''; }
  ])('rejects malformed layout %#', mutate => {
    const atlas = codexV1(); mutate(atlas);
    expect(() => validateAtlas(atlas)).toThrow();
  });
});
