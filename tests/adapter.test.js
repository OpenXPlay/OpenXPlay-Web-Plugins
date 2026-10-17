// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import { it,expect,vi,afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { attachChannel,frame } from '../tools/websocket.js';
import { Relay } from '../tools/relay.js';
function masked(op,text) {const b=frame(op,text),size=b.length-Buffer.byteLength(text),mask=Buffer.from([1,2,3,4]),payload=Buffer.from(text);b[1]|=128;for(let i=0;i<payload.length;i++)payload[i]^=mask[i%4];return Buffer.concat([b.subarray(0,size),mask,payload]);}
class Socket extends EventEmitter {writes=[];writableLength=0;ended=false;write(b){this.writes.push(b);}end(b){this.ended=true;if(b)this.write(b);}destroy(){this.emit('close');}}
const request={url:'/plugins/channel',method:'GET',headers:{upgrade:'websocket','sec-websocket-version':'13','sec-websocket-key':'AAAAAAAAAAAAAAAAAAAAAA=='}};
afterEach(()=>vi.useRealTimers());
it('upgrades, receives hello and echoes ping without binding a port',async()=>{vi.useFakeTimers();const server=new EventEmitter(),relay=await new Relay({enabled:[]}).init(),detach=attachChannel(server,relay),socket=new Socket();try{server.emit('upgrade',request,socket,Buffer.alloc(0));expect(socket.writes[0]).toContain('101 Switching Protocols');socket.emit('data',masked(1,JSON.stringify({type:'hello',spec:'oxp-web-plugin/0',host:'test'})));expect(JSON.parse(socket.writes[1].subarray((socket.writes[1][1]&127)===126?4:2).toString()).type).toBe('welcome');socket.emit('data',masked(9,'hi'));expect(socket.writes.at(-1)[0]).toBe(0x8a);await vi.advanceTimersByTimeAsync(15000);expect(socket.writes.at(-1)[0]).toBe(0x89);await relay.close();expect(socket.ended).toBe(true);expect(relay.sessions.size).toBe(0);}finally{detach();}});
it('refuses disabled channels and the fifth connection',async()=>{vi.useFakeTimers();const server=new EventEmitter(),relay=await new Relay({enabled:[]}).init(),detach=attachChannel(server,relay);try{for(let i=0;i<4;i++)server.emit('upgrade',request,new Socket(),Buffer.alloc(0));const fifth=new Socket();server.emit('upgrade',request,fifth,Buffer.alloc(0));expect(fifth.writes[0]).toContain('404');await relay.close();relay.enabled=null;const off=new Socket();server.emit('upgrade',request,off,Buffer.alloc(0));expect(off.writes[0]).toContain('404');}finally{detach();}});
