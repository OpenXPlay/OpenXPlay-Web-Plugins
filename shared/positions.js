// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

export const validPosition = p => p && typeof p === 'object' && Number.isFinite(p.x) && Number.isFinite(p.y);
export function validPrefs(value) {
  try { return value !== null && typeof value === 'object' && !Array.isArray(value) && new TextEncoder().encode(JSON.stringify(value)).length <= 4096; } catch { return false; }
}
export function readPrefs(storage, key) {
  try { const value=JSON.parse(storage.getItem(key)); return validPrefs(value) ? value : {}; } catch { return {}; }
}
export function savePrefs(storage, key, value) {
  if (!validPrefs(value)) return false;
  try { storage.setItem(key,JSON.stringify(value)); return true; } catch { return false; }
}
export function intersects(a,b) { return a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y; }
// Select the nearest unobstructed candidate, including obstacle corners for multiple obstacles.
export function placeFree(rect, viewport, obstacles=[], margin=24) {
  const w=Math.min(rect.w,viewport.w), h=Math.min(rect.h,viewport.h);
  const mx=Math.min(margin,Math.max(0,(viewport.w-w)/2)), my=Math.min(margin,Math.max(0,(viewport.h-h)/2));
  const bound=(x,y)=>({x:Math.max(mx,Math.min(viewport.w-w-mx,x)),y:Math.max(my,Math.min(viewport.h-h-my,y)),w,h});
  const initial=bound(rect.x,rect.y);
  const xs=[initial.x,mx,viewport.w-w-mx,...obstacles.flatMap(o=>[o.x-w-8,o.x+o.w+8])];
  const ys=[initial.y,my,viewport.h-h-my,...obstacles.flatMap(o=>[o.y-h-8,o.y+o.h+8])];
  const candidates=xs.flatMap(x=>ys.map(y=>bound(x,y))).filter(r=>!obstacles.some(o=>intersects(r,o)));
  candidates.sort((a,b)=>Math.hypot(a.x-initial.x,a.y-initial.y)-Math.hypot(b.x-initial.x,b.y-initial.y));
  return candidates[0] ?? null;
}
