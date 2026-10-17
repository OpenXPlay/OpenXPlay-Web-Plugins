// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

export const clamp = (value, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, value));
export const defaults = Object.freeze({ enabled: true, effect: 'progress', brightness: 0.6 });
export function settings(value) {
  return { enabled: typeof value?.enabled === 'boolean' ? value.enabled : defaults.enabled,
    effect: ['progress', 'album', 'sky'].includes(value?.effect) ? value.effect : defaults.effect,
    brightness: [0.3, 0.6, 0.9].includes(value?.brightness) ? value.brightness : defaults.brightness };
}
export function trackKey(track) { return track ? JSON.stringify([track.title, track.artist, track.album]) : ''; }
export function progress(track, receivedAt, now) {
  if (!track || !(track.durationMs > 0)) return null;
  const elapsed = track.elapsedMs + (track.playing ? Math.max(0, now - receivedAt) * track.rate : 0);
  return clamp(elapsed / track.durationMs);
}
export function fallbackColor(track) {
  const text = track ? `${track.album || track.title}|${track.artist}` : 'Quiet Lights';
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  const hue = hash % 360, c = 0.48, x = c * (1 - Math.abs((hue / 60) % 2 - 1));
  const base = hue < 60 ? [c,x,0] : hue < 120 ? [x,c,0] : hue < 180 ? [0,c,x] : hue < 240 ? [0,x,c] : hue < 300 ? [x,0,c] : [c,0,x];
  return base.map(v => Math.round((v + 0.3) * 255));
}
// Ignore transparent, near-black and near-white pixels; weight chromatic pixels.
export function palette(pixels, fallback) {
  let weight = 0; const sum = [0,0,0];
  for (let i = 0; i < pixels.length; i += 4) {
    const rgb = [pixels[i], pixels[i+1], pixels[i+2]], high = Math.max(...rgb), low = Math.min(...rgb);
    if (pixels[i+3] < 128 || high < 24 || low > 238) continue;
    const w = 0.2 + (high - low) / 255;
    weight += w; rgb.forEach((v,j) => { sum[j] += v * w; });
  }
  return weight ? sum.map(v => Math.round(clamp(v / weight, 45, 220))) : [...fallback];
}
export function blend(from, to, amount) { return from.map((v,i) => Math.round(v + (to[i] - v) * clamp(amount))); }
export function skyAt(hour) {
  const h = ((hour % 24) + 24) % 24;
  const stops = [[0,[12,20,48],[39,44,76]], [5,[20,28,58],[71,63,99]], [7,[82,135,175],[247,177,132]], [12,[63,141,186],[166,215,222]], [17,[84,129,166],[244,170,129]], [19,[35,42,83],[115,76,109]], [24,[12,20,48],[39,44,76]]];
  const index = stops.findIndex((s,i) => i < stops.length-1 && h >= s[0] && h < stops[i+1][0]);
  const a = stops[index], b = stops[index+1], t = (h-a[0])/(b[0]-a[0]);
  const daylight = h >= 6 && h < 18;
  const phase = daylight ? (h-6)/12 : ((h+6)%24)/12;
  return { top:blend(a[1],b[1],t), bottom:blend(a[2],b[2],t), daylight,
    x:0.08+0.84*phase, y:0.85-0.7*Math.sin(Math.PI*phase), stars:clamp((6-h)/1.5) + clamp((h-18)/1.5) };
}
// Smooth low-frequency flame motion: no random per-frame flicker.
export function flames(time, count = 15) {
  return Array.from({length:count}, (_,i) => ({ x:(i+0.5)/count,
    height:0.2+0.07*Math.sin(time*0.8+i*1.7)+0.025*Math.sin(time*1.6+i),
    lean:0.025*Math.sin(time*0.65+i*1.3), width:0.045+0.01*Math.sin(i*2) }));
}
export function motionAllowed({visible, calm}, reducedMotion) { return visible && !calm && !reducedMotion; }
// Local visual time freezes across calm/reduced-motion periods, without a resume jump.
export function visualClock(previous, wall, moving) {
  return { wall, time:previous.time + (moving ? clamp(wall-previous.wall,0,1000) : 0) };
}
