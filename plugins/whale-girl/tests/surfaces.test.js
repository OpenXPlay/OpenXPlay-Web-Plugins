// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import {it, expect, vi, afterEach} from 'vitest';
const runtime = vi.hoisted(() => ({sdk:null}));
vi.mock('../oxp-plugin-sdk.js', () => ({connect:async()=>runtime.sdk}));
let cleanup;
async function setup(kind='companion', stored=null) {
  vi.useFakeTimers(); vi.resetModules();
  const callbacks={}, events={}, draw=vi.fn();
  class Element {
    children=[];style={};attributes={};textContent='';hidden=false;disabled=false;listeners={};
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children=nodes; }
    setAttribute(k,v) { this.attributes[k]=v; }
    addEventListener(k,fn) { this.listeners[k]=fn; }
    removeEventListener(k) { delete this.listeners[k]; }
    getContext() { return {setTransform:vi.fn(),clearRect:vi.fn(),drawImage:draw}; }
    click() { return this.listeners.click?.() ?? this.onclick?.(); }
  }
  const elements=Object.fromEntries(['pet','heart','canvas','title','close','settings-tab','credits-tab','content','status'].map(id=>[id,new Element()]));
  vi.stubGlobal('document',{hidden:false,documentElement:{},querySelector:key=>elements[key.replace('#','')],createElement:()=>new Element(),addEventListener:(k,fn)=>events[k]=fn,removeEventListener:k=>delete events[k]});
  vi.stubGlobal('window',{addEventListener:(k,fn)=>events[k]=fn});
  vi.stubGlobal('Image',class {async decode() {}});
  vi.stubGlobal('devicePixelRatio',1);
  const media={matches:false,addEventListener:(k,fn)=>callbacks.motion=fn,removeEventListener:vi.fn()};
  vi.stubGlobal('matchMedia',()=>media);
  const sdk={locale:'zh-CN',reducedMotion:false,parked:'unknown',state:{},
    surface:{enableDrag:vi.fn(),kind,w:136,h:136,visible:true,calm:false,request:vi.fn(),open:vi.fn(),close:vi.fn(),onChange:fn=>{callbacks.surface=fn;return vi.fn();}},
    storage:{get:vi.fn(async()=>stored),set:vi.fn(async()=>{})},
    quickActions:{on:(k,fn)=>{callbacks[k]=fn;return vi.fn();},setState:vi.fn()},
    on:(k,fn)=>{callbacks[k]=fn;return vi.fn();},disconnect:vi.fn()};
  runtime.sdk=sdk;
  await import(kind==='panel'?'../panel.js':'../companion.js');
  await Promise.resolve(); await Promise.resolve();
  cleanup=()=>events.pagehide?.();
  return {sdk,elements,callbacks,events,draw,media};
}
afterEach(()=>{cleanup?.();cleanup=null;vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();});
it('requests saved placement, scales smoothly, handles Pat and expires its heart',async()=>{
  const e=await setup('companion',{size:112,corner:'top-left'});
  expect(e.sdk.surface.request).toHaveBeenLastCalledWith({anchor:'top-left',size:{w:112,h:112}});
  expect(e.elements.canvas.style.imageRendering).toBe('auto');
  expect(e.elements.pet.attributes['aria-label']).toBe('摸摸鲸鱼娘');
  e.callbacks.pat();expect(e.elements.heart.hidden).toBe(false);
  expect(e.sdk.quickActions.setState).toHaveBeenLastCalledWith('pat',{badge:'♥'});
  await vi.advanceTimersByTimeAsync(1700);expect(e.elements.heart.hidden).toBe(true);
  expect(e.sdk.quickActions.setState).toHaveBeenLastCalledWith('pat',{badge:''});
});
it('stops every scheduled callback while calm, hidden, reduced motion or closing',async()=>{
  const e=await setup();
  expect(vi.getTimerCount()).toBeGreaterThan(0);
  for(const flags of [{calm:true},{visible:false},{closing:true}]) {
    Object.assign(e.sdk.surface,{calm:false,visible:true,closing:false},flags);e.callbacks.surface();
    await Promise.resolve();expect(vi.getTimerCount()).toBe(0);
  }
  Object.assign(e.sdk.surface,{visible:true,closing:false});e.media.matches=true;e.callbacks.motion();
  expect(vi.getTimerCount()).toBe(0);
  e.callbacks.pat();expect(e.elements.heart.hidden).toBe(true);
  e.media.matches=false;e.callbacks.motion();expect(vi.getTimerCount()).toBeGreaterThan(0);
  e.events.pagehide();expect(vi.getTimerCount()).toBe(0);
});
it('renders no more than 24 times a second and keeps its canvas inside host bounds',async()=>{
  const e=await setup();e.draw.mockClear();
  await vi.advanceTimersByTimeAsync(1000);expect(e.draw.mock.calls.length).toBeLessThanOrEqual(24);
  Object.assign(e.sdk.surface,{w:80,h:70});e.callbacks.surface();
  expect(e.elements.canvas.width).toBe(80);expect(e.elements.canvas.height).toBe(70);
});
it('paginates all credits with taps and saves choices before opening the companion',async()=>{
  const e=await setup('panel');
  expect(e.elements.title.textContent).toBe('鲸鱼娘');
  e.elements['credits-tab'].onclick();
  expect(e.elements.content.children[0].textContent).toContain('上善无形');
  for(let i=0;i<4;i++)e.elements.content.children[1].children[1].click();
  expect(e.elements.content.children[0].textContent).toContain('不得用于商业用途');
  e.elements['settings-tab'].onclick();
  e.elements.content.children[0].click();
  e.elements.content.children[2].children[0].click();
  const apply=e.elements.content.children[3];apply.click();
  await Promise.resolve();await Promise.resolve();
  expect(e.sdk.storage.set).toHaveBeenCalledWith({size:160,corner:'top-left'});
  expect(e.sdk.surface.open).toHaveBeenCalledWith('companion');expect(e.sdk.surface.close).toHaveBeenCalled();
});
it('shows a failed save and keeps the settings panel reviewable',async()=>{
  const e=await setup('panel');e.sdk.storage.set.mockRejectedValue(new Error('offline store'));
  e.elements.content.children[3].click();await Promise.resolve();await Promise.resolve();
  expect(e.elements.status.textContent).toContain('保存失败');expect(e.sdk.surface.open).not.toHaveBeenCalled();
});
