// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import { it,expect,vi,afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
const manifest=JSON.parse(readFileSync('tests/fixtures/valid/oxp-plugin.json'));
const geometry={oxp:'host/0',type:'init',locale:'en',theme:'dark',reducedMotion:false,viewport:{w:876,h:518},video:{x:18,y:12,w:840,h:494},gear:{x:796,y:438,w:56,h:56,side:'right'},channel:'/plugins/channel'};
async function environment(hostPrefs, screenScale, initial=geometry) {
  vi.useFakeTimers();vi.resetModules();let time=0;
  class Element {
    children=[];style={setProperty(k,v){this[k]=v;}};hidden=false;attributes={};messages=[];
    constructor(tag='div'){this.tag=tag;if(tag==='iframe')this.contentWindow={postMessage:m=>this.messages.push(m)};}
    listeners={};
    addEventListener(k,fn){const previous=this.listeners[k];this.listeners[k]=previous?e=>{previous(e);fn(e);}:fn;}
    removeEventListener(k){delete this.listeners[k];}
    setPointerCapture(id){this.capture=id;}
    hasPointerCapture(id){return this.capture===id;}
    releasePointerCapture(){this.capture=undefined;}
    setAttribute(k,v){this.attributes[k]=v;}
    append(...children){for(const child of children){child.parent=this;this.children.push(child);}}
    replaceChildren(...children){this.children=[];this.append(...children);}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);}
  }
  const elements=Object.fromEntries(['dock','launcher','surfaces'].map(id=>[id,new Element()])),messages=[],listeners=[],sockets=[];
  const parent={postMessage:m=>messages.push(m)};
  class Socket {
    static OPEN=1;readyState=1;sent=[];
    constructor(url){this.url=url;sockets.push(this);}
    send(raw){this.sent.push(JSON.parse(raw));}
    close(){this.readyState=3;this.onclose?.();}
    receive(m){this.onmessage({data:JSON.stringify(m)});}
  }
  vi.stubGlobal('requestAnimationFrame',fn=>fn());vi.stubGlobal('parent',parent);vi.stubGlobal('window',{addEventListener:(_,fn)=>listeners.push(fn)});
  vi.stubGlobal('document',{querySelector:s=>elements[s.slice(1)],createElement:tag=>new Element(tag),documentElement:{style:{}}});
  vi.stubGlobal('location',{href:'http://localhost/plugins/host/index.html',protocol:'http:'});vi.stubGlobal('performance',{now:()=>time});vi.stubGlobal('WebSocket',Socket);
  await import('../host/host.js');
  const receive=(m,source=parent)=>listeners.forEach(fn=>fn({source,data:m}));
  receive({...initial,type:'init',...(hostPrefs?{hostPrefs}:{}),...(screenScale?{screenScale}:{})});const socket=sockets[0];socket.onopen();
  socket.receive({type:'welcome',spec:'oxp-web-plugin/0',plugins:[manifest],topics:['session','nowPlaying','call','activity'],storage:{quotaBytes:65536,persistent:false}});
  socket.receive({type:'state',topic:'session',value:{carplay:'connected'},seq:1});
  const click=label=>{const button=(()=>{const all=e=>[...e.children,...e.children.flatMap(all)];return all(elements.launcher).find(c=>(c.textContent===label || c.attributes['aria-label']===label));})();expect(button,`button ${label}`).toBeDefined();if(button.onchange)button.onchange();else button.onclick();};
  const launch=()=>{elements.dock.children[0].onclick();const all=e=>[...e.children,...e.children.flatMap(all)];if(all(elements.launcher).some(c=>c.attributes['aria-label']==='Fixture: More'))click('Fixture: More');};
  const frames=()=>elements.surfaces.children;
  const hello=frame=>receive({oxp:'plugin/0',type:'hello',spec:'oxp-web-plugin/0',sdk:'test/0'},frame.contentWindow);
  return {elements,messages,receive,socket,launch,click,frames,hello,advance:async ms=>{time+=ms;await vi.advanceTimersByTimeAsync(ms);}};
}
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();});
it.each([{dock:{x:1064,y:246}},{dock:{x:1064,y:246,w:48,h:48}}])('resets legacy positions with settings open and delayed preference echoes: %j',async legacy=>{
  const middle={...geometry,type:'geometry',viewport:{w:1200,h:540},gear:{x:1120,y:246,w:48,h:48,side:'right',gap:8},hostPrefs:legacy};
  const e=await environment(legacy,undefined,middle);
  expect(e.elements.dock.style.left).toBe('1064px');
  expect(e.elements.dock.style.top).toBe('246px');
  e.receive({oxp:'host/0',type:'visibility',visible:false});
  e.receive({oxp:'host/0',type:'reset-positions'});
  // placeGear can publish before the host-prefs storage round trip completes.
  e.receive({...middle,gear:{...middle.gear,y:24}});
  e.receive({oxp:'host/0',type:'visibility',visible:true});
  expect(e.elements.dock.style.left).toBe('1064px');
  expect(e.elements.dock.style.top).toBe('24px');
  expect(e.messages.filter(m=>m.type==='host-prefs').at(-1).value.dock).toBeUndefined();
});
it.each([false,true])('follows the gear until a dock drag, including pinned actions: %s',async pinned=>{
  const e=await environment({dock:{x:732,y:438,w:56,h:56}});
  if(pinned){e.launch();e.click('Tap: Show next to the plugins button');}
  for(const [w,h,x,y,side] of [[1200,540,1120,246,'right'],[1200,540,1120,24,'right'],[1200,540,1120,0,'right'],[1200,540,1120,492,'right'],[540,1200,24,600,'left']]){
    e.receive({...geometry,type:'geometry',viewport:{w,h},gear:{x,y,w:48,h:48,side,gap:8}});
    const width=pinned?100:48;
    expect(e.elements.dock.style.left).toBe(`${side==='right'?x-width-8:x+56}px`);
    expect(e.elements.dock.style.top).toBe(`${y}px`);
    expect(e.messages.filter(m=>m.type==='host-prefs').at(-1).value.dock).toBeUndefined();
  }
  e.receive({oxp:'host/0',type:'visibility',visible:false});
  e.receive({oxp:'host/0',type:'reset-positions'});
  e.receive({...geometry,type:'geometry',gear:{...geometry.gear,y:24}});
  e.receive({oxp:'host/0',type:'visibility',visible:true});
  expect(e.elements.dock.style.top).toBe('24px');
  expect(e.elements.dock.style.left).toBe(pinned?'672px':'732px');
});
it('bootstraps through welcome, isolates frames and correlates storage',async()=>{
  const e=await environment();expect(e.messages[0]).toMatchObject({type:'ready',spec:'oxp-web-plugin/0'});expect(e.socket.sent[0].type).toBe('hello');expect(e.socket.sent[1].type).toBe('subscribe');
  e.launch();e.click('Show Pet');const frame=e.frames()[0];expect(frame.attributes).toEqual({sandbox:'allow-scripts',allow:''});e.hello(frame);expect(frame.messages.find(m=>m.type==='welcome').state.session.carplay).toBe('connected');
  const count=e.socket.sent.length;e.receive({oxp:'plugin/0',type:'storage-get',id:'evil'},{});expect(e.socket.sent).toHaveLength(count);
  e.receive({oxp:'plugin/0',type:'storage-get',id:'local',plugin:'org.other'},frame.contentWindow);const request=e.socket.sent.at(-1);expect(request.plugin).toBe(manifest.id);expect(request.id).not.toBe('local');
  e.socket.receive({type:'storage',id:request.id,value:{score:2}});expect(frame.messages.at(-1)).toEqual({oxp:'plugin/0',type:'storage',id:'local',value:{score:2}});
  e.receive({oxp:'host/0',type:'ping',seq:12},{});expect(e.messages.at(-1).type).not.toBe('pong');e.receive({oxp:'host/0',type:'ping',seq:12});expect(e.messages.at(-1)).toMatchObject({type:'pong',seq:12});
});
it('gates fullscreen, closes on calm, collapses and unloads hidden surfaces',async()=>{
  const e=await environment();e.launch();e.click('Show Games');expect(e.frames()).toHaveLength(0);e.click('Confirm');expect(e.frames()).toHaveLength(1);expect(e.messages.at(-1).cover).toBe('fullscreen');
  e.socket.receive({type:'state',topic:'call',value:{state:'ringing'},seq:2});expect(e.messages.at(-1).cover).toBe('none');await e.advance(500);expect(e.frames()).toHaveLength(0);
  e.socket.receive({type:'state',topic:'call',value:{state:'idle'},seq:3});e.launch();e.click('Show Settings');expect(e.frames()).toHaveLength(1);e.receive({oxp:'host/0',type:'collapse'});expect(e.messages.at(-1).cover).toBe('none');await e.advance(500);expect(e.frames()).toHaveLength(0);
  e.launch();e.click('Show Pet');expect(e.frames()).toHaveLength(1);e.receive({oxp:'host/0',type:'visibility',visible:false});expect(e.frames()).toHaveLength(1);expect(e.frames()[0].hidden).toBe(true);expect(e.messages.at(-1).regions).toEqual([]);
});
it('pings plugins, unloads after five seconds and disables repeated crashes',async()=>{
  const e=await environment();
  for(let i=0;i<3;i++){e.launch();e.click('Show Pet');const frame=e.frames()[0];e.hello(frame);await e.advance(2000);expect(frame.messages.some(m=>m.type==='ping')).toBe(true);await e.advance(3000);expect(e.frames()).toHaveLength(0);}
  e.launch();e.click('Show Pet');expect(e.frames()).toHaveLength(0);expect(e.elements.launcher.title).toContain('Disabled');
});
it('retains the same companion through calm and applies bounded runtime requests',async()=>{
  const e=await environment();e.launch();e.click('Show Pet');const frame=e.frames()[0];e.hello(frame);
  const welcome=frame.messages.find(m=>m.type==='welcome');expect(welcome.viewport).toEqual(geometry.viewport);expect(welcome.video).toEqual({...geometry.video,x:-6,y:-12});
  e.receive({oxp:'plugin/0',type:'surface-request',anchor:'bottom-right',size:{w:150,h:90}},frame.contentWindow);
  expect(e.frames()[0]).toBe(frame);expect(frame.style.width).toBe('120px');expect(frame.style.height).toBe('90px');
  const last=frame.messages.filter(m=>m.type==='surface').at(-1);expect(last.anchor).toBe('bottom-right');expect(last.video.x).toBe(geometry.video.x-parseFloat(frame.style.left));
  e.receive({oxp:'plugin/0',type:'surface-request',anchor:'center',size:{w:1,h:1}},frame.contentWindow);expect(frame.style.width).toBe('120px');
  e.socket.receive({type:'state',topic:'call',value:{state:'ringing'},seq:2});
  expect(e.frames()[0]).toBe(frame);expect(frame.hidden).toBe(true);expect(frame.messages.filter(m=>m.type==='surface').at(-1)).toMatchObject({calm:true,visible:false});
  e.socket.receive({type:'state',topic:'call',value:{state:'idle'},seq:3});expect(e.frames()[0]).toBe(frame);expect(frame.hidden).toBe(false);
});
it('allows a closing panel to save, then flushes its final value after unload',async()=>{
  const e=await environment();e.launch();e.click('Show Settings');const frame=e.frames()[0];e.hello(frame);
  const set=(id,n)=>e.receive({oxp:'plugin/0',type:'storage-set',id,value:{n}},frame.contentWindow);
  set('1',1);set('2',2);await e.advance(50);
  const first=e.socket.sent.at(-1);expect(first).toMatchObject({type:'storage-set',value:{n:2}});e.socket.receive({type:'storage-ok',id:first.id});
  expect(frame.messages.filter(m=>m.type==='storage-ok').map(m=>m.id)).toEqual(['1','2']);
  e.socket.receive({type:'state',topic:'call',value:{state:'active'},seq:2});
  expect(frame.messages.at(-1)).toMatchObject({type:'surface',visible:false,closing:true});expect(e.frames()[0]).toBe(frame);
  set('3',3);await e.advance(499);expect(e.frames()[0]).toBe(frame);await e.advance(1);expect(e.frames()).toEqual([]);
  expect(e.socket.sent.filter(m=>m.type==='storage-set')).toHaveLength(1);await e.advance(1500);
  expect(e.socket.sent.filter(m=>m.type==='storage-set').at(-1).value).toEqual({n:3});
});
it('shows user tiles and labelled surfaces without developer details',async()=>{
  const e=await environment();e.elements.dock.children[0].onclick();
  const tile=e.elements.launcher.content.children[0].children[0];
  expect(tile.className).toBe('plugin-tile');expect(tile.children[0].src).toBe(`/plugins/p/${manifest.id}/icon.svg`);expect(tile.children[1].textContent).toBe('Fixture');
  expect(tile.children.some(c=>c.className==='plugin-meta')).toBe(false);
  tile.onclick();expect(e.frames()[0].style.width).toBe(`${876*.4-48}px`);
  e.elements.dock.children[0].onclick();e.click('Fixture: More');e.click('Hide Settings');await e.advance(500);expect(e.frames()).toHaveLength(0);
  e.receive({...geometry,type:'geometry',locale:'zh-CN'});e.click('返回');e.click('Fixture: 更多');
  expect(e.elements.launcher.content.children.some(c=>c.textContent==='显示宠物')).toBe(true);
});
it('pages overflowing launcher content using taps and keeps header controls',async()=>{
  const e=await environment();e.elements.dock.children[0].onclick();
  const content=e.elements.launcher.content,pages=e.elements.launcher.children[2];
  content.clientHeight=100;content.scrollHeight=350;content.scrollTop=0;content.onscroll();
  expect(pages.hidden).toBe(false);expect(pages.children[0].disabled).toBe(true);
  pages.children[1].onclick();expect(content.scrollTop).toBe(100);pages.children[0].onclick();expect(content.scrollTop).toBe(0);
  expect(e.elements.launcher.children[0].children.map(c=>c.attributes['aria-label'])).toContain('Close');
});
it('moves only an active companion, throttles layout, persists and resets its free position',async()=>{
  const e=await environment();e.launch();e.click('Show Pet');const frame=e.frames()[0];e.hello(frame);
  const move=(phase,dx,dy)=>e.receive({oxp:'plugin/0',type:'surface-request',move:{phase,dx,dy}},frame.contentWindow);
  const original=frame.style.left;move('move',200,100);await e.advance(40);expect(frame.style.left).toBe(original);
  move('start',0,0);move('move',200,100);move('move',220,120);await e.advance(40);
  expect(frame.style.left).toBe('244px');expect(frame.style.top).toBe('144px');expect(frame.className).toBe('lifted');
  move('end',220,120);expect(frame.className).toBe('');
  const saved=e.messages.filter(m=>m.type==='host-prefs').at(-1).value;
  expect(saved.companions[`${manifest.id}/widget`]).toMatchObject({x:244,y:144});
  e.receive({...geometry,type:'geometry',viewport:{w:300,h:250},gear:{x:220,y:170,w:56,h:56,side:'right'}});
  expect(parseFloat(frame.style.left)+120).toBeLessThanOrEqual(276);
  e.receive({oxp:'plugin/0',type:'surface-request',anchor:'top-left'},frame.contentWindow);
  expect(e.messages.filter(m=>m.type==='host-prefs').at(-1).value.companions[`${manifest.id}/widget`]).toBeUndefined();
});
it('restores free positions without losing them to the pet startup anchor',async()=>{
  const e=await environment({dock:{x:300,y:200,dragged:true},companions:{[`${manifest.id}/widget`]:{x:450,y:100,anchor:'bottom-left'}}});
  e.launch();e.click('Show Pet');const frame=e.frames()[0];e.hello(frame);expect(frame.style.left).toBe('450px');
  e.receive({oxp:'plugin/0',type:'surface-request',anchor:'bottom-left'},frame.contentWindow);expect(frame.style.left).toBe('450px');
  e.receive({oxp:'plugin/0',type:'surface-request',anchor:'bottom-left'},frame.contentWindow);expect(frame.style.left).toBe('24px');
});
it('keeps the dock button captured while dragging and publishes layouts at about 30 Hz',async()=>{
  const e=await environment(),button=e.elements.dock.children[0];
  expect(button.attributes['aria-label']).toBe('Plugins');expect(button.innerHTML).toContain('<svg');
  button.listeners.pointerdown({pointerId:1,button:0,screenX:100,screenY:100});
  const before=e.messages.filter(m=>m.type==='layout').length;
  for(let i=0;i<20;i++)button.listeners.pointermove({pointerId:1,screenX:100-i*10,screenY:100-i*5,preventDefault:()=>{}});
  expect(e.messages.filter(m=>m.type==='layout')).toHaveLength(before);
  await e.advance(34);expect(e.messages.filter(m=>m.type==='layout')).toHaveLength(before+1);
  expect(e.elements.dock.children[0]).toBe(button);expect(button.capture).toBe(1);
  button.listeners.pointerup({pointerId:1});expect(button.capture).toBeUndefined();
  expect(e.messages.filter(m=>m.type==='host-prefs').at(-1).value.dock).toEqual({x:542,y:343,dragged:true});
  e.receive({...geometry,type:'geometry',locale:'zh-CN'});expect(button.attributes['aria-label']).toBe('插件');
});

it('restores selected surfaces on reload, removes closed selections and prunes uninstall',async()=>{
  const id=`${manifest.id}/widget`,ambient=`${manifest.id}/ambient`;
  const prefs={surfaces:{[id]:{anchor:'bottom-right',x:450,y:100},[ambient]:{},'org.gone/pet':{},[`${manifest.id}/panel`]:{}}};
  const e=await environment(prefs);expect(e.frames()).toHaveLength(2);
  const cat=e.frames()[0];e.hello(cat);expect(cat.style.left).toBe('450px');expect(cat.style.top).toBe('100px');
  expect(cat.messages.find(m=>m.type==='welcome').surface.anchor).toBe('bottom-right');
  let saved=e.messages.filter(m=>m.type==='host-prefs').at(-1).value;
  expect(Object.keys(saved.surfaces)).toEqual([id,ambient]);
  e.receive({oxp:'plugin/0',type:'close'},cat.contentWindow);
  saved=e.messages.filter(m=>m.type==='host-prefs').at(-1).value;
  expect(saved.surfaces[id]).toBeUndefined();expect(saved.companions[id]).toBeUndefined();
  e.socket.receive({type:'welcome',spec:'oxp-web-plugin/0',plugins:[],topics:[],storage:{quotaBytes:65536,persistent:false}});
  expect(e.frames()).toHaveLength(0);expect(e.messages.filter(m=>m.type==='host-prefs').at(-1).value.surfaces).toEqual({});
});
it('converts screen deltas for both companion and dock in a half-scale receiver',async()=>{
  const e=await environment(undefined,{x:.5,y:.5});e.launch();e.click('Show Pet');const cat=e.frames()[0];e.hello(cat);
  for(const [phase,dx,dy] of [['start',0,0],['end',100,50]])e.receive({oxp:'plugin/0',type:'surface-request',move:{phase,dx,dy}},cat.contentWindow);
  expect(cat.style.left).toBe('224px');expect(cat.style.top).toBe('124px');
  const button=e.elements.dock.children[0];button.listeners.pointerdown({pointerId:1,button:0,screenX:500,screenY:300});
  button.listeners.pointermove({pointerId:1,screenX:400,screenY:250,preventDefault:()=>{}});button.listeners.pointerup({pointerId:1});
  expect(e.messages.filter(m=>m.type==='host-prefs').at(-1).value.dock).toEqual({x:532,y:338,dragged:true});
});
it('merges receiver motion and host parked through the plugin state path and enforces provider ownership',async()=>{
  const e=await environment();e.launch();e.click('Show Pet');const frame=e.frames()[0];e.hello(frame);
  const welcome=frame.messages.find(m=>m.type==='welcome');expect(welcome.topics).toContain('parked');expect(welcome.topics).not.toContain('motion');expect(welcome.state.parked).toEqual({state:'unknown',confirmedBy:null});
  e.receive({...geometry,type:'geometry',topics:['motion']});
  const motion=speedMps=>e.receive({oxp:'host/0',type:'state',topic:'motion',value:{speedMps,accuracyM:0,source:'vehicle'}});
  motion(0);await e.advance(4000);e.receive({oxp:'plugin/0',type:'pong',seq:frame.messages.filter(m=>m.type==='ping').at(-1).seq},frame.contentWindow);await e.advance(1000);
  expect(frame.messages.filter(m=>m.type==='state' && m.topic==='parked').at(-1).value).toEqual({state:'parked',confirmedBy:'speed'});
  expect(frame.messages.some(m=>m.type==='state' && m.topic==='motion')).toBe(false);
  e.launch();e.click('Show Games');expect(e.frames()).toHaveLength(2);
  // Foreign receiver writes and messages from a plugin cannot overwrite host-owned parked.
  e.receive({oxp:'host/0',type:'state',topic:'parked',value:{state:'moving',confirmedBy:'speed'}});
  e.receive({oxp:'host/0',type:'state',topic:'motion',value:{speedMps:4,accuracyM:0,source:'vehicle'}},frame.contentWindow);
  expect(e.frames()).toHaveLength(2);
  motion(3);await e.advance(500);expect(e.frames()).toHaveLength(1);
  e.receive({...geometry,type:'geometry',topics:[]});
  await e.advance(250);expect(frame.messages.filter(m=>m.type==='state' && m.topic==='parked').at(-1).value.state).toBe('unknown');
});
it('announces permission-filtered availability changes and publishes relay and receiver snapshots identically',async()=>{
  const e=await environment();
  e.socket.receive({type:'welcome',spec:'oxp-web-plugin/0',plugins:[{...manifest,permissions:[...manifest.permissions,'motion','route']}],topics:['session','route'],storage:{quotaBytes:65536,persistent:false}});
  e.receive({...geometry,type:'geometry',topics:['motion']});e.launch();e.click('Show Pet');const frame=e.frames()[0];e.hello(frame);
  const welcome=frame.messages.find(m=>m.type==='welcome');expect(welcome.topics).toEqual(['session','route','motion','parked']);expect(welcome.state.motion).toBe(null);
  e.receive({oxp:'host/0',type:'state',topic:'motion',value:{speedMps:1,accuracyM:null,source:'vehicle'}});
  expect(frame.messages.filter(m=>m.type==='state' && m.topic==='motion').at(-1).value.speedMps).toBe(1);
  const route={active:true,destination:null,etaMs:1000,distanceRemainingM:null,maneuver:{type:2,road:null,distanceM:40},appName:null};
  e.socket.receive({type:'state',topic:'route',value:route,seq:1});expect(frame.messages.filter(m=>m.type==='state' && m.topic==='route').at(-1).value).toEqual(route);
  for(const speedMps of [2,3,4])e.receive({oxp:'host/0',type:'state',topic:'motion',value:{speedMps,accuracyM:null,source:'vehicle'}});
  expect(frame.messages.filter(m=>m.type==='state' && m.topic==='motion')).toHaveLength(1);await e.advance(250);
  expect(frame.messages.filter(m=>m.type==='state' && m.topic==='motion').map(m=>m.value.speedMps)).toEqual([1,4]);
  e.receive({...geometry,type:'geometry',topics:[]});expect(frame.messages.filter(m=>m.type==='topics').at(-1).topics).toEqual(['session','route','parked']);
});

it('matches receiver dimensions, fades on geometry, wakes on press and drag, and inherits theme',async()=>{
  const e=await environment(),button=e.elements.dock.children[0];
  e.receive({...geometry,type:'geometry',gear:{...geometry.gear,w:48,h:48,faded:true}});
  expect(button.style).toMatchObject({width:'48px',height:'48px',padding:'12px 12px',borderRadius:'12px / 12px'});
  expect(e.elements.dock.style.height).toBe('48px');expect(e.elements.dock.style.opacity).toBe('.3');
  expect(document.documentElement.style.colorScheme).toBe('dark');
  expect(e.elements.dock.style['--dock-icon-w']).toBe('24px');
  expect(button.innerHTML).toContain('viewBox="0 0 24 24"');
  button.onclick();expect(e.messages.some(m=>m.type==='wake')).toBe(true);
  const before=e.messages.filter(m=>m.type==='wake').length;
  button.listeners.pointerdown({pointerId:1,button:0,screenX:100,screenY:100});
  expect(e.messages.filter(m=>m.type==='wake').length).toBeGreaterThan(before);
  button.listeners.pointermove({pointerId:1,screenX:90,screenY:100,preventDefault:()=>{}});
  expect(e.messages.filter(m=>m.type==='wake').length).toBeGreaterThan(before);
  e.receive({...geometry,type:'geometry',theme:'light',gear:{...geometry.gear,faded:false}});
  expect(document.documentElement.style.colorScheme).toBe('light');expect(e.elements.dock.style.opacity).toBe('1');
});
it('keeps transparent nested frames in matching colour schemes',()=>{
  const host=readFileSync('host/style.css','utf8'),sim=readFileSync('simulator/receiver.css','utf8');
  expect(host).toContain('iframe { color-scheme:light; }');expect(host).not.toContain('html, body, iframe { color-scheme:light; }');
  expect(host).toContain('stroke:currentColor');expect(host).toContain('stroke-linecap:round');expect(host).toContain('background:#151515b3');
  for (const name of ['cats','games','whale-girl']) expect(readFileSync(`plugins/${name}/style.css`,'utf8')).toMatch(/color-scheme:\s*light/);
  expect(sim).toContain('color-scheme:dark');expect(sim).toContain('transition:opacity .4s');
});

it('retains pinned action buttons through the wake geometry round trip',async()=>{
  const e=await environment();e.launch();e.click('Tap: Show next to the plugins button');
  const pinned=e.elements.dock.children[1];expect(pinned.textContent).toBe('Tap');
  e.receive({...geometry,type:'geometry',gear:{...geometry.gear,w:48,h:48,faded:true}});
  expect(e.elements.dock.children[1]).toBe(pinned);expect(pinned.style.width).toBe('48px');
  pinned.listeners.pointerdown({});expect(e.messages.at(-1).type).toBe('wake');
  e.receive({...geometry,type:'geometry',gear:{...geometry.gear,w:48,h:48,faded:false}});
  expect(e.elements.dock.children[1]).toBe(pinned);expect(e.elements.dock.style.opacity).toBe('1');
});

it('shows the apps outline and restores default positions without closing companions',async()=>{
  const id=`${manifest.id}/widget`,e=await environment({dock:{x:300,y:200,dragged:true},companions:{[id]:{x:450,y:100}},surfaces:{[id]:{x:450,y:100}}});
  const icon=e.elements.dock.children[0].innerHTML;
  expect(icon).toContain('viewBox="0 0 24 24"');expect(icon.match(/<rect /g)).toHaveLength(4);expect(icon.match(/rx="1.5"/g)).toHaveLength(4);
  expect(e.elements.dock.style.left).toBe('300px');expect(e.frames()[0].style.left).toBe('450px');
  e.receive({oxp:'host/0',type:'reset-positions'},{});expect(e.elements.dock.style.left).toBe('300px');
  e.receive({oxp:'host/0',type:'reset-positions'});
  expect(e.elements.dock.style.left).toBe('732px');expect(e.elements.dock.style.top).toBe('438px');
  expect(e.frames()).toHaveLength(1);expect(e.frames()[0].style.left).toBe('24px');
  const saved=e.messages.filter(m=>m.type==='host-prefs').at(-1).value;
  expect(saved.dock).toBeUndefined();expect(saved.companions).toEqual({});expect(saved.surfaces[id].x).toBeUndefined();
  e.receive({...geometry,type:'geometry',gear:{...geometry.gear,y:24},hostPrefs:saved});
  expect(e.elements.dock.style.top).toBe('24px');
});
it('drags from a pinned quick action immediately and suppresses its click',async()=>{
  const e=await environment();e.launch();e.click('Tap: Show next to the plugins button');const b=e.elements.dock.children[1];
  const event={pointerId:1,button:0,screenX:500,screenY:300,detail:1,preventDefault:vi.fn(),stopImmediatePropagation:vi.fn()};
  b.listeners.pointerdown(event);b.listeners.pointermove({...event,screenX:480});b.listeners.pointerup(event);
  b.listeners.click(event);expect(event.preventDefault).toHaveBeenCalled();expect(event.stopImmediatePropagation).toHaveBeenCalled();
  expect(e.messages.filter(m=>m.type==='host-prefs').at(-1).value.dock).toMatchObject({dragged:true});
});

it('restores only user-dragged dock positions and never resurrects them after a hidden reset',async()=>{
  const saved={dock:{x:300,y:200,dragged:true}},e=await environment(saved);
  expect(e.elements.dock.style.left).toBe('300px');
  e.receive({...geometry,type:'geometry',gear:{...geometry.gear,y:24},hostPrefs:{}});
  expect(e.elements.dock.style.top).toBe('200px');
  e.receive({oxp:'host/0',type:'visibility',visible:false});
  e.receive({oxp:'host/0',type:'reset-positions'});
  e.receive({...geometry,type:'geometry',gear:{...geometry.gear,y:24},hostPrefs:saved});
  e.receive({oxp:'host/0',type:'visibility',visible:true});
  expect(e.elements.dock.style.left).toBe('732px');
  expect(e.elements.dock.style.top).toBe('24px');
  expect(e.messages.filter(m=>m.type==='host-prefs').at(-1).value.dock).toBeUndefined();
});

it('toggles the primary panel from its tile and preserves it when opening the launcher',async()=>{
  const e=await environment();const tile=()=>e.elements.launcher.content.children[0].children[0];
  e.elements.dock.children[0].onclick();tile().onclick();const frame=e.frames()[0];e.hello(frame);
  e.elements.dock.children[0].onclick();expect(tile().attributes['aria-pressed']).toBe('true');expect(e.frames()[0]).toBe(frame);
  tile().onclick();expect(frame.messages.at(-1)).toMatchObject({type:'surface',closing:true,visible:false});await e.advance(500);expect(e.frames()).toHaveLength(0);
});
it('shows inline parked confirmation only on demand, supports cancel, and opens on confirmation',async()=>{
  const e=await environment();e.launch();
  const all=n=>[...n.children,...n.children.flatMap(all)],nodes=()=>all(e.elements.launcher);
  expect(nodes().some(n=>n.attributes.role==='alertdialog')).toBe(false);
  e.click('Show Games');expect(e.frames()).toHaveLength(0);expect(nodes().some(n=>n.textContent==='Use only while parked. Is the car parked?')).toBe(true);
  e.click('Cancel');expect(nodes().some(n=>n.attributes.role==='alertdialog')).toBe(false);expect(e.frames()).toHaveLength(0);
  e.click('Show Games');e.click('Confirm');expect(e.frames()).toHaveLength(1);expect(e.messages.at(-1).cover).toBe('fullscreen');
});
it('renders about credits and pin switches and keeps developer controls behind receiver preference',async()=>{
  const e=await environment();e.launch();const all=n=>[...n.children,...n.children.flatMap(all)],nodes=()=>all(e.elements.launcher);
  expect(nodes().some(n=>n.textContent==='Author: Fixture author')).toBe(true);expect(nodes().some(n=>n.textContent==='Version: 1.0.0')).toBe(true);
  expect(nodes().some(n=>n.textContent?.includes('Fixture artwork by Artist'))).toBe(true);expect(nodes().some(n=>n.href==='https://example.org/artist')).toBe(true);
  expect(nodes().some(n=>n.className==='developer')).toBe(false);
  e.click('Tap: Show next to the plugins button');expect(e.elements.dock.children).toHaveLength(2);
  expect(nodes().find(n=>n.tag==='input').checked).toBe(true);e.click('Tap: Show next to the plugins button');expect(e.elements.dock.children).toHaveLength(1);
  e.receive({...geometry,type:'geometry',developer:true});expect(nodes().some(n=>n.className==='developer')).toBe(true);
  e.receive({...geometry,type:'geometry',developer:false});expect(nodes().some(n=>n.className==='developer')).toBe(false);
  expect(nodes().some(n=>n.textContent==='Reload plugin')).toBe(false);
});
it('recreates only this plugin’s frames on developer reload, reports telemetry and resets its position',async()=>{
  const id=`${manifest.id}/widget`,e=await environment({companions:{[id]:{x:450,y:100}},surfaces:{[id]:{x:450,y:100}}});
  const old=e.frames()[0];e.hello(old);e.receive({...geometry,type:'geometry',developer:true});e.launch();
  const all=n=>[...n.children,...n.children.flatMap(all)],nodes=()=>all(e.elements.launcher);
  expect(nodes().some(n=>n.textContent===`ID: ${manifest.id}`)).toBe(true);
  const read=e.socket.sent.find(m=>m.type==='storage-get');e.socket.receive({type:'storage',id:read.id,value:{x:1}});
  e.receive({...geometry,type:'geometry',developer:true});expect(nodes().some(n=>n.textContent==='Storage used: 7 B / 64 KiB')).toBe(true);
  e.click('Reload plugin');expect(e.frames()).toHaveLength(1);const fresh=e.frames()[0];expect(fresh).not.toBe(old);expect(fresh.style.left).toBe('450px');e.hello(fresh);
  e.receive({oxp:'plugin/0',type:'close'},old.contentWindow);expect(e.frames()).toHaveLength(1);
  e.click('Reset this plugin’s positions');expect(fresh.style.left).toBe('24px');
  await e.advance(2000);const ping=fresh.messages.filter(m=>m.type==='ping').at(-1);await e.advance(37);e.receive({oxp:'plugin/0',type:'pong',seq:ping.seq},fresh.contentWindow);
  e.receive({...geometry,type:'geometry',developer:true});expect(nodes().some(n=>n.textContent?.includes('Last pong latency: 37 ms'))).toBe(true);
  e.click('Back');const tile=e.elements.launcher.content.children[0].children[0];expect(tile.children.some(n=>n.className==='plugin-meta')).toBe(true);
});
it('includes the whale-girl asset attribution and source links in About',async()=>{
  const e=await environment(),whale=JSON.parse(readFileSync('plugins/whale-girl/oxp-plugin.json','utf8'));
  e.socket.receive({type:'welcome',spec:'oxp-web-plugin/0',plugins:[whale],topics:[],storage:{quotaBytes:65536,persistent:false}});
  e.elements.dock.children[0].onclick();e.click('Whale Girl: More');const all=n=>[...n.children,...n.children.flatMap(all)],nodes=all(e.elements.launcher);
  expect(nodes.some(n=>n.textContent?.includes('CC BY-NC-SA 4.0')&&n.textContent?.includes('上善无形')&&n.textContent?.includes('YunYueSama'))).toBe(true);
  expect(nodes.some(n=>n.href==='https://creativecommons.org/licenses/by-nc-sa/4.0/')).toBe(true);
});

it('caps pin switches at two and enables another after unpinning',async()=>{
  const e=await environment(),m={...manifest,quickActions:['One','Two','Three'].map((label,i)=>({id:`action-${i}`,label:{en:label},icon:'icon.svg'}))};
  e.socket.receive({type:'welcome',spec:'oxp-web-plugin/0',plugins:[m],topics:[],storage:{quotaBytes:65536,persistent:false}});e.launch();
  const all=n=>[...n.children,...n.children.flatMap(all)],switches=()=>all(e.elements.launcher).filter(n=>n.tag==='input');
  switches()[0].onchange();switches()[1].onchange();expect(e.elements.dock.children).toHaveLength(3);expect(switches()[2].disabled).toBe(true);
  switches()[0].onchange();expect(switches()[2].disabled).toBe(false);switches()[2].onchange();expect(e.elements.dock.children).toHaveLength(3);
});
it('shows a muted plain reason for a disabled plugin without exposing diagnostics to users',async()=>{
  const e=await environment();
  for(let i=0;i<3;i++){e.launch();e.click('Show Pet');e.frames()[0].onerror();}
  e.click('Back');const wrapper=e.elements.launcher.content.children[0];expect(wrapper.className).toContain('muted');
  expect(wrapper.children[0].children.some(n=>n.textContent==='Unavailable right now')).toBe(true);
  expect(wrapper.children[0].children.some(n=>n.className==='plugin-meta')).toBe(false);
});

it.each([
  ['en',{id:'ID',version:'Version',spec:'Spec',permissions:'Permissions',declared:'Topics declared',available:'Topics available',subscribed:'Topics subscribed',storage:'Storage used',disabled:'Disabled for this session',pong:'Last pong latency',error:'Last error',reload:'Reload plugin',reset:'Reset this plugin’s positions',parked:'Parked (testing)',open:'Open Pet',show:'Show Pet',hide:'Hide Pet',back:'Back',more:'More',pet:'Pet'}],
  ['zh-CN',{id:'ID',version:'版本',spec:'规范',permissions:'权限',declared:'声明的话题',available:'可用的话题',subscribed:'订阅的话题',storage:'已用存储',disabled:'本次会话已停用',pong:'最后心跳延迟',error:'最后错误',reload:'重新加载插件',reset:'重置此插件的位置',parked:'已停车（测试）',open:'打开 宠物',show:'显示宠物',hide:'隐藏宠物',back:'返回',more:'更多',pet:'宠物'}]
])('pairs developer labels and values and groups surface actions in %s',async(locale,t)=>{
  const e=await environment(undefined,undefined,{...geometry,locale,developer:true});
  e.elements.dock.children[0].onclick();e.click(`Fixture: ${t.more}`);
  const all=n=>[...n.children,...n.children.flatMap(all)],nodes=()=>all(e.elements.launcher);
  const section=()=>nodes().find(n=>n.className==='developer');
  const pairs=()=>section().children.filter(n=>n.tag==='p').map(n=>n.textContent);
  const read=e.socket.sent.find(m=>m.type==='storage-get');e.socket.receive({type:'storage',id:read.id,value:{x:1}});
  e.receive({...geometry,type:'geometry',locale,developer:true});
  expect(pairs()).toEqual([
    `${t.id}: org.openxplay.fixture`,`${t.version}: 1.0.0`,`${t.spec}: oxp-web-plugin/0`,
    `${t.permissions}: session, nowPlaying, nowPlaying.artwork, call, activity, storage`,
    `${t.declared}: session, nowPlaying, call, activity`,
    `${t.available}: session, nowPlaying, call, activity, parked`,`${t.subscribed}: —`,
    `${t.storage}: 7 B / 64 KiB`,`${t.disabled}: —`,`${t.error}: —`
  ]);
  const cards=()=>section().children.filter(n=>n.className==='surface-card');
  expect(cards()).toHaveLength(manifest.surfaces.length);
  expect(cards()[0].children.map(n=>n.textContent)).toEqual([
    `${t.pet} (companion) · hidden · ${t.pong}: — · ${t.error}: —`,t.open
  ]);
  const actions=section().children.at(-1);expect(actions.className).toBe('developer-actions');
  expect(actions.children.map(n=>n.textContent)).toEqual([t.reload,t.reset,t.parked]);
  expect(actions.children[2].attributes).toMatchObject({role:'switch','aria-checked':'false'});
  e.click(t.show);e.hello(e.frames()[0]);e.receive({...geometry,type:'geometry',locale,developer:true});
  expect(pairs()).toContain(`${t.subscribed}: session, nowPlaying, call, activity, parked`);
  expect(nodes().some(n=>n.textContent===t.hide)).toBe(true);
  e.frames()[0].onerror();
  const error=locale==='en'?'Surface failed to load':'界面加载失败';
  expect(cards()[0].children[0].textContent).toContain(`${t.error}: ${error}`);
  expect(cards()[1].children[0].textContent).toContain(`${t.error}: —`);
  for(let i=0;i<2;i++){e.click(t.show);e.frames()[0].onerror();}
  expect(pairs()).toContain(`${t.disabled}: ${error}`);
  e.click(t.back);const meta=nodes().find(n=>n.className==='plugin-meta');
  expect(meta.textContent).toBe('org.openxplay.fixture · 1.0.0');expect(meta.title).toBe('org.openxplay.fixture');
});
it.each(['en','zh-CN'])('shows compact credits with collapsed full licence notes in %s',async locale=>{
  const e=await environment(undefined,undefined,{...geometry,locale});
  const whale=JSON.parse(readFileSync('plugins/whale-girl/oxp-plugin.json','utf8'));
  e.socket.receive({type:'welcome',spec:'oxp-web-plugin/0',plugins:[whale],topics:[],storage:{quotaBytes:65536,persistent:false}});
  e.elements.dock.children[0].onclick();e.click(locale==='en'?'Whale Girl: More':'鲸鱼娘: 更多');
  const about=e.elements.launcher.content.children.find(n=>n.className==='about');
  const credits=about.children.filter(n=>n.className==='credit-line');expect(credits).toHaveLength(3);
  expect(credits.map(n=>n.textContent)).toEqual(['鲸鱼娘 · 上善无形 · ','Maid design · ZipZipPipe · ','Sprite atlas · YunYueSama · ']);
  for(const row of credits.slice(0,2))expect(row.children[0]).toMatchObject({tag:'a',textContent:'CC BY-NC-SA 4.0',href:'https://creativecommons.org/licenses/by-nc-sa/4.0/'});
  expect(credits[2].children[0].textContent).toBe('大肥鱼项目署名许可 1.0 (LicenseRef-YunYueSama-1.0)');
  const notes=about.children.at(-1);expect(notes.tag).toBe('details');expect(notes.open).toBeFalsy();
  expect(notes.children[0].textContent).toBe(locale==='en'?'Full licence notes':'完整许可说明');
  expect(notes.children[2].textContent).toBe(whale.attributions[0].text[locale]);
  expect(about.children.some(n=>n.tag==='p' && n.textContent?.includes('Commit:'))).toBe(false);
});

it.each([{w:880,h:518},{w:360,h:640}])('publishes the open launcher exemption at %j',async viewport=>{
  const gear={x:viewport.w-72,y:24,w:48,h:48,side:'right'};
  const e=await environment(undefined,undefined,{...geometry,locale:'zh-CN',viewport,gear});
  e.elements.dock.children[0].onclick();
  const layout=e.messages.filter(m=>m.type==='layout').at(-1);
  expect(layout.cover).toBe('panel');
  expect(layout.launcher.h).toBe(viewport.h-24-layout.launcher.y);
  expect(e.elements.launcher.style.height).toBe(`${layout.launcher.h}px`);
  expect(layout.regions).toContainEqual(layout.launcher);
  e.click('关闭');
  expect(e.messages.filter(m=>m.type==='layout').at(-1).launcher).toBeUndefined();
});
