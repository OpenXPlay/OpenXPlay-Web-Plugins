// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import {validateAtlas} from './atlas.js';

// Pixel art uses integer enlargement or reciprocal-integer reduction when the
// surface is smaller than one cell; it always fits without changing aspect ratio.
export function fitFrame(cellWidth, cellHeight, width, height, pixelArt = true) {
  if (![cellWidth, cellHeight, width, height].every(value => Number.isFinite(value) && value > 0)) throw new TypeError('dimensions must be positive');
  let scale = Math.min(width / cellWidth, height / cellHeight);
  if (pixelArt) scale = scale >= 1 ? Math.floor(scale) : 1 / Math.ceil(1 / scale);
  const w = cellWidth * scale, h = cellHeight * scale;
  return {x: pixelArt ? Math.floor((width - w) / 2) : (width - w) / 2,
    y: pixelArt ? Math.floor((height - h) / 2) : (height - h) / 2, width: w, height: h, scale};
}

// canvas is a transparent surface owned by the plugin; image is an already loaded
// ImageBitmap, HTMLImageElement or compiled canvas. Width/height are CSS pixels.
export function createRenderer(canvas, image, descriptor, {pixelArt = true} = {}) {
  const atlas = validateAtlas(descriptor);
  const context = canvas.getContext('2d', {alpha: true});
  if (!context) throw new Error('2D canvas is unavailable');
  function resize(width, height, pixelRatio = 1) {
    if (![width, height, pixelRatio].every(value => Number.isFinite(value) && value > 0)) throw new TypeError('surface dimensions must be positive');
    canvas.width = Math.max(1, Math.round(width * pixelRatio));
    canvas.height = Math.max(1, Math.round(height * pixelRatio));
    if (canvas.style) {
      canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
      canvas.style.imageRendering = pixelArt ? 'pixelated' : 'auto';
    }
  }
  function draw(frame) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = !pixelArt;
    const target = fitFrame(atlas.cellWidth, atlas.cellHeight, canvas.width, canvas.height, pixelArt);
    const rect = frame.rect;
    context.drawImage(image, rect.x, rect.y, rect.width, rect.height,
      target.x, target.y, target.width, target.height);
    return target;
  }
  return {resize, draw};
}
