// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import {validateAtlas, resolveState, frameRect} from './atlas.js';

// Pure timeline. now is a monotonic millisecond clock, shared with play/sample.
// Base states must loop; a one-shot's final frame lasts a full frame interval.
export function createAnimation(descriptor, now = 0) {
  return {atlas: validateAtlas(descriptor), state: 'idle', baseState: 'idle', startedAt: now};
}

export function play(animation, state, now, {baseState = animation.baseState, restart = false} = {}) {
  const base = resolveState(animation.atlas, baseState);
  if (!animation.atlas.rows.find(row => row.state === base).loop) throw new TypeError('base state must loop');
  const resolved = resolveState(animation.atlas, state);
  return {...animation, state: resolved, baseState: base,
    startedAt: restart || resolved !== animation.state ? now : animation.startedAt};
}

export function sample(animation, now, {visible = true, calm = false, reducedMotion = false, still = false} = {}) {
  const frozen = !visible || calm || reducedMotion;
  let state = frozen ? 'idle' : animation.state;
  let row = animation.atlas.rows.find(candidate => candidate.state === state);
  let elapsed = Math.max(0, now - animation.startedAt);
  let completed = false;
  if (!frozen && !still && !row.loop && elapsed >= row.frames * 1000 / row.fps) {
    elapsed -= row.frames * 1000 / row.fps;
    state = animation.baseState;
    row = animation.atlas.rows.find(candidate => candidate.state === state);
    completed = true;
  }
  const frame = frozen || still ? 0 : Math.floor(elapsed * row.fps / 1000) % row.frames;
  return {state, frame, completed, rect: frameRect(animation.atlas, state, frame),
    animate: !frozen && !still && (row.frames > 1 || !row.loop)};
}

// Browser shell with injectable scheduling for tests. Feed engine view flags into
// setFlags; pass its reactionId as play's key to replay the same one-shot on a new event.
// Hidden/calm/reduced/still states cancel RAF, discard pending gestures, and resume
// from the base row. Wire document.visibilitychange as well as host surface changes.
export function createAnimator(descriptor, {draw, now = () => performance.now(),
  requestFrame = callback => requestAnimationFrame(callback),
  cancelFrame = id => cancelAnimationFrame(id)} = {}) {
  if (typeof draw !== 'function') throw new TypeError('draw callback is required');
  let animation = createAnimation(descriptor, now());
  let flags = {}, pending = null, disposed = false, lastKey, lastDraw;
  const frozen = () => flags.visible === false || flags.calm || flags.reducedMotion;
  function stop() { if (pending !== null) cancelFrame(pending); pending = null; }
  function render(time, force = false) {
    const view = sample(animation, time, flags);
    const signature = `${view.state}:${view.frame}`;
    if (force || signature !== lastDraw) { draw(view); lastDraw = signature; }
    if (!view.animate) stop();
    if (view.animate && pending === null && !disposed) pending = requestFrame(tick);
  }
  function tick(time) { pending = null; if (!disposed) render(time); }
  return {
    play(state, {baseState, key} = {}) {
      if (disposed) return;
      animation = play(animation, state, now(), {baseState, restart: key !== undefined && key !== lastKey});
      lastKey = key;
      if (frozen()) animation = play(animation, animation.baseState, now(), {restart: true});
      render(now());
    },
    setFlags(next) {
      if (disposed) return;
      const wasFrozen = frozen();
      flags = {...flags, ...next};
      stop();
      if (frozen() || wasFrozen) animation = play(animation, animation.baseState, now(), {restart: true});
      render(now());
    },
    // Call after a resize or image replacement, even if the timeline is frozen.
    redraw() { if (!disposed) render(now(), true); },
    dispose() { disposed = true; stop(); }
  };
}
