// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import {it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {atlases} from '../assets/atlases.js';
import {spriteState,walkPosition} from '../poses.js';
import {validateAtlas,createAnimation,play,sample,fitFrame,createAnimator,createRenderer} from '../kit/index.js';
import {BREEDS} from '../model.js';

it('ships valid compact descriptors matching JSON and transparent PNG dimensions',()=>{
  for(const breed of BREEDS) {
    const descriptor=atlases[breed],atlas=validateAtlas(descriptor);
    expect(JSON.parse(readFileSync(new URL(`../assets/${breed}.pet-atlas.json`,import.meta.url)))).toEqual(descriptor);
    const png=readFileSync(new URL(`../assets/${breed}.png`,import.meta.url));
    expect(png.readUInt32BE(16)).toBe(atlas.columns*atlas.cellWidth);
    expect(png.readUInt32BE(20)).toBe(atlas.rows.length*atlas.cellHeight);
    expect(png[25]).toBe(6); // RGBA, retaining transparency.
    expect(atlas.cellWidth).toBeLessThan(50);expect(atlas.cellHeight).toBeLessThan(50);
    expect(atlas.rows.map(row=>row.state)).toEqual(['idle','walking','run','sitting','laying','sleeping','sleeping2','greeting','happy','purr','itch','stretch']);
    expect(atlas.rows.every(row=>row.fps<=30)).toBe(true);
    expect(atlas.rows.find(row=>row.state==='stretch').frames).toBe(13);
    expect(atlas.rows.find(row=>row.state==='itch').frames).toBe(breed==='ragdoll'?5:2);
  }
});
it('maps existing context moods to the intended upstream animation rows',()=>{
  for(const [state,row] of Object.entries({idle:'idle',running:'walking',jumping:'run',waving:'greeting',happy:'happy',review:'sitting',waiting:'sitting',failed:'laying',sleeping:'sleeping',hungry:'purr'}))expect(spriteState(state)).toBe(row);
});
it('walks and reflects inside narrow and normal frames, with integer coordinates',()=>{
  for(const width of [56,80,112,136,160,224])for(const spriteWidth of [30,60,90,120]) {
    let bounded=true;
    for(let time=0;time<120000;time+=137) {
      const p=walkPosition(time,width,spriteWidth);
      bounded &&= Number.isInteger(p.x)&&p.x>=0&&p.x<=Math.max(0,width-spriteWidth);
    }
    expect(bounded).toBe(true);
  }
  expect(walkPosition(0,136,90)).toEqual({x:23,left:false});
  expect(walkPosition(4000,136,90).left).toBe(true);
  expect(fitFrame(30,16,108,74).scale).toBe(3);
});
it('plays laying before sleeping and freezes the selected attentive pose',()=>{
  const descriptor=atlases.orange;
  const animation=play(createAnimation(descriptor),'laying',0,{baseState:'sleeping'});
  expect(sample(animation,1599).state).toBe('laying');expect(sample(animation,1600).state).toBe('sleeping');
  for(const flags of [{calm:true},{visible:false},{reducedMotion:true},{still:true}]) {
    expect(sample(animation,10,flags)).toEqual(sample(animation,10000,flags));
    expect(sample(animation,100,flags).animate).toBe(false);
  }
  const sit=play(createAnimation(descriptor),'sitting',0);
  expect(sample(sit,100,{calm:true,still:true}).state).toBe('sitting');
});
it('stops callbacks while frozen and limits drawing to atlas cadence',()=>{
  let callback,time=0;
  const draw=vi.fn(),cancel=vi.fn();
  const animator=createAnimator(atlases.orange,{draw,now:()=>time,requestFrame:fn=>{callback=fn;return 1;},cancelFrame:cancel});
  animator.play('walking');draw.mockClear();
  for(time=10;time<=1000;time+=10)callback(time);
  expect(draw.mock.calls.length).toBeLessThanOrEqual(8);
  animator.setFlags({calm:true});expect(cancel).toHaveBeenCalled();
  const calls=draw.mock.calls.length;animator.play('happy');expect(draw).toHaveBeenCalledTimes(calls);animator.dispose();
});
it('draws leftward sprites with a horizontal flip and nearest-neighbour scaling',()=>{
  const context={setTransform:vi.fn(),clearRect:vi.fn(),save:vi.fn(),restore:vi.fn(),translate:vi.fn(),scale:vi.fn(),drawImage:vi.fn()};
  const canvas={style:{},getContext:()=>context};
  const renderer=createRenderer(canvas,{complete:true,naturalWidth:390},atlases.orange);
  renderer.resize(136,136);
  const animation=play(createAnimation(atlases.orange),'walking',0,{baseState:'walking'});
  renderer.draw(sample(animation,4000));
  expect(context.scale).toHaveBeenCalledWith(-1,1);expect(context.imageSmoothingEnabled).toBe(false);
  const dest=context.drawImage.mock.calls[0].slice(5);expect(dest.every(Number.isInteger)).toBe(true);
});

it('sequences a tap meow into grooming then returns to its base',()=>{
  const animation=play(createAnimation(atlases.orange),'greeting',0,{baseState:'idle',followState:'happy'});
  expect(sample(animation,999).state).toBe('greeting');
  expect(sample(animation,1000).state).toBe('happy');
  expect(sample(animation,2250).state).toBe('idle');
});
