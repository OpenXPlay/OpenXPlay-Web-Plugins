// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import { it, expect, vi, afterEach } from 'vitest';
const runtime=vi.hoisted(()=>({host:null}));
vi.mock('../oxp-plugin-sdk.js',()=>({connect:async()=>runtime.host}));
function environment(kind='ambient'){
  vi.useFakeTimers();vi.resetModules();
  const callbacks={},actions={},elements={},frames=[];
  function element(){return {textContent:'',children:[],setAttribute:vi.fn(),append(...items){this.children.push(...items);},replaceChildren(){this.children=[];},getContext:()=>context};}
  const gradient={addColorStop:vi.fn()};
  const context=new Proxy({createRadialGradient:()=>gradient,createLinearGradient:()=>gradient},{get:(t,k)=>t[k]??vi.fn()});
  for(const selector of ['canvas','h1','#hint','#choices','#options','#status','#sound','#close','#song p'])elements[selector]=element();
  vi.stubGlobal('document',{hidden:false,documentElement:{},querySelector:key=>elements[key],createElement:element,addEventListener:vi.fn()});
  vi.stubGlobal('window',{addEventListener:vi.fn()});vi.stubGlobal('requestAnimationFrame',fn=>frames.push(fn));
  const host={state:{nowPlaying:null},locale:'zh-CN',reducedMotion:false,parked:kind==='fireplace'?'confirmed':'unknown',
    surface:{kind,w:876,h:518,visible:true,calm:false,onChange:fn=>callbacks.surface=fn,open:vi.fn(),close:vi.fn()},
    on:(key,fn)=>callbacks[key]=fn,onArtwork:fn=>callbacks.artwork=fn,
    storage:{get:vi.fn(async()=>null),set:vi.fn(async()=>{})},
    quickActions:{on:(key,fn)=>actions[key]=fn,setState:vi.fn()},disconnect:vi.fn()};
  runtime.host=host;return {host,callbacks,actions,elements,frames};
}
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();});
it('coalesces dock toggles, persists the final state, and releases artwork',async()=>{
  const e=environment();await import('../ambient.js');
  expect(e.host.quickActions.setState).toHaveBeenCalledWith('toggle',{active:true});
  e.actions.toggle();e.actions.toggle();e.actions.toggle();
  expect(e.host.storage.set).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(2100);
  expect(e.host.storage.set).toHaveBeenCalledExactlyOnceWith({enabled:false,effect:'progress',brightness:.6});
  const bitmap={close:vi.fn()};e.callbacks.artwork(bitmap);expect(bitmap.close).toHaveBeenCalledOnce();
});
it('has tap-only paged options, localizes, saves then opens ambient',async()=>{
  const e=environment('panel');await import('../panel.js');
  expect(e.elements.h1.textContent).toBe('静谧光景');expect(e.elements['#choices'].children).toHaveLength(3);
  e.elements['#choices'].children[2].onclick();
  e.elements['#options'].children[0].onclick();
  e.elements['#choices'].children[2].onclick();expect(e.host.surface.open).not.toHaveBeenCalled();
  expect(e.elements['#status'].textContent).toContain('驻车');
  await e.elements['#options'].children[1].onclick();
  expect(e.host.storage.set).toHaveBeenCalledWith({enabled:true,effect:'sky',brightness:.6});
  expect(e.host.surface.open).toHaveBeenCalledWith('ambient');expect(e.host.surface.close).toHaveBeenCalledOnce();
});
it('starts fireplace audio off and closes when parked confirmation is lost',async()=>{
  const e=environment('fireplace');await import('../fireplace.js');
  expect(e.elements['#sound'].textContent).toBe('柴火声：关');
  expect(e.host.surface.close).not.toHaveBeenCalled();
  e.host.parked='unknown';e.callbacks.surface();expect(e.host.surface.close).toHaveBeenCalledOnce();
});
it('redraws the progress border with current video coordinates after resize and orientation updates',async()=>{
  const e=environment();e.host.state.nowPlaying={title:'Track',artist:'Artist',album:'Album',durationMs:1000,elapsedMs:500,playing:false,rate:1};
  const calls=[],gradient={addColorStop:vi.fn()};
  const ctx=new Proxy({moveTo:(...p)=>calls.push(['moveTo',...p]),lineTo:(...p)=>calls.push(['lineTo',...p]),createRadialGradient:()=>gradient},{get:(t,k)=>t[k]??vi.fn()});
  e.elements.canvas.getContext=()=>ctx;
  e.host.surface.video={x:20,y:30,w:800,h:450};
  await import('../ambient.js');
  e.frames.shift()(1000);
  expect(calls).toContainEqual(['moveTo',10,15]);expect(calls).toContainEqual(['lineTo',410,240]);
  for(const [w,h,video] of [[1001,601,{x:40,y:60,w:900,h:500}],[601,1001,{x:10,y:20,w:580,h:950}]]){
    calls.length=0;Object.assign(e.host.surface,{w,h,video});e.callbacks.surface();
    await vi.advanceTimersByTimeAsync(250);e.frames.shift()(2000+h);
    const sx=Math.round(w/2)/w,sy=Math.round(h/2)/h;
    const start=calls.find(c=>c[0]==='moveTo');expect(start[1]).toBeCloseTo(video.x*sx);expect(start[2]).toBeCloseTo(video.y*sy);
    const end=calls.filter(c=>c[0]==='lineTo').at(-1);expect(end[1]).toBeCloseTo((video.x+video.w)*sx);expect(end[2]).toBeCloseTo((video.y+video.h)*sy);
  }
});
