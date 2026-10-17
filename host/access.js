// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import { topicAllowed } from './data.js';
export function permittedState(manifest,state) {
  return Object.fromEntries(Object.keys(state).filter(topic=>topicAllowed(manifest,topic)).map(topic=>[topic,state[topic]??null]));
}
export function permits(manifest,message) {
  if (['storage-get','storage-set'].includes(message.type)) return manifest.permissions.includes('storage');
  if (message.type==='quick-action-state') return manifest.quickActions.some(a=>a.id===message.id);
  if (message.type==='open') return manifest.surfaces.some(s=>s.id===message.surface);
  return ['hello','pong','close','surface-request'].includes(message.type);
}
export function frameForSource(frames,source) { return [...frames].find(frame=>frame.window===source); }
