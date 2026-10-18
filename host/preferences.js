// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import { validPosition, validPrefs } from '../shared/positions.js';
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const persistent = s => ['companion','ambient'].includes(s.kind);
export const surfaceKey = s => `${s.plugin}/${s.id}`;
const anchors = new Set(['top-left','top-right','bottom-left','bottom-right','left','right','top','bottom']);
export function placement(value = {}) {
  if (!record(value)) return {};
  return {...(validPosition(value) ? {x:value.x,y:value.y} : {}),...(anchors.has(value.anchor) ? {anchor:value.anchor} : {})};
}
export function loadPreferences(value) {
  if (!validPrefs(value)) return {};
  const companions=Object.fromEntries(Object.entries(record(value.companions)?value.companions:{}).filter(([,p])=>validPosition(p)).map(([id,p])=>[id,placement(p)]));
  // Older hosts saved active companions only as free positions.
  const selected=value.surfaces===undefined?companions:record(value.surfaces)?value.surfaces:{};
  const surfaces=Object.fromEntries(Object.entries(selected).filter(([,p])=>record(p)).map(([id,p])=>[id,placement(p)]));
  return {...value,companions,surfaces};
}
// Desired surfaces survive temporary policy gates, but never disabled or removed plugins.
export function pruneSurfaces(saved, manifests, disabled) {
  return Object.fromEntries(Object.entries(record(saved)?saved:{}).filter(([id,value]) => {
    const [plugin,surface] = id.split('/');
    return id===`${plugin}/${surface}` && record(value) && !disabled.has(plugin) && manifests.get(plugin)?.surfaces.some(s=>s.id===surface && persistent(s));
  }).map(([id,value])=>[id,placement(value ?? {})]));
}
export function rememberSurfaces(saved, loaded) {
  const next={...saved};
  for (const s of loaded.filter(persistent)) next[surfaceKey(s)]=placement({...s.position,anchor:s.anchor});
  return next;
}
export function restoreSurfaces(saved, pending, manifests, policy, now) {
  for (const id of pending) {
    if (!Object.hasOwn(saved,id)) { pending.delete(id); continue; }
    const [plugin,surface]=id.split('/'), declared=manifests.get(plugin)?.surfaces.find(s=>s.id===surface);
    const value=placement(saved[id]);
    if (declared && policy.open(plugin,{...declared,...(value.anchor?{anchor:value.anchor}:{}),...(validPosition(value)?{position:{x:value.x,y:value.y},restoredAnchor:value.anchor ?? declared.anchor}:{})},now)) pending.delete(id);
  }
}

// Keep surface selections but return every control to its default placement.
export function resetPositions(prefs) {
  const {dock, companions, ...rest}=prefs;
  if (rest.surfaces) rest.surfaces=Object.fromEntries(Object.keys(rest.surfaces).map(id=>[id,{}]));
  return rest;
}
