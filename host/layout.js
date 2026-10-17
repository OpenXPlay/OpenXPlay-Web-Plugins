// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import { placeFree, validPosition } from '../shared/positions.js';

export function clamp(rect, viewport) {
  const x = Math.max(0, Math.min(viewport.w, rect.x)), y = Math.max(0, Math.min(viewport.h, rect.y));
  return { x, y, w: Math.max(0, Math.min(viewport.w, rect.x + rect.w) - x), h: Math.max(0, Math.min(viewport.h, rect.y + rect.h) - y) };
}
export function unionArea(rects) {
  const xs = [...new Set(rects.flatMap(r => [r.x, r.x + r.w]))].sort((a,b) => a-b);
  let area = 0;
  for (let i = 1; i < xs.length; i++) {
    const spans = rects.filter(r => r.x < xs[i] && r.x + r.w > xs[i-1]).map(r => [r.y, r.y + r.h]).sort((a,b) => a[0]-b[0]);
    let end = -Infinity, height = 0;
    for (const [lo, hi] of spans) { height += Math.max(0, hi - Math.max(lo, end)); end = Math.max(end, hi); }
    area += height * (xs[i]-xs[i-1]);
  }
  return area;
}
export function dockSize(gear) {
  const size = value => Number.isFinite(value) && value > 0 ? value : 48;
  return {w:size(gear?.w),h:size(gear?.h)};
}
export function dockRect({ viewport: v, gear: g, dockPosition }, count = 1) {
  const size = dockSize(g);
  const w = Math.min(v.w, count * (size.w + 4) - 4), h = Math.min(size.h, v.h);
  const initial={ x: g.side === 'right' ? g.x - w - (g.gap ?? 8) : g.x + g.w + (g.gap ?? 8), y: Math.min(g.y, v.h - h), w, h };
  // Attached controls share the gear's edge inset; free drags use the safety margin.
  const free=validPosition(dockPosition);
  return placeFree({...initial,...(free?dockPosition:{})},v,[g],free?24:0) ?? {x:0,y:0,w:0,h:0};
}
export function margins(v, video) {
  const r = clamp(video, v);
  return [{x:0,y:0,w:v.w,h:r.y},{x:0,y:r.y+r.h,w:v.w,h:v.h-r.y-r.h},{x:0,y:r.y,w:r.x,h:r.h},{x:r.x+r.w,y:r.y,w:v.w-r.x-r.w,h:r.h}].filter(r => r.w > 0 && r.h > 0);
}
export function surfaceRects(surface, geometry, calm = false, index = 0) {
  const { viewport: v, video } = geometry;
  if (surface.kind === 'ambient') return margins(v, video);
  if (surface.kind === 'fullscreen') return [{ x:0, y:0, w:v.w, h:v.h }];
  if (surface.kind === 'panel') return [{ x:24, y:24, w:Math.max(0,v.w * .4 - 48), h:Math.max(0,v.h-48) }];
  const w = Math.min(calm ? 80 : 160, surface.size?.w ?? 120, v.w), h = Math.min(calm ? 80 : 160, surface.size?.h ?? 120, v.h);
  const anchor = surface.anchor ?? (index ? 'bottom-left' : 'top-left');
  const place=r=>({...r,x:Math.max(0,Math.min(v.w-r.w,r.x)),y:Math.max(0,Math.min(v.h-r.h,r.y))});
  const initial=place({ x:anchor.includes('right') ? v.w-w-24 : anchor === 'top' || anchor === 'bottom' ? (v.w-w)/2 : 24, y:anchor.includes('bottom') ? v.h-h-24 : anchor==='left'||anchor==='right' ? (v.h-h)/2 : 24, w,h });
  const obstacles=[geometry.gear,geometry.dock ?? dockRect(geometry)].filter(Boolean);
  const free=placeFree({...initial,...(validPosition(surface.position)?surface.position:{})},v,obstacles);
  return free ? [free] : [];
}
export function overlaps(a,b) { return a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y; }
export function subtract(rect, obstacle) {
  if (!obstacle || !overlaps(rect,obstacle)) return [rect];
  const x=Math.max(rect.x,obstacle.x), y=Math.max(rect.y,obstacle.y), right=Math.min(rect.x+rect.w,obstacle.x+obstacle.w), bottom=Math.min(rect.y+rect.h,obstacle.y+obstacle.h);
  return [{x:rect.x,y:rect.y,w:rect.w,h:y-rect.y},{x:rect.x,y:bottom,w:rect.w,h:rect.y+rect.h-bottom},{x:rect.x,y,w:x-rect.x,h:bottom-y},{x:right,y,w:rect.x+rect.w-right,h:bottom-y}].filter(r=>r.w>0&&r.h>0);
}
export function enforceLayout(regions, cover, viewport, dock, gear, launcher) {
  // Only the host launcher is exempt; plugin regions retain their own union budget.
  const modal=cover==='panel' && launcher && regions.find(r=>['x','y','w','h'].every(k=>r[k]===launcher[k]));
  const clean = regions.filter(r=>r!==modal).map(r => clamp(r, viewport)).filter(r => r.w && r.h);
  const bounded=cover !== 'fullscreen' && unionArea(clean) > viewport.w * viewport.h * .4 ? dock.map(r => clamp(r, viewport)) : clean;
  return [...bounded,...(modal?[clamp(modal,viewport)]:[])].flatMap(r=>subtract(r,gear));
}
export function clipPath(regions) {
  return regions.length ? `path('${regions.map(r => `M${r.x} ${r.y}h${r.w}v${r.h}h-${r.w}Z`).join(' ')}')` : 'inset(100%)';
}

export function planLayout(loaded,geometry,{opened=false,visible=true,calm=false,pins=0}={}) {
  const dock=dockRect(geometry,1+pins), v=geometry.viewport;
  const width=Math.max(0,Math.min(v.w-48,Math.max(280,Math.min(640,v.w*.7))));
  let launcher={x:24,y:24,w:width,h:Math.max(0,v.h-48)};
  const obstacles=[geometry.gear,dock];
  launcher=placeFree(launcher,v,obstacles) ?? obstacles.reduce((regions,obstacle)=>regions.flatMap(r=>subtract(r,obstacle)),[launcher]).sort((a,b)=>b.w*b.h-a.w*a.h)[0] ?? {...launcher,w:0,h:0};
  geometry={...geometry,dock};
  if (!visible || calm) return {dock,launcher,regions:visible?[dock]:[],cover:'none',surfaces:loaded.filter(s=>['companion','ambient'].includes(s.kind)),shown:[]};
  const fullscreen=loaded.find(s=>s.kind==='fullscreen');
  if (fullscreen && !opened) return {dock,launcher,regions:[{x:0,y:0,w:v.w,h:v.h}],cover:'fullscreen',surfaces:[fullscreen],shown:[fullscreen]};
  let regions=[dock,...(opened?[launcher]:[])], selected=[],cover=opened?'panel':'none';
  const coverSurface=loaded.find(s=>s.kind==='panel');
  const candidates=[...(coverSurface&&!opened?[coverSurface]:[]),...loaded.filter(s=>!['fullscreen','panel'].includes(s.kind))];
  for (const surface of candidates) {
    const rects=surfaceRects(surface,geometry,calm,loaded.indexOf(surface));
    const all=[...regions,...rects];
    const pluginRegions=opened?all.filter(r=>r!==launcher):all;
    if (!rects.length || unionArea(pluginRegions)>v.w*v.h*.4) continue;
    // Obscured surfaces receive no region; the host retains their frame and reports visible:false.
    const sheet=opened?launcher:coverSurface&&selected.includes(coverSurface)?surfaceRects(coverSurface,geometry)[0]:null;
    if (surface.kind!=='panel' && sheet && rects.every(r=>r.x>=sheet.x && r.y>=sheet.y && r.x+r.w<=sheet.x+sheet.w && r.y+r.h<=sheet.y+sheet.h)) continue;
    regions=all; selected.push(surface); if(surface.kind==='panel')cover='panel';
  }
  return {dock,launcher,regions,cover,surfaces:selected,shown:selected};
}
