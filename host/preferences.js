// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import { validPosition } from '../shared/positions.js';
const persistent = s => ['companion','ambient'].includes(s.kind);
export const surfaceKey = s => `${s.plugin}/${s.id}`;
const anchors = new Set(['top-left','top-right','bottom-left','bottom-right','left','right','top','bottom']);
export function placement(value = {}) {
  return {...(validPosition(value) ? {x:value.x,y:value.y} : {}),...(anchors.has(value.anchor) ? {anchor:value.anchor} : {})};
}
// Desired surfaces survive temporary policy gates, but never disabled or removed plugins.
export function pruneSurfaces(saved, manifests, disabled) {
  return Object.fromEntries(Object.entries(saved ?? {}).filter(([id]) => {
    const [plugin,surface] = id.split('/');
    return !disabled.has(plugin) && manifests.get(plugin)?.surfaces.some(s=>s.id===surface && persistent(s));
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
