// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import {view, tap} from './kit/engine.js';
export const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
export const SIZES = [112, 136, 160];
export function settings(value) {
  return {size: SIZES.includes(value?.size) ? value.size : 136,
    corner: CORNERS.includes(value?.corner) ? value.corner : 'bottom-right'};
}
const poses = {running: 'busy', waiting: 'startled', review: 'listening', failed: 'drowsy',
  yawning: 'drowsy', sunbathing: 'thinking'};
const states = ['idle', 'running', 'waiting', 'review', 'failed', 'waving', 'jumping', 'yawning', 'sunbathing'];
export function pat(pet, now) {
  const next = tap(pet, now);
  return next === pet ? pet : {...next, reaction: {...next.reaction, state: 'happy'}};
}
export function whaleView(pet, now, hour) {
  const v = view(pet, now, hour, [...states, 'happy']);
  return {...v, state: poses[v.state] ?? v.state, baseState: poses[v.baseState] ?? v.baseState,
    heart: v.state === 'happy' && v.reactionId !== null && v.animate};
}
export function language(locale) { return /^zh(?:-|$)/i.test(locale) ? 'zh-CN' : 'en'; }
