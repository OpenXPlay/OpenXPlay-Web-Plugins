// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import { it,expect } from 'vitest';
import { createServer } from 'node:http';
import { mkdir,mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Relay } from '../tools/relay.js';
import { readPackage } from '../tools/validate.js';
import { attachChannel } from '../tools/websocket.js';
import { conformance,httpTransport,websocketTransport } from '../tools/conformance.js';
it('runs HTTP and WebSocket conformance over loopback when permitted',async context=>{
  const root=await mkdtemp(join(tmpdir(),'oxp-live-'));let clock=10000,detach,server,relay;
  try {
    await mkdir(join(root,'host'));await writeFile(join(root,'host/index.html'),'host');
    for(const [path,data] of (await readPackage('tests/fixtures/valid')).files){const file=join(root,'p/org.openxplay.fixture',path);await mkdir(join(file,'..'),{recursive:true});await writeFile(file,data);}
    relay=await new Relay({root,enabled:['org.openxplay.fixture'],clock:()=>clock}).init();
    server=createServer(async(req,res)=>{const result=await relay.request({url:req.url,method:req.method,origin:`http://127.0.0.1:${server.address().port}`});res.writeHead(result.status,result.headers);res.end(result.body);});
    detach=attachChannel(server,relay);
    try {await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});}
    catch(error){if(['EPERM','EACCES'].includes(error.code)){context.skip(`Sandbox forbids loopback listening: ${error.code}`);return;}throw error;}
    const origin=`http://127.0.0.1:${server.address().port}`;
    const result=await conformance({origin,request:httpTransport(origin),connect:()=>websocketTransport(origin),delay:async ms=>{clock+=ms;}});
    expect(result.checks.filter(c=>!c.pass)).toEqual([]);
    relay.enabled=null;
    const off=await conformance({origin,request:httpTransport(origin),connect:()=>websocketTransport(origin),expectOff:true});expect(off.checks.every(c=>c.pass)).toBe(true);
  }finally{detach?.();await relay?.close();if(server?.listening)await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});}
},15000);
