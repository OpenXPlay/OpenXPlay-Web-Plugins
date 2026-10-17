// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

export class StorageBroker {
  nextId=0;
  pending=new Map();
  writes=new Map();
  lastWrite=new Map();
  begin(frame,plugin,message,now) {
    if(message.type==='storage-set') {
      const write=this.writes.get(plugin) ?? {waiters:[]};
      write.value=message.value;write.waiters.push({frame,id:message.id,time:now});this.writes.set(plugin,write);
      return {};
    }
    const local=this.writes.get(plugin) ?? [...this.pending.values()].find(p=>p.plugin===plugin && p.write)?.write;
    if(local)return {reply:{type:'storage',id:message.id,value:local.value}};
    if (this.pending.size>=64) return {reply:{type:'error',id:message.id,code:'rate'}};
    const id=String(++this.nextId);
    this.pending.set(id,{frame,id:message.id,time:now,plugin});
    return {message:{type:message.type,id,plugin}};
  }
  flush(now) {
    const messages=[];
    for(const [plugin,write] of this.writes) {
      if(now-(this.lastWrite.get(plugin) ?? -Infinity)<2000 || [...this.pending.values()].some(p=>p.plugin===plugin&&p.write))continue;
      const id=String(++this.nextId);this.writes.delete(plugin);this.lastWrite.set(plugin,now);
      this.pending.set(id,{plugin,write,time:now});messages.push({type:'storage-set',id,plugin,value:write.value});
    }
    return messages;
  }
  retry(p,now) {
    const newer=this.writes.get(p.plugin);
    this.writes.set(p.plugin,{value:newer ? newer.value : p.write.value,waiters:[...p.write.waiters,...(newer?.waiters ?? [])]});
    this.lastWrite.set(p.plugin,now);
  }
  finish(message,now=0) {
    if (!['storage','storage-ok','error'].includes(message.type)) return null;
    const p=this.pending.get(message.id); if (!p) return null;
    this.pending.delete(message.id);
    if(p.write) {
      this.lastWrite.set(p.plugin,now);
      if(message.type==='error'&&message.code==='rate'){this.retry(p,now);return null;}
      return p.write.waiters.map(w=>({frame:w.frame,message:{...message,id:w.id}}));
    }
    return {frame:p.frame,message:{...message,id:p.id}};
  }
  cancel(id) {
    const p=this.pending.get(id);this.pending.delete(id);
    if(p?.write)this.retry(p,p.time);
  }
  forget(frame) {
    for(const [id,p] of this.pending)if(p.write)p.write.waiters=p.write.waiters.filter(w=>w.frame!==frame);else if(p.frame===frame)this.pending.delete(id);
    for(const write of this.writes.values())write.waiters=write.waiters.filter(w=>w.frame!==frame);
  }
  expire(now,all=false) {
    const replies=[];
    for(const [id,p] of this.pending) if(all || now-p.time>=10000) {
      this.pending.delete(id);
      if(p.write)this.retry(p,now);
      else replies.push({frame:p.frame,message:{type:'error',id:p.id,code:'protocol'}});
    }
    return replies;
  }
}
