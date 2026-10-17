// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import {it,expect} from 'vitest';
import {placeFree,intersects,validPrefs,readPrefs,savePrefs} from '../shared/positions.js';
import {acceptHostPrefs,hostPrefs,HOST_PREFS_KEY} from '../simulator/receiver-policy.js';
import {dockRect,dockSize,surfaceRects,planLayout,unionArea,enforceLayout,overlaps} from '../host/layout.js';
const viewport={w:876,h:518},gear={x:400,y:240,w:56,h:56,side:'right'};
it('clamps all edges with margin, supports free centers and adapts on resize',()=>{
  expect(placeFree({x:250,y:180,w:56,h:56},viewport)).toEqual({x:250,y:180,w:56,h:56});
  expect(placeFree({x:-100,y:900,w:56,h:56},viewport)).toEqual({x:24,y:438,w:56,h:56});
  expect(placeFree({x:700,y:400,w:56,h:56},{w:300,h:200})).toEqual({x:220,y:120,w:56,h:56});
  expect(placeFree({x:0,y:0,w:160,h:160},{w:100,h:80})).toEqual({x:0,y:0,w:100,h:80});
});
it('nudges out of multiple obstacles, preserves size and fails closed without space',()=>{
  const obstacles=[gear,{x:460,y:200,w:160,h:160}];
  const result=placeFree({x:420,y:250,w:120,h:120},viewport,obstacles);
  expect(obstacles.some(o=>intersects(result,o))).toBe(false);expect(result.w).toBe(120);
  expect(placeFree({x:0,y:0,w:56,h:56},{w:56,h:56},[{x:0,y:0,w:56,h:56}])).toBeNull();
});
it('plans a free dock and companion around each other and the gear',()=>{
  const geometry={viewport,gear,video:{x:0,y:0,...viewport},dockPosition:{x:400,y:240}};
  const dock=dockRect(geometry,3);expect(dock.w).toBe(176);expect(intersects(dock,gear)).toBe(false);
  const [pet]=surfaceRects({kind:'companion',position:{x:dock.x,y:dock.y}},{...geometry,dock});
  expect(intersects(pet,dock)).toBe(false);expect(intersects(pet,gear)).toBe(false);
});
it('roundtrips receiver-owned preferences and rejects invalid or oversized values',()=>{
  const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
  const value={dock:{x:250,y:150},companions:{'org.pet/companion':{x:500,y:250,anchor:'bottom-right'}}};
  expect(acceptHostPrefs(storage,{type:'host-prefs',value})).toBe(true);expect(hostPrefs(storage)).toEqual(value);
  expect(acceptHostPrefs(storage,{type:'host-prefs',value:{text:'界'.repeat(1400)}})).toBe(false);expect(hostPrefs(storage)).toEqual(value);
  expect(validPrefs([])).toBe(false);expect(validPrefs(null)).toBe(false);
  expect(validPrefs({text:'a'.repeat(4085)})).toBe(true);expect(validPrefs({text:'a'.repeat(4086)})).toBe(false);
  data.set(HOST_PREFS_KEY,'broken');expect(hostPrefs(storage)).toEqual({});
  const broken={getItem:()=>{throw Error();},setItem:()=>{throw Error();}};
  expect(readPrefs(broken,'x')).toEqual({});expect(savePrefs(broken,'x',value)).toBe(false);
});

it('sizes dock regions from the receiver gear with a 48px fallback',()=>{
  expect(dockSize({w:0,h:NaN})).toEqual({w:48,h:48});expect(dockSize()).toEqual({w:48,h:48});
  expect(dockRect({viewport,gear:{...gear,w:72,h:60}},3)).toMatchObject({w:224,h:60});
});

it('places the unsaved dock left of the top-right gear with the receiver gap',()=>{
  const g={x:804,y:24,w:48,h:48,side:'right',gap:10};
  expect(dockRect({viewport,gear:g})).toEqual({x:746,y:24,w:48,h:48});
  expect(dockRect({viewport,gear:g,dockPosition:{x:300,y:200}})).toEqual({x:300,y:200,w:48,h:48});
});
it.each([{w:360,h:800},{w:320,h:568},{w:876,h:518},{w:1920,h:720}])('keeps launcher names room outside the plugin budget: %j',v=>{
  const g={x:v.w-72,y:24,w:48,h:48,side:'right'},plan=planLayout([],{viewport:v,gear:g},{opened:true});
  expect(plan.launcher.w).toBeGreaterThanOrEqual(Math.min(280,v.w-48));
  expect(plan.launcher.h).toBe(v.h-24-plan.launcher.y);
  // The gear can cut a corner out of the sheet, but must never cause a dock-only fallback.
  expect(unionArea(enforceLayout(plan.regions,'panel',v,[plan.dock],g,plan.launcher))).toBeGreaterThanOrEqual(plan.launcher.w*plan.launcher.h-g.w*g.h);
});

it.each([{w:880,h:518},{w:1200,h:540},{w:360,h:640},{w:320,h:568}])('sizes the launcher for tiles while preserving margins and controls: %j',viewport=>{
  const gear={x:viewport.w-72,y:24,w:48,h:48,side:'right'};
  const plan=planLayout([],{viewport,gear},{opened:true}),r=plan.launcher;
  expect(r.w).toBe(Math.min(viewport.w-48,Math.max(280,Math.min(640,viewport.w*.7))));
  expect(r.x).toBeGreaterThanOrEqual(24);expect(r.y).toBeGreaterThanOrEqual(24);
  expect(r.x+r.w).toBeLessThanOrEqual(viewport.w-24);expect(r.y+r.h).toBeLessThanOrEqual(viewport.h-24);
  expect(overlaps(r,gear)).toBe(false);expect(overlaps(r,plan.dock)).toBe(false);
  expect(r.h).toBe(viewport.h-24-r.y);
  if(viewport.w>=880)expect(r).toMatchObject({y:24,h:viewport.h-48});
  else expect(r).toMatchObject({y:72,h:viewport.h-96});
});

// Run these browser layout assertions where Chromium is available; sandboxed runners
// can still run the geometry tests above without launching a browser process.
it.for([{w:880,h:518},{w:360,h:640}])('renders a complete tile row and scrollable plugin page in zh-CN: %j',async(viewport,context)=>{
  const {readFile,mkdtemp,writeFile,rm,access}=await import('node:fs/promises');
  const {tmpdir}=await import('node:os');
  const {join}=await import('node:path');
  const {execFileSync}=await import('node:child_process');
  const candidates=[process.env.CHROME_BIN,'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/chromium','/usr/bin/google-chrome'].filter(Boolean);
  let chrome;
  for(const candidate of candidates)try{await access(candidate);chrome=candidate;break;}catch{}
  if(!chrome){context.skip('Chromium unavailable; set CHROME_BIN to run browser layout assertions');return;}
  const gear={x:viewport.w-72,y:24,w:48,h:48,side:'right'};
  const r=planLayout([],{viewport,gear},{opened:true}).launcher;
  const css=await readFile('host/style.css','utf8'),dir=await mkdtemp(join(tmpdir(),'oxp-launcher-layout-'));
  const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>${css}</style>
    <section id="launcher" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px">
      <nav><h1>插件</h1><button class="icon-button">×</button></nav>
      <div class="launcher-content plugin-grid">${Array.from({length:24},()=>`<div class="tile-wrap"><button class="plugin-tile"><img alt="" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"><span class="plugin-name">海洋少女可爱宠物</span><small>已停用</small></button><button class="icon-button" aria-label="更多">•••</button></div>`).join('')}</div>
      <nav><button>⌃</button><button>⌄</button></nav>
    </section><pre id="result"></pre><script>
    onload=()=>{try{
      const check=(value,message)=>{if(!value)throw Error(message);}, launcher=document.querySelector('#launcher'),content=launcher.children[1];
      const box=e=>e.getBoundingClientRect(),viewportHeight=${viewport.h};
      check(box(launcher).height===${r.h},'launcher height');
      check(box(launcher).bottom===viewportHeight-24,'bottom margin');
      const first=box(content.firstElementChild);
      for(const tile of content.children){if(box(tile).top!==first.top)break;
        const more=box(tile.lastElementChild),button=box(tile.firstElementChild);
        check(more.top>=first.top && more.bottom<=box(content).bottom,'complete row including more');
        check(button.bottom<=box(tile).bottom+1,'tile contained in row');
      }
      check(content.scrollHeight>content.clientHeight,'grid scrolls');
      content.scrollTop+=content.clientHeight;
      check(content.scrollTop>0,'paging advances');
      content.className='launcher-content plugin-page';
      content.innerHTML='<div class="plugin-intro"><h2>海洋少女</h2><p>描述</p></div>'+Array.from({length:20},()=>'<button>显示宠物</button>').join('');
      content.scrollTop=0;
      check(box(content.children[1]).height>=48,'detail buttons retain touch height');
      check(content.scrollHeight>content.clientHeight,'detail scrolls');
      content.scrollTop=content.scrollHeight;
      check(box(content.lastElementChild).bottom<=box(content).bottom+1,'last detail reachable');
      document.querySelector('#result').textContent='LAYOUT PASS';
    }catch(error){document.querySelector('#result').textContent='LAYOUT FAIL: '+error.message;}};
    </script></html>`;
  try{
    const file=join(dir,'layout.html');await writeFile(file,html);
    let output;
    try{output=execFileSync(chrome,['--headless','--no-sandbox','--disable-gpu',`--user-data-dir=${join(dir,'profile')}`,`--window-size=${viewport.w},${viewport.h}`,'--dump-dom',`file://${file}`],{encoding:'utf8',timeout:20000,stdio:['ignore','pipe','pipe']});}
    catch(error){if(error.signal==='SIGABRT' || /Operation not permitted|EPERM/.test(String(error.stderr))){context.skip('Sandbox blocks Chromium launch');return;}throw error;}
    expect(output).toContain('<pre id="result">LAYOUT PASS</pre>');
  }finally{await rm(dir,{recursive:true,force:true});}
},30000);
