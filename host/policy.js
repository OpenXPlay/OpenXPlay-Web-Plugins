// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

export class Policy {
  parkedUntil = 0;
  confirmation = false;
  calm = false;
  navigation = false;
  visible = true;
  loaded = [];
  crashes = new Map();
  disabled = new Set();
  state = {};
  lowSpeedSince = null;
  motionAvailable = false;
  parkedValue(now) {
    const speed=this.motionAvailable ? this.state.motion?.speedMps : null;
    if (speed != null && speed > 2) return {state:'moving',confirmedBy:'speed'};
    if (speed != null && speed < 0.5 && this.lowSpeedSince !== null && now-this.lowSpeedSince >= 5000) return {state:'parked',confirmedBy:'speed'};
    return now < this.parkedUntil ? {state:'parked',confirmedBy:'user'} : {state:'unknown',confirmedBy:null};
  }
  parked(now) { return this.parkedValue(now).state === 'parked' ? 'confirmed' : 'unknown'; }
  confirm(step, now) {
    if (step === 1) { this.confirmation = true; return false; }
    if (this.parkedValue(now).state==='moving') { this.confirmation=false; return false; }
    if (step !== 2 || !this.confirmation || this.navigation || this.state.session?.carplay !== 'connected') return false;
    this.confirmation = false; this.parkedUntil = now + 30 * 60 * 1000; return true;
  }
  update(topic, value, now) {
    this.state[topic] = value;
    if(topic==='motion') {
      const speed=this.motionAvailable ? value?.speedMps : null;
      if(speed != null && speed < 0.5) { if(this.lowSpeedSince===null)this.lowSpeedSince=now; }
      else this.lowSpeedSince=null;
      if(speed != null && speed > 2) { this.parkedUntil=0;this.confirmation=false; }
    }
    this.navigation = !!this.state.activity?.navigation;
    this.calm = !!(this.state.activity?.siri || this.state.activity?.phoneCall || ['ringing','dialing','active','held','ending'].includes(this.state.call?.state));
    if (this.navigation || this.state.session?.carplay !== 'connected') { this.parkedUntil = 0; this.confirmation = false; }
    this.reconcile(now);
  }
  reconcile(now) {
    this.loaded = this.loaded.filter(s => ((this.visible && !this.calm) || ['companion','ambient'].includes(s.kind)) && (s.usage !== 'parked' || this.parked(now) === 'confirmed'));
  }
  open(plugin, surface, now) {
    this.reconcile(now);
    if (this.disabled.has(plugin) || !this.visible || surface.usage === 'parked' && this.parked(now) !== 'confirmed' || surface.kind === 'fullscreen' && this.parked(now) !== 'confirmed' || this.calm && ['panel','fullscreen'].includes(surface.kind)) return false;
    if (this.loaded.some(s => s.plugin === plugin && s.id === surface.id)) return true;
    const group = k => ['panel','fullscreen'].includes(k) ? 'cover' : k;
    const limit = {cover:1,companion:2,ambient:1}[group(surface.kind)];
    if (!limit) return false;
    if (group(surface.kind) === 'cover') this.collapse();
    if (this.loaded.filter(s => group(s.kind) === group(surface.kind)).length >= limit) return false;
    this.loaded.push({...surface,plugin,lastPong:now}); return true;
  }
  collapse() { this.loaded = this.loaded.filter(s => !['panel','fullscreen'].includes(s.kind)); this.confirmation = false; }
  close(plugin, id) { this.loaded = this.loaded.filter(s => s.plugin !== plugin || s.id !== id); }
  pong(plugin,id,now) { const s = this.loaded.find(s => s.plugin === plugin && s.id === id); if (s) s.lastPong = now; }
  crash(plugin,id,now) {
    this.close(plugin,id);
    const crashes = (this.crashes.get(plugin) ?? []).filter(t => now-t < 600000); crashes.push(now); this.crashes.set(plugin,crashes);
    if (crashes.length >= 3) { this.disabled.add(plugin); this.loaded = this.loaded.filter(s => s.plugin !== plugin); }
  }
  tick(now) { this.reconcile(now); for (const s of [...this.loaded]) if (now-s.lastPong >= 5000) this.crash(s.plugin,s.id,now); }
}
export function reconnectDelay(attempt) { return Math.min(30000, 500 * 2 ** Math.min(attempt,6)); }
