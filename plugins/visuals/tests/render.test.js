// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import { it, expect } from 'vitest';
import { drawGlow, drawProgress, drawSky, drawFire } from '../render.js';
function context(){const calls=[];const gradient={addColorStop(...args){calls.push(args);}};return new Proxy({calls,createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},{get:(target,key)=>key in target?target[key]:(...args)=>{calls.push([key,...args]);}});}
it('draws bounded scenes at tiny and target sizes without non-finite coordinates',()=>{
  for(const [w,h] of [[4,4],[438,259]]){
    const ctx=context();drawGlow(ctx,w,h,[90,150,200]);
    for(const amount of [0,.2,.7,1,null])drawProgress(ctx,w,h,amount,[200,100,50]);
    for(const hour of [0,6,12,18,23.99])drawSky(ctx,w,h,hour);
    drawFire(ctx,w,h,12);
    expect(ctx.calls.length).toBeGreaterThan(100);
    for(const call of ctx.calls)for(const value of call)if(typeof value==='number')expect(Number.isFinite(value)).toBe(true);
  }
});
it('does not draw progress when no duration is known or progress is zero',()=>{
  const ctx=context();drawProgress(ctx,438,259,null,[1,2,3]);drawProgress(ctx,438,259,0,[1,2,3]);expect(ctx.calls).toEqual([]);
});
