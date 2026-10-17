// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import { connect } from './oxp-plugin-sdk.js';
import { settings } from './model.js';
import { strings } from './i18n.js';
const host=await connect();
let value=settings(null), page=0, busy=false;
const choices=document.querySelector('#choices'), options=document.querySelector('#options'), status=document.querySelector('#status');
function button(label,fn,pressed) {
  const element=document.createElement('button');element.textContent=label;element.onclick=fn;element.disabled=busy;
  if(pressed!==undefined)element.setAttribute('aria-pressed',String(pressed));return element;
}
function render() {
  const text=strings(host.locale);document.documentElement.lang=host.locale;
  document.querySelector('h1').textContent=text.title;
  document.querySelector('#hint').hidden=true; choices.replaceChildren();options.replaceChildren();
  if(page===0) for(const effect of ['progress','album','sky']) choices.append(button(text[effect],()=>{value.effect=effect;render();},value.effect===effect));
  else {
    choices.append(button(value.enabled?text.on:text.off,()=>{value.enabled=!value.enabled;render();},value.enabled));
    choices.append(button(`${text.brightness}: ${text[['low','medium','high'][[0.3,0.6,0.9].indexOf(value.brightness)]]}`,()=>{value.brightness=[0.3,0.6,0.9][([0.3,0.6,0.9].indexOf(value.brightness)+1)%3];render();}));
    choices.append(button(text.cozy,()=>{if(host.parked==='confirmed')host.surface.open('fireplace');else status.textContent=text.parked;}));
  }
  options.append(button(page?text.back:text.next,()=>{page=1-page;status.textContent='';render();}));
  options.append(button(text.start,async()=>{
    busy=true;render();
    try {await host.storage.set(value);host.surface.open('ambient');host.surface.close();}
    catch {status.textContent=strings(host.locale).failed;}
    finally {busy=false;render();}
  }));
}
render();
try {value=settings(await host.storage.get());render();}catch{status.textContent=strings(host.locale).failed;}
host.surface.onChange(render);
