// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import { it,expect,vi,afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { connect } from '../sdk/oxp-plugin-sdk';
function environment() {
  const listeners=new Set<(e: MessageEvent)=>void>(),sent:Record<string,unknown>[]=[];
  const parent={postMessage:(m:Record<string,unknown>)=>sent.push(m)};
  const win={parent,addEventListener:(_:string,fn:(e:MessageEvent)=>void)=>listeners.add(fn),removeEventListener:(_:string,fn:(e:MessageEvent)=>void)=>listeners.delete(fn)};
  vi.stubGlobal('window',win);
  const receive=(data:unknown,source:unknown=parent)=>{for(const fn of listeners)fn({data,source} as MessageEvent);};
  return {sent,receive,win,parent,listeners};
}
const welcome={oxp:'plugin/0',type:'welcome',pluginId:'org.openxplay.fixture',surface:{id:'widget',kind:'companion',w:120,h:120},permissions:['session','storage'],locale:'en',theme:'dark',reducedMotion:false,parked:'unknown',state:{session:{carplay:'connected'}}};
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it('handshakes only with parent and answers pings',async()=>{const e=environment(),promise=connect();expect(e.sent[0].type).toBe('hello');e.receive(welcome,{});e.receive({...welcome,surface:{w:-1}});expect(e.sent).toHaveLength(1);e.receive(welcome);const oxp=await promise;expect(oxp.state.session?.carplay).toBe('connected');expect(oxp.surface.size).toEqual({w:120,h:120});e.receive({oxp:'plugin/0',type:'ping',seq:3});expect(e.sent.at(-1)).toEqual({oxp:'plugin/0',type:'pong',seq:3});oxp.disconnect();expect(e.listeners.size).toBe(0);});
it('updates topics, surface environment, parked and quick actions',async()=>{const e=environment(),promise=connect();e.receive(welcome);const oxp=await promise;const states:unknown[]=[],changes:unknown[]=[],actions:unknown[]=[];const off=oxp.on('session',v=>states.push(v));oxp.surface.onChange(v=>changes.push(v));oxp.quickActions.on('tap',()=>actions.push(1));e.receive({oxp:'plugin/0',type:'state',topic:'session',value:{carplay:'bad'}});e.receive({oxp:'plugin/0',type:'state',topic:'session',value:null});expect(states).toEqual([null]);off();e.receive({oxp:'plugin/0',type:'surface',w:80,h:80,visible:true,calm:true,locale:'zh-CN',theme:'light',reducedMotion:true});e.receive({oxp:'plugin/0',type:'parked',value:'confirmed'});e.receive({oxp:'plugin/0',type:'quick-action',id:'tap'});expect(oxp.parked).toBe('confirmed');expect(oxp.locale).toBe('zh-CN');expect(oxp.theme).toBe('light');expect(oxp.reducedMotion).toBe(true);expect(oxp.surface.calm).toBe(true);expect(changes.length).toBe(2);expect(actions).toEqual([1]);oxp.surface.open('panel');expect(e.sent.at(-1)?.surface).toBe('panel');oxp.surface.close();expect(e.sent.at(-1)?.type).toBe('close');expect(()=>oxp.quickActions.setState('tap',{badge:'1234'})).toThrow();oxp.disconnect();});
it('correlates concurrent storage responses and errors',async()=>{const e=environment(),promise=connect();e.receive(welcome);const oxp=await promise;const get=oxp.storage.get(),id=e.sent.at(-1)?.id;const set=oxp.storage.set({x:1}),setId=e.sent.at(-1)?.id;e.receive({oxp:'plugin/0',type:'storage-ok',id:setId});await set;e.receive({oxp:'plugin/0',type:'storage',id,value:{x:2}});expect(await get).toEqual({x:2});const fail=oxp.storage.set({x:2}),error=expect(fail).rejects.toThrow('rate');e.receive({oxp:'plugin/0',type:'error',id:e.sent.at(-1)?.id,code:'rate'});await error;oxp.disconnect();});
it('times out handshake and storage; disconnect rejects pending work',async()=>{vi.useFakeTimers();const e=environment();const failed=expect(connect()).rejects.toThrow('timed out');await vi.advanceTimersByTimeAsync(10000);await failed;const promise=connect();e.receive(welcome);const oxp=await promise;const pending=expect(oxp.storage.get()).rejects.toThrow('timed out');await vi.advanceTimersByTimeAsync(10000);await pending;const disconnected=expect(oxp.storage.get()).rejects.toThrow('Disconnected');oxp.disconnect();await disconnected;});
it('delivers only ImageBitmap artwork',async()=>{class Bitmap{}vi.stubGlobal('ImageBitmap',Bitmap);const e=environment(),promise=connect();e.receive(welcome);const oxp=await promise;const images:unknown[]=[];oxp.onArtwork(v=>images.push(v));e.receive({oxp:'plugin/0',type:'artwork',bitmap:{}});const bitmap=new Bitmap();e.receive({oxp:'plugin/0',type:'artwork',bitmap});expect(images).toEqual([bitmap]);oxp.disconnect();});
it('exposes optional geometry and closing signals and requests placement',async()=>{
  const e=environment(),promise=connect();const video={x:-30,y:-40,w:840,h:494},viewport={w:876,h:518};
  e.receive({...welcome,video,viewport});const oxp=await promise;
  expect(oxp.surface.video).toEqual(video);expect(oxp.surface.viewport).toEqual(viewport);
  const change=vi.fn();oxp.surface.onChange(change);
  e.receive({oxp:'plugin/0',type:'surface',w:80,h:70,calm:true,visible:false,closing:true,anchor:'bottom-left',video:{...video,x:-10},viewport});
  expect(oxp.surface.closing).toBe(true);expect(oxp.surface.video?.x).toBe(-10);expect(change).toHaveBeenCalled();
  oxp.surface.request({anchor:'bottom-right',size:{w:100,h:80}});
  expect(e.sent.at(-1)).toEqual({oxp:'plugin/0',type:'surface-request',anchor:'bottom-right',size:{w:100,h:80}});oxp.disconnect();
});
it('reports companion drag messages and removes element listeners on disconnect',async()=>{
  vi.useFakeTimers();const e=environment(),promise=connect();e.receive(welcome);const oxp=await promise;
  const handlers=new Map<string,(event:unknown)=>void>();let captured:number|undefined;
  const element={style:{},addEventListener:(k:string,fn:(event:unknown)=>void)=>handlers.set(k,fn),removeEventListener:(k:string)=>handlers.delete(k),setPointerCapture:(id:number)=>{captured=id;},hasPointerCapture:(id:number)=>captured===id,releasePointerCapture:()=>{captured=undefined;}};
  oxp.surface.enableDrag(element as unknown as HTMLElement);
  handlers.get('pointerdown')?.({pointerId:1,button:0,screenX:500,screenY:400});
  handlers.get('pointermove')?.({pointerId:1,screenX:509,screenY:400,preventDefault:()=>{}});
  expect(e.sent.at(-2)).toEqual({oxp:'plugin/0',type:'surface-request',move:{phase:'start',dx:0,dy:0}});
  handlers.get('pointermove')?.({pointerId:1,screenX:600,screenY:350,preventDefault:()=>{}});
  expect(e.sent.at(-1)?.move).toEqual({phase:'move',dx:100,dy:-50});
  oxp.disconnect();expect(e.sent.at(-1)?.move).toEqual({phase:'end',dx:100,dy:-50});expect(handlers.size).toBe(0);
});
it('exposes availability independently of null and removes cached values on topics changes',async()=>{
  const e=environment(),promise=connect();e.receive({...welcome,topics:['session','motion','parked'],state:{session:null,motion:null,parked:{state:'unknown',confirmedBy:null}}});const oxp=await promise;
  expect(oxp.available('motion')).toBe(true);expect(oxp.state.motion).toBe(null);expect(oxp.available('route')).toBe(false);
  const changed:unknown[]=[];oxp.on('topics',value=>changed.push(value));
  e.receive({oxp:'plugin/0',type:'state',topic:'motion',value:{speedMps:4,accuracyM:1,source:'vehicle'}});expect(oxp.state.motion?.speedMps).toBe(4);
  e.receive({oxp:'plugin/0',type:'topics',topics:['session','parked']});expect(oxp.state).not.toHaveProperty('motion');expect(oxp.available('motion')).toBe(false);expect(changed).toEqual([['session','parked']]);oxp.disconnect();
});

it('validates relay route vectors on welcome and state delivery',async()=>{
  const fixture=JSON.parse(readFileSync('spec/vectors/provider-relay.json','utf8'));
  for(const vector of fixture.vectors.filter((v: {topic: string})=>v.topic==='route')) {
    const e=environment(),promise=connect();
    e.receive({...welcome,topics:['route'],state:{route:vector.value}});const oxp=await promise;
    expect(Object.hasOwn(oxp.state,'route'),vector.name).toBe(vector.valid);
    if(vector.valid)expect(oxp.state.route).toEqual(vector.value);
    const received:unknown[]=[];oxp.on('route',value=>received.push(value));
    e.receive({oxp:'plugin/0',type:'state',topic:'route',value:vector.value});
    expect(received,vector.name).toEqual(vector.valid?[vector.value]:[]);oxp.disconnect();
  }
});
