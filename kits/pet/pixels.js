// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import {validateAtlas} from './atlas.js';

export function createCanvas(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  if (typeof document === 'undefined') throw new Error('Supply a canvasFactory outside a browser');
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  return canvas;
}

// source = {palette: {a:'#ff8800', ...}, rows:[{state,fps,loop,frames:[['.aa.', ...], ...]}]}.
// Layers have {palette?, rows:[{state,frames:[...]}]}; a single layer frame repeats
// across its row, otherwise its count must match. '.' always means no paint.
// All frames/layers share the source cell dimensions; swaps override every palette.
export function compilePixels(source, {palette = {}, overlays = [], scale = 1,
  image = 'runtime-atlas', canvasFactory = createCanvas} = {}) {
  if (!Number.isSafeInteger(scale) || scale < 1) throw new TypeError('scale must be a positive integer');
  const first = source?.rows?.[0]?.frames?.[0];
  if (!Array.isArray(first) || !first.length || typeof first[0] !== 'string' || !first[0].length) throw new TypeError('pixel frames are required');
  const width = Array.from(first[0]).length, height = first.length;
  const descriptor = validateAtlas({image, cellWidth: width * scale, cellHeight: height * scale,
    rows: source.rows.map(row => ({...row, frames: row.frames.length}))});
  const layers = [source, ...overlays];
  // Validate before allocating or painting, so a bad layer never returns partial art.
  const prepared = layers.map((layer, layerIndex) => {
    if (!Array.isArray(layer.rows)) throw new TypeError('layer rows are required');
    const colors = {...source.palette, ...layer.palette, ...palette};
    const rows = new Map();
    for (const row of layer.rows) {
      const target = descriptor.rows.find(candidate => candidate.state === row.state);
      if (!target || rows.has(row.state)) throw new TypeError('unknown or duplicate layer state');
      if (!Array.isArray(row.frames) || (row.frames.length !== target.frames && !(layerIndex > 0 && row.frames.length === 1))) throw new TypeError('layer frame count mismatch');
      for (const frame of row.frames) {
        if (!Array.isArray(frame) || frame.length !== height || frame.some(line => typeof line !== 'string' || Array.from(line).length !== width)) throw new TypeError('pixel frames must have equal dimensions');
        for (const line of frame) for (const char of line) {
          if (char !== '.' && (typeof colors[char] !== 'string' || !colors[char])) throw new TypeError(`missing palette color: ${char}`);
        }
      }
      rows.set(row.state, row.frames);
    }
    return {colors, rows};
  });
  const canvas = canvasFactory(descriptor.columns * descriptor.cellWidth, descriptor.rows.length * descriptor.cellHeight);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is unavailable');
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, canvas.width, canvas.height);
  descriptor.rows.forEach((row, y) => {
    for (let frame = 0; frame < row.frames; frame++) {
      for (const layer of prepared) {
        const frames = layer.rows.get(row.state);
        if (!frames) continue;
        frames[frame % frames.length].forEach((line, py) => {
          Array.from(line).forEach((char, px) => {
            if (char === '.') return;
            context.fillStyle = layer.colors[char];
            context.fillRect(frame * descriptor.cellWidth + px * scale,
              y * descriptor.cellHeight + py * scale, scale, scale);
          });
        });
      }
    }
  });
  return {canvas, descriptor};
}
