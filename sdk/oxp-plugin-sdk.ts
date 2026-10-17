// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

export type Topic = keyof Topics;
export interface Topics {
  route: { active: boolean; destination: string | null; etaMs: number | null; distanceRemainingM: number | null; maneuver: {type: number | null; road: string | null; distanceM: number | null} | null; appName: string | null } | null;
  motion: { speedMps: number | null; accuracyM: number | null; source: 'geolocation' | 'vehicle' | null } | null;
  parked: { state: 'parked' | 'moving' | 'unknown'; confirmedBy: 'speed' | 'user' | null } | null;
  audioSource: { appName: string | null } | null;
  session: { carplay: 'connected' | 'disconnected' } | null;
  nowPlaying: { title: string; artist: string; album: string; durationMs: number; elapsedMs: number; playing: boolean; rate: number } | null;
  call: { state: 'idle' | 'ringing' | 'dialing' | 'active' | 'held' | 'ending' } | null;
  activity: { siri: boolean; phoneCall: boolean; navigation: boolean } | null;
}
export type Anchor = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'left' | 'right' | 'top' | 'bottom';
export type Rect = { x: number; y: number; w: number; h: number };
export type SurfaceInfo = { id: string; kind: 'companion' | 'ambient' | 'panel' | 'fullscreen'; w: number; h: number; visible: boolean; calm: boolean; closing?: boolean; anchor?: Anchor; video?: Rect; viewport?: { w: number; h: number } };
export interface DragOptions { /** @deprecated Drag starts on movement; this option is ignored. */ delayMs?: number; tolerancePx?: number }
export type DragMove = { phase: 'start' | 'move' | 'end'; dx: number; dy: number };
type Unsubscribe = () => void;
type Listener<T> = (value: T) => void;
export interface Connection {
  readonly topics: Topic[];
  available(topic: string): boolean;
  readonly state: Partial<Topics>;
  on(topic: 'topics', fn: Listener<Topic[]>): Unsubscribe;
  on<T extends Topic>(topic: T, fn: Listener<Topics[T]>): Unsubscribe;
  storage: { get(): Promise<Record<string, unknown> | null>; set(value: Record<string, unknown>): Promise<void> };
  surface: SurfaceInfo & { readonly size: { w: number; h: number }; enableDrag(element: HTMLElement, options?: DragOptions): Unsubscribe; onChange(fn: Listener<SurfaceInfo>): Unsubscribe; open(surfaceId: string): void; close(): void; request(options: { anchor?: Anchor; size?: { w: number; h: number } }): void };
  quickActions: { on(id: string, fn: () => void): Unsubscribe; setState(id: string, state: { badge?: string; active?: boolean }): void };
  readonly parked: 'confirmed' | 'unknown';
  readonly locale: string;
  readonly theme: 'light' | 'dark';
  readonly reducedMotion: boolean;
  onArtwork(fn: Listener<ImageBitmap>): Unsubscribe;
  disconnect(): void;
}
const topics: Topic[] = ['session','nowPlaying','call','activity','route','motion','parked','audioSource'];
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const number = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
function topicValue(topic: Topic, v: unknown): boolean {
  if (v === null) return true;
  if (!object(v)) return false;
  if (topic === 'motion') return (v.speedMps === null || number(v.speedMps)) && (v.accuracyM === null || number(v.accuracyM)) && ['geolocation','vehicle',null].includes(v.source as string | null);
  if (topic === 'parked') return ['parked','moving','unknown'].includes(String(v.state)) && ['speed','user',null].includes(v.confirmedBy as string | null);
  if (topic === 'audioSource') return v.appName === null || typeof v.appName === 'string';
  if (topic === 'route') return typeof v.active === 'boolean' && [v.destination,v.appName].every(x => x === null || typeof x === 'string') && [v.etaMs,v.distanceRemainingM].every(x => x === null || number(x)) && (v.maneuver === null || object(v.maneuver) && (v.maneuver.type === null || number(v.maneuver.type) && Number.isInteger(v.maneuver.type) && v.maneuver.type <= 255) && (v.maneuver.road === null || typeof v.maneuver.road === 'string') && (v.maneuver.distanceM === null || number(v.maneuver.distanceM)));
  if (topic === 'session') return v.carplay === 'connected' || v.carplay === 'disconnected';
  if (topic === 'call') return ['idle','ringing','dialing','active','held','ending'].includes(String(v.state));
  if (topic === 'activity') return ['siri','phoneCall','navigation'].every(k => typeof v[k] === 'boolean');
  return ['title','artist','album'].every(k => typeof v[k] === 'string') && ['durationMs','elapsedMs','rate'].every(k => number(v[k])) && typeof v.playing === 'boolean';
}
export function connect(): Promise<Connection> {
  return new Promise((resolve, reject) => {
    if (window.parent === window) { reject(new Error('Plugin must run inside the host')); return; }
    let ready = false, counter = 0, closed = false;
    let parked: 'confirmed' | 'unknown' = 'unknown', locale = 'en', theme: 'light' | 'dark' = 'dark', reducedMotion = false;
    const state: Partial<Topics> = {};
    let availableTopics: Topic[] = [];
    function setTopics(value: unknown) {
      if (!Array.isArray(value) || !value.every(t=>topics.includes(t))) return;
      availableTopics=[...new Set(value)] as Topic[];
      for(const topic of topics)if(!availableTopics.includes(topic))delete state[topic];
      if(ready)emit('topics',[...availableTopics]);
    }
    const listeners = new Map<string, Set<Listener<never>>>();
    const pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
    function emit(key: string, value: unknown) { for (const fn of listeners.get(key) ?? []) { try { fn(value as never); } catch (error) { console.error(error); } } }
    function on<T>(key: string, fn: Listener<T>): Unsubscribe {
      const set = listeners.get(key) ?? new Set(); set.add(fn as Listener<never>); listeners.set(key,set);
      return () => { set.delete(fn as Listener<never>); };
    }
    function send(type: string, data: Record<string, unknown> = {}) { if (!closed) window.parent.postMessage({ oxp:'plugin/0',type,...data }, '*'); }
    function request(type: string, value?: Record<string, unknown>): Promise<unknown> {
      if (closed) return Promise.reject(new Error('Disconnected'));
      const id = String(++counter);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('Storage timed out')); },10000);
        pending.set(id,{resolve,reject,timer}); send(type,{ id,...(value === undefined ? {} : {value}) });
      });
    }
    const drags = new Set<Unsubscribe>();
    const surface: Connection['surface'] = { id:'',kind:'companion',w:0,h:0,visible:true,calm:false,
      get size() { return { w:surface.w,h:surface.h }; },
      enableDrag: (element, options) => {
        const off = enableDragGesture(element, move => { if (surface.kind === 'companion') send('surface-request',{move}); }, options);
        const dispose = () => { off(); drags.delete(dispose); }; drags.add(dispose); return dispose;
      },
      onChange: fn => on('surface',fn), open: surface => send('open',{surface}), close: () => send('close'), request: options => send('surface-request',options) };
    function geometry(m: Record<string, unknown>) {
      const video=m.video;
      if (object(video) && ['x','y'].every(k=>typeof video[k]==='number' && Number.isFinite(video[k])) && number(video.w) && number(video.h)) surface.video=video as Rect;
      if (object(m.viewport) && number(m.viewport.w) && number(m.viewport.h)) surface.viewport=m.viewport as {w:number;h:number};
      if (typeof m.closing==='boolean')surface.closing=m.closing;
      if (typeof m.anchor==='string' && ['top-left','top-right','bottom-left','bottom-right','left','right','top','bottom'].includes(m.anchor))surface.anchor=m.anchor as Anchor;
    }
    const connection: Connection = { state, get topics() { return [...availableTopics]; }, available: topic=>availableTopics.includes(topic as Topic), on: on,
      storage: { get: () => request('storage-get') as Promise<Record<string,unknown> | null>, set: value => {
        if (!object(value)) return Promise.reject(new Error('Storage requires a JSON object'));
        try { JSON.stringify(value); } catch { return Promise.reject(new Error('Storage requires JSON')); }
        return request('storage-set',value) as Promise<void>;
      } }, surface,
      quickActions: { on: (id,fn) => on(`quick:${id}`,fn), setState: (id,value) => {
        if (value.badge !== undefined && [...value.badge].length > 3) throw new Error('Badge exceeds three characters');
        send('quick-action-state',{id,...value});
      } }, get parked() { return parked; }, get locale() { return locale; }, get theme() { return theme; }, get reducedMotion() { return reducedMotion; },
      onArtwork: fn => on('artwork',fn), disconnect: () => {
        for (const off of drags) off();
        closed = true; window.removeEventListener('message',receive); clearTimeout(timeout);
        for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('Disconnected')); } pending.clear(); listeners.clear();
      }
    };
    const timeout = setTimeout(() => { connection.disconnect(); reject(new Error('Host handshake timed out')); },10000);
    function receive(event: MessageEvent) {
      if (event.source !== window.parent || !object(event.data) || event.data.oxp !== 'plugin/0') return;
      const m = event.data;
      if (m.type === 'ping' && number(m.seq)) { send('pong',{seq:m.seq}); return; }
      if (m.type === 'welcome' && !ready) {
        if (m.spec !== undefined && m.spec !== 'oxp-web-plugin/0') { connection.disconnect(); reject(new Error('Unsupported host spec')); return; }
        if (!object(m.surface) || typeof m.surface.id !== 'string' || !['companion','ambient','panel','fullscreen'].includes(String(m.surface.kind)) || !number(m.surface.w) || !number(m.surface.h) || !object(m.state) || !Array.isArray(m.permissions) || typeof m.locale !== 'string' || !['light','dark'].includes(String(m.theme)) || typeof m.reducedMotion !== 'boolean' || !['confirmed','unknown'].includes(String(m.parked))) return;
        Object.assign(surface,m.surface); geometry(m); locale=m.locale; theme=m.theme as 'light'|'dark'; reducedMotion=m.reducedMotion; parked=m.parked as 'confirmed'|'unknown';
        for (const topic of topics) if (Object.hasOwn(m.state,topic) && topicValue(topic,m.state[topic])) Object.assign(state,{[topic]:m.state[topic]});
        setTopics(m.topics ?? Object.keys(state));
        ready=true; clearTimeout(timeout); resolve(connection); return;
      }
      if (!ready) return;
      if (m.type === 'topics') setTopics(m.topics);
      if (m.type === 'state' && topics.includes(m.topic as Topic) && topicValue(m.topic as Topic,m.value)) { Object.assign(state,{[m.topic as string]:m.value}); emit(m.topic as string,m.value); }
      if (m.type === 'surface' && number(m.w) && number(m.h) && typeof m.visible === 'boolean' && typeof m.calm === 'boolean') {
        Object.assign(surface,{w:m.w,h:m.h,visible:m.visible,calm:m.calm}); geometry(m);
        if (typeof m.locale === 'string') locale=m.locale;
        if (m.theme === 'dark' || m.theme === 'light') theme=m.theme;
        if (typeof m.reducedMotion === 'boolean') reducedMotion=m.reducedMotion;
        emit('surface',surface);
      }
      if (m.type === 'parked' && (m.value === 'confirmed' || m.value === 'unknown')) { parked=m.value; emit('surface',surface); }
      if (m.type === 'quick-action' && typeof m.id === 'string') emit(`quick:${m.id}`,undefined);
      if (m.type === 'artwork' && typeof ImageBitmap !== 'undefined' && m.bitmap instanceof ImageBitmap) emit('artwork',m.bitmap);
      if (['storage','storage-ok','error'].includes(String(m.type)) && typeof m.id === 'string') {
        const p=pending.get(m.id); if (!p) return;
        clearTimeout(p.timer); pending.delete(m.id);
        if (m.type === 'error') p.reject(new Error(String(m.code)));
        else if (m.type === 'storage' && (m.value === null || object(m.value))) p.resolve(m.value);
        else if (m.type === 'storage-ok') p.resolve(undefined);
        else p.reject(new Error('Invalid storage response'));
      }
    }
    window.addEventListener('message',receive);
    send('hello',{spec:'oxp-web-plugin/0',sdk:'0.1.0'});
  });
}

// Screen deltas remain stable when the containing iframe moves under the pointer.
export function enableDragGesture(element: HTMLElement, report: (move: DragMove) => void, options: DragOptions = {}): Unsubscribe {
  let pointer: number | undefined, x = 0, y = 0, clientX = 0, clientY = 0, dx = 0, dy = 0, active = false, suppress = false;
  const previousTouchAction = element.style.touchAction;
  element.style.touchAction = 'none';
  function down(e: PointerEvent) {
    if (pointer !== undefined || e.button !== 0 || e.isPrimary === false) return;
    pointer = e.pointerId; x = e.screenX; y = e.screenY; clientX = e.clientX; clientY = e.clientY; dx = dy = 0; active = false; suppress = false;
    element.setPointerCapture(pointer);
  }
  function move(e: PointerEvent) {
    if (pointer !== e.pointerId) return;
    dx = e.screenX - x; dy = e.screenY - y;
    if (!active) {
      // Before activation, local coordinates measure CSS pixels even in a scaled simulator.
      // Once the frame follows the pointer, only screen deltas remain stable.
      const tx = Number.isFinite(e.clientX - clientX) ? e.clientX - clientX : dx;
      const ty = Number.isFinite(e.clientY - clientY) ? e.clientY - clientY : dy;
      if (Math.hypot(tx,ty) <= (options.tolerancePx ?? 8)) return;
      active = true; suppress = true; report({phase:'start',dx:0,dy:0});
    }
    e.preventDefault(); report({phase:'move',dx,dy});
  }
  function finish(e?: PointerEvent) {
    if (pointer === undefined || e && e.pointerId !== pointer) return;
    if (e?.type === 'pointercancel' || e?.type === 'lostpointercapture') suppress = true;
    if (active) report({phase:'end',dx,dy});
    const id = pointer; pointer = undefined; active = false;
    if (element.hasPointerCapture(id)) element.releasePointerCapture(id);
  }
  function click(e: MouseEvent) { if (suppress && e.detail !== 0) { suppress = false; e.preventDefault(); e.stopImmediatePropagation(); } }
  function context(e: Event) { e.preventDefault(); }
  element.addEventListener('pointerdown',down);
  element.addEventListener('pointermove',move);
  element.addEventListener('pointerup',finish);
  element.addEventListener('pointercancel',finish);
  element.addEventListener('lostpointercapture',finish);
  element.addEventListener('click',click,true);
  element.addEventListener('contextmenu',context);
  return () => {
    finish(); element.style.touchAction = previousTouchAction;
    element.removeEventListener('pointerdown',down); element.removeEventListener('pointermove',move);
    element.removeEventListener('pointerup',finish); element.removeEventListener('pointercancel',finish);
    element.removeEventListener('lostpointercapture',finish); element.removeEventListener('click',click,true);
    element.removeEventListener('contextmenu',context);
  };
}
