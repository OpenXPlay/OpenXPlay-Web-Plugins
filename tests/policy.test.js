// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import { it,expect,describe } from 'vitest';
import { Policy,reconnectDelay } from '../host/policy.js';
import { clamp,unionArea,dockRect,margins,surfaceRects,enforceLayout,clipPath,planLayout } from '../host/layout.js';
import { ReceiverSlot,discover } from '../simulator/receiver-policy.js';
import { permittedState,permits,frameForSource } from '../host/access.js';
import { manifestErrors,parseMessage } from '../shared/protocol.js';
import { readFileSync } from 'node:fs';
const manifest=JSON.parse(readFileSync('tests/fixtures/valid/oxp-plugin.json'));
const geometry={viewport:{w:876,h:518},video:{x:18,y:12,w:840,h:494},gear:{x:796,y:438,w:56,h:56,side:'right'}};
const surface=(id,kind='companion',usage='driving')=>({id,kind,usage});
const connected=()=>{const p=new Policy();p.update('session',{carplay:'connected'},0);return p;};
describe('parked and calm policy',()=>{
  it('requires both confirmation steps and an active session',()=>{const p=new Policy();expect(p.confirm(2,0)).toBe(false);p.confirm(1,0);expect(p.confirm(2,0)).toBe(false);p.update('session',{carplay:'connected'},0);p.confirm(1,0);expect(p.confirm(2,0)).toBe(true);expect(p.parked(1799999)).toBe('confirmed');expect(p.parked(1800000)).toBe('unknown');});
  for (const trigger of ['disconnect','navigation','timeout','reload']) it(`expires parked on ${trigger}`,()=>{
    let p=connected();p.confirm(1,0);p.confirm(2,0);expect(p.open('p',surface('a','fullscreen','parked'),0)).toBe(true);
    if(trigger==='disconnect')p.update('session',{carplay:'disconnected'},1);
    if(trigger==='navigation')p.update('activity',{siri:false,phoneCall:false,navigation:true},1);
    if(trigger==='timeout')p.tick(1800000);
    if(trigger==='reload')p=new Policy();
    expect(p.parked(trigger==='timeout'?1800000:1)).toBe('unknown');expect(p.loaded).toHaveLength(0);
  });
  for (const state of ['ringing','dialing','active','held','ending']) it(`closes covers for call ${state}`,()=>{const p=connected();p.open('p',surface('a','panel'),0);p.open('p',surface('b'),0);p.update('call',{state},1);expect(p.calm).toBe(true);expect(p.loaded.map(s=>s.id)).toEqual(['b']);expect(p.open('p',surface('a','panel'),2)).toBe(false);});
  it('Siri freezes companions; navigation preserves them',()=>{const p=connected();p.open('p',surface('b'),0);p.update('activity',{siri:true,phoneCall:false,navigation:false},1);expect(p.calm).toBe(true);p.update('activity',{siri:false,phoneCall:false,navigation:true},2);expect(p.calm).toBe(false);expect(p.navigation).toBe(true);expect(p.loaded).toHaveLength(1);});
  it('does not open parked surfaces until confirmed',()=>{const p=connected();expect(p.open('p',surface('full','fullscreen'),0)).toBe(false);expect(p.open('p',surface('panel','panel','parked'),0)).toBe(false);});
  it('retains hidden persistent surfaces',()=>{const p=connected();p.open('p',surface('a'),0);p.visible=false;p.tick(1);expect(p.loaded).toHaveLength(1);expect(p.open('p',surface('b'),1)).toBe(false);});
});
describe('resource and crash limits',()=>{
  it('loads at most two companions and one ambient',()=>{const p=connected();for (let i=0;i<3;i++)expect(p.open('p',surface(String(i)),0)).toBe(i<2);expect(p.open('p',surface('a','ambient'),0)).toBe(true);expect(p.open('q',surface('b','ambient'),0)).toBe(false);});
  it('replaces the single cover and collapses only covers',()=>{const p=connected();p.open('p',surface('a'),0);p.open('p',surface('b','panel'),0);p.open('q',surface('c','panel'),0);expect(p.loaded.map(s=>s.id)).toEqual(['a','c']);p.collapse();expect(p.loaded.map(s=>s.id)).toEqual(['a']);});
  it('pong refreshes timeout; five seconds without pong crashes',()=>{const p=connected();p.open('p',surface('a'),0);p.pong('p','a',4000);p.tick(8999);expect(p.loaded).toHaveLength(1);p.tick(9000);expect(p.loaded).toHaveLength(0);});
  it('disables plugin and all its surfaces on three crashes',()=>{const p=connected();for(let i=0;i<3;i++){p.open('p',surface('a'),i);p.crash('p','a',i);}expect(p.disabled.has('p')).toBe(true);expect(p.open('p',surface('b'),4)).toBe(false);});
  it('forgets crashes outside ten minutes',()=>{const p=connected();p.crash('p','a',0);p.crash('p','a',1);p.crash('p','a',600001);expect(p.disabled.has('p')).toBe(false);});
  it('caps reconnect backoff',()=>expect([0,1,5,10,100].map(reconnectDelay)).toEqual([500,1000,16000,30000,30000]));
});
describe('geometry and receiver limits',()=>{
  it('clamps negative origins by intersection',()=>expect(clamp({x:-5,y:-10,w:20,h:30},{w:100,h:100})).toEqual({x:0,y:0,w:15,h:20}));
  it('computes overlapping union, including nested rectangles',()=>expect(unionArea([{x:0,y:0,w:10,h:10},{x:5,y:0,w:10,h:10},{x:2,y:2,w:3,h:3}])).toBe(150));
  it('positions dock next to both gear sides',()=>{expect(dockRect(geometry).x).toBe(732);expect(dockRect({...geometry,gear:{...geometry.gear,x:24,side:'left'}}).x).toBe(88);});
  it('ambient paints only outside video',()=>expect(unionArea(margins(geometry.viewport,geometry.video))).toBe(876*518-840*494));
  it('shrinks companions in calm and bounds panels',()=>{expect(surfaceRects(surface('a'),geometry,true)[0].w).toBe(80);expect(unionArea(surfaceRects(surface('a','panel'),geometry))).toBeLessThan(876*518*.4);});
  it('enforces union cap, allows fullscreen, and emits disjoint clip paths',()=>{const all=[{x:0,y:0,w:876,h:518}],dock=[dockRect(geometry)];expect(enforceLayout(all,'panel',geometry.viewport,dock)).toEqual(dock);expect(enforceLayout(all,'fullscreen',geometry.viewport,dock)).toEqual(all);expect(clipPath([])).toBe('inset(100%)');expect(clipPath(dock)).toContain('path(');});
  it('clips collapse immediately to last dock regions',()=>{const slot=new ReceiverSlot(geometry);slot.mount(0);slot.layout({regions:[dockRect(geometry)],cover:'none'});slot.layout({regions:[{x:0,y:0,w:876,h:518}],cover:'fullscreen'});expect(slot.collapse()).toEqual([dockRect(geometry)]);expect(slot.cover).toBe('none');});
  it('watchdog rejects unsolicited pong and limits reloads',()=>{const slot=new ReceiverSlot(geometry);slot.mount(0);slot.pong(99,5999);expect(slot.tick(6000)).toBe('reload');slot.mount(6000);slot.pong(slot.ping(),7000);expect(slot.tick(12999)).toBe('ok');expect(slot.tick(13000)).toBe('remove');expect(slot.tick(500000)).toBe('ok');slot.mount(400000);expect(slot.tick(406000)).toBe('reload');});
  it('discovery respects capability, URL and preference',()=>{const caps={plugins:{host:'/plugins/host/index.html'}};expect(discover({},'http://localhost')).toBe(null);expect(discover(caps,'http://localhost?plugins=off')).toBe(null);expect(discover(caps,'http://localhost',false)).toBe(null);expect(discover(caps,'http://localhost')).toBe(caps.plugins.host);});
});
describe('permissions and input validation',()=>{
  it('filters state to declared topics',()=>expect(permittedState({permissions:['session']},{session:{carplay:'connected'},call:{state:'active'}})).toEqual({session:{carplay:'connected'}}));
  it('binds frame identity to source',()=>{const a={},b={};expect(frameForSource([{window:a,id:'a'}],b)).toBeUndefined();expect(frameForSource([{window:a,id:'a'}],a).id).toBe('a');});
  it('restricts storage, quick action and surface identifiers',()=>{const m={...manifest,permissions:[]};expect(permits(m,{type:'storage-get'})).toBe(false);expect(permits(m,{type:'open',surface:'other'})).toBe(false);expect(permits(m,{type:'quick-action-state',id:'other'})).toBe(false);expect(permits(m,{type:'open',surface:'panel'})).toBe(true);});
  it('checks semantic manifest constraints',()=>{for(const change of [{surfaces:[{...manifest.surfaces[0],size:{w:161,h:100}}]},{surfaces:[{...manifest.surfaces[2],usage:'driving'}]},{permissions:['call','call']},{version:'1.0.0-01'},{quickActions:[{...manifest.quickActions[0],opens:'missing'}]}])expect(manifestErrors({...manifest,...change}).length).toBeGreaterThan(0);});
  it('rejects invalid JSON and oversized messages',()=>{expect(parseMessage('channel','{')).toBe(null);expect(parseMessage('channel',' '.repeat(65537))).toBe(null);expect(parseMessage('channel',JSON.stringify({type:'hello',spec:'oxp-web-plugin/1',host:'x'}))).toBe(null);});
});

it('unloads surfaces hidden under fullscreen or beyond the union budget',()=>{
  const loaded=[surface('a'),surface('b'),surface('ambient','ambient'),surface('full','fullscreen','parked')];
  expect(planLayout(loaded,geometry).surfaces.map(s=>s.id)).toEqual(['full']);
  const plan=planLayout(loaded.filter(s=>s.id!=='full'),geometry,{opened:true});
  expect(unionArea(plan.regions.filter(r=>r!==plan.launcher))).toBeLessThanOrEqual(876*518*.4);
  expect(planLayout(loaded,geometry,{visible:false}).surfaces.map(s=>s.id)).toEqual(['a','b','ambient']);
});

it('validates SPDX expression syntax and language tags',async()=>{
  const {spdxExpression,languageTag}=await import('../shared/spdx.js');
  for(const value of ['MIT','Apache-2.0 OR MIT','(MIT AND BSD-2-Clause) OR GPL-2.0-only WITH Classpath-exception-2.0','LicenseRef-Custom'])expect(spdxExpression(value)).toBe(true);
  for(const value of ['','MIT OR','MIT AND (Apache-2.0','not a license','MIT NOT GPL-3.0-only'])expect(spdxExpression(value)).toBe(false);
  for(const value of ['en','zh-CN','x-private','i-klingon'])expect(languageTag(value)).toBe(true);
  expect(languageTag('bad_tag')).toBe(false);
});
it('moves a bottom-right companion along the edge away from dock and gear',()=>{
  const dock=dockRect(geometry,3), rect=surfaceRects({...surface('pet'),anchor:'bottom-right',size:{w:160,h:160}},{...geometry,dock})[0];
  const intersects=(a,b)=>unionArea([a,b])<a.w*a.h+b.w*b.h;
  expect(intersects(rect,geometry.gear)).toBe(false);expect(intersects(rect,dock)).toBe(false);expect(rect.x).toBe(692);expect(rect.y+rect.h).toBeLessThanOrEqual(dock.y);
});
it('receiver excludes the gear even for fullscreen, fallback and collapse',()=>{
  const slot=new ReceiverSlot(geometry);slot.mount(0);
  const full={x:0,y:0,...geometry.viewport};
  for(const regions of [slot.layout({cover:'fullscreen',regions:[full]}),slot.layout({cover:'none',regions:[full]}),slot.collapse()])
    for(const r of regions)expect(unionArea([r,geometry.gear])).toBe(r.w*r.h+geometry.gear.w*geometry.gear.h);
});
it('calm retains both persistent surface kinds without granting regions',()=>{
  const loaded=[surface('pet'),surface('ambient','ambient')];const plan=planLayout(loaded,geometry,{calm:true});
  expect(plan.surfaces).toEqual(loaded);expect(plan.shown).toEqual([]);expect(plan.regions).toEqual([plan.dock]);
});

it('exempts only the user-opened launcher while capping plugin regions',()=>{
  const viewport={w:880,h:518},gear={x:808,y:24,w:48,h:48,side:'right'};
  const plan=planLayout([],{viewport,gear},{opened:true}),slot=new ReceiverSlot({viewport,gear});
  expect(slot.layout({...plan,cover:'panel'})).toContainEqual(plan.launcher);
  const oversized={x:0,y:0,...viewport};
  const regions=slot.layout({cover:'panel',launcher:plan.launcher,regions:[plan.dock,plan.launcher,oversized]});
  expect(regions).toContainEqual(plan.launcher);
  expect(regions).not.toContainEqual(oversized);
  expect(slot.layout({cover:'panel',regions:[plan.launcher]})).not.toContainEqual(plan.launcher);
});
