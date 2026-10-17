// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import {validateAtlas} from './atlas.js';
import {walkPosition} from '../poses.js';

export function fitFrame(cellWidth, cellHeight, width, height, pixelArt = true) {
  if (![cellWidth, cellHeight, width, height].every(value => Number.isFinite(value) && value > 0)) throw new TypeError('dimensions must be positive');
  let scale = Math.min(width / cellWidth, height / cellHeight);
  if (pixelArt) scale = scale >= 1 ? Math.floor(scale) : 1 / Math.ceil(1 / scale);
  const w = cellWidth * scale, h = cellHeight * scale;
  return {x: pixelArt ? Math.floor((width - w) / 2) : (width - w) / 2,
    y: pixelArt ? Math.floor((height - h) / 2) : (height - h) / 2, width: w, height: h, scale};
}

export function createRenderer(canvas, image, descriptor, {pixelArt = true, meow} = {}) {
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
    // Leave walking room and enough vertical room for the original meow effect.
    const target = fitFrame(atlas.cellWidth, atlas.cellHeight, canvas.width*.8, canvas.height*.55, pixelArt);
    target.x=Math.floor((canvas.width-target.width)/2);
    target.y=Math.floor((canvas.height-target.height)/2+canvas.height*.12);
    const moving=['walking','run'].includes(frame.state)&&frame.animate;
    const position=moving?walkPosition(frame.elapsedMs,canvas.width,target.width,frame.state==='run'?30:8):{x:target.x,left:false};
    const rect = frame.rect;
    if(image.complete===false||image.naturalWidth===0)return target;
    context.save();
    if(position.left){context.translate(position.x+target.width,0);context.scale(-1,1);}
    context.drawImage(image, rect.x, rect.y, rect.width, rect.height,
      position.left?0:position.x, target.y, target.width, target.height);
    context.restore();
    if(frame.state==='greeting'&&meow?.complete&&meow.naturalWidth) {
      const scale=target.scale,cell=16;
      const x=Math.min(canvas.width-cell*scale,position.x+target.width-cell*scale);
      context.drawImage(meow,Math.min(2,frame.frame)*cell,0,cell,cell,
        Math.max(0,x),Math.max(0,target.y-cell*scale),cell*scale,cell*scale);
    }
    return target;
  }
  return {resize, draw};
}
