// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import {describe, it, expect} from 'vitest';
import {readFileSync} from 'fs';
import {createPet, updateContext, updateHost} from '../kit/engine.js';
import {createAnimation, play, sample} from '../kit/animator.js';
import {validateAtlas, frameRect} from '../kit/atlas.js';
import {fitFrame} from '../kit/renderer.js';
import {settings, pat, whaleView, language} from '../behaviour.js';
import atlas from '../atlas.js';
import {credits, creditPage} from '../credits.js';
const show = (pet, now=10, hour=15) => whaleView(pet, now, hour);
const context = (pet, topic, value, now=0) => updateContext(pet, topic, value, now, () => 0);

describe('Whale Girl state mapping', () => {
  it('greets on connection and becomes drowsy on disconnect then rests idle', () => {
    let pet = context(createPet(), 'session', {carplay:'connected'});
    expect(show(pet).state).toBe('waving');
    pet = context(pet, 'session', {carplay:'disconnected'}, 2000);
    expect(show(pet,2001).state).toBe('drowsy');
    expect(show(pet,4000).state).toBe('idle');
  });
  it('uses busy for playing music and hops only on an actual subsequent playing track', () => {
    let pet = context(createPet(), 'nowPlaying', {title:'One',artist:'A',album:'B',playing:true});
    expect(show(pet).state).toBe('busy');
    pet = context(pet,'nowPlaying',{title:'Two',artist:'A',album:'B',playing:true},100);
    expect(show(pet,101).state).toBe('jumping');
    expect(show(pet,2000).state).toBe('busy');
    pet = context(pet,'nowPlaying',null,3000);
    expect(show(pet,3001).state).toBe('idle');
  });
  it('shows static startled and listening poses for call and Siri, blocking affection', () => {
    for (const [topic,value,state] of [['call',{state:'ringing'},'startled'],['activity',{siri:true},'listening']]) {
      const pet = context(createPet(),topic,value);
      expect(show(pet)).toMatchObject({state,animate:false,still:true,heart:false});
      expect(pat(pet,100)).toBe(pet);
    }
  });
  it('freezes and discards reactions in calm, hidden, reduced motion and navigation', () => {
    for (const flags of [{calm:true},{visible:false},{reducedMotion:true}]) {
      const pet = updateHost(pat(createPet(),1),flags,2);
      expect(show(pet)).toMatchObject({animate:false,heart:false,nextChangeAt:null});
      expect(pat(pet,2000)).toBe(pet);
    }
    const pet = context(pat(createPet(),1),'activity',{navigation:true},2);
    expect(show(pet)).toMatchObject({animate:false,heart:false});
  });
  it('gives one short happy heart per accepted tap and respects cooldown', () => {
    const pet = pat(createPet(),1);
    expect(show(pet)).toMatchObject({state:'happy',heart:true});
    expect(pat(pet,100)).toBe(pet);
    expect(show(pet,1700)).toMatchObject({state:'idle',heart:false});
    expect(pat(pet,1700).taps).toBe(2);
  });
  it('has a quiet nighttime drowsy pose and midday thinking pose', () => {
    expect(show(createPet(),10,23).state).toBe('drowsy');
    expect(show(createPet(),10,12).state).toBe('thinking');
  });
});
describe('descriptor, sizing and localization', () => {
  it('matches the custom JSON and accounts for all 73 physical cells', () => {
    expect(atlas).toEqual(JSON.parse(readFileSync(new URL('../pet-atlas.json',import.meta.url))));
    expect(validateAtlas(atlas).rows.reduce((sum,row)=>sum+row.frames,0)).toBe(73);
    expect(frameRect(atlas,'drowsy',7)).toEqual({x:1344,y:2080,width:192,height:208});
  });
  it('returns to the mapped base after happy and freezes to idle without scheduling', () => {
    let animation = createAnimation(atlas);
    animation = play(animation,'happy',0,{baseState:'busy'});
    expect(sample(animation,1100).state).toBe('busy');
    for (const flags of [{calm:true},{reducedMotion:true},{visible:false}]) expect(sample(animation,100,flags)).toMatchObject({state:'idle',frame:0,animate:false});
  });
  it('smoothly fits a nonsquare cell without cropping', () => {
    const fit = fitFrame(192,208,136,136,false);
    expect(fit.height).toBe(136); expect(fit.width).toBeCloseTo(125.538); expect(fit.x).toBeGreaterThan(0);
  });
  it('rejects corrupted storage and accepts the supported corner and size choices', () => {
    expect(settings(null)).toEqual({size:136,corner:'bottom-right'});
    expect(settings({size:Infinity,corner:'left'})).toEqual(settings());
    expect(settings({size:160,corner:'top-left'})).toEqual({size:160,corner:'top-left'});
  });
  it('localizes Chinese variants and retains every author in panel credits', () => {
    expect(language('zh-Hans-CN')).toBe('zh-CN'); expect(language('fr')).toBe('en');
    expect(credits.join(' ')).toContain('7661c8b304c5400701f91da01b1a643a207331de');
    for(const author of ['上善无形','ZipZipPipe','YunYueSama']) expect(credits.join(' ')).toContain(author);
    expect(creditPage(4,'zh-CN')).toContain('不得用于商业用途');
  });
  it('keeps every atlas row at a gentle six fps or less', () => {
    expect(atlas.rows.every(row => row.fps <= 6)).toBe(true);
  });
});
