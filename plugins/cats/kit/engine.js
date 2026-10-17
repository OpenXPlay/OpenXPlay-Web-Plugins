// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import {CODEX_V1_STATES} from './atlas.js';

// All engine functions are immutable and timer-free. Use one monotonic clock for
// now; pass local wall-clock hour explicitly to view. Reevaluate view on context,
// host and tap events, at nextChangeAt, and on local hour changes. No polling is
// required while hidden. Optional base rows (sleeping/yawning/sunbathing) must loop.
export const DEFAULT_TEMPERAMENT = Object.freeze({
  sleepiness: 1, sleepAfterMs: 180000, nightSleepAfterMs: 5000,
  greetingChance: 1, greetingEveryMs: 120000, hunger: 0,
  hungerEveryMs: 60000, reactionMs: 1600, tapCooldownMs: 1600
});

export function temperament(value = {}) {
  const result = {...DEFAULT_TEMPERAMENT};
  for (const key of Object.keys(result)) {
    if (Number.isFinite(value[key]) && value[key] >= 0) result[key] = value[key];
  }
  result.greetingChance = Math.min(1, result.greetingChance);
  result.hunger = Math.min(1, result.hunger);
  // Zero sleepiness disables idle/night sleep; intervals cannot create busy loops.
  for (const key of ['sleepAfterMs', 'nightSleepAfterMs', 'greetingEveryMs', 'hungerEveryMs', 'reactionMs', 'tapCooldownMs']) result[key] = Math.max(1, result[key]);
  return result;
}

export function createPet(now = 0, tuning = {}) {
  return {context: {}, host: {visible: true, calm: false, reducedMotion: false, parked: 'unknown'},
    tuning: temperament(tuning), startedAt: now, idleSince: now, lastTap: -Infinity,
    reaction: null, sequence: 0, track: null, connected: null, taps: 0};
}

function restricted(pet) {
  const {activity, call} = pet.context;
  return pet.host.visible === false || pet.host.calm || pet.host.reducedMotion ||
    activity?.siri || activity?.navigation || activity?.phoneCall ||
    (call && call.state !== 'idle');
}

function react(pet, state, now) {
  if (restricted(pet)) return {...pet, reaction: null};
  const sequence = pet.sequence + 1;
  return {...pet, sequence, reaction: {state, id: sequence, until: now + pet.tuning.reactionMs}};
}

// Only the four OXP snapshot topics are accepted. null clears a topic to unknown.
// Every connection gets one greeting; temperament controls periodic gestures.
export function updateContext(pet, topic, value, now, random = Math.random) {
  if (!['session', 'nowPlaying', 'call', 'activity'].includes(topic)) throw new TypeError('unknown pet topic');
  let next = {...pet, context: {...pet.context, [topic]: value}};
  if (topic === 'session') {
    next.connected = value ? value.carplay === 'connected' : null;
    if (next.connected !== pet.connected && next.connected !== null) {
      next.idleSince = now;
      if (!next.connected) next = react(next, 'failed', now);
      else next = react(next, 'waving', now);
    }
  }
  if (topic === 'nowPlaying') {
    const key = value && [value.title, value.artist, value.album].some(part => typeof part === 'string' && part.length) ?
      JSON.stringify([value.title, value.artist, value.album]) : null;
    next.track = key;
    if (key !== null && pet.track !== null && pet.track !== key && value.playing && next.connected !== false) next = react(next, 'jumping', now);
    // Sleep measures inactivity, rather than time since the last pat during music.
    if (value?.playing || pet.context.nowPlaying?.playing) next.idleSince = now;
  }
  if (restricted(next)) next.reaction = null;
  return next;
}

export function updateHost(pet, flags, now) {
  const next = {...pet, host: {...pet.host, ...flags}};
  if (restricted(next)) next.reaction = null;
  if (pet.host.visible === false && next.host.visible !== false) next.idleSince = now;
  return next;
}

export function tap(pet, now) {
  if (restricted(pet) || now - pet.lastTap < pet.tuning.tapCooldownMs) return pet;
  return react({...pet, lastTap: now, idleSince: now, taps: pet.taps + 1}, 'waving', now);
}

// Optional rows: sleeping, yawning, sunbathing, hungry. No game/action is opened
// here: parked is exposed only as a hint for the plugin's own interaction policy.
// Periodic gestures use a stable per-session hash, never fresh randomness per draw.
function roll(cycle, salt) {
  return ((Math.imul(cycle + 1, 1664525) + salt) >>> 0) / 4294967296;
}

export function view(pet, now, hour, states = CODEX_V1_STATES) {
  const available = new Set(states);
  const choose = (state, fallback = 'idle') => available.has(state) ? state : available.has(fallback) ? fallback : 'idle';
  const {context, host, tuning: t} = pet;
  const nav = !!context.activity?.navigation;
  const siri = !!context.activity?.siri;
  const ringing = context.call?.state === 'ringing';
  const call = !!context.activity?.phoneCall || !!(context.call && context.call.state !== 'idle');
  const night = hour >= 22 || hour < 6;
  const music = !!context.nowPlaying?.playing && pet.connected !== false;
  const age = Math.max(0, now - pet.idleSince);
  const sleepAfter = t.sleepiness === 0 ? Infinity : (night ? t.nightSleepAfterMs : t.sleepAfterMs) / t.sleepiness;
  const sleeping = pet.connected === false || !music && age >= sleepAfter;
  let baseState = 'idle';
  if (sleeping) baseState = choose('sleeping');
  else if (music) baseState = choose('running');
  else if (night) baseState = choose('yawning');
  else if (hour >= 11 && hour < 14) baseState = choose('sunbathing');
  const blocked = restricted(pet);
  let state = baseState, reactionId = null;
  const deadlines = [];
  if (!music && pet.connected !== false && sleepAfter > age && Number.isFinite(sleepAfter)) deadlines.push(pet.idleSince + sleepAfter);
  if (pet.reaction && now < pet.reaction.until && !blocked) {
    state = choose(pet.reaction.state); reactionId = pet.reaction.id;
    deadlines.push(pet.reaction.until);
  } else if (!music && !sleeping && baseState === 'idle' && !blocked) {
    for (const [interval, chance, pose, salt] of [
      [t.greetingEveryMs, t.greetingChance, 'waving', 1013904223],
      [t.hungerEveryMs, t.hunger, 'hungry', 2246822519]
    ]) {
      if (!chance) continue;
      const elapsed = Math.max(0, now - pet.startedAt), cycle = Math.floor(elapsed / interval);
      const start = pet.startedAt + cycle * interval;
      deadlines.push(start + interval);
      if (cycle > 0 && now < start + Math.min(t.reactionMs, interval) && roll(cycle, salt) < chance) {
        state = choose(pose); reactionId = `${pose}:${cycle}`;
        deadlines.push(start + Math.min(t.reactionMs, interval)); break;
      }
    }
  }
  if (siri || nav) state = choose('review');
  else if (ringing) state = choose('waiting');
  else if (call || host.calm) state = 'idle';
  const still = siri || nav || call;
  if (blocked) reactionId = null;
  return {state, baseState, reactionId, visible: host.visible !== false,
    calm: !!host.calm, reducedMotion: !!host.reducedMotion || nav,
    still, animate: host.visible !== false && !host.calm && !host.reducedMotion && !still,
    compact: host.parked !== 'confirmed' || still || !!host.calm,
    parked: host.parked === 'confirmed', night, taps: pet.taps,
    nextChangeAt: host.visible === false || blocked || !deadlines.length ? null : Math.min(...deadlines)};
}
