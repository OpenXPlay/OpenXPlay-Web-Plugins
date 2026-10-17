// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import { inflateRawSync } from 'node:zlib';
export const MAX_PACKAGE = 8 * 1024 * 1024;
export function crc32(data) {
  let crc=0xffffffff;
  for (const byte of data) { crc^=byte; for (let i=0;i<8;i++) crc=crc>>>1 ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc^0xffffffff)>>>0;
}
export function writeZip(files) {
  if(files.size>65535)throw new Error('too many ZIP entries');
  const local=[], central=[]; let offset=0;
  for (const [path,data] of [...files].sort(([a],[b]) => a.localeCompare(b))) {
    const name=Buffer.from(path), crc=crc32(data), head=Buffer.alloc(30), entry=Buffer.alloc(46);
    head.writeUInt32LE(0x04034b50); head.writeUInt16LE(20,4); head.writeUInt32LE(crc,14); head.writeUInt32LE(data.length,18); head.writeUInt32LE(data.length,22); head.writeUInt16LE(name.length,26);
    entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(20,4); entry.writeUInt16LE(20,6); entry.writeUInt32LE(crc,16); entry.writeUInt32LE(data.length,20); entry.writeUInt32LE(data.length,24); entry.writeUInt16LE(name.length,28); entry.writeUInt32LE(offset,42);
    local.push(head,name,data); central.push(entry,name); offset+=head.length+name.length+data.length;
  }
  const cd=Buffer.concat(central), end=Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.size,8); end.writeUInt16LE(files.size,10); end.writeUInt32LE(cd.length,12); end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,cd,end]);
}
export function readZip(data) {
  if (data.length>MAX_PACKAGE) throw new Error('archive exceeds 8 MiB');
  let end=-1;
  for (let i=data.length-22;i>=Math.max(0,data.length-65557);i--) if (data.readUInt32LE(i)===0x06054b50 && i+22+data.readUInt16LE(i+20)===data.length) { end=i; break; }
  if (end<0) throw new Error('missing ZIP directory');
  if (data.readUInt16LE(end+4) || data.readUInt16LE(end+6) || data.readUInt16LE(end+8)!==data.readUInt16LE(end+10)) throw new Error('multi-disk ZIP unsupported');
  const count=data.readUInt16LE(end+10), size=data.readUInt32LE(end+12); let pos=data.readUInt32LE(end+16), total=0;
  if (pos+size!==end) throw new Error('invalid ZIP directory bounds');
  const files=new Map();
  for (let i=0;i<count;i++) {
    if (pos+46>end || data.readUInt32LE(pos)!==0x02014b50) throw new Error('invalid ZIP entry');
    const flags=data.readUInt16LE(pos+8), method=data.readUInt16LE(pos+10), crc=data.readUInt32LE(pos+16), compressed=data.readUInt32LE(pos+20), length=data.readUInt32LE(pos+24), names=data.readUInt16LE(pos+28), extra=data.readUInt16LE(pos+30), comment=data.readUInt16LE(pos+32), attr=data.readUInt32LE(pos+38), local=data.readUInt32LE(pos+42);
    if (flags&1 || ![0,8].includes(method) || ((attr>>>16)&0xf000)===0xa000) throw new Error('encrypted, unsupported or symlink ZIP entry');
    if (pos+46+names+extra+comment>end || local+30>data.length || data.readUInt32LE(local)!==0x04034b50) throw new Error('invalid ZIP bounds');
    const name=data.subarray(pos+46,pos+46+names).toString('utf8');
    const start=local+30+data.readUInt16LE(local+26)+data.readUInt16LE(local+28);
    if (start+compressed>data.readUInt32LE(end+16)) throw new Error('invalid ZIP payload bounds');
    total+=length; if (total>MAX_PACKAGE) throw new Error('expanded package exceeds 8 MiB');
    const payload=data.subarray(start,start+compressed), content=method===0 ? payload : inflateRawSync(payload,{maxOutputLength:MAX_PACKAGE});
    if (content.length!==length || crc32(content)!==crc) throw new Error('ZIP size or CRC mismatch');
    if (files.has(name)) throw new Error(`duplicate ZIP path: ${name}`);
    if (!name.endsWith('/')) files.set(name,content);
    else if (!name.slice(0,-1).split('/').every(p=>/^[a-z0-9][a-z0-9._-]*$/.test(p)) || length) throw new Error('invalid ZIP directory');
    pos+=46+names+extra+comment;
  }
  if (pos!==end) throw new Error('ZIP directory length mismatch');
  return files;
}
