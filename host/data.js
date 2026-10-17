// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import { registry } from '../shared/topics.js';
import { schemas } from '../shared/schemas.js';
import { validate } from '../shared/validate.js';
export const topicDefinitions = registry.topics;
export function topicAllowed(manifest, topic) {
  const definition=topicDefinitions.find(t=>t.id===topic);
  return !!definition && (definition.permission===null || manifest.permissions.includes(definition.permission));
}
// Every provider uses the same availability and full-snapshot interface.
export class DataStore {
  state = {};
  providers = new Map();
  constructor(changed=()=>{}) { this.changed=changed; }
  get topics() { return topicDefinitions.filter(t=>this.providers.get(t.provider)?.has(t.id)).map(t=>t.id); }
  available(provider, topics) {
    const previous=this.topics;
    this.providers.set(provider,new Set(topics.filter(id=>topicDefinitions.some(t=>t.id===id && t.provider===provider))));
    for(const id of previous) if(!this.topics.includes(id)) delete this.state[id];
    for(const id of this.topics) if(!Object.hasOwn(this.state,id)) this.state[id]=null;
    if(JSON.stringify(previous)!==JSON.stringify(this.topics))this.changed('topics',this.topics);
  }
  update(provider, topic, value) {
    if(!this.providers.get(provider)?.has(topic) || !topicDefinitions.some(t=>t.id===topic && t.provider===provider) || validate(schemas[`topic-${topic}`],value).length)return false;
    this.state[topic]=value;this.changed(topic,value);return true;
  }
}
