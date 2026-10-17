// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import http from 'node:http';
import https from 'node:https';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { headers } from '../shared/paths.js';
import { schemas } from '../shared/schemas.js';
import { validate } from '../shared/validate.js';
import { SPEC, TOPICS, parseMessage } from '../shared/protocol.js';
export function httpTransport(origin,insecure=false) {
  const base=new URL(origin);
  return ({url,method='GET'})=>new Promise((resolve,reject)=>{
    const request=(base.protocol==='https:'?https:http).request({hostname:base.hostname,port:base.port,protocol:base.protocol,path:url,method,rejectUnauthorized:!insecure},response=>{
      const chunks=[]; let size=0;
      response.on('data',chunk=>{ size+=chunk.length; if (size>8*1024*1024) { response.destroy(new Error('response too large')); return; } chunks.push(chunk); });
      response.on('end',()=>resolve({status:response.statusCode,headers:response.headers,body:Buffer.concat(chunks)})); response.on('error',reject);
    }); request.setTimeout(5000,()=>request.destroy(new Error('HTTP timed out'))); request.on('error',reject); request.end();
  });
}
export async function websocketTransport(origin) {
  const url=new URL('/plugins/channel',origin); url.protocol=url.protocol==='https:'?'wss:':'ws:';
  const socket=new WebSocket(url), queue=[]; let waiter,closed=false;
  socket.addEventListener('close',()=>{closed=true; if (waiter) waiter.reject(new Error('Channel closed'));});
  socket.addEventListener('message',event=>{ const m=parseMessage('channel',event.data); if (!m) { if (waiter) waiter.reject(new Error('Invalid channel message')); return; } queue.push(m); if (waiter) waiter.pump(); });
  await new Promise((resolve,reject)=>{ const timer=setTimeout(()=>{socket.close();reject(new Error('WebSocket timed out'));},5000); socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true}); socket.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('WebSocket refused'));},{once:true}); });
  return {
    send(message) { socket.send(JSON.stringify(message)); },
    next(predicate) { return new Promise((resolve,reject)=>{
      if (closed) {reject(new Error('Channel closed'));return;}
      const timer=setTimeout(()=>{waiter=undefined;reject(new Error('Channel reply timed out'));},5000);
      const pump=()=>{const index=queue.findIndex(predicate); if (index>=0) { const [m]=queue.splice(index,1); clearTimeout(timer); waiter=undefined; resolve(m); }};
      waiter={pump,reject:error=>{clearTimeout(timer);waiter=undefined;reject(error);}}; pump();
    }); }, close() { socket.close(); }
  };
}
export async function conformance({origin,request,connect,expectOff=false,delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))}) {
  const checks=[], skip=[];
  function check(name,ok,detail='') { checks.push({name,pass:!!ok,...(!ok?{detail}: {})}); }
  const get=url=>request({url});
  const normalized=h=>Object.fromEntries(Object.entries(h).map(([k,v])=>[k.toLowerCase(),v]));
  function checkHeaders(name,response,plugin) {
    const actual=normalized(response.headers);
    for (const [key,value] of Object.entries(headers(origin,plugin))) check(`${name}: ${key}`,actual[key.toLowerCase()]===value,`expected ${value}; received ${actual[key.toLowerCase()]}`);
  }
  if (expectOff) {
    for (const url of ['/plugins/index.json','/plugins/host/index.html','/plugins/p/org.openxplay.fixture/index.html','/plugins/artwork/'+'0'.repeat(64)]) check(`${url}: off`,(await get(url)).status===404);
    let refused=false, channel;
    try { channel=await connect(); } catch { refused=true; } finally { channel?.close(); }
    check('channel refused when off',refused); return {checks,skip};
  }
  const host=await get('/plugins/host/index.html'); check('host served',host.status===200); checkHeaders('host',host);
  const head=await request({url:'/plugins/host/index.html',method:'HEAD'}); check('HEAD host',head.status===200 && head.body.length===0); checkHeaders('HEAD',head);
  const indexResponse=await get('/plugins/index.json'); let index;
  try { index=JSON.parse(indexResponse.body.toString()); } catch { index=null; }
  check('index schema',indexResponse.status===200 && !validate(schemas.index,index).length);
  const installed=new Set((index?.plugins??[]).map(p=>p.id));let disabled='org.openxplay.conformance-disabled';
  while(installed.has(disabled))disabled+='-x';
  for (const path of ['/plugins/host/../index.html','/plugins/host/%2e%2e/index.html','/plugins/host/%252e%252e/index.html','/plugins/host/.hidden.js','/plugins/host/a/.hidden.js','/plugins/host/file.exe',`/plugins/p/${disabled}/index.html`]) {
    const response=await get(path); check(`${path}: 404`,response.status===404); checkHeaders(path,response,path.includes('/p/')?disabled:undefined);
  }
  for (const method of ['POST','PUT','DELETE','PATCH','OPTIONS','TRACE']) check(`${method} denied`,(await request({url:'/plugins/host/index.html',method})).status===404);
  const manifests=[];
  for (const item of index?.plugins ?? []) {
    const response=await get(item.manifest); let manifest;
    try {manifest=JSON.parse(response.body.toString());} catch {}
    check(`${item.id} manifest`,response.status===200 && manifest?.id===item.id && manifest?.version===item.version && !validate(schemas.manifest,manifest).length);
    if (manifest) manifests.push(manifest);
  }
  if (manifests.length) {
    const m=manifests[0], file=await get(`/plugins/p/${m.id}/${m.surfaces[0]?.entry ?? m.icon}`);
    check('plugin file served',file.status===200); checkHeaders('plugin',file,m.id);
  } else skip.push('Plugin file checks: index has no plugins.');
  let channel;
  try {
    channel=await connect(); channel.send({type:'hello',spec:SPEC,host:'conformance/0'});
    const welcome=await channel.next(m=>m.type==='welcome'); check('channel welcome',!validate(schemas['channel-message'],welcome).length);
    const topics=welcome.topics.filter(t=>TOPICS.includes(t));
    channel.send({type:'subscribe',topics});
    for (const topic of topics) { const m=await channel.next(m=>m.type==='state' && m.topic===topic); check(`channel state ${topic}`,!validate(schemas['channel-message'],m).length); }
    channel.send({type:'storage-get',id:'unknown',plugin:disabled});
    check('unknown plugin storage denied',(await channel.next(m=>m.type==='error' && m.id==='unknown')).code==='unknown-plugin');
    const m=manifests.find(m=>m.permissions.includes('storage'));
    if (m) {
      channel.send({type:'storage-get',id:'before',plugin:m.id}); const before=(await channel.next(m=>m.type==='storage' && m.id==='before')).value;
      const value={...(before??{}),oxpConformance:true};
      try {
        await delay(2000);
        channel.send({type:'storage-set',id:'write',plugin:m.id,value}); check('storage write',(await channel.next(m=>m.id==='write')).type==='storage-ok');
        channel.send({type:'storage-set',id:'rate',plugin:m.id,value}); check('storage rate',(await channel.next(m=>m.id==='rate')).code==='rate');
        // The envelope already exceeds the message cap before a 64 KiB object can exceed quota.
        const probe=await connect();
        try {
          probe.send({type:'hello',spec:SPEC,host:'conformance-quota/0'}); await probe.next(m=>m.type==='welcome');
          probe.send({type:'storage-set',id:'quota',plugin:m.id,value:{text:'x'.repeat(65536)}});
          let code;
          try { code=(await probe.next(m=>m.type==='error' && (m.id==='quota' || !m.id))).code; }
          catch(error) { if (!/Channel closed/.test(error.message)) throw error; code='protocol'; }
          check('oversize storage rejected',['quota','protocol'].includes(code));
          if (code==='protocol') skip.push('Wire quota error is unreachable under the 64 KiB message cap; oversized storage was rejected as protocol.');
        } finally { probe.close(); }
      } finally {
        await delay(2000); channel.send({type:'storage-set',id:'restore',plugin:m.id,value:before??{}});
        check('storage restored',(await channel.next(m=>m.id==='restore')).type==='storage-ok');
      }
    } else skip.push('Storage checks: no enabled plugin declares storage.');
  } catch(error) { check('channel exchange',false,error.message); } finally { channel?.close(); }
  return {checks,skip};
}
async function main() {
  const args=process.argv.slice(2), origin=args.find(a=>!a.startsWith('--'));
  if (!origin) throw new Error('Usage: npm run conformance -- <relay origin> [--insecure] [--expect-off]');
  const base=new URL(origin); if (!['http:','https:'].includes(base.protocol) || base.pathname!=='/' || base.search || base.hash || base.username || base.password) throw new Error('Expected an HTTP(S) origin');
  if (args.includes('--insecure')) process.env.NODE_TLS_REJECT_UNAUTHORIZED='0';
  const result=await conformance({origin:base.origin,request:httpTransport(base.origin,args.includes('--insecure')),connect:()=>websocketTransport(base.origin),expectOff:args.includes('--expect-off')});
  for (const check of result.checks) console.log(`${check.pass?'PASS':'FAIL'} ${check.name}${check.detail?`: ${check.detail}`:''}`);
  for (const note of result.skip) console.log(`SKIP ${note}`);
  console.log(`${result.checks.filter(c=>c.pass).length}/${result.checks.length} checks passed; ${result.skip.length} notes/skips`);
  process.exitCode=result.checks.every(c=>c.pass)?0:1;
}
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {await main();} catch(error) {console.error(error.message);process.exitCode=1;}
}
