// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { validatePackage, pluginDirs } from './validate.js';
import { Relay } from './relay.js';
import { attachChannel } from './websocket.js';
import { MIME, safePath } from '../shared/paths.js';
execFileSync(process.execPath,['build.js'],{stdio:'inherit'});
const args=process.argv.slice(2), fixtures=args.flatMap((arg,i)=>arg==='--fixture' ? [args[i+1]]:[]);
const sources=[...await pluginDirs(),...fixtures.map(name=>`tests/fixtures/${name}`)], enabled=[];
for (const source of sources) {
  const result=await validatePackage(source); if (result.errors.length) throw new Error(result.errors.join('\n'));
  enabled.push(result.manifest.id);
  for (const [name,data] of result.files) { const file=`dist/install/p/${result.manifest.id}/${name}`; await mkdir(resolve(file,'..'),{recursive:true}); await writeFile(file,data); }
}
const relay=await new Relay({enabled,storageDir:args.includes('--storage') ? args[args.indexOf('--storage')+1] : null}).init();
relay.enabled=args.includes('--enable') || fixtures.length ? enabled : null;
function capabilities() { return {...(relay.enabled!==null ? {plugins:{host:'/plugins/host/index.html'}}:{}),artwork:relay.artworkUrl}; }
const server=createServer(async(request,response)=>{
  try {
    const url=request.url, origin=`http://${request.headers.host}`;
    if (url.startsWith('/plugins/')) { const result=await relay.request({url,origin,method:request.method}); response.writeHead(result.status,result.headers); response.end(result.body); return; }
    if (url==='/simulator/config' || url==='/simulator/state') {
      let body=''; for await (const chunk of request) { body+=chunk; if (Buffer.byteLength(body)>65536) { response.writeHead(413); response.end(); return; } }
      if (request.method==='POST') {
        const data=JSON.parse(body);
        if (url.endsWith('/config')) { relay.enabled=data.enabled ? enabled : null; if (!data.enabled) for (const session of [...relay.sessions]) session.close(); }
        else relay.update(data.topic,data.value);
      } else if (request.method!=='GET') { response.writeHead(404); response.end(); return; }
      response.writeHead(200,{'Content-Type':'application/json'}); response.end(JSON.stringify(capabilities())); return;
    }
    const path=url==='/' ? 'simulator/index.html' : url.slice(1).split('?')[0];
    if (!['GET','HEAD'].includes(request.method) || !safePath(path) || !/^(simulator|shared|host)\//.test(path)) { response.writeHead(404); response.end(); return; }
    const data=await readFile(path); response.writeHead(200,{'Content-Type':MIME[path.split('.').at(-1)]}); response.end(request.method==='HEAD'?undefined:data);
  } catch(error) { response.writeHead(error.code==='ENOENT'?404:400); response.end(error.message); }
});
const detach=attachChannel(server,relay);
const port=Number(args.includes('--port') ? args[args.indexOf('--port')+1] : 5173);
server.on('error',error=>{ detach(); console.error(`Simulator could not listen: ${error.message}`); process.exitCode=1; });
server.listen(port,'127.0.0.1',()=>console.log(`Simulator: http://localhost:${port}${relay.enabled===null ? ' (plugins off)' : ''}`));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,async()=>{ detach(); await relay.close(); server.close(()=>process.exit()); });
