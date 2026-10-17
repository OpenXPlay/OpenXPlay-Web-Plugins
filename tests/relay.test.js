// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import { it,expect,describe,beforeAll,afterAll } from 'vitest';
import { mkdtemp,mkdir,writeFile,readFile,rm,symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Relay } from '../tools/relay.js';
import { readPackage } from '../tools/validate.js';
import { conformance } from '../tools/conformance.js';
import { frame,FrameParser } from '../tools/websocket.js';
let root,clock=10000;
beforeAll(async()=>{root=await mkdtemp(join(tmpdir(),'oxp-relay-'));await mkdir(join(root,'host'),{recursive:true});await writeFile(join(root,'host/index.html'),'host');const {files}=await readPackage('tests/fixtures/valid');for (const [path,data] of files){await mkdir(join(root,'p/org.openxplay.fixture',path,'..'),{recursive:true});await writeFile(join(root,'p/org.openxplay.fixture',path),data);}});
afterAll(async()=>{await rm(root,{recursive:true,force:true});});
const relay=options=>new Relay({root,enabled:['org.openxplay.fixture'],clock:()=>clock,...options}).init();
function client(relay) {
  const queue=[],session=relay.connect(m=>{queue.push(m);return true;});if(!session)throw new Error('refused');
  return {send:m=>session.receive(JSON.stringify(m)),next:async predicate=>{const i=queue.findIndex(predicate);if(i<0)throw new Error('missing reply');return queue.splice(i,1)[0];},close:()=>session.close(),queue,session};
}
describe('relay HTTP handler',()=>{
  it('off means every plugin route is 404 and channel refused',async()=>{const r=await relay({enabled:null});const result=await conformance({origin:'https://relay.example',request:q=>r.request({...q,origin:'https://relay.example'}),connect:async()=>client(r),expectOff:true});expect(result.checks.every(c=>c.pass)).toBe(true);expect(r.sessions.size).toBe(0);});
  it('passes enabled conformance in process',async()=>{const r=await relay();const result=await conformance({origin:'https://relay.example',request:q=>r.request({...q,origin:'https://relay.example'}),connect:async()=>client(r),delay:async ms=>{clock+=ms;}});expect(result.checks.filter(c=>!c.pass)).toEqual([]);expect(result.skip).toHaveLength(1);await r.close();});
  it('checks enabled IDs and prevents directory listing, escapes and symlinks outside root',async()=>{const r=await relay();for(const url of ['/plugins/host/','/plugins/p/org.openxplay.disabled/index.html','/plugins/host/a%2fb.js','/plugins/host/../../file.js'])expect((await r.request({url})).status).toBe(404);await symlink(join(root,'../outside.js'),join(root,'host/link.js'));expect((await r.request({url:'/plugins/host/link.js'})).status).toBe(404);});
  it('returns PNG artwork only when current',async()=>{const r=await relay();expect((await r.request({url:r.artworkUrl})).status).toBe(404);r.update('nowPlaying',{title:'x',artist:'a',album:'b',durationMs:1,elapsedMs:0,playing:true,rate:1,artwork:{url:r.artworkUrl,type:'image/png'}});const result=await r.request({url:r.artworkUrl});expect(result.status).toBe(200);expect([...result.body.subarray(0,4)]).toEqual([137,80,78,71]);});
});
describe('channel state and storage',()=>{
  it('requires hello and caps connections at four',async()=>{const r=await relay(),c=client(r);c.send({type:'subscribe',topics:['session']});expect(c.queue.at(-1).code).toBe('protocol');client(r);client(r);client(r);expect(r.connect(()=>true)).toBe(null);await r.close();});
  it('keeps only latest update under backpressure and enforces 4 Hz',async()=>{const r=await relay();const output=[];let blocked=false;const c=r.connect(m=>{if(blocked)return false;output.push(m);return true;});c.receive(JSON.stringify({type:'hello',spec:'oxp-web-plugin/0',host:'test'}));c.receive(JSON.stringify({type:'subscribe',topics:['session']}));blocked=true;for(let i=0;i<100;i++)r.update('session',{carplay:i===99?'connected':'disconnected'});clock+=250;r.flush();expect(c.latest.size).toBe(1);blocked=false;r.flush();expect(output.at(-1).value.carplay).toBe('connected');expect(c.latest.size).toBe(0);r.update('session',null);clock+=249;r.flush();expect(output.at(-1).value).not.toBe(null);clock++;r.flush();expect(output.at(-1).value).toBe(null);await r.close();});
  it('rejects quota at the storage boundary and enforces permissions',async()=>{const r=await relay(),c=client(r);c.session.storage({type:'storage-set',id:'q',plugin:'org.openxplay.fixture',value:{text:'x'.repeat(65536)}});expect(c.queue.at(-1).code).toBe('quota');r.manifests.get('org.openxplay.fixture').permissions=[];c.session.storage({type:'storage-get',id:'p',plugin:'org.openxplay.fixture'});expect(c.queue.at(-1).code).toBe('permission');await r.close();});
  it('persists atomically and reloads per-plugin JSON',async()=>{const dir=join(root,'storage');let r=await relay({storageDir:dir}),c=client(r);c.session.storage({type:'storage-set',id:'a',plugin:'org.openxplay.fixture',value:{score:7}});expect(c.queue.at(-1).type).toBe('storage-ok');await r.close();expect(JSON.parse(await readFile(join(dir,'org.openxplay.fixture.json'),'utf8'))).toEqual({score:7});r=await relay({storageDir:dir});expect(r.store.get('org.openxplay.fixture')).toEqual({score:7});await r.close();});
  it('rejects bad topic snapshots before publishing',async()=>{const r=await relay();expect(()=>r.update('activity',{siri:true})).toThrow();expect(()=>r.update('motion',null)).toThrow();});
});
function masked(op,text,fin=true) {
  const plain=Buffer.isBuffer(text)?text:Buffer.from(text),head=frame(op,plain),offset=head.length-plain.length;
  head[0]=(fin?128:0)|op;head[1]|=128;const mask=Buffer.from([1,2,3,4]),data=Buffer.from(plain);for(let i=0;i<data.length;i++)data[i]^=mask[i%4];return Buffer.concat([head.subarray(0,offset),mask,data]);
}
describe('RFC 6455 frame parser',()=>{
  it('handles split input, continuation and interleaved ping',()=>{const text=[],control=[],errors=[];const parser=new FrameParser(m=>text.push(m),(op,b)=>control.push([op,b.toString()]),()=>errors.push(1));const bytes=Buffer.concat([masked(1,'hel',false),masked(9,'p'),masked(0,'lo')]);for (const b of bytes)parser.push(Buffer.from([b]));expect(text).toEqual(['hello']);expect(control).toEqual([[9,'p']]);expect(errors).toEqual([]);});
  for(const [name,bytes] of [['unmasked',frame(1,'x')],['binary',masked(2,'x')],['orphan continuation',masked(0,'x')],['fragmented ping',masked(9,'x',false)],['bad utf8',masked(1,Buffer.from([255]))],['oversize',masked(1,Buffer.alloc(65537))]])it(`rejects ${name}`,()=>{let errors=0;const p=new FrameParser(()=>{},()=>{},()=>errors++);p.push(bytes);expect(errors).toBe(1);});
  it('parses extended text lengths and close',()=>{const received=[],control=[];const p=new FrameParser(m=>received.push(m),(op)=>control.push(op),()=>{throw new Error('invalid');});p.push(masked(1,'x'.repeat(1000)));p.push(masked(8,''));expect(received[0]).toHaveLength(1000);expect(control).toEqual([8]);});
});
