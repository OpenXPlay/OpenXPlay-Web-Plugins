// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import {describe, it, expect, vi} from 'vitest';
import {codexV1} from '../atlas.js';
import {createAnimation, play, sample, createAnimator} from '../animator.js';

function harness(descriptor = codexV1()) {
  let time = 0, id = 0;
  const queue = new Map(), draw = vi.fn();
  const animator = createAnimator(descriptor, {draw, now: () => time,
    requestFrame: callback => { queue.set(++id, callback); return id; },
    cancelFrame: key => queue.delete(key)});
  return {animator, draw, queue, tick(next) {
    time = next;
    const callbacks = [...queue.values()]; queue.clear();
    callbacks.forEach(callback => callback(time));
  }};
}

describe('animation timeline', () => {
  it('uses row fps, loops and returns after the complete final one-shot frame', () => {
    const a = play(createAnimation(codexV1()), 'jumping', 100, {baseState: 'running'});
    expect(sample(a, 224).frame).toBe(0);
    expect(sample(a, 225).frame).toBe(1);
    expect(sample(a, 1099)).toMatchObject({state: 'jumping', frame: 7, completed: false});
    expect(sample(a, 1100)).toMatchObject({state: 'running', frame: 0, completed: true});
    expect(sample(a, 2225).frame).toBe(1);
    expect(sample(a, -1).frame).toBe(0);
  });
  it('freezes idle for hidden/calm/reduced motion, but attentive states use their own still frame', () => {
    const a = play(createAnimation(codexV1()), 'waiting', 0);
    for (const flags of [{visible: false}, {calm: true}, {reducedMotion: true}]) {
      expect(sample(a, 500, flags)).toMatchObject({state: 'idle', frame: 0, animate: false});
    }
    expect(sample(a, 500, {still: true})).toMatchObject({state: 'waiting', frame: 0, animate: false});
  });
  it('keeps a repeated row running unless explicitly restarted and validates bases', () => {
    const a = play(createAnimation(codexV1()), 'jumping', 100);
    expect(play(a, 'jumping', 500).startedAt).toBe(100);
    expect(play(a, 'jumping', 500, {restart: true}).startedAt).toBe(500);
    expect(() => play(a, 'idle', 500, {baseState: 'failed'})).toThrow(/loop/);
  });
});

describe('animation scheduler', () => {
  it('deduplicates draws within a frame and cancels RAF while hidden', () => {
    const h = harness(); h.animator.play('running');
    h.tick(16); h.tick(33); expect(h.draw).toHaveBeenCalledTimes(1);
    h.tick(125); expect(h.draw).toHaveBeenCalledTimes(2);
    h.animator.setFlags({visible: false});
    expect(h.draw.mock.lastCall[0]).toMatchObject({state: 'idle', frame: 0});
    expect(h.queue.size).toBe(0);
    h.tick(10000); expect(h.queue.size).toBe(0);
    h.animator.setFlags({visible: true}); expect(h.queue.size).toBe(1);
    h.animator.dispose(); expect(h.queue.size).toBe(0);
    h.animator.redraw(); expect(h.queue.size).toBe(0);
  });
  it('stops for calm, reduced motion and still, and preserves waiting', () => {
    const h = harness(); h.animator.play('running');
    for (const flag of ['calm', 'reducedMotion']) {
      h.animator.setFlags({[flag]: true}); expect(h.queue.size).toBe(0);
      h.animator.setFlags({[flag]: false}); expect(h.queue.size).toBe(1);
    }
    h.animator.setFlags({still: true}); h.animator.play('waiting');
    expect(h.draw.mock.lastCall[0]).toMatchObject({state: 'waiting', frame: 0});
    expect(h.queue.size).toBe(0);
  });
  it('finishes single-frame one-shots even when the base is static', () => {
    const atlas = codexV1(); atlas.rows.forEach(row => { row.frames = 1; });
    const h = harness(atlas); h.animator.play('jumping', {key: 1});
    expect(h.queue.size).toBe(1); h.tick(125);
    expect(h.draw.mock.lastCall[0]).toMatchObject({state: 'idle', completed: true});
    expect(h.queue.size).toBe(0);
    h.animator.play('jumping', {key: 2});
    expect(h.draw.mock.lastCall[0].state).toBe('jumping');
    expect(h.queue.size).toBe(1);
  });
  it('discards interrupted one-shots and resumes the base instead of replaying them', () => {
    const h = harness(); h.animator.play('jumping', {baseState: 'running', key: 1});
    h.tick(125); h.animator.setFlags({visible: false});
    h.tick(250); h.animator.setFlags({visible: true});
    expect(h.draw.mock.lastCall[0]).toMatchObject({state: 'running', frame: 0});
    expect(h.queue.size).toBe(1);
  });
});
