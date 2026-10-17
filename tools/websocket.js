// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import { createHash } from 'node:crypto';
export function frame(opcode,data=Buffer.alloc(0)) {
  const body=Buffer.isBuffer(data) ? data : Buffer.from(data), head=Buffer.alloc(body.length<126 ? 2 : body.length<=65535 ? 4 : 10);
  head[0]=0x80|opcode;
  if (body.length<126) head[1]=body.length;
  else if (body.length<=65535) { head[1]=126; head.writeUInt16BE(body.length,2); }
  else { head[1]=127; head.writeBigUInt64BE(BigInt(body.length),2); }
  return Buffer.concat([head,body]);
}
export class FrameParser {
  buffer=Buffer.alloc(0); fragments=[]; size=0; fragmented=false; failed=false;
  constructor(onText,onControl,onError) { this.onText=onText; this.onControl=onControl; this.onError=onError; }
  fail() { this.failed=true; this.onError(); }
  push(data) {
    if (this.failed) return;
    this.buffer=Buffer.concat([this.buffer,data]);
    while (this.buffer.length>=2) {
      const b=this.buffer, fin=!!(b[0]&128), opcode=b[0]&15, masked=!!(b[1]&128); let length=b[1]&127, offset=2;
      if (b[0]&0x70 || !masked || ![0,1,8,9,10].includes(opcode)) { this.fail(); return; }
      if (length===126) { if (b.length<4) return; length=b.readUInt16BE(2); offset=4; if (length<126) { this.fail(); return; } }
      else if (length===127) { if (b.length<10) return; const long=b.readBigUInt64BE(2); if (long>65536n || long<65536n) { this.fail(); return; } length=Number(long); offset=10; }
      if (length>65536 || opcode>=8 && (!fin || length>125) || opcode===8 && length===1) { this.fail(); return; }
      if (b.length<offset+4+length) return;
      const mask=b.subarray(offset,offset+4), body=Buffer.from(b.subarray(offset+4,offset+4+length)); for (let i=0;i<body.length;i++) body[i]^=mask[i%4];
      this.buffer=b.subarray(offset+4+length);
      if (opcode>=8) {
        if(opcode===8 && body.length>=2) {
          const code=body.readUInt16BE(0);
          if(!([1000,1001,1002,1003,1007,1008,1009,1010,1011,1012,1013,1014].includes(code) || code>=3000 && code<=4999)) {this.fail();return;}
          try{new TextDecoder('utf-8',{fatal:true}).decode(body.subarray(2));}catch{this.fail();return;}
        }
        this.onControl(opcode,body);continue;
      }
      if (opcode===1 && this.fragmented || opcode===0 && !this.fragmented) { this.fail(); return; }
      this.size+=length; if (this.size>65536) { this.fail(); return; }
      this.fragments.push(body); this.fragmented=!fin;
      if (fin) {
        let text; try { text=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(this.fragments)); } catch { this.fail(); return; }
        this.fragments=[]; this.size=0; this.onText(text);
      }
    }
    if (this.buffer.length>65550) this.fail();
  }
}
export function attachChannel(server,relay) {
  const sockets=new Set();
  const upgrade=(request,socket,head) => {
    const key=request.headers['sec-websocket-key'];
    if (request.url!=='/plugins/channel' || request.method!=='GET' || request.headers.upgrade?.toLowerCase()!=='websocket' || request.headers['sec-websocket-version']!=='13' || typeof key!=='string' || !/^[A-Za-z0-9+/]{22}==$/.test(key)) { socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n'); return; }
    let ended=false, lastPong=Date.now();
    const session=relay.connect(message => {
      if (ended) return false;
      if (socket.writableLength>65536) { if (message.type==='state') return false; close(); return false; }
      socket.write(frame(1,JSON.stringify(message))); return true;
    });
    if (!session) { socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n'); return; }
    const accept=createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`); sockets.add(socket);
    function close() { if (ended) return; ended=true; clearInterval(timer); session.close(); sockets.delete(socket); socket.end(frame(8)); }
    session.onClose=close;
    const parser=new FrameParser(text=>session.receive(text),(op,data)=>{ if (op===9) socket.write(frame(10,data)); if (op===10) lastPong=Date.now(); if (op===8) close(); },close);
    const timer=setInterval(()=>{ if (Date.now()-lastPong>30000) close(); else socket.write(frame(9)); },15000);
    socket.on('data',data=>parser.push(data)); socket.on('error',close); socket.on('close',close); socket.on('end',close);
    if (head.length) parser.push(head);
  };
  server.on('upgrade',upgrade);
  const flush=setInterval(()=>relay.flush(),50);
  return () => { clearInterval(flush); server.off('upgrade',upgrade); for (const socket of sockets) socket.destroy(); };
}
