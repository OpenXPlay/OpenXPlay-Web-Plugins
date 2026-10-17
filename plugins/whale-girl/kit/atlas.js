// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

// Vendor this directory alongside the SDK. No SDK, image loading or network is required here.
export const CODEX_V1_STATES = Object.freeze([
  'idle', 'running-right', 'running-left', 'waving', 'jumping',
  'failed', 'waiting', 'running', 'review'
]);

// Timing is a kit default; Codex's grid contract does not prescribe an fps.
export function codexV1(image = 'spritesheet.webp') {
  return {image, cellWidth: 192, cellHeight: 208, columns: 8,
    rows: CODEX_V1_STATES.map(state => ({state, frames: 8, fps: 8,
      loop: !['waving', 'jumping', 'failed'].includes(state)}))};
}

function positiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${name} must be a positive integer`);
  return value;
}

// JSON may carry SPDX/creator metadata. Only these layout fields affect rendering.
// Each array entry is the next physical row; unused cells at its right stay transparent.
export function validateAtlas(value) {
  if (!value || typeof value.image !== 'string' || !value.image.trim()) throw new TypeError('image is required');
  const cellWidth = positiveInteger(value.cellWidth, 'cellWidth');
  const cellHeight = positiveInteger(value.cellHeight, 'cellHeight');
  if (!Array.isArray(value.rows) || !value.rows.length) throw new TypeError('rows are required');
  const seen = new Set();
  const rows = value.rows.map(row => {
    if (!row || typeof row.state !== 'string' || !row.state || seen.has(row.state)) throw new TypeError('states must be unique nonempty strings');
    seen.add(row.state);
    const frames = positiveInteger(row.frames, 'frames');
    if (!Number.isFinite(row.fps) || row.fps <= 0 || row.fps > 30) throw new TypeError('fps must be > 0 and <= 30');
    if (typeof row.loop !== 'boolean') throw new TypeError('loop must be boolean');
    return {state: row.state, frames, fps: row.fps, loop: row.loop};
  });
  if (!seen.has('idle')) throw new TypeError('an idle row is required');
  const columns = value.columns === undefined ? Math.max(...rows.map(row => row.frames)) : positiveInteger(value.columns, 'columns');
  if (rows.some(row => row.frames > columns)) throw new TypeError('frames exceed columns');
  return {image: value.image, cellWidth, cellHeight, columns, rows};
}

// Optional poses can fall back to any named standard row, then idle.
export function resolveState(atlas, state, fallback = 'idle') {
  return atlas.rows.some(row => row.state === state) ? state :
    atlas.rows.some(row => row.state === fallback) ? fallback : 'idle';
}

export function frameRect(atlas, state, frame = 0) {
  const resolved = resolveState(atlas, state);
  const index = atlas.rows.findIndex(row => row.state === resolved);
  const row = atlas.rows[index];
  if (!Number.isInteger(frame) || frame < 0 || frame >= row.frames) throw new RangeError('frame outside row');
  return {x: frame * atlas.cellWidth, y: index * atlas.cellHeight,
    width: atlas.cellWidth, height: atlas.cellHeight};
}
