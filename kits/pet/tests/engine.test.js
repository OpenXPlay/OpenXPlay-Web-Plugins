// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import {describe, it, expect} from 'vitest';
import {CODEX_V1_STATES} from '../atlas.js';
import {createPet, updateContext, updateHost, tap, view, temperament} from '../engine.js';

const states = [...CODEX_V1_STATES, 'sleeping', 'yawning', 'sunbathing', 'hungry'];
const read = (pet, now = 100, hour = 10) => view(pet, now, hour, states);
const song = title => ({title, artist: 'Artist', album: 'Album', playing: true});

describe('pet context mapping', () => {
  it('greets once on connect; fails once then sleeps after disconnect', () => {
    const original = createPet();
    let p = updateContext(original, 'session', {carplay: 'connected'}, 0, () => 0);
    expect(read(p)).toMatchObject({state: 'waving', baseState: 'idle', reactionId: 1});
    p = updateContext(p, 'session', {carplay: 'connected'}, 2000);
    expect(read(p, 2100).state).toBe('idle');
    p = updateContext(p, 'session', {carplay: 'disconnected'}, 3000);
    expect(read(p, 3100)).toMatchObject({state: 'failed', baseState: 'sleeping'});
    expect(read(p, 4600).state).toBe('sleeping');
    expect(original.context).toEqual({});
    expect(original.sequence).toBe(0);
  });
  it('uses running during music and hops only on a changed known track', () => {
    let p = updateContext(createPet(), 'nowPlaying', song('A'), 0);
    expect(read(p).state).toBe('running');
    p = updateContext(p, 'nowPlaying', song('B'), 1000);
    expect(read(p, 1100)).toMatchObject({state: 'jumping', baseState: 'running', reactionId: 1});
    p = updateContext(p, 'nowPlaying', {...song('B'), elapsedMs: 5000}, 5000);
    expect(read(p, 5100).state).toBe('running');
    expect(read(p, 999999).state).toBe('running');
    p = updateContext(p, 'nowPlaying', {...song('B'), playing: false}, 1000000);
    expect(read(p, 1000001).state).toBe('idle');
    expect(read(p, 1180000).state).toBe('sleeping');
  });
  it('treats null metadata as unknown and never invents a track change', () => {
    let p = updateContext(createPet(), 'nowPlaying', song('A'), 0);
    p = updateContext(p, 'nowPlaying', null, 100);
    p = updateContext(p, 'nowPlaying', song('B'), 200);
    expect(read(p, 300).state).toBe('running');
    p = updateContext(p, 'session', null, 500);
    expect(p.connected).toBe(null);
    expect(() => updateContext(p, 'route', {}, 600)).toThrow(/topic/);
  });
  it('does not let stale music snapshots interrupt disconnect then sleep', () => {
    let p = updateContext(createPet(), 'nowPlaying', song('A'), 0);
    p = updateContext(p, 'session', {carplay: 'disconnected'}, 100);
    p = updateContext(p, 'nowPlaying', song('B'), 200);
    expect(read(p, 300).state).toBe('failed');
    expect(read(p, 1700).state).toBe('sleeping');
  });
  it('selects still waiting on ring, review for Siri and reduced motion during navigation', () => {
    let p = updateContext(createPet(), 'call', {state: 'ringing'}, 0);
    expect(read(p)).toMatchObject({state: 'waiting', still: true, animate: false, compact: true});
    p = updateContext(p, 'activity', {siri: true}, 100);
    expect(read(p)).toMatchObject({state: 'review', still: true});
    p = updateContext(p, 'activity', {navigation: true}, 200);
    expect(read(p, 300)).toMatchObject({state: 'review', reducedMotion: true, animate: false});
  });
  it.each(['dialing', 'active', 'held', 'ending'])('is still during %s calls', state => {
    const p = updateContext(createPet(), 'call', {state}, 0);
    expect(read(p)).toMatchObject({state: 'idle', still: true, animate: false});
    expect(tap(p, 100)).toBe(p);
  });
  it.each([
    ['call', {state: 'ringing'}], ['activity', {siri: true}],
    ['activity', {navigation: true}], ['activity', {phoneCall: true}]
  ])('discards gestures suppressed by %s instead of replaying them', (topic, value) => {
    let p = tap(createPet(), 0);
    p = updateContext(p, topic, value, 100);
    p = updateContext(p, 'nowPlaying', song('A'), 200);
    p = updateContext(p, 'nowPlaying', song('B'), 300);
    expect(p.reaction).toBe(null);
    p = updateContext(p, topic, null, 400);
    expect(read(p, 500).state).toBe('running');
  });
});

describe('pet rhythm and temperament', () => {
  it('rate limits taps and assigns distinct event ids to repeated waves', () => {
    let p = tap(createPet(), 0);
    expect(p.taps).toBe(1); expect(tap(p, 1599)).toBe(p);
    expect(read(p, 1599).state).toBe('waving');
    expect(read(p, 1600).state).toBe('idle');
    p = tap(p, 1600);
    expect(p.taps).toBe(2); expect(read(p, 1700).reactionId).toBe(2);
  });
  it.each([{visible: false}, {calm: true}, {reducedMotion: true}])('discards reactions and rejects taps with host flags %j', flags => {
    let p = updateHost(tap(createPet(), 0), flags, 100);
    expect(p.reaction).toBe(null); expect(tap(p, 2000)).toBe(p);
    expect(read(p)).toMatchObject({animate: false, nextChangeAt: null});
    p = updateHost(p, {visible: true, calm: false, reducedMotion: false}, 200);
    expect(read(p, 300).state).toBe('idle');
  });
  it('uses sleepiness for idle sleep, night rhythm and noon sunbathing', () => {
    const sleepy = createPet(0, {sleepiness: 2, greetingChance: 0});
    expect(read(sleepy, 89999).state).toBe('idle');
    expect(read(sleepy, 90000).state).toBe('sleeping');
    expect(read(sleepy, 100, 23).state).toBe('yawning');
    expect(read(sleepy, 2500, 23).state).toBe('sleeping');
    expect(read(sleepy, 100, 12).state).toBe('sunbathing');
    expect(read(createPet(0, {sleepiness: 0, greetingChance: 0}), 999999, 23).state).toBe('yawning');
  });
  it('lets temperament tune connection greetings and periodic hunger', () => {
    let p = createPet(0, {greetingChance: 0, hunger: 1});
    p = updateContext(p, 'session', {carplay: 'connected'}, 0, () => 0);
    expect(read(p).state).toBe('idle');
    expect(read(p, 60000).state).toBe('hungry');
    expect(read(p, 61600).state).toBe('idle');
    const friendly = createPet(0, {greetingChance: 1});
    expect(read(friendly, 120000).state).toBe('waving');
    expect(read(friendly, 121600).state).toBe('idle');
    expect(temperament({greetingChance: 9, sleepiness: -1, hungerEveryMs: 0})).toMatchObject({greetingChance: 1, sleepiness: 1, hungerEveryMs: 1});
  });
  it('reports parked/compact hints, deadlines and standard-row fallbacks', () => {
    let p = createPet(0, {greetingChance: 0});
    expect(read(p)).toMatchObject({compact: true, nextChangeAt: 180000});
    p = updateHost(p, {parked: 'confirmed'}, 0);
    expect(read(p)).toMatchObject({parked: true, compact: false});
    expect(view(p, 180000, 10).state).toBe('idle');
    p = tap(p, 180001);
    expect(read(p, 180100).nextChangeAt).toBe(181601);
  });
  it('does not periodically greet when sleep falls back to the standard idle row', () => {
    const p = createPet();
    expect(view(p, 240000, 10)).toMatchObject({state: 'idle', reactionId: null});
  });
});
