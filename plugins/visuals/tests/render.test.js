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
it('traces the video border clockwise from its top-left by perimeter distance',()=>{
  const rect={x:20,y:30,w:200,h:100};
  for(const [amount,end] of [[1/6,[120,30]],[1/3,[220,30]],[.5,[220,130]],[2/3,[120,130]],[5/6,[20,130]],[1,[20,30]]]){
    const ctx=context();drawProgress(ctx,400,240,amount,[1,2,3],rect);
    expect(ctx.calls.find(c=>c[0]==='moveTo')).toEqual(['moveTo',20,30]);
    expect(ctx.calls.filter(c=>c[0]==='lineTo').at(-1)).toEqual(['lineTo',...end]);
    expect(ctx.calls.some(c=>c[0]==='stroke')).toBe(true);
    expect(ctx.calls.some(c=>c[0]==='clip'||c[0]==='fillRect'||c[0]==='strokeRect')).toBe(false);
  }
});
it('preserves the v0 page-margin sweep when the video rect is missing or unusable',()=>{
  const fallback=context();drawProgress(fallback,400,240,.5,[1,2,3]);
  expect(fallback.calls.find(c=>c[0]==='moveTo')).toEqual(['moveTo',200,120]);
  expect(fallback.calls).toContainEqual(['strokeRect',2,2,396,236]);
  expect(fallback.calls).toContainEqual(['clip']);
  for(const rect of [null,{x:20,y:30,w:0,h:100},{x:NaN,y:30,w:200,h:100}]){
    const ctx=context();drawProgress(ctx,400,240,.5,[1,2,3],rect);expect(ctx.calls).toEqual(fallback.calls);
  }
});
