// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import { readPrefs, savePrefs, validPrefs } from '../shared/positions.js';
import { enforceLayout, dockRect } from '../host/layout.js';
export const HOST_PREFS_KEY='oxp.sim.hostPrefs';
export function hostPrefs(storage) { return readPrefs(storage,HOST_PREFS_KEY); }
export function acceptHostPrefs(storage,message) { return message.type==='host-prefs' && validPrefs(message.value) && savePrefs(storage,HOST_PREFS_KEY,message.value); }

export class ReceiverSlot {
  cover='none'; regions=[]; dock=[]; lastPong=0; lastReload=-Infinity; removed=false; seq=0; pending=new Set();
  constructor(geometry) { this.geometry=geometry; }
  mount(now) { this.lastPong=now; this.removed=false; this.pending.clear(); this.cover='none'; this.regions=[]; this.dock=[]; }
  layout(message) {
    const fallback=this.dock.length ? this.dock : [dockRect(this.geometry)];
    this.regions=enforceLayout(message.regions,message.cover,this.geometry.viewport,fallback,this.geometry.gear,message.launcher); this.cover=message.cover;
    if (this.cover==='none') this.dock=this.regions;
    return this.regions;
  }
  collapse() { this.cover='none'; this.regions=this.dock.length ? this.dock : [dockRect(this.geometry)]; this.regions=enforceLayout(this.regions,'none',this.geometry.viewport,[],this.geometry.gear); return this.regions; }
  ping() { const seq=++this.seq; this.pending.add(seq); while (this.pending.size>4) this.pending.delete(this.pending.values().next().value); return seq; }
  pong(seq,now) { if (this.pending.delete(seq)) this.lastPong=now; }
  tick(now) {
    if (this.removed || now-this.lastPong<6000) return 'ok';
    this.removed=true;
    if (now-this.lastReload>=300000) { this.lastReload=now; return 'reload'; }
    return 'remove';
  }
}
export function discover(capabilities,url,preference=true) { return preference && new URL(url).searchParams.get('plugins')!=='off' && capabilities.plugins?.host==='/plugins/host/index.html' ? capabilities.plugins.host : null; }
