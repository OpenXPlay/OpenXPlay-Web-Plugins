// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import {describe,it,expect} from 'vitest';
import {settings,saved,mood,mergeMood,createCat,configure,hostFlags,tick,update,pat,view,canPlay,playTap} from '../model.js';
import {words} from '../strings.js';
const cfg=settings(null);
const read=(c,now=100,hour=10,config=cfg)=>view(c,config,now,hour);
const song=title=>({title,artist:'A',album:'B',playing:true});
describe('preferences and persistent affection',()=>{
  it('migrates old preferences and bounds corrupt storage',()=>{
    expect(saved({breed:'dog',name:'  M\u0000imi  ',size:999})).toEqual({...cfg,name:'Mimi',mood:{pats:0,companyMs:0}});
    expect(settings({name:'x'.repeat(40)}).name).toHaveLength(24);
    expect(mood({pats:Infinity,companyMs:-2})).toEqual({pats:0,companyMs:0});
    expect(mergeMood({pats:3,companyMs:90},{pats:1,companyMs:100})).toEqual({pats:3,companyMs:100});
    expect(words('zh-CN').orange).toBe('橘猫');expect(words('en-US').orange).toBe('Orange tabby');
  });
  it('counts visible company, freezes the clock when hidden, restores saved pats',()=>{
    let c=createCat(0,'orange',{pats:4,companyMs:100});
    c=hostFlags(c,{visible:false},1000);c=tick(c,100000);
    expect(c.mood).toEqual({pats:4,companyMs:1100});
    c=hostFlags(c,{visible:true},100000);c=tick(c,101000);
    expect(c.mood.companyMs).toBe(2100);
    expect(pat(c,102000,'orange').mood.pats).toBe(5);
  });
});
describe('kit context mapping',()=>{
  it('greets once and sleeps after disconnection',()=>{
    let c=update(createCat(),'session',{carplay:'connected'},0,()=>0);
    expect(read(c).state).toBe('waving');
    c=update(c,'session',{carplay:'connected'},2000,()=>0);expect(read(c,2100).state).toBe('idle');
    c=update(c,'session',{carplay:'disconnected'},3000);expect(read(c,3100).state).toBe('failed');
    expect(read(c,5000).state).toBe('sleeping');
  });
  it('hops for changed songs, not snapshots or the initial track',()=>{
    let c=update(createCat(),'nowPlaying',song('A'),0);expect(read(c).state).toBe('running');
    c=update(c,'nowPlaying',song('B'),1000);expect(read(c,1100).state).toBe('jumping');
    c=update(c,'nowPlaying',song('B'),5000);expect(read(c,5100).state).toBe('running');
  });
  it.each(['ringing','dialing','active','held','ending'])('freezes for %s calls and clears suppressed reactions',state=>{
    let c=pat(createCat(),0,'orange');c=update(c,'call',{state},100);
    expect(read(c).animate).toBe(false);expect(c.reaction).toBeNull();expect(pat(c,5000,'orange')).toBe(c);
    c=update(c,'call',null,6000);expect(read(c,6100).state).toBe('idle');
  });
  it('is still for Siri/navigation and never replays discarded hearts',()=>{
    for(const activity of [{siri:true},{navigation:true},{phoneCall:true}]) {
      let c=update(pat(createCat(),0,'orange'),'activity',activity,100);
      expect(read(c).animate).toBe(false);expect(pat(c,5000,'orange')).toBe(c);
      c=update(c,'activity',null,6000);expect(read(c,6100).state).toBe('idle');
    }
  });
  it.each([{calm:true},{visible:false},{reducedMotion:true}])('freezes and rejects pats for %j',flags=>{
    const c=hostFlags(createCat(),flags,0);expect(read(c).animate).toBe(false);expect(pat(c,5000,'orange')).toBe(c);
  });
});
describe('breed personalities and parked toy',()=>{
  it('sleeps silver first, greets golden most, and gives orange hunger gestures',()=>{
    expect(read(createCat(0,'silver'),80000).state).toBe('sleeping');
    expect(read(createCat(),80000).state).toBe('idle');
    expect(read(createCat(0,'golden'),30100).state).toBe('waving');
    expect(read(createCat(0,'orange'),45100).state).toBe('hungry');
    expect(read(configure(createCat(),'silver'),80000).state).toBe('sleeping');
  });
  it('maps accepted pats to hearts, with a floppy Ragdoll pose and kit cooldown',()=>{
    const c=pat(createCat(0,'ragdoll'),100,'ragdoll');
    expect(read(c,200,10,settings({breed:'ragdoll'}))).toMatchObject({state:'happy',floppy:true,pats:1});
    expect(pat(c,1000,'ragdoll')).toBe(c);expect(read(c,1800).state).toBe('idle');
  });
  it('rounds only orange after half an hour of company',()=>{
    expect(read(createCat(),1799999).round).toBe(false);expect(read(createCat(),1800000).round).toBe(true);
    expect(read(createCat(),3600000,10,settings({breed:'silver'})).round).toBe(false);
  });
  it('yawns at night, sleeps later, and sunbathes at noon',()=>{
    expect(read(createCat(),100,23).state).toBe('yawning');expect(read(createCat(),7000,23).state).toBe('sleeping');
    expect(read(createCat(),100,12).state).toBe('sunbathing');
  });
  it('accepts yarn taps only while parked and visible without distractions',()=>{
    const game={catches:0,side:'left'},c=createCat();expect(playTap(game,c)).toBe(game);
    const p=hostFlags(c,{parked:'confirmed'},0);expect(canPlay(p)).toBe(true);
    expect(playTap(game,p)).toEqual({catches:1,side:'right'});
    expect(playTap(game,hostFlags(p,{visible:false},100))).toBe(game);
    expect(playTap(game,update(p,'activity',{navigation:true},100))).toBe(game);
  });
});
