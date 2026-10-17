// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import {describe, it, expect, vi} from 'vitest';
import {compilePixels, createCanvas} from '../pixels.js';

const source = () => ({palette: {a: '#ff8800'}, rows: [
  {state: 'idle', fps: 2, loop: true, frames: [['a.', '.a'], ['aa', '..']]},
  {state: 'sleeping', fps: 1, loop: true, frames: [['..', 'aa']]}
]});
function factory(width, height) {
  const calls = [];
  const context = {clearRect: vi.fn(), fillRect(...rect) { calls.push([this.fillStyle, ...rect]); }};
  return {width, height, calls, context, getContext: () => context};
}

describe('pixel compiler', () => {
  it('paints correct cells, transparent gaps and integer-upscaled pixels', () => {
    const {canvas, descriptor} = compilePixels(source(), {scale: 3, canvasFactory: factory});
    expect([canvas.width, canvas.height]).toEqual([12, 12]);
    expect(descriptor.cellWidth).toBe(6);
    expect(canvas.context.imageSmoothingEnabled).toBe(false);
    expect(canvas.calls).toEqual([
      ['#ff8800', 0, 0, 3, 3], ['#ff8800', 3, 3, 3, 3],
      ['#ff8800', 6, 0, 3, 3], ['#ff8800', 9, 0, 3, 3],
      ['#ff8800', 0, 9, 3, 3], ['#ff8800', 3, 9, 3, 3]
    ]);
  });
  it('repeats single-frame breed overlays and swaps palettes without mutating input', () => {
    const input = source();
    const overlays = [{palette: {b: '#000'}, rows: [{state: 'idle', frames: [['.b', '..']]}]}];
    const {canvas} = compilePixels(input, {palette: {a: '#fff', b: '#777', '.': '#f00'}, overlays, canvasFactory: factory});
    expect(canvas.calls.filter(call => call[0] === '#777')).toEqual([
      ['#777', 1, 0, 1, 1], ['#777', 3, 0, 1, 1]
    ]);
    expect(canvas.calls.some(call => call[0] === '#f00')).toBe(false);
    expect(canvas.calls[0][0]).toBe('#fff');
    expect(input.palette.a).toBe('#ff8800');
  });
  it('rejects unequal dimensions, missing colors, mismatched overlays and fractional scales', () => {
    const input = source(); input.rows[0].frames[1] = ['a', 'aa'];
    expect(() => compilePixels(input, {canvasFactory: factory})).toThrow(/equal dimensions/);
    input.rows[0].frames[1] = ['az', 'aa'];
    expect(() => compilePixels(input, {canvasFactory: factory})).toThrow(/missing palette/);
    expect(() => compilePixels(source(), {scale: 1.5})).toThrow(/scale/);
    expect(() => compilePixels(source(), {overlays: [{rows: [{state: 'idle', frames: []}]}]})).toThrow(/count/);
    expect(() => compilePixels(source(), {overlays: [{rows: [{state: 'unknown', frames: []}]}]})).toThrow(/state/);
  });
  it('prefers OffscreenCanvas and falls back to a DOM canvas', () => {
    try {
      vi.stubGlobal('OffscreenCanvas', class { constructor(width, height) { this.width = width; this.height = height; } });
      expect(createCanvas(3, 4)).toMatchObject({width: 3, height: 4});
      vi.stubGlobal('OffscreenCanvas', undefined);
      const element = {};
      vi.stubGlobal('document', {createElement: vi.fn(() => element)});
      expect(createCanvas(5, 6)).toBe(element);
      expect(element).toEqual({width: 5, height: 6});
    } finally { vi.unstubAllGlobals(); }
  });
});
