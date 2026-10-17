// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { DataStore, topicAllowed } from '../host/data.js';
import { registry } from '../shared/topics.js';
import { schemas } from '../shared/schemas.js';
import { validMessage, manifestErrors } from '../shared/protocol.js';
import { Policy } from '../host/policy.js';
for(const provider of ['relay','receiver','host']) {
  const fixture=JSON.parse(readFileSync(`spec/vectors/provider-${provider}.json`));
  for(const message of fixture.messages)it(message.name,()=>expect(validMessage(message.schema.replace('-message',''),message.value)).toBe(message.valid));
  if(fixture.parkedTimeline)it('host parked timeline vector',()=>{const policy=new Policy();policy.motionAvailable=true;for(const step of fixture.parkedTimeline){if(Object.hasOwn(step,'speedMps'))policy.update('motion',{speedMps:step.speedMps,accuracyM:null,source:'vehicle'},step.atMs);expect(policy.parkedValue(step.atMs)).toEqual(step.expected);}});
  for(const vector of fixture.vectors)it(vector.name,()=>{
    const store=new DataStore();store.available(provider,fixture.topics);
    expect(store.update(provider,vector.topic,vector.value)).toBe(vector.valid);
  });
}
it('keeps normative topic schemas and permissions aligned',()=>{
  expect(registry).toEqual(JSON.parse(readFileSync('spec/topics/registry.json')));
  for(const topic of registry.topics) {
    expect(JSON.parse(readFileSync(topic.schema))).toEqual(schemas[`topic-${topic.id}`]);
    expect(JSON.parse(readFileSync(`spec/schema/topic-${topic.id}.schema.json`))).toEqual(schemas[`topic-${topic.id}`]);
    expect(topic.permission===null || registry.permissions.includes(topic.permission)).toBe(true);
  }
  expect(schemas.manifest.properties.permissions.items.enum).toEqual(registry.permissions);
  const manifest=JSON.parse(readFileSync('tests/fixtures/valid/oxp-plugin.json'));
  expect(manifestErrors({...manifest,permissions:['route','motion','audioSource']})).toEqual([]);
  expect(manifestErrors({...manifest,permissions:['parked']})).not.toEqual([]);
});
it('merges providers, distinguishes null from absent, removes stale values and filters permissions',()=>{
  const changes=[],store=new DataStore((...args)=>changes.push(args));
  store.available('relay',['session','motion']);store.available('receiver',['motion']);store.available('host',['parked']);
  expect(store.topics).toEqual(['session','motion','parked']);expect(store.state.motion).toBe(null);
  expect(store.update('relay','motion',null)).toBe(false);
  store.update('receiver','motion',{speedMps:1,accuracyM:null,source:'vehicle'});
  store.available('receiver',[]);expect(store.state).not.toHaveProperty('motion');
  expect(changes.at(-1)).toEqual(['topics',['session','parked']]);
  expect(topicAllowed({permissions:[]},'parked')).toBe(true);expect(topicAllowed({permissions:[]},'motion')).toBe(false);
});
it('validates receiver declarations and state without accepting foreign providers',()=>{
  expect(validMessage('host',{oxp:'host/0',type:'state',topic:'motion',value:{speedMps:null,accuracyM:null,source:null}})).toBe(true);
  for(const topic of ['route','parked','session'])expect(validMessage('host',{oxp:'host/0',type:'state',topic,value:null})).toBe(false);
  expect(validMessage('host',{oxp:'host/0',type:'state',topic:'motion',value:{speedMps:-1,accuracyM:0,source:'vehicle'}})).toBe(false);
});
it('derives parked after five continuous seconds, resets on unknown, and rejects manual unlock while moving',()=>{
  const p=new Policy();p.motionAvailable=true;p.update('session',{carplay:'connected'},0);
  const speed=(speedMps,time)=>p.update('motion',{speedMps,accuracyM:null,source:'vehicle'},time);
  speed(0,0);expect(p.parkedValue(4999).state).toBe('unknown');expect(p.parkedValue(5000)).toEqual({state:'parked',confirmedBy:'speed'});
  speed(2,5001);expect(p.parkedValue(5001).state).toBe('unknown');p.confirm(1,5001);expect(p.confirm(2,5001)).toBe(true);
  speed(2.01,5002);expect(p.parkedValue(5002)).toEqual({state:'moving',confirmedBy:'speed'});p.confirm(1,5002);expect(p.confirm(2,5002)).toBe(false);
  speed(0,6000);speed(null,7000);speed(0,8000);expect(p.parkedValue(12000).state).toBe('unknown');expect(p.parked(13000)).toBe('confirmed');
  expect(p.open('test',{id:'full',kind:'fullscreen',usage:'parked'},13000)).toBe(true);speed(3,13001);expect(p.loaded).toEqual([]);
});
