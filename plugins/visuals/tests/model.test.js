// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import { describe, it, expect } from 'vitest';
import { settings, progress, trackKey, fallbackColor, palette, blend, skyAt, flames, motionAllowed, visualClock } from '../model.js';
const song={title:'One',artist:'Artist',album:'Album',durationMs:100000,elapsedMs:10000,playing:true,rate:1};
describe('song progress',()=>{
  it('extrapolates locally at playback rate, pauses and clamps',()=>{
    expect(progress(song,1000,11000)).toBe(.2);
    expect(progress({...song,rate:2},1000,11000)).toBe(.3);
    expect(progress({...song,playing:false},1000,11000)).toBe(.1);
    expect(progress(song,1000,999)).toBe(.1);
    expect(progress(song,1000,1000000)).toBe(1);
    expect(progress(null,0,100)).toBeNull();
    expect(progress({...song,durationMs:0},0,100)).toBeNull();
  });
  it('identifies track changes without resetting on ordinary progress updates',()=>{
    expect(trackKey(song)).toBe(trackKey({...song,elapsedMs:20000}));
    expect(trackKey(song)).not.toBe(trackKey({...song,title:'Two'}));
    expect(trackKey({...song,title:'Two',elapsedMs:0})).not.toBe(trackKey(song));
    expect(trackKey(null)).toBe('');
  });
});
describe('palette and transitions',()=>{
  it('uses deterministic album/artist fallback and handles missing data',()=>{
    expect(fallbackColor(song)).toEqual(fallbackColor({...song,title:'Other'}));
    expect(fallbackColor(song)).not.toEqual(fallbackColor({...song,album:'Other'}));
    expect(fallbackColor(null).every(n=>n>=0&&n<=255)).toBe(true);
  });
  it('ignores unusable pixels and selects a usable artwork color',()=>{
    expect(palette([0,0,0,255,255,255,255,255,200,100,50,0],[1,2,3])).toEqual([1,2,3]);
    expect(palette([200,100,50,255],[1,2,3])).toEqual([200,100,50]);
  });
  it('crossfades smoothly and clamps endpoints',()=>{
    expect(blend([0,100,200],[100,200,0],.5)).toEqual([50,150,100]);
    expect(blend([0,0,0],[100,100,100],10)).toEqual([100,100,100]);
  });
});
describe('clock-only sky and gentle fire',()=>{
  it('has day/night arcs, night stars, and continuous midnight/sunrise colors',()=>{
    expect(skyAt(12)).toMatchObject({daylight:true,stars:0,x:.5});
    expect(skyAt(0).daylight).toBe(false);expect(skyAt(0).stars).toBe(1);
    expect(skyAt(24)).toEqual(skyAt(0));
    expect(skyAt(7-1e-6).top).toEqual(skyAt(7).top);
    for(let h=0;h<24;h+=.25){const s=skyAt(h);expect(s.x).toBeGreaterThanOrEqual(.08);expect(s.y).toBeGreaterThanOrEqual(.14);}
  });
  it('keeps flames bounded, deterministic and smooth between frames',()=>{
    expect(flames(4)).toEqual(flames(4));
    for(let t=0;t<100;t+=.4)for(const f of flames(t)){expect(f.height).toBeGreaterThan(.1);expect(f.height).toBeLessThan(.3);}
    flames(2).forEach((f,i)=>expect(Math.abs(f.height-flames(2+1/24)[i].height)).toBeLessThan(.01));
  });
});
describe('settings and freeze policy',()=>{
  it('sanitizes untrusted persisted options',()=>{
    expect(settings({effect:'bad',brightness:Infinity,enabled:'yes'})).toEqual(settings(null));
    expect(settings({effect:'sky',brightness:.3,enabled:false})).toEqual({effect:'sky',brightness:.3,enabled:false});
  });
  it('freezes visual time in calm/reduced/hidden states and resumes without jumping',()=>{
    for(const [surface,reduced] of [[{visible:false,calm:false},false],[{visible:true,calm:true},false],[{visible:true,calm:false},true]])expect(motionAllowed(surface,reduced)).toBe(false);
    expect(motionAllowed({visible:true,calm:false},false)).toBe(true);
    let clock={wall:0,time:0};clock=visualClock(clock,500,true);expect(clock.time).toBe(500);
    clock=visualClock(clock,10000,false);expect(clock.time).toBe(500);
    clock=visualClock(clock,10040,true);expect(clock.time).toBe(540);
  });
});
