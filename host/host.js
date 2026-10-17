// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import { SPEC, TOPICS, validMessage, parseMessage, manifestErrors } from '../shared/protocol.js';
import { Policy, reconnectDelay } from './policy.js';
import { dockSize, surfaceRects, clipPath, planLayout } from './layout.js';
import { permittedState, permits } from './access.js';
import { StorageBroker } from './storage.js';
import { enableDragGesture } from '../shared/drag.js';
import { validPrefs, validPosition } from '../shared/positions.js';
import { layoutDelta } from '../shared/coordinates.js';
import { resetPositions, pruneSurfaces, rememberSurfaces, restoreSurfaces, surfaceKey } from './preferences.js';
import { DataStore, topicAllowed } from './data.js';
import { strings } from './strings.js';
const policy = new Policy(), frames = new Map(), manifests = new Map(), broker = new StorageBroker(), pins = new Set(), actionStates = new Map();
const dock = document.querySelector('#dock'), launcher = document.querySelector('#launcher'), surfaces = document.querySelector('#surfaces');
let geometry, socket, attempt = 0, seq = 0, visible = true, opened = false, stalled = false, started = false;
let hostPrefs={}, lastPrefs, prefsLoaded=false, manifestsReady=false, pendingRestore=new Set(), dockGesture=false, layoutTimer, lastLayout=-Infinity;
let text = strings.en, artworkUrl, artworkGeneration = 0, detail, launcherScroll=0, pendingOpen;
const storageBytes=new Map(), lastErrors=new Map();
const now = () => performance.now();
const key = (plugin,id) => `${plugin}/${id}`;
const sendReceiver = (type,data={}) => { if (!stalled) parent.postMessage({oxp:'host/0',type,...data},'*'); };
const sendPlugin = (frame,type,data={},transfer=[]) => frame.element.contentWindow?.postMessage({oxp:'plugin/0',type,...data},'*',transfer);
function sendChannel(message) { if (socket?.readyState === WebSocket.OPEN) { socket.send(JSON.stringify(message)); return true; } return false; }
function localized(map) { return map[geometry.locale] ?? map.en; }
function button(label,fn) { const b=document.createElement('button'); b.textContent=label; b.onclick=fn; return b; }
const pendingStates=new Map(), sentStatesAt=new Map();
function deliverState(topic,value) {
  sentStatesAt.set(topic,now());
  for(const frame of frames.values())if(frame.ready && topicAllowed(manifests.get(frame.plugin),topic))sendPlugin(frame,'state',{topic,value});
}
function queueState(topic,value) {
  if(now()-(sentStatesAt.get(topic) ?? -Infinity)>=250) { pendingStates.delete(topic);deliverState(topic,value); }
  else pendingStates.set(topic,value);
}
const data = new DataStore((topic,value)=>{
  if(topic==='topics') {
    for(const topic of pendingStates.keys())if(!data.topics.includes(topic))pendingStates.delete(topic);
    policy.state=data.state;
    policy.motionAvailable=data.topics.includes('motion');
    if(!policy.motionAvailable)policy.lowSpeedSince=null;
    for(const frame of frames.values())if(frame.ready)sendPlugin(frame,'topics',{topics:topicsFor(manifests.get(frame.plugin))});
  } else {
    policy.update(topic,value,now());
    queueState(topic,value);
  }
});
policy.state=data.state;
data.available('host',['parked']);
function topicsFor(manifest) { return data.topics.filter(t=>topicAllowed(manifest,t)); }
function updateParked() {
  const value=policy.parkedValue(now());
  if(JSON.stringify(data.state.parked)!==JSON.stringify(value))data.update('host','parked',value);
}
function stateFor(manifest) {
  return permittedState(manifest,policy.state);
}
function closeSurface(plugin,id) {
  const k=key(plugin,id); delete hostPrefs.surfaces?.[k]; delete hostPrefs.companions?.[k]; pendingRestore.delete(k);
  policy.close(plugin,id); sync();
}
function open(plugin,id) {
  const surface=manifests.get(plugin)?.surfaces.find(s => s.id===id);
  if (!surface) return;
  if (!policy.disabled.has(plugin) && (surface.usage==='parked' || surface.kind==='fullscreen') && policy.parked(now())!=='confirmed') {
    pendingOpen={plugin,id}; policy.confirm(1,now()); opened=true; sync(); return;
  }
  if (!policy.open(plugin,surface,now())) { launcher.title=policy.disabled.has(plugin) ? text.disabled : text.unavailable; return; }
  opened=false; pendingOpen=undefined; sync();
}
function toggleSurface(plugin,id) {
  if (policy.loaded.some(s=>s.plugin===plugin && s.id===id)) closeSurface(plugin,id); else open(plugin,id);
}
function quick(plugin,action) {
  if (action.opens) { open(plugin,action.opens); return; }
  for (const frame of frames.values()) if (frame.plugin===plugin && ['companion','ambient'].includes(frame.surface.kind) && frame.ready) sendPlugin(frame,'quick-action',{id:action.id});
}
function dockPosition() { return {x:parseFloat(dock.style.left),y:parseFloat(dock.style.top)}; }
function persistPositions() {
  if (!manifestsReady) return;
  const saved=pruneSurfaces(rememberSurfaces(hostPrefs.surfaces,policy.loaded),manifests,policy.disabled);
  const positions={...pruneSurfaces(hostPrefs.companions,manifests,policy.disabled)};
  for (const [id,value] of Object.entries(saved)) if (!validPosition(value)) delete positions[id];
  for (const [id,value] of Object.entries(saved)) if (validPosition(value)) positions[id]=value;
  const {dock: _dock, ...rest}=hostPrefs;
  const value={...rest,...(geometry.dockPosition?{dock:{...dockPosition(),dragged:true}}:{}),companions:positions,surfaces:saved};
  if (validPrefs(value) && JSON.stringify(value)!==lastPrefs) { hostPrefs=value; lastPrefs=JSON.stringify(value); sendReceiver('host-prefs',{value}); }
}
function scheduleLayout(final=false) {
  if (final) { clearTimeout(layoutTimer); layoutTimer=undefined; sync(); persistPositions(); return; }
  if (layoutTimer!==undefined) return;
  layoutTimer=setTimeout(()=>{layoutTimer=undefined;lastLayout=now();sync();},Math.max(0,34-(now()-lastLayout)));
}
function enableDockDrag(element) {
  enableDragGesture(element,move=>{
      if (move.phase==='start') { sendReceiver('wake'); dockGesture={...dockPosition()}; dock.className='lifted'; }
      if (!dockGesture) return;
      const delta=layoutDelta(move,geometry.screenScale);
      geometry.dockPosition={x:dockGesture.x+delta.dx,y:dockGesture.y+delta.dy};
      scheduleLayout(move.phase==='end');
      if (move.phase==='end') { dockGesture=false; dock.className=''; }
    });
}
function renderDock() {
  // Retain the launcher element during a captured gesture and geometry updates.
  let launch=dock.children[0];
  if (!launch) {
    launch=button('',() => { sendReceiver('wake'); opened=!opened; if(opened){detail=undefined;launcherScroll=0;} policy.confirmation=false; pendingOpen=undefined; sync(); });
    launch.className='dock-launcher';
    launch.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>';
    dock.append(launch);
    launch.addEventListener('pointerdown',()=>sendReceiver('wake'));
    enableDockDrag(launch);
  }
  launch.setAttribute('aria-label',text.launcher);
  const size=dockSize(geometry.gear);
  dock.style.setProperty('--dock-icon-w',`${size.w*.5}px`);
  dock.style.setProperty('--dock-icon-h',`${size.h*.5}px`);
  dock.style.opacity=geometry.gear.faded ? '.3' : '1';
  const previous=new Map([...dock.children].slice(1).map(b=>[b.actionKey,b])), retained=new Set();
  // Pinned actions are a session preference, never shared with another plugin.
  for (const [plugin,manifest] of manifests) for (const action of manifest.quickActions) if (pins.has(key(plugin,action.id))) {
    const state=actionStates.get(key(plugin,action.id)) ?? {};
    const id=key(plugin,action.id), b=previous.get(id) ?? button('',() => { sendReceiver('wake'); quick(plugin,action); });
    if (!previous.has(id)) { b.actionKey=id; b.addEventListener('pointerdown',()=>sendReceiver('wake')); enableDockDrag(b); dock.append(b); }
    b.textContent=`${localized(action.label)}${state.badge ? ` ${state.badge}` : ''}`;
    b.setAttribute('aria-pressed',String(!!state.active)); retained.add(id);
  }
  for (const [id,b] of previous) if (!retained.has(id)) b.remove();
  for (const b of dock.children) Object.assign(b.style,{width:`${size.w}px`,height:`${size.h}px`,padding:`${size.h*.25}px ${size.w*.25}px`,borderRadius:`${size.w*.25}px / ${size.h*.25}px`});
}
const glyphs={close:'M6 6l12 12M6 18L18 6',back:'M15 6l-6 6 6 6',more:'M5 12h.01M12 12h.01M19 12h.01',up:'M6 15l6-6 6 6',down:'M6 9l6 6 6-6'};
function iconButton(label,icon,fn) {
  const b=button('',fn); b.className='icon-button'; b.setAttribute('aria-label',label);
  b.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${glyphs[icon]}"/></svg>`; return b;
}
function node(tag,value,className) { const n=document.createElement(tag); n.textContent=value; if(className)n.className=className; return n; }
function pluginIcon(plugin,m) { const img=document.createElement('img'); img.crossOrigin='anonymous'; img.src=`/plugins/p/${plugin}/${m.icon}`; img.alt=''; return img; }
function surfaceLabel(m,s) { return s.label ? localized(s.label) : localized(m.name); }
function primarySurface(m) { return m.surfaces.find(s=>s.kind==='panel') ?? m.surfaces.find(s=>s.kind==='companion') ?? m.surfaces[0]; }
function blockedReason(plugin,s) {
  if(policy.disabled.has(plugin) || !visible || policy.calm && ['panel','fullscreen'].includes(s?.kind))return text.unavailable;
  if(s && (s.usage==='parked' || s.kind==='fullscreen') && policy.parked(now())!=='confirmed')return text.onlyParked;
  if(s && !policy.loaded.some(v=>v.plugin===plugin&&v.id===s.id) && ['companion','ambient'].includes(s.kind) && policy.loaded.filter(v=>v.kind===s.kind).length >= (s.kind==='companion'?2:1))return text.unavailable;
  return '';
}
function resetPluginPositions(plugin) {
  for(const field of ['companions','surfaces'])for(const [id,value] of Object.entries(hostPrefs[field] ?? {}))if(id.startsWith(`${plugin}/`)) {
    if(field==='companions')delete hostPrefs[field][id]; else hostPrefs[field][id]={...value};
    if(field==='surfaces'){delete hostPrefs[field][id].x;delete hostPrefs[field][id].y;delete hostPrefs[field][id].anchor;}
  }
  for(const surface of policy.loaded)if(surface.plugin===plugin){delete surface.position;delete surface.restoredAnchor;surface.anchor=manifests.get(plugin).surfaces.find(s=>s.id===surface.id)?.anchor;surface.anchorReset=true;}
  for(const frame of frames.values())if(frame.plugin===plugin){frame.drag=undefined;frame.element.className='';}
  sync();
}
function reloadPlugin(plugin) {
  // Recreate selected surfaces without changing policy limits or clearing session disablement.
  for(const [id,frame] of frames)if(frame.plugin===plugin)removeFrame(id,frame);
  for(const surface of policy.loaded)if(surface.plugin===plugin)surface.lastPong=now();
  sync();
}
function renderDeveloper(content,plugin,m) {
  if(m.permissions.includes('storage') && !storageBytes.has(plugin) && ![...broker.pending.values()].some(p=>p.plugin===plugin)) {
    const request=broker.begin(`inspector/${plugin}`,plugin,{type:'storage-get',id:'inspect'},now());
    if(request.message && !sendChannel(request.message))broker.cancel(request.message.id);
  }
  const section=document.createElement('section'); section.className='developer'; section.append(node('h2',text.developer));
  for(const [label,value] of [[text.id,m.id],[text.version,m.version],[text.spec,m.spec],[text.permissions,m.permissions.join(', ') || '—'],[text.declared,[...TOPICS,'motion'].filter(t=>m.permissions.includes(t)).join(', ') || '—'],[text.available,topicsFor(m).join(', ') || '—'],[text.subscribed,[...frames.values()].some(f=>f.plugin===plugin && f.ready)?topicsFor(m).join(', ') || '—':'—'],[text.storage,`${storageBytes.has(plugin)?`${storageBytes.get(plugin)} B`:m.permissions.includes('storage')?'—':'0 B'} / 64 KiB`],[text.disabled,policy.disabled.has(plugin)?lastErrors.get(plugin) ?? text.watchdog:'—'],[text.lastError,lastErrors.get(plugin) ?? '—']])section.append(node('p',`${label}: ${value}`));
  for(const s of m.surfaces) {
    const frame=frames.get(key(plugin,s.id));
    const state=policy.disabled.has(plugin)?'disabled':frame?.closing?'closing':!frame?'hidden':!frame.ready?'loaded':frame.element.hidden?'hidden':'visible';
    const card=document.createElement('div');card.className='surface-card';
    card.append(node('p',`${surfaceLabel(m,s)} (${s.kind}) · ${state} · ${text.pong}: ${frame?.latency===undefined?'—':`${frame.latency} ms`} · ${text.lastError}: ${lastErrors.get(key(plugin,s.id)) ?? '—'}`),button(`${text.openKind} ${surfaceLabel(m,s)}`,()=>open(plugin,s.id)));
    section.append(card);
  }
  const actions=document.createElement('div');actions.className='developer-actions';
  actions.append(button(text.reload,()=>reloadPlugin(plugin)),button(text.resetPositions,()=>resetPluginPositions(plugin)));
  const parked=button(text.parked,()=>{policy.parkedUntil=policy.parked(now())==='confirmed'?0:now()+30*60*1000;sync();});
  parked.setAttribute('role','switch');parked.setAttribute('aria-checked',String(policy.parked(now())==='confirmed'));actions.append(parked);section.append(actions);content.append(section);
}
function creditLink(link) {
  const a=node('a',link.label);a.href=link.url;a.target='_blank';a.rel='noopener noreferrer';return a;
}
function renderLauncher() {
  launcher.replaceChildren();
  const controls=document.createElement('nav'), content=document.createElement('div'), pages=document.createElement('nav');
  content.className=detail && manifests.has(detail)?'launcher-content plugin-page':'launcher-content plugin-grid'; launcher.content=content;
  const manifest=manifests.get(detail);
  if(manifest)controls.append(iconButton(text.back,'back',()=>{detail=undefined;launcherScroll=0;sync();}));
  controls.append(node('h1',text.launcher),iconButton(text.close,'close',()=>{opened=false;policy.confirmation=false;pendingOpen=undefined;sync();}));
  if (manifest) {
    const intro=document.createElement('div');intro.className='plugin-intro';intro.append(pluginIcon(detail,manifest),node('h2',localized(manifest.name)),node('p',localized(manifest.description),'description'));content.append(intro);
    for (const surface of manifest.surfaces) {
      const active=policy.loaded.some(s=>s.plugin===detail&&s.id===surface.id);
      const b=button((active?text.hide:text.show).replace('{label}',surfaceLabel(manifest,surface)),()=>toggleSurface(detail,surface.id));b.setAttribute('aria-pressed',String(active));content.append(b);
    }
    for (const action of manifest.quickActions) {
      const row=document.createElement('div');row.className='quick-action';row.append(button(localized(action.label),()=>quick(detail,action)));
      const id=key(detail,action.id),label=document.createElement('label'),pin=document.createElement('input');
      pin.type='checkbox';pin.setAttribute('role','switch');pin.setAttribute('aria-label',`${localized(action.label)}: ${text.pin}`);pin.checked=pins.has(id);pin.disabled=!pin.checked&&pins.size>=2;
      pin.onchange=()=>{if(pins.has(id))pins.delete(id);else if(pins.size<2)pins.add(id);sync();};label.append(node('span',text.pin),pin);row.append(label);content.append(row);
    }
    const about=document.createElement('section');about.className='about';about.append(node('h2',text.about),node('p',`${text.author}: ${manifest.author ?? text.unknown}`),node('p',`${text.version}: ${manifest.version}`));
    const notes=document.createElement('details');notes.className='licence-notes';notes.append(node('summary',text.fullLicence),node('p',`${text.license}: ${manifest.license}`));
    for(const credit of manifest.attributions ?? []) {
      const links=(credit.links ?? []).filter(link=>/^https?:\/\//.test(link.url));
      // Legacy attribution text groups each work in a paragraph, headed by “work by author”.
      for(const paragraph of localized(credit.text).split(/\n\s*\n/)) {
        const lines=paragraph.split('\n'), heading=lines[0].split(/ by /);
        if(heading.length!==2)continue;
        const [author,inlineLicence]=heading[1].split(/ — /);
        const licenceLine=lines.find(line=>/^(?:CC |MIT$|Apache-|Licence:)/.test(line));
        if(!inlineLicence && !licenceLine)continue;
        const licence=inlineLicence ?? licenceLine.replace(/^Licence: /,'').replace(/\.$/,'');
        const row=node('p',`${heading[0]} · ${author} · `,'credit-line');
        const link=links.find(link=>link.label===licence || licence.startsWith(`${link.label} (`));
        if(link)row.append(creditLink(link));else row.append(node('span',licence));
        about.append(row);
      }
      notes.append(node('p',localized(credit.text)));
      for(const link of links)notes.append(creditLink(link));
    }
    about.append(notes);
    content.append(about);
    if(geometry.developer===true)renderDeveloper(content,detail,manifest);
  } else for (const [plugin,m] of manifests) {
    const primary=primarySurface(m), active=policy.loaded.some(s=>s.plugin===plugin),reason=blockedReason(plugin,primary);
    const wrapper=document.createElement('div');wrapper.className=`tile-wrap${reason?' muted':''}`;
    const tile=button('',()=>{if(primary)toggleSurface(plugin,primary.id);});tile.className='plugin-tile';tile.setAttribute('aria-pressed',String(active));
    tile.append(pluginIcon(plugin,m),node('span',localized(m.name),'plugin-name'));tile.title=localized(m.name);
    if(reason)tile.append(node('small',reason));
    if(geometry.developer===true){const meta=node('small',`${plugin} · ${m.version}`,'plugin-meta');meta.title=plugin;tile.append(meta);}
    wrapper.append(tile,iconButton(`${localized(m.name)}: ${text.details}`,'more',()=>{detail=plugin;launcherScroll=0;sync();}));content.append(wrapper);
  }
  if (!manifests.size)content.append(node('p',text.empty));
  if(policy.confirmation && pendingOpen) {
    const sheet=document.createElement('section');sheet.className='parked-confirm';sheet.setAttribute('role','alertdialog');sheet.setAttribute('aria-label',text.parkedQuestion);
    sheet.append(node('p',text.parkedQuestion),button(text.confirm,()=>{const target=pendingOpen;if(policy.confirm(2,now())){pendingOpen=undefined;open(target.plugin,target.id);}else sync();}),button(text.cancel,()=>{policy.confirmation=false;pendingOpen=undefined;sync();}));
    content.prepend ? content.prepend(sheet) : content.append(sheet);
  }
  const up=iconButton(text.pageUp,'up',()=>{content.scrollTop=Math.max(0,content.scrollTop-content.clientHeight);updatePages();});
  const down=iconButton(text.pageDown,'down',()=>{content.scrollTop+=content.clientHeight;updatePages();});
  function updatePages(){launcherScroll=content.scrollTop;pages.hidden=content.scrollHeight<=content.clientHeight;up.disabled=content.scrollTop<=0;down.disabled=content.scrollTop+content.clientHeight>=content.scrollHeight-1;}
  pages.append(up,down);launcher.append(controls,content,pages);content.scrollTop=launcherScroll;content.onscroll=updatePages;
  requestAnimationFrame(updatePages);
}
function surfaceData(frame) {
  const surface=frame.surface, r=frame.rect ?? {x:0,y:0,w:0,h:0};
  return {w:r.w,h:r.h,visible:visible&&!policy.calm&&!frame.closing&&!frame.element.hidden,calm:policy.calm,closing:!!frame.closing,anchor:surface.anchor,video:{...geometry.video,x:geometry.video.x-r.x,y:geometry.video.y-r.y},viewport:{...geometry.viewport}};
}
function flushStorage() { for(const message of broker.flush(now())) if(!sendChannel(message))broker.cancel(message.id); }
function removeFrame(id,frame) {
  flushStorage(); frame.element.remove();frames.delete(id);broker.forget(id);
}
function sync() {
  if (!geometry) return;
  if (manifestsReady) {
    const saved=pruneSurfaces(hostPrefs.surfaces,manifests,policy.disabled);
    restoreSurfaces(saved,pendingRestore,manifests,policy,now());
  }
  updateParked();
  policy.reconcile(now());
  for (const surface of policy.loaded) if (!surface.position && !surface.anchorReset) {
    const saved=hostPrefs.companions?.[key(surface.plugin,surface.id)];
    if (validPosition(saved)) { surface.position={x:saved.x,y:saved.y}; surface.restoredAnchor=saved.anchor ?? surface.anchor; }
  }
  const plan=planLayout(policy.loaded,geometry,{opened,visible,calm:policy.calm,pins:pins.size});
  // Keep persistent surfaces alive when geometry or an overlay temporarily hides them.
  const shown=plan.shown ?? plan.surfaces;
  renderDock();
  const dockRegion=plan.dock;
  if (geometry.dockPosition) geometry.dockPosition={x:dockRegion.x,y:dockRegion.y};
  Object.assign(dock.style,{left:`${dockRegion.x}px`,top:`${dockRegion.y}px`,width:`${dockRegion.w}px`,height:`${dockRegion.h}px`});
  const launcherRegion=plan.launcher;
  Object.assign(launcher.style,{left:`${launcherRegion.x}px`,top:`${launcherRegion.y}px`,width:`${launcherRegion.w}px`,height:`${launcherRegion.h}px`});
  launcher.hidden=!opened || !visible;
  for (const [id,frame] of frames) if (!policy.loaded.some(s => key(s.plugin,s.id)===id)) {
    if (['panel','fullscreen'].includes(frame.surface.kind) && frame.ready && !policy.disabled.has(frame.plugin) && now()-frame.surface.lastPong<5000) {
      if (!frame.closing) {
        frame.closing=true;frame.element.hidden=true;
        sendPlugin(frame,'surface',{...surfaceData(frame),visible:false,closing:true});
        setTimeout(()=>{if(frames.get(id)===frame)removeFrame(id,frame);},500);
      }
    } else removeFrame(id,frame);
  }
  const {regions,cover}=plan;
  for (const [index,surface] of policy.loaded.entries()) {
    const id=key(surface.plugin,surface.id), manifest=manifests.get(surface.plugin);
    let frame=frames.get(id);
    if (frame?.closing) { removeFrame(id,frame);frame=undefined; }
    if (!frame) {
      const element=document.createElement('iframe'); element.setAttribute('sandbox','allow-scripts'); element.setAttribute('allow',''); element.referrerPolicy='no-referrer';
      element.title=localized(manifest.name);element.style.colorScheme='light'; element.src=`/plugins/p/${surface.plugin}/${surface.entry}`;
      frame={element,plugin:surface.plugin,surface,ready:false,ping:0}; frames.set(id,frame); surfaces.append(element);
      element.onerror=() => { lastErrors.set(surface.plugin,text.frameError); lastErrors.set(key(surface.plugin,surface.id),text.frameError); policy.crash(surface.plugin,surface.id,now()); sync(); };
    }
    frame.surface=surface;frame.element.hidden=!visible || policy.calm || !shown.includes(surface);
    const rects=surfaceRects(surface,{...geometry,dock:plan.dock},policy.calm,index), r=rects[0] ?? {x:0,y:0,w:0,h:0};
    if (surface.kind==='ambient') {
      Object.assign(frame.element.style,{left:'0px',top:'0px',width:`${geometry.viewport.w}px`,height:`${geometry.viewport.h}px`,clipPath:clipPath(rects),pointerEvents:'none',opacity:policy.calm ? '.25' : '1'});
    } else Object.assign(frame.element.style,{left:`${r.x}px`,top:`${r.y}px`,width:`${r.w}px`,height:`${r.h}px`});

    if (surface.position && r.w && r.h) surface.position={x:r.x,y:r.y};
    frame.rect=surface.kind==='ambient' ? {x:0,y:0,...geometry.viewport} : r;
    if (frame.ready) {
      sendPlugin(frame,'surface',{...surfaceData(frame),locale:geometry.locale,theme:geometry.theme,reducedMotion:geometry.reducedMotion || policy.navigation,motion:policy.calm ? 'frozen' : policy.navigation ? 'idle' : 'normal'});
      sendPlugin(frame,'parked',{value:policy.parked(now())});
    }
  }
  renderLauncher();
  sendReceiver('layout',{regions,cover,...(opened && cover==='panel'?{launcher:launcherRegion}:{})});
  if (!dockGesture && ![...frames.values()].some(f=>f.drag)) persistPositions();
}
async function artwork(value) {
  const generation=++artworkGeneration;
  if (!value?.artwork || !/^\/plugins\/artwork\/[a-f0-9]{64}$/.test(value.artwork.url)) { artworkUrl=undefined; return; }
  artworkUrl=value.artwork.url;
  const targets=[...frames.values()].filter(frame=>frame.ready && manifests.get(frame.plugin).permissions.includes('nowPlaying.artwork'));
  if(!targets.length)return;
  try {
    const response=await fetch(artworkUrl); if (!response.ok) return;
    const blob=await response.blob();
    for (const frame of targets) {
      const bitmap=await createImageBitmap(blob);
      if (generation!==artworkGeneration || !frames.has(key(frame.plugin,frame.surface.id))) { bitmap.close(); continue; }
      sendPlugin(frame,'artwork',{bitmap},[bitmap]);
    }
  } catch { /* Artwork is optional. */ }
}
function deliver(reply) {
  if(Array.isArray(reply)){for(const item of reply)deliver(item);return;}
  if(!reply)return;const frame=frames.get(reply.frame);if(frame)sendPlugin(frame,reply.message.type,reply.message);
}
function connectChannel() {
  const url=new URL(geometry.channel,location.href); url.protocol=location.protocol==='https:' ? 'wss:' : 'ws:';
  socket=new WebSocket(url);
  socket.onopen=() => { sendChannel({type:'hello',spec:SPEC,host:'reference/0'}); };
  socket.onmessage=event => {
    const m=parseMessage('channel',event.data); if (!m) return;
    if (m.type==='welcome') {
      attempt=0; manifests.clear();
      for (const manifest of m.plugins) if (!manifestErrors(manifest).length) manifests.set(manifest.id,manifest);
      manifestsReady=true;
      policy.loaded=policy.loaded.filter(s=>!policy.disabled.has(s.plugin) && manifests.get(s.plugin)?.surfaces.some(d=>d.id===s.id && d.kind===s.kind)); sync();
      data.available('relay',m.topics);
      sendChannel({type:'subscribe',topics:m.topics.filter(t=>TOPICS.includes(t))});
    }
    if (m.type==='state') {
      if(!data.update('relay',m.topic,m.value))return;
      if (m.topic==='session' && m.value?.carplay!=='connected') opened=false;
      if (policy.calm) opened=false;
      sync(); if (m.topic==='nowPlaying') void artwork(m.value);
    }
    const pending=broker.pending.get(m.id);
    if(pending && m.type==='storage')storageBytes.set(pending.plugin,m.value===null?0:new TextEncoder().encode(JSON.stringify(m.value)).length);
    if(pending && m.type==='storage-ok' && pending.write)storageBytes.set(pending.plugin,new TextEncoder().encode(JSON.stringify(pending.write.value)).length);
    if(pending && m.type==='error')lastErrors.set(pending.plugin,m.code);
    deliver(broker.finish(m,now()));flushStorage();
  };
  socket.onclose=() => { for(const reply of broker.expire(now(),true)) deliver(reply); data.update('relay','session',null); data.available('relay',[]); sync(); setTimeout(connectChannel,reconnectDelay(attempt++)); };
  socket.onerror=() => socket.close();
}
window.addEventListener('message',event => {
  const m=event.data;
  // Simulator-only control is sent by the receiver and never by plugin frames; checked first
  // because unknown host messages are otherwise accepted and ignored.
  if (event.source===parent && m?.oxp==='host/0' && m.type==='simulate-stall') { stalled=true; return; }
  if (event.source===parent && validMessage('host',m)) {
    if (m.type==='state') { if(data.update('receiver',m.topic,m.value))sync(); return; }
    if (m.type==='ping') { sendReceiver('pong',{seq:m.seq}); return; }
    if (m.type==='reset-positions' && geometry) {
      hostPrefs=resetPositions(hostPrefs); prefsLoaded=true; geometry.dockPosition=undefined; dockGesture=false; dock.className='';
      for (const surface of policy.loaded) {
        delete surface.position; delete surface.restoredAnchor;
        surface.anchor=manifests.get(surface.plugin)?.surfaces.find(s=>s.id===surface.id)?.anchor;
        surface.anchorReset=true;
      }
      for (const frame of frames.values()) { frame.drag=undefined; frame.element.className=''; }
      sync(); return;
    }
    if (m.type==='collapse') { opened=false; policy.collapse(); sync(); return; }
    if (m.type==='visibility') { visible=m.visible; policy.visible=visible; if (!visible) opened=false; sync(); return; }
    if (m.type==='init' || m.type==='geometry') {
      if(m.type==='init' || m.topics!==undefined)data.available('receiver',m.topics ?? []);
      const previous=geometry?.dockPosition;
      // Preferences bootstrap this host once. Geometry messages may echo stale storage
      // while a save/reset is in flight; they must never undo live host state.
      if (!prefsLoaded) {
        hostPrefs=validPrefs(m.hostPrefs)?m.hostPrefs:{};
        pendingRestore=new Set(Object.keys(hostPrefs.surfaces ?? {})); prefsLoaded=true;
        lastPrefs=JSON.stringify(hostPrefs);
      }
      geometry={...m,dockPosition:previous ?? (hostPrefs.dock?.dragged===true && validPosition(hostPrefs.dock)?hostPrefs.dock:undefined)}; text=strings[m.locale==='zh-CN' ? 'zh-CN':'en']; document.documentElement.lang=m.locale; document.documentElement.style.colorScheme=m.theme;
      if (!started) { started=true; connectChannel(); }
      sync(); return;
    }
    return;
  }
  const frame=[...frames.values()].find(f => f.element.contentWindow===event.source);
  if (!frame || !validMessage('plugin',m)) return;
  const manifest=manifests.get(frame.plugin);
  if (m.type==='hello') {
    frame.ready=true; policy.pong(frame.plugin,frame.surface.id,now());
    const data=surfaceData(frame);
    sendPlugin(frame,'welcome',{spec:SPEC,pluginId:frame.plugin,surface:{id:frame.surface.id,kind:frame.surface.kind,w:data.w,h:data.h,visible:data.visible,calm:data.calm,closing:data.closing,anchor:data.anchor},video:data.video,viewport:data.viewport,permissions:manifest.permissions,locale:geometry.locale,theme:geometry.theme,reducedMotion:geometry.reducedMotion,parked:policy.parked(now()),topics:topicsFor(manifest),state:stateFor(manifest)});
    sync(); if (artworkUrl) void artwork(policy.state.nowPlaying); return;
  }
  if (!frame.ready) return;
  if (!permits(manifest,m)) { if (m.type==='storage-get' || m.type==='storage-set') sendPlugin(frame,'error',{id:m.id,code:'permission'}); return; }
  if (m.type==='surface-request' && frame.surface.kind==='companion' && !frame.closing) {
    const declared=manifest.surfaces.find(s=>s.id===frame.surface.id);
    if(m.anchor) {
      // Pets repeat their configured anchor once at startup; preserve a restored drag there.
      const restoring=frame.initialAnchor!==false && frame.surface.position && m.anchor===frame.surface.restoredAnchor;
      frame.initialAnchor=false; frame.surface.anchor=m.anchor;
      if (!restoring) { delete frame.surface.position; frame.surface.anchorReset=true; frame.drag=undefined;frame.element.className=''; }
    }
    if(m.move && (m.move.phase==='end' || visible && !policy.calm && !frame.element.hidden)) {
      const move=m.move;
      if(move.phase==='start') { frame.drag={x:frame.rect.x,y:frame.rect.y}; frame.element.className='lifted'; }
      if(frame.drag) {
        const delta=layoutDelta(move,geometry.screenScale);
        frame.surface.position={x:frame.drag.x+delta.dx,y:frame.drag.y+delta.dy};
        scheduleLayout(move.phase==='end');
        if(move.phase==='end') { frame.drag=undefined;frame.element.className=''; }
      }
      return;
    }
    if(m.size)frame.surface.size={w:Math.min(m.size.w,declared.size?.w ?? 160),h:Math.min(m.size.h,declared.size?.h ?? 160)};
    sync(); persistPositions();
  }
  if (m.type==='pong' && m.seq===frame.ping) { frame.latency=Math.max(0,Math.round(now()-frame.pingAt)); policy.pong(frame.plugin,frame.surface.id,now()); }
  if (m.type==='close') { const id=surfaceKey(frame.surface); delete hostPrefs.surfaces?.[id]; delete hostPrefs.companions?.[id]; pendingRestore.delete(id); policy.close(frame.plugin,frame.surface.id); sync(); }
  if (m.type==='open') open(frame.plugin,m.surface);
  if (m.type==='quick-action-state' && manifest.quickActions.some(a => a.id===m.id)) { actionStates.set(key(frame.plugin,m.id),{badge:m.badge,active:m.active}); sync(); }
  if (m.type==='storage-get' || m.type==='storage-set') {
    if (!manifest.permissions.includes('storage')) { sendPlugin(frame,'error',{id:m.id,code:'permission'}); return; }
    const request=broker.begin(key(frame.plugin,frame.surface.id),frame.plugin,m,now());
    if(request.reply)sendPlugin(frame,request.reply.type,request.reply);
    else if(request.message && !sendChannel(request.message)) {broker.cancel(request.message.id);sendPlugin(frame,'error',{id:m.id,code:'protocol'});}

  }
});
setInterval(() => {
  const before=[...policy.loaded];policy.tick(now());for(const s of before)if(!policy.loaded.includes(s)){lastErrors.set(s.plugin,text.watchdog);lastErrors.set(key(s.plugin,s.id),text.watchdog);}sync();
  for (const frame of frames.values()) { frame.ping=++seq; frame.pingAt=now(); sendPlugin(frame,'ping',{seq:frame.ping}); }
  for (const reply of broker.expire(now())) deliver(reply);
},2000);
// Check the five-second deadline independently of the two-second ping cadence.
setInterval(() => { const n=policy.loaded.length, previous=JSON.stringify(data.state.parked); const before=[...policy.loaded];policy.tick(now());for(const s of before)if(!policy.loaded.includes(s)){lastErrors.set(s.plugin,text.watchdog);lastErrors.set(key(s.plugin,s.id),text.watchdog);}updateParked(); if (n!==policy.loaded.length || previous!==JSON.stringify(data.state.parked)) sync(); },250);
setInterval(flushStorage,50);
sendReceiver('ready',{spec:SPEC});

setInterval(()=>{for(const [topic,value] of pendingStates)if(now()-(sentStatesAt.get(topic) ?? -Infinity)>=250){pendingStates.delete(topic);deliverState(topic,value);}},50);
