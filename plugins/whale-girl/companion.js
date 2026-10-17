// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import {connect} from './oxp-plugin-sdk.js';
import {createPet, updateHost, updateContext, createAnimator, createRenderer} from './kit/index.js';
import descriptor from './atlas.js';
import {pat, whaleView, settings, language} from './behaviour.js';

const sdk = await connect();
const button = document.querySelector('#pet'), heart = document.querySelector('#heart');
sdk.surface.enableDrag(button);
const image = new Image();
image.crossOrigin = 'anonymous';
image.src = descriptor.image;
try { await image.decode(); } catch { button.hidden = true; sdk.disconnect(); throw new Error('Pet atlas unavailable'); }
const renderer = createRenderer(document.querySelector('canvas'), image, descriptor, {pixelArt: false});
// A timer-backed scheduler caps callbacks at 24 fps, including on 120 Hz displays.
const animator = createAnimator(descriptor, {draw: renderer.draw,
  requestFrame: callback => setTimeout(() => callback(performance.now()), 1000 / 24),
  cancelFrame: clearTimeout});
const media = matchMedia('(prefers-reduced-motion: reduce)');
let pet = createPet(performance.now()), timer, disposed = false, preference = settings(), reading = false;
let requested = '', lastBadge = false;
const unsubscribes = [];
function badge(value) {
  if (lastBadge !== value) { lastBadge = value; sdk.quickActions.setState('pat', {badge: value ? '♥' : ''}); }
  heart.hidden = !value;
}
function refresh() {
  if (disposed) return;
  clearTimeout(timer);
  const now = performance.now(), s = sdk.surface;
  pet = updateHost(pet, {visible: s.visible && !s.closing && !document.hidden,
    calm: s.calm, reducedMotion: sdk.reducedMotion || media.matches, parked: sdk.parked}, now);
  const v = whaleView(pet, now, new Date().getHours());
  animator.setFlags(v);
  animator.play(v.state, {baseState: v.baseState, key: v.reactionId});
  badge(v.heart && v.visible);
  button.disabled = !v.visible || v.calm || v.still || v.reducedMotion;
  const zh = language(sdk.locale) === 'zh-CN';
  button.setAttribute('aria-label', zh ? '摸摸鲸鱼娘' : 'Pat Whale Girl');
  document.documentElement.lang = zh ? 'zh-CN' : 'en';
  // The host owns geometry, including video-relative bounds and obstacle avoidance.
  // Never translate the pet outside the surface to chase the underlying video.
  const size = preference.size;
  const request = JSON.stringify([preference.corner, size]);
  if (requested !== request) { requested = request; sdk.surface.request({anchor: preference.corner, size: {w:size,h:size}}); }
  if (v.visible && v.animate) {
    const date = new Date(), hourBoundary = 3600000 - (date.getMinutes()*60000 + date.getSeconds()*1000 + date.getMilliseconds());
    timer = setTimeout(refresh, Math.max(16, Math.min(hourBoundary, v.nextChangeAt === null ? Infinity : v.nextChangeAt - now)));
  }
}
function resize() {
  if (sdk.surface.w > 0 && sdk.surface.h > 0) {
    renderer.resize(sdk.surface.w, sdk.surface.h, Math.min(devicePixelRatio || 1, 2));
    animator.redraw();
  }
}
async function readSettings() {
  if (reading || disposed) return;
  reading = true;
  try { const value = await sdk.storage.get(); if (!disposed) { preference = settings(value); refresh(); } }
  catch { /* Defaults work when storage is unavailable. */ }
  finally { reading = false; }
}
function affection() { pet = pat(pet, performance.now()); refresh(); }
button.addEventListener('click', affection);
for (const topic of ['session', 'nowPlaying', 'call', 'activity']) {
  if (Object.hasOwn(sdk.state, topic)) pet = updateContext(pet, topic, sdk.state[topic], performance.now());
  unsubscribes.push(sdk.on(topic, value => { pet = updateContext(pet, topic, value, performance.now()); refresh(); }));
}
unsubscribes.push(sdk.quickActions.on('pat', affection));
unsubscribes.push(sdk.surface.onChange(() => { resize(); refresh(); void readSettings(); }));
function visibility() { refresh(); if (!document.hidden) void readSettings(); }
document.addEventListener('visibilitychange', visibility);
media.addEventListener('change', refresh);
function dispose() {
  if (disposed) return;
  badge(false); disposed = true; clearTimeout(timer); animator.dispose();
  for (const off of unsubscribes) off();
  document.removeEventListener('visibilitychange', visibility); media.removeEventListener('change', refresh);
  button.removeEventListener('click', affection); sdk.disconnect();
}
window.addEventListener('pagehide', dispose, {once:true});
resize(); refresh(); void readSettings();
