// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

// Minimal wiring (plugin owns SDK subscriptions, assets, timers and disposal):
// const renderer = createRenderer(canvas, loadedImage, descriptor, {pixelArt: true});
// const animator = createAnimator(descriptor, {draw: renderer.draw});
// let pet = createPet(performance.now(), {sleepiness: 1.5, greetingChance: 0.8});
// On host/context/tap events update pet using the matching immutable engine function.
// To refresh, using the same monotonic clock throughout:
// const v = view(pet, performance.now(), new Date().getHours(), descriptor.rows.map(r => r.state));
// animator.setFlags(v);
// animator.play(v.state, {baseState: v.baseState, key: v.reactionId});
// Schedule the next engine refresh at v.nextChangeAt and local hour boundaries;
// cancel that timer while hidden. Combine host visibility with !document.hidden.
// After renderer.resize(w, h, devicePixelRatio), call animator.redraw().
// On teardown cancel the engine timer, unsubscribe SDK listeners and animator.dispose().

export * from './atlas.js';
export * from './pixels.js';
export * from './animator.js';
export * from './engine.js';
export * from './renderer.js';
