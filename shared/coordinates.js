// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

const positive = n => Number.isFinite(n) && n > 0;
// Rect dimensions include CSS transforms; layout dimensions do not.
export function frameScale(rect, width, height) {
  return {x:positive(rect?.width) && positive(width) ? rect.width/width : 1,
    y:positive(rect?.height) && positive(height) ? rect.height/height : 1};
}
export function layoutDelta(move, scale) {
  return {dx:move.dx/(positive(scale?.x)?scale.x:1),dy:move.dy/(positive(scale?.y)?scale.y:1)};
}
