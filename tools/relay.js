// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import { readFile, lstat, readdir, realpath, mkdir, writeFile, rename } from 'node:fs/promises';
import { resolve, sep, join } from 'node:path';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { headers, safePath, MIME } from '../shared/paths.js';
import { SPEC, TOPICS, parseMessage, manifestErrors } from '../shared/protocol.js';
import { schemas } from '../shared/schemas.js';
import { validate } from '../shared/validate.js';
import { crc32 } from './zip.js';
export function sampleArtwork() {
  const chunk=(name,data) => { const type=Buffer.from(name), head=Buffer.alloc(4), crc=Buffer.alloc(4); head.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([type,data]))); return Buffer.concat([head,type,data,crc]); };
  const ihdr=Buffer.alloc(13); ihdr.writeUInt32BE(64,0); ihdr.writeUInt32BE(64,4); ihdr[8]=8; ihdr[9]=2;
  const pixels=Buffer.alloc(64*(1+64*3));
  for (let y=0;y<64;y++) for (let x=0;x<64;x++) { const i=y*193+1+x*3; pixels[i]=x*4; pixels[i+1]=y*4; pixels[i+2]=130; }
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
export class Relay {
  constructor({root='dist/install',enabled=null,storageDir=null,clock=()=>Date.now()}={}) {
    this.root=resolve(root); this.enabled=enabled; this.storageDir=storageDir; this.clock=clock;
    this.manifests=new Map(); this.store=new Map(); this.lastWrite=new Map(); this.sessions=new Set(); this.seq=0;
    this.state=Object.fromEntries(TOPICS.map(t=>[t,null]));
    this.artwork=sampleArtwork(); this.hash=createHash('sha256').update(this.artwork).digest('hex'); this.artworkUrl=`/plugins/artwork/${this.hash}`;
    this.persistence=Promise.resolve();
  }
  async init() {
    for (const id of this.enabled ?? []) {
      if (!/^[a-z0-9]+(\.[a-z0-9-]+)+$/.test(id)) continue;
      try {
        const manifest=JSON.parse(await readFile(join(this.root,'p',id,'oxp-plugin.json'),'utf8'));
        if (manifest.id!==id || manifestErrors(manifest).length) continue;
        this.manifests.set(id,manifest);
        if (this.storageDir && manifest.permissions.includes('storage')) {
          try { const value=JSON.parse(await readFile(join(this.storageDir,`${id}.json`),'utf8')); if (value && typeof value==='object' && !Array.isArray(value) && Buffer.byteLength(JSON.stringify(value))<=65536) this.store.set(id,value); } catch { /* Missing or corrupt state is unknown. */ }
        }
      } catch { /* Disabled and malformed packages are not advertised. */ }
    }
    const welcome={type:'welcome',spec:SPEC,plugins:[...this.manifests.values()],topics:TOPICS,storage:{quotaBytes:65536,persistent:!!this.storageDir}};
    if (Buffer.byteLength(JSON.stringify(welcome))>65536) throw new Error('Manifest catalog exceeds the 64 KiB channel cap');
    return this;
  }
  index() { return {spec:SPEC,plugins:[...this.manifests].map(([id,m])=>({id,version:m.version,manifest:`/plugins/p/${id}/oxp-plugin.json`}))}; }
  async request({url,method='GET',origin='http://localhost'}) {
    const path=url.split('?')[0];
    const match=path.match(/^\/plugins\/p\/([a-z0-9.-]+)\//), plugin=match?.[1];
    // Opaque sandbox origins need CORS for modules and host reads.
    const h={...headers(origin,plugin),'Access-Control-Allow-Origin':'null'};
    const response=(status,body=Buffer.alloc(0),mime='text/plain') => ({status,headers:{...h,'Content-Type':mime,'Content-Length':String(body.length)},body:method==='HEAD' ? Buffer.alloc(0) : body});
    if (this.enabled===null || !['GET','HEAD'].includes(method) || !path.startsWith('/plugins/')) return response(404);
    if (path==='/plugins/index.json') return response(200,Buffer.from(JSON.stringify(this.index())),MIME.json);
    if (path===this.artworkUrl && this.state.nowPlaying?.artwork?.url===this.artworkUrl) return response(200,this.artwork,'image/png');
    let relative;
    if (path.startsWith('/plugins/host/')) relative=`host/${path.slice(14)}`;
    else if (plugin && this.manifests.has(plugin)) relative=`p/${plugin}/${path.slice(match[0].length)}`;
    if (!relative || !safePath(relative)) return response(404);
    const full=resolve(this.root,relative);
    try {
      const real=await realpath(full), root=await realpath(this.root);
      if (!real.startsWith(root+sep) || !(await lstat(full)).isFile()) return response(404);
      const data=await readFile(full); return response(200,data,MIME[relative.split('.').at(-1)]);
    } catch { return response(404); }
  }
  connect(send) {
    if (this.enabled===null || this.sessions.size>=4) return null;
    const session=new Channel(this,send); this.sessions.add(session); return session;
  }
  update(topic,value) {
    if (!TOPICS.includes(topic) || validate(schemas[`topic-${topic}`],value).length) throw new Error('Invalid topic value');
    if (Buffer.byteLength(JSON.stringify({type:'state',topic,value,seq:this.seq+1}))>65536) throw new Error('Topic snapshot exceeds channel cap');
    this.state[topic]=value; this.seq++;
    for (const session of this.sessions) if (session.topics.has(topic)) session.latest.set(topic,{type:'state',topic,value,seq:this.seq});
  }
  flush() { for (const session of this.sessions) session.flush(); }
  persist(plugin,value) {
    if (!this.storageDir) return;
    this.persistence=this.persistence.then(async()=>{
      await mkdir(this.storageDir,{recursive:true}); const file=join(this.storageDir,`${plugin}.json`);
      await writeFile(`${file}.tmp`,JSON.stringify(value)); await rename(`${file}.tmp`,file);
    });
    // Keep a failed write observable without an unhandled rejection.
    this.persistence.catch(()=>{});
  }
  async close() { for (const session of [...this.sessions]) session.close(); await this.persistence; }
}
export class Channel {
  constructor(relay,send) { this.relay=relay; this.send=send; this.ready=false; this.closed=false; this.topics=new Set(); this.latest=new Map(); this.sentAt=new Map(); }
  error(code,id) { this.send({type:'error',...(id ? {id}:{}),code}); }
  receive(raw) {
    if (this.closed) return;
    const m=parseMessage('channel',raw);
    if (!m) { this.error('protocol'); return; }
    if (!['hello','subscribe','storage-get','storage-set','welcome','state','storage','storage-ok','error'].includes(m.type)) return;
    if (m.type==='hello' && !this.ready) {
      this.ready=true; this.send({type:'welcome',spec:SPEC,plugins:[...this.relay.manifests.values()],topics:TOPICS,storage:{quotaBytes:65536,persistent:!!this.relay.storageDir}}); return;
    }
    if (!this.ready) { this.error('protocol',m.id); return; }
    if (m.type==='subscribe') {
      this.topics=new Set(m.topics); this.latest.clear();
      for (const topic of this.topics) this.latest.set(topic,{type:'state',topic,value:this.relay.state[topic],seq:this.relay.seq});
      this.flush(); return;
    }
    if (m.type==='storage-get' || m.type==='storage-set') { this.storage(m); return; }
    this.error('protocol',m.id);
  }
  storage(m) {
    const manifest=this.relay.manifests.get(m.plugin);
    if (!manifest) { this.error('unknown-plugin',m.id); return; }
    if (!manifest.permissions.includes('storage')) { this.error('permission',m.id); return; }
    if (m.type==='storage-get') { this.send({type:'storage',id:m.id,value:this.relay.store.get(m.plugin)??null}); return; }
    if (Buffer.byteLength(JSON.stringify(m.value))>65536) { this.error('quota',m.id); return; }
    const now=this.relay.clock();
    if (now-(this.relay.lastWrite.get(m.plugin)??-Infinity)<2000) { this.error('rate',m.id); return; }
    this.relay.lastWrite.set(m.plugin,now); this.relay.store.set(m.plugin,m.value); this.relay.persist(m.plugin,m.value); this.send({type:'storage-ok',id:m.id});
  }
  flush() {
    for (const [topic,message] of this.latest) {
      const now=this.relay.clock(); if (now-(this.sentAt.get(topic)??-Infinity)<250) continue;
      if (this.send(message)!==false) { this.latest.delete(topic); this.sentAt.set(topic,now); }
    }
  }
  close() { if(this.closed)return;this.closed=true;this.relay.sessions.delete(this);this.latest.clear();this.onClose?.(); }
}
