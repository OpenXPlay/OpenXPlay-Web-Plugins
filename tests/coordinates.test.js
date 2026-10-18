// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import {it,expect} from 'vitest';
import {frameScale,layoutDelta} from '../shared/coordinates.js';
it.each([0.5,0.75,1,1.5,2])('keeps rendered dock and companion motion equal to screen motion at scale %s',scale=>{
 const measured=frameScale({width:1000*scale,height:600*scale},1000,600);
 for(const start of [{x:24,y:100},{x:400,y:200}]) {
  const delta=layoutDelta({dx:80,dy:-30},measured);
  expect((start.x+delta.dx-start.x)*scale).toBeCloseTo(80);
  expect((start.y+delta.dy-start.y)*scale).toBeCloseTo(-30);
 }
});
it('handles per-axis transforms and defaults invalid or absent geometry to scale 1',()=>{
 expect(layoutDelta({dx:40,dy:30},frameScale({width:500,height:150},1000,600))).toEqual({dx:80,dy:120});
 for(const scale of [undefined,{x:0,y:NaN},{x:-1,y:Infinity}])expect(layoutDelta({dx:40,dy:30},scale)).toEqual({dx:40,dy:30});
 expect(frameScale({width:0,height:NaN},0,0)).toEqual({x:1,y:1});
});
it('recomputes deltas from cumulative pointer movement without compounding the scale',async()=>{
 const {dragPosition}=await import('../host/layout.js');
 const scale=frameScale({width:438,height:259},876,518),start={x:500,y:300};
 expect(dragPosition(start,{dx:-30,dy:-20},scale)).toEqual({x:440,y:260});
 expect(dragPosition(start,{dx:-60,dy:-40},scale)).toEqual({x:380,y:220});
 expect(dragPosition(start,{dx:0,dy:0},scale)).toEqual(start);
});
