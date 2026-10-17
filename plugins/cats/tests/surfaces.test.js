// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import {it,expect,vi,afterEach} from 'vitest';
const runtime=vi.hoisted(()=>({host:null}));
vi.mock('../oxp-plugin-sdk.js',()=>({connect:async()=>runtime.host}));
function setup(kind='companion',stored=null) {
  vi.useFakeTimers();vi.resetModules();
  const callbacks={},actions={},events={};
  const drawImage=vi.fn(),context=new Proxy({drawImage},{get:(o,k)=>o[k]??(()=>{})});
  function element(tag='main') {
    return {tag,style:{},dataset:{},children:[],textContent:'',setAttribute:vi.fn(),
      append(...items){this.children.push(...items);},replaceChildren(){this.children=[];},getContext:()=>context};
  }
  const root=element();
  vi.stubGlobal('Image',class {complete=true;naturalWidth=390;});
  vi.stubGlobal('document',{hidden:false,body:{},documentElement:{},querySelector:()=>root,createElement:element,
    addEventListener:(k,f)=>events[k]=f,removeEventListener:vi.fn()});
  vi.stubGlobal('window',{addEventListener:(k,f)=>events[k]=f});
  vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}));
  vi.stubGlobal('requestAnimationFrame',fn=>setTimeout(()=>fn(performance.now()),16));
  vi.stubGlobal('cancelAnimationFrame',clearTimeout);
  const host={state:{},locale:'zh-CN',reducedMotion:false,parked:kind==='fullscreen'?'confirmed':'unknown',
    surface:{enableDrag:vi.fn(),id:kind==='companion'?'companion':'settings',kind,w:160,h:160,visible:true,calm:false,
      onChange:fn=>{callbacks.surface=fn;return ()=>{};},open:vi.fn(),close:vi.fn(),request:vi.fn()},
    storage:{get:vi.fn(async()=>stored),set:vi.fn(async value=>{stored=value;})},
    quickActions:{on:(id,fn)=>{actions[id]=fn;return ()=>{};},setState:vi.fn()},
    on:(topic,fn)=>{callbacks[topic]=fn;return ()=>{};},disconnect:vi.fn()};
  runtime.host=host;
  const find=(text,node=root)=>node.textContent===text?node:node.children.map(e=>find(text,e)).find(Boolean);
  return {host,root,callbacks,actions,events,drawImage,find,setStored:value=>{stored=value;}};
}
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();});
it('handles dock pats with a short badge, cooldown and persistent mood',async()=>{
  const e=setup();await import('../main.js');await Promise.resolve();e.actions.pet();e.actions.pet();
  expect(e.host.quickActions.setState).toHaveBeenCalledWith('pet',{badge:'♥'});
  await vi.advanceTimersByTimeAsync(1600);
  expect(e.host.quickActions.setState).toHaveBeenLastCalledWith('pet',{badge:''});
  expect(e.host.storage.set).toHaveBeenCalledWith(expect.objectContaining({mood:expect.objectContaining({pats:1})}));
});
it('requests the saved corner without reopening or replacing the companion',async()=>{
  const e=setup('companion',{corner:'top-left',breed:'ragdoll'});await import('../main.js');
  expect(e.host.surface.request).toHaveBeenCalledWith({anchor:'top-left'});
  expect(e.host.surface.close).not.toHaveBeenCalled();expect(e.host.surface.open).not.toHaveBeenCalled();
});
it('freezes scheduled work during calm, hidden and reduced motion and resumes safely',async()=>{
  const e=setup();await import('../main.js');await Promise.resolve();
  expect(vi.getTimerCount()).toBeGreaterThan(0);
  e.host.surface.calm=true;e.callbacks.surface();await Promise.resolve();expect(vi.getTimerCount()).toBe(0);
  e.actions.pet();expect(e.host.quickActions.setState).not.toHaveBeenCalledWith('pet',{badge:'♥'});
  e.host.surface.calm=false;e.callbacks.surface();await Promise.resolve();expect(vi.getTimerCount()).toBeGreaterThan(0);
  document.hidden=true;e.events.visibilitychange();await Promise.resolve();expect(vi.getTimerCount()).toBe(0);
  document.hidden=false;e.host.reducedMotion=true;e.callbacks.surface();expect(vi.getTimerCount()).toBe(0);
  const count=e.drawImage.mock.calls.length;await vi.advanceTimersByTimeAsync(5000);expect(e.drawImage).toHaveBeenCalledTimes(count);
});
it('reads settings changes and moves the existing companion to another anchor',async()=>{
  const e=setup();await import('../main.js');await Promise.resolve();
  e.setStored({breed:'silver',corner:'bottom-left'});await vi.advanceTimersByTimeAsync(3100);
  expect(e.host.surface.request).toHaveBeenLastCalledWith({anchor:'bottom-left'});
  expect(e.host.surface.open).not.toHaveBeenCalled();
});
it('localizes settings and preserves mood when saving preferences',async()=>{
  const e=setup('panel',{mood:{pats:8,companyMs:2000}});await import('../main.js');
  expect(e.root.children[0].textContent).toBe('猫咪伙伴');
  const breed=e.find('品种').children[0];breed.value='ragdoll';breed.onchange();
  const name=e.find('名字（可选）').children[0];name.value='Mimi';name.oninput();
  e.find('位置').onclick();
  const size=e.find('大小').children[0];size.value='112';size.onchange();
  const corner=e.root.children[2].children[1].children[0];corner.value='top-left';corner.onchange();
  await e.find('保存并显示').onclick();
  expect(e.host.storage.set).toHaveBeenCalledWith(expect.objectContaining({breed:'ragdoll',name:'Mimi',size:112,corner:'top-left',mood:expect.objectContaining({pats:8})}));
  expect(e.host.surface.open).toHaveBeenCalledWith('companion');
});
it('does not silently save uncommitted preferences on close',async()=>{
  const e=setup('panel',{breed:'silver'});await import('../main.js');
  const breed=e.find('品种').children[0];breed.value='ragdoll';breed.onchange();
  e.host.surface.closing=true;e.callbacks.surface();await Promise.resolve();
  expect(e.host.storage.set).toHaveBeenCalledWith(expect.objectContaining({breed:'silver'}));
});
it('keeps failed saves reviewable and gates the play room on parked mode',async()=>{
  const e=setup('panel');e.host.storage.set.mockRejectedValue(new Error('storage'));await import('../main.js');
  await e.find('保存并显示').onclick();expect(e.find('重试保存')).toBeTruthy();expect(e.host.surface.open).not.toHaveBeenCalled();
  e.find('心情').onclick();expect(e.find('玩耍小屋').disabled).toBe(true);
  e.host.parked='confirmed';e.callbacks.surface();expect(e.find('玩耍小屋').disabled).toBe(false);
});
it('allows parked yarn taps, closes on revocation and queues mood during closing',async()=>{
  const e=setup('fullscreen');await import('../main.js');
  e.find('接毛线球').onclick();expect(e.find('接球次数: 1')).toBeTruthy();
  e.host.parked='unknown';e.callbacks.surface();expect(e.host.surface.close).toHaveBeenCalledOnce();
  e.host.surface.closing=true;e.callbacks.surface();expect(vi.getTimerCount()).toBe(0);
});
it('disposes timers and animator on pagehide',async()=>{
  const e=setup();await import('../main.js');await Promise.resolve();e.events.pagehide();
  expect(vi.getTimerCount()).toBe(0);expect(e.host.disconnect).toHaveBeenCalledOnce();
});

it('preserves companion drag support',async()=>{
  const e=setup();await import('../main.js');expect(e.host.surface.enableDrag).toHaveBeenCalledOnce();
});
