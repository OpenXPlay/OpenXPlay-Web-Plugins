// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import {describe, it, expect, vi} from 'vitest';
import {codexV1, frameRect} from '../atlas.js';
import {fitFrame, createRenderer} from '../renderer.js';
import {compilePixels} from '../pixels.js';
import {createPet, updateContext, view} from '../engine.js';
import {createAnimation, play, sample} from '../animator.js';

describe('surface rendering', () => {
  it('fits aspect ratio using integer or reciprocal-integer pixel scales', () => {
    expect(fitFrame(10, 20, 55, 70)).toEqual({x: 12, y: 5, width: 30, height: 60, scale: 3});
    expect(fitFrame(192, 208, 160, 160).scale).toBe(.5);
    expect(fitFrame(10, 20, 55, 70, false)).toEqual({x: 10, y: 0, width: 35, height: 70, scale: 3.5});
    expect(() => fitFrame(0, 1, 1, 1)).toThrow();
  });
  it('sizes backing pixels, clears transparency and selects the source frame', () => {
    const context = {setTransform: vi.fn(), clearRect: vi.fn(), drawImage: vi.fn()};
    const canvas = {style: {}, getContext: vi.fn(() => context)};
    const image = {}, atlas = codexV1();
    const renderer = createRenderer(canvas, image, atlas);
    renderer.resize(160, 160, 2);
    expect(canvas).toMatchObject({width: 320, height: 320, style: {width: '160px', height: '160px', imageRendering: 'pixelated'}});
    const frame = {rect: frameRect(atlas, 'running', 2)};
    expect(renderer.draw(frame)).toEqual({x: 64, y: 56, width: 192, height: 208, scale: 1});
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 320, 320);
    expect(context.drawImage).toHaveBeenCalledWith(image, 384, 1456, 192, 208, 64, 56, 192, 208);
    expect(context.imageSmoothingEnabled).toBe(false);
    const smooth = createRenderer(canvas, image, atlas, {pixelArt: false});
    smooth.draw(frame); expect(context.imageSmoothingEnabled).toBe(true);
    expect(() => renderer.resize(0, 160)).toThrow();
  });
  it('composes compiled art, engine, timeline and renderer without a DOM or SDK', () => {
    const paints = [];
    const context = {clearRect() {}, fillRect() {}, setTransform() {}, drawImage(...args) { paints.push(args); }};
    const canvasFactory = (width, height) => ({width, height, getContext: () => context});
    const {canvas, descriptor} = compilePixels({palette: {a: '#fff'}, rows: [
      {state: 'idle', fps: 1, loop: true, frames: [['a']]},
      {state: 'running', fps: 2, loop: true, frames: [['a'], ['.']]}
    ]}, {canvasFactory});
    const p = updateContext(createPet(), 'nowPlaying', {title: 'Song', playing: true}, 0);
    const v = view(p, 600, 10, descriptor.rows.map(row => row.state));
    const animation = play(createAnimation(descriptor), v.state, 0, {baseState: v.baseState});
    const renderer = createRenderer(canvasFactory(4, 4), canvas, descriptor);
    renderer.draw(sample(animation, 600, v));
    expect(paints[0]).toEqual([canvas, 1, 1, 1, 1, 0, 0, 4, 4]);
  });
});
