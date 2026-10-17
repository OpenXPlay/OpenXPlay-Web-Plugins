// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import {connect} from './oxp-plugin-sdk.js';
import {settings, saved, mergeMood, BREEDS, CORNERS, createCat, configure, tick, hostFlags, update, pat, view, canPlay, playTap} from './model.js';
import {mountCat} from './draw.js';
import {words} from './strings.js';

const root=document.querySelector('#root');
try {
  const host=await connect();
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  const now=()=>performance.now();
  const kind=host.surface.kind;
  let config=saved(null), storageError=false;
  try {config=saved(await host.storage.get());} catch {storageError=true;}
  let committed=config;
  let cat=createCat(now(),config.breed,config.mood), art, artKey, artSize, deadline, poll, badgeTimer;
  let disposed=false, reading=false, saving=false, page=0, closing=false;
  let game={catches:0,side:'left'};
  const unsub=[];
  const t=()=>words(host.locale);
  const canvas=document.createElement('canvas');
  const catButton=document.createElement('button');catButton.className='cat';catButton.append(canvas);
  if (kind==='companion') host.surface.enableDrag(catButton);
  let status, playButton, yarn, score;
  const flags=()=>({visible:host.surface.visible&&!document.hidden&&!host.surface.closing,
    calm:host.surface.calm,reducedMotion:host.reducedMotion||motion.matches,parked:host.parked});
  const button=(label,handler)=>{const b=document.createElement('button');b.textContent=label;b.onclick=handler;return b;};
  function localize() {
    document.documentElement.lang=/^zh/i.test(host.locale)?'zh-CN':'en';
    document.title=t().title;
  }
  function refresh() {
    clearTimeout(deadline);
    if(disposed)return;
    cat=hostFlags(cat,flags(),now());
    const v=view(cat,config,now(),new Date().getHours());
    localize();
    if(kind==='fullscreen'&&!canPlay(cat)&&!closing) {closing=true;persist();host.surface.close();}
    if(kind!=='panel') {
      const key=config.breed;
      if(key!==artKey) {art?.animator.dispose();art=mountCat(canvas,config.breed);artKey=key;artSize=null;}
      const size=kind==='fullscreen'?224:Math.min(v.calm?80:config.size,host.surface.w||160,host.surface.h||160);
      catButton.style.width=`${size}px`;catButton.style.height=`${size}px`;
      if(artSize!==size){art.resize(size);artSize=size;}
      art.animator.setFlags(v);
      art.animator.play(v.state,{baseState:v.baseState,key:v.reactionId});
      catButton.setAttribute('aria-label',`${config.name||t()[config.breed]}: ${t()[v.floppy?'floppy':v.state]}`);
      if(status)status.textContent=t()[v.floppy?'floppy':v.state];
      if(playButton)playButton.disabled=!canPlay(cat);
      if(yarn)yarn.disabled=!canPlay(cat);
    } else if(status) {
      status.textContent=`${t()[v.state]} · ${t().pats}: ${cat.mood.pats}`;
      if(playButton)playButton.disabled=!canPlay(cat);
    }
    if(!v.visible||v.calm||v.reducedMotion||v.still) {
      clearTimeout(poll);clearTimeout(badgeTimer);host.quickActions.setState('pet',{badge:''});return;
    }
    // Engine deadlines and wall-clock hour changes need no animation polling.
    const hourDelay=3600000-Date.now()%3600000;
    const roundDelay=config.breed==='orange'&&!v.round?1800000-cat.mood.companyMs:Infinity;
    const delay=Math.min(hourDelay,roundDelay,v.nextChangeAt===null?Infinity:v.nextChangeAt-now());
    deadline=setTimeout(refresh,Math.max(20,delay));
  }
  // Read before writing so settings and mood survive changes from another surface.
  // Closing uses the host's grace window and queues a write immediately.
  async function persist(preferences=false, immediate=false) {
    const snapshot=tick(cat,now());cat=snapshot;
    try {
      const latest=immediate?committed:saved(await host.storage.get());
      const value={...(preferences?settings(config):settings(latest)),mood:mergeMood(latest.mood,snapshot.mood)};
      await host.storage.set(value);storageError=false;
      committed=value;config={...config,mood:value.mood};return true;
    } catch {storageError=true;return false;}
  }
  async function syncSettings() {
    clearTimeout(poll);
    if(disposed||reading||!flags().visible||flags().calm||flags().reducedMotion)return;
    reading=true;
    try {
      const next=saved(await host.storage.get());
      if(disposed)return;
      committed=next;
      cat={...cat,mood:mergeMood(cat.mood,next.mood)};
      if(JSON.stringify(settings(config))!==JSON.stringify(settings(next))) {
        config=next;cat=configure(cat,config.breed);artKey=null;
        host.surface.request({anchor:config.corner});
      }
      refresh();
      if(cat.mood.companyMs-next.mood.companyMs>=60000)persist();
    } catch { /* Retain the last known settings when storage is unavailable. */ }
    finally {reading=false;}
    if(!disposed&&flags().visible&&!flags().calm&&!flags().reducedMotion)poll=setTimeout(syncSettings,3000);
  }
  function pet() {
    cat=hostFlags(cat,flags(),now());
    const next=pat(cat,now(),config.breed);
    if(next===cat)return;
    cat=next;host.quickActions.setState('pet',{badge:'♥'});
    clearTimeout(badgeTimer);badgeTimer=setTimeout(()=>host.quickActions.setState('pet',{badge:''}),1600);
    persist();refresh();
  }
  catButton.onclick=pet;
  function renderPanel() {
    localize();root.replaceChildren();status=null;playButton=null;
    const title=document.createElement('h1');title.textContent=t().title;root.append(title);
    const tabs=document.createElement('div');tabs.className='row';
    for(const [i,key] of ['look','place','mood'].entries()) {
      const b=button(t()[key],()=>{page=i;renderPanel();});b.setAttribute('aria-pressed',String(page===i));tabs.append(b);
    }
    root.append(tabs);
    const fields=document.createElement('div');fields.className='fields';root.append(fields);
    function select(label,key,options) {
      const wrap=document.createElement('label');wrap.textContent=label;
      const input=document.createElement('select');
      for(const [value,label] of options){const option=document.createElement('option');option.value=value;option.textContent=label;input.append(option);}
      input.value=String(config[key]);input.onchange=()=>{config={...config,...settings({...config,[key]:key==='size'?Number(input.value):input.value})};};
      wrap.append(input);fields.append(wrap);
    }
    if(page===0) {
      select(t().breed,'breed',BREEDS.map(b=>[b,t()[b]]));
      const label=document.createElement('label');label.textContent=t().name;
      const input=document.createElement('input');input.maxLength=24;input.value=config.name;
      input.oninput=()=>{config={...config,...settings({...config,name:input.value})};};label.append(input);fields.append(label);
    } else if(page===1) {
      select(t().size,'size',[[112,t().small],[136,t().medium],[160,t().large]]);
      select(t().corner,'corner',CORNERS.map(c=>[c,t()[c]]));
    } else {
      status=document.createElement('p');status.className='status';status.setAttribute('role','status');fields.append(status);
      const hint=document.createElement('p');hint.textContent=storageError?t().unavailable:t().hint;fields.append(hint);
      playButton=button(t().play,async()=>{if(host.parked==='confirmed'&&await persist(true))host.surface.open('play');});
      playButton.disabled=host.parked!=='confirmed';fields.append(playButton);
    }
    const footer=document.createElement('div');footer.className='row';
    const save=button(t().save,async()=>{
      if(saving)return;saving=true;save.disabled=true;save.textContent=t().saving;
      const ok=await persist(true);saving=false;save.disabled=false;save.textContent=ok?t().saved:t().error;
      if(ok){cat=configure(cat,config.breed);host.surface.open('companion');}
    });save.className='primary';
    footer.append(save,button(t().close,()=>host.surface.close()));root.append(footer);refresh();
  }
  document.body.className=kind;
  if(kind==='panel')renderPanel();
  else {
    if(kind==='companion') {root.append(catButton);host.surface.request({anchor:config.corner});}
    else {
      const header=document.createElement('header');const title=document.createElement('h1');title.textContent=t().play;
      header.append(title,button(t().close,()=>{persist(false,true);host.surface.close();}));root.append(header);
      const room=document.createElement('div');room.className='room';room.append(catButton);root.append(room);
      status=document.createElement('p');status.className='status';root.append(status);
      score=document.createElement('p');score.textContent=`${t().catches}: 0`;root.append(score);
      yarn=button(t().yarn,()=>{
        cat=hostFlags(cat,flags(),now());const next=playTap(game,cat);if(next===game)return;
        game=next;score.textContent=`${t().catches}: ${game.catches}`;yarn.dataset.side=game.side;
        pet();
      });yarn.className='yarn';yarn.dataset.side=game.side;root.append(yarn);
    }
    unsub.push(host.quickActions.on('pet',pet));
  }
  for(const topic of ['session','nowPlaying','call','activity']) {
    if(Object.hasOwn(host.state,topic))cat=update(cat,topic,host.state[topic],now());
    unsub.push(host.on(topic,value=>{cat=hostFlags(cat,flags(),now());cat=update(cat,topic,value,now());refresh();}));
  }
  function changed() {
    if(host.surface.closing) {
      if(!closing){closing=true;persist(false,true);}
      art?.animator.setFlags({visible:false});clearTimeout(deadline);clearTimeout(poll);clearTimeout(badgeTimer);
      host.quickActions.setState('pet',{badge:''});return;
    }
    refresh();if(kind==='companion')syncSettings();
  }
  unsub.push(host.surface.onChange(changed));
  document.addEventListener('visibilitychange',changed);motion.addEventListener('change',changed);
  window.addEventListener('pagehide',()=>{
    persist(false,true);disposed=true;clearTimeout(deadline);clearTimeout(poll);clearTimeout(badgeTimer);art?.animator.dispose();
    for(const off of unsub)off();document.removeEventListener('visibilitychange',changed);motion.removeEventListener('change',changed);
    host.disconnect();
  });
  refresh();if(kind==='companion')syncSettings();
} catch {
  root.textContent=/^zh/i.test(navigator.language)?'请从插件主菜单打开猫咪。':'Open Cozy Cats from the plugin launcher.';
}
