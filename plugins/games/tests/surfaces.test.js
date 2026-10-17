// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import {it,expect,vi,afterEach} from 'vitest';
const runtime=vi.hoisted(()=>({host:null}));
vi.mock('../oxp-plugin-sdk.js',()=>({connect:async()=>runtime.host}));
async function setup(kind,stored=null,locale='en') {
  vi.useFakeTimers();vi.resetModules();
  const callbacks={},events={};
  class Element {
    children=[];style={setProperty:vi.fn()};dataset={};className='';textContent='';hidden=false;clientWidth=500;clientHeight=400;
    classList={add:vi.fn()};
    constructor(tag){this.tag=tag;}
    append(...children){this.children.push(...children);}
    replaceChildren(...children){this.children=[...children];}
    setAttribute(){}
    setPointerCapture(){}
    getBoundingClientRect(){return {left:0,top:0};}
  }
  const root=new Element('main');
  const all=()=>{const nodes=[];const walk=e=>{nodes.push(e);for(const c of e.children)walk(c);};walk(root);return nodes;};
  vi.stubGlobal('document',{hidden:false,documentElement:{},createElement:tag=>new Element(tag),querySelector:selector=>selector==='#app'?root:all().find(e=>selector[0]==='#'?e.id===selector.slice(1):e.className.split(' ').includes(selector.slice(1))),addEventListener:(k,fn)=>events[k]=fn});
  vi.stubGlobal('window',{addEventListener:(k,fn)=>events[k]=fn});
  const host={locale,parked:'confirmed',state:{},reducedMotion:false,surface:{id:kind,calm:false,visible:true,onChange:fn=>callbacks.surface=fn,open:vi.fn(),close:vi.fn()},on:(topic,fn)=>callbacks[topic]=fn,storage:{get:vi.fn(async()=>stored),set:vi.fn(async()=>{})}};
  runtime.host=host;
  await import('../main.js');await Promise.resolve();await Promise.resolve();
  const find=text=>all().find(e=>e.tag==='button'&&e.textContent===text);
  return {host,root,all,callbacks,events,find,start:()=>find(locale==='en'?'Let’s play':'开始游戏').onclick()};
}
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();});
it('renders all menu pages with saved scores and opens the chosen surface',async()=> {
  const e=await setup('menu',{scores:{duel:188}});
  expect(e.all().some(x=>x.textContent==='Best · 188 ms')).toBe(true);
  let cards=e.all().filter(x=>x.className==='game-card');expect(cards).toHaveLength(2);cards[0].onclick();expect(e.host.surface.open).toHaveBeenCalledWith('chooser');
  e.find('More games → 1/3').onclick();e.find('More games → 2/3').onclick();
  expect(e.all().some(x=>x.textContent==='Song bingo')).toBe(true);
});
it('does not move before a resume tap, pauses instantly and requires another tap after calm',async()=> {
  const e=await setup('tic');
  const cells=()=>e.all().filter(x=>x.className.startsWith('cell '));
  cells()[0].onclick();expect(cells()[0].textContent).toBe('');
  e.start();cells()[0].onclick();expect(cells()[0].textContent).toBe('×');
  e.host.surface.calm=true;e.callbacks.surface();cells()[1].onclick();expect(cells()[1].textContent).toBe('');
  e.host.surface.calm=false;e.callbacks.surface();cells()[1].onclick();expect(cells()[1].textContent).toBe('');
  e.start();cells()[1].onclick();expect(cells()[1].textContent).toBe('○');
});
it('cancels a pending AI turn during Siri and resumes it only after a tap',async()=> {
  const e=await setup('tic');e.start();e.find('Mode: two players').onclick();
  e.all().find(x=>x.className==='cell player-0').onclick();
  e.host.state.activity={siri:true};e.callbacks.activity();await vi.advanceTimersByTimeAsync(1000);
  expect(e.all().filter(x=>x.className==='cell player-2')).toHaveLength(0);
  e.host.state.activity={siri:false};e.callbacks.activity();await vi.advanceTimersByTimeAsync(1000);
  expect(e.all().filter(x=>x.className==='cell player-2')).toHaveLength(0);
  e.start();await vi.advanceTimersByTimeAsync(350);expect(e.all().filter(x=>x.className==='cell player-2')).toHaveLength(1);
});
it('accepts five simultaneous pointers and ignores a sixth',async()=> {
  const e=await setup('chooser');e.start();
  const zone=e.all().find(x=>x.className==='finger-zone');
  for(let i=0;i<6;i++)zone.onpointerdown({pointerId:i,clientX:60+i*70,clientY:100,preventDefault(){}});
  expect(zone.children).toHaveLength(5);await vi.advanceTimersByTimeAsync(3100);
  expect(zone.children.filter(x=>x.className.includes('chosen')&&!x.className.includes('not-chosen'))).toHaveLength(1);
});
it('freezes song marking during a call and catches up on the explicit resume tap',async()=> {
  const e=await setup('bingo');e.start();
  const song={title:'Love you',artist:'Tom',album:'A',playing:true,durationMs:350000};
  e.host.state.call={state:'active'};e.callbacks.call();e.host.state.nowPlaying=song;e.callbacks.nowPlaying(song);
  expect(e.all().filter(x=>x.className==='bingo-square marked')).toHaveLength(0);
  e.host.state.call={state:'idle'};e.callbacks.call();e.start();
  expect(e.all().filter(x=>x.className==='bingo-square marked').length).toBeGreaterThan(0);
});
it('uses the host Chinese locale and restores a saved board',async()=> {
  const cells=[1,0,0,0,0,0,0,0,0];
  const e=await setup('tic',{saved:{tic:{board:{kind:'tic',cells}}}},'zh-CN');
  expect(e.all().some(x=>x.textContent==='井字棋')).toBe(true);expect(e.find('开始游戏')).toBeDefined();
  expect(e.all().filter(x=>x.className==='cell player-1')).toHaveLength(1);
});

it('saves the latest board before leaving through the games menu',async()=> {
  const e=await setup('tic');e.start();
  let cells=e.all().filter(x=>x.className.startsWith('cell '));cells[0].onclick();
  cells=e.all().filter(x=>x.className.startsWith('cell '));cells[1].onclick();
  const leaving=e.find('Games').onclick();expect(e.host.surface.open).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(2500);await leaving;
  expect(e.host.surface.open).toHaveBeenCalledWith('menu');
  expect(e.host.storage.set.mock.calls.at(-1)[0].saved.tic.board.cells.slice(0,2)).toEqual([1,2]);
});

it('scores reaction taps on pointer down so a held false start cannot evade the rule',async()=> {
  const e=await setup('duel');e.start();e.find('Next round').onclick();
  const pad=e.all().find(x=>x.className.startsWith('duel-pad side-0'));
  pad.onpointerdown({preventDefault(){}});
  expect(e.all().some(x=>x.textContent==='False start! Opponent scores.')).toBe(true);
  await vi.advanceTimersByTimeAsync(5000);pad.onclick();
  const pads=e.all().filter(x=>x.className.startsWith('duel-pad side-'));
  expect(pads[0].children[1].textContent).toBe('0');expect(pads[1].children[1].textContent).toBe('1');
});
