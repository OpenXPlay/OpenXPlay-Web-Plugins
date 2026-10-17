// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import {createPet, temperament, updateContext, updateHost, tap, view as petView} from './kit/engine.js';
import {STATES} from './poses.js';
export const BREEDS = ['orange', 'silver', 'golden', 'ragdoll'];
export const CORNERS = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];
export const TEMPERAMENTS = {
  orange:{hunger:1,hungerEveryMs:45000,greetingChance:.45,sleepiness:.8},
  silver:{sleepiness:2.5,greetingChance:.25,greetingEveryMs:240000},
  golden:{sleepiness:.6,greetingChance:1,greetingEveryMs:30000,reactionMs:1600},
  ragdoll:{sleepiness:1.2,greetingChance:.6,reactionMs:1600,tapCooldownMs:1600}
};
export function settings(value) {
  const v=value && typeof value==='object'?value:{};
  return {breed:BREEDS.includes(v.breed)?v.breed:'orange',
    name:typeof v.name==='string'?v.name.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,24):'',
    size:[112,136,160].includes(v.size)?v.size:136,
    corner:CORNERS.includes(v.corner)?v.corner:'bottom-right'};
}
const bounded = (v,max) => Number.isFinite(v)?Math.max(0,Math.min(max,Math.floor(v))):0;
export function mood(value) {
  return {pats:bounded(value?.pats,999999),companyMs:bounded(value?.companyMs,3600000)};
}
export function saved(value) {return {...settings(value),mood:mood(value?.mood)};}
export function mergeMood(a,b) {
  return mood({pats:Math.max(a.pats,b.pats),companyMs:Math.max(a.companyMs,b.companyMs)});
}
export function createCat(now=0,breed='orange',storedMood={}) {
  return {...createPet(now,TEMPERAMENTS[breed]),mood:mood(storedMood),clock:now};
}
export function tick(cat,now) {
  return {...cat,clock:now,mood:mood({...cat.mood,companyMs:cat.mood.companyMs+
    (cat.host.visible&&!cat.host.calm?Math.max(0,now-cat.clock):0)})};
}
export function configure(cat,breed) {return {...cat,tuning:temperament(TEMPERAMENTS[breed])};}
export function update(cat,topic,value,now,random) {return updateContext(tick(cat,now),topic,value,now,random);}
export function hostFlags(cat,flags,now) {return updateHost(tick(cat,now),flags,now);}
export function pat(cat,now,breed) {
  const next=tap(cat,now);
  if(next===cat)return cat;
  // Tap acceptance and cooldown belong to the kit; only our affection pose differs.
  return {...tick(next,now),reaction:{...next.reaction,state:'happy'},
    mood:mood({...tick(next,now).mood,pats:cat.mood.pats+1})};
}
export function view(cat,config,now,hour) {
  const v=petView(cat,now,hour,STATES);
  return {...v,floppy:config.breed==='ragdoll'&&v.state==='happy',
    round:config.breed==='orange'&&tick(cat,now).mood.companyMs>=1800000,
    pats:cat.mood.pats};
}
export function canPlay(cat) {
  const v=petView(cat,cat.clock,10,STATES);
  return v.parked&&v.visible&&!v.calm&&!v.still;
}
// A quiet tap-only toy: each yarn tap earns one catch and alternates its side.
export function playTap(game,cat) {
  return canPlay(cat)?{catches:game.catches+1,side:game.side==='left'?'right':'left'}:game;
}
