// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import { it,expect } from 'vitest';
import { StorageBroker } from '../host/storage.js';
it('keeps identical plugin request IDs separate and binds plugin identity',()=>{
  const broker=new StorageBroker();
  const a=broker.begin('frame-a','org.a',{type:'storage-get',id:'1',plugin:'org.b'},0);
  const b=broker.begin('frame-b','org.b',{type:'storage-get',id:'1'},0);
  expect(a.message.plugin).toBe('org.a');expect(a.message.id).not.toBe(b.message.id);
  expect(broker.finish({type:'storage',id:b.message.id,value:{secret:'b'}})).toEqual({frame:'frame-b',message:{type:'storage',id:'1',value:{secret:'b'}}});
  expect(broker.finish({type:'storage',id:a.message.id,value:{secret:'a'}}).frame).toBe('frame-a');
  expect(broker.finish({type:'storage',id:'unknown',value:{}})).toBe(null);
});
it('drops replies after unload and expires outstanding requests',()=>{const b=new StorageBroker();const a=b.begin('a','org.a',{type:'storage-get',id:'local'},0);b.forget('a');expect(b.finish({type:'storage',id:a.message.id,value:{}})).toBe(null);b.begin('b','org.b',{type:'storage-get',id:'b'},0);expect(b.expire(9999)).toEqual([]);expect(b.expire(10000)).toEqual([{frame:'b',message:{type:'error',id:'b',code:'protocol'}}]);});
it('caps pending requests and drains on channel disconnect',()=>{const b=new StorageBroker();for(let i=0;i<64;i++)b.begin('a','org.a',{type:'storage-get',id:String(i)},0);expect(b.begin('a','org.a',{type:'storage-get',id:'over'},0).reply.code).toBe('rate');expect(b.expire(1,true)).toHaveLength(64);expect(b.pending.size).toBe(0);});
it('coalesces across surfaces, reads the latest value, and acknowledges every caller',()=>{
  const b=new StorageBroker();
  b.begin('panel','org.a',{type:'storage-set',id:'1',value:{n:1}},0);
  b.begin('pet','org.a',{type:'storage-set',id:'2',value:{n:2}},10);
  expect(b.begin('panel','org.a',{type:'storage-get',id:'3'},10).reply).toEqual({type:'storage',id:'3',value:{n:2}});
  const [write]=b.flush(50);expect(write.value).toEqual({n:2});expect(b.flush(100)).toEqual([]);
  expect(b.finish({type:'storage-ok',id:write.id},100)).toEqual([{frame:'panel',message:{type:'storage-ok',id:'1'}},{frame:'pet',message:{type:'storage-ok',id:'2'}}]);
  b.begin('pet','org.a',{type:'storage-set',id:'4',value:{n:4}},101);
  expect(b.flush(2099)).toEqual([]);expect(b.flush(2100)[0].value).toEqual({n:4});
});
it('preserves the final write after unload and retries rate errors without exposing them',()=>{
  const b=new StorageBroker();b.begin('a','org.a',{type:'storage-set',id:'1',value:{n:1}},0);
  const [first]=b.flush(0);b.begin('b','org.a',{type:'storage-set',id:'2',value:{n:2}},1);
  expect(b.finish({type:'error',id:first.id,code:'rate'},100)).toBe(null);
  b.forget('a');b.forget('b');expect(b.flush(2099)).toEqual([]);
  const [retry]=b.flush(2100);expect(retry.value).toEqual({n:2});expect(b.finish({type:'storage-ok',id:retry.id},2101)).toEqual([]);
});
it('does not block another plugin and forwards actual write failures',()=>{
  const b=new StorageBroker();b.begin('a','org.a',{type:'storage-set',id:'1',value:{}},0);b.begin('b','org.b',{type:'storage-set',id:'1',value:{}},0);
  const writes=b.flush(0);expect(writes).toHaveLength(2);
  expect(b.finish({type:'error',id:writes[0].id,code:'quota'},1)).toEqual([{frame:'a',message:{type:'error',id:'1',code:'quota'}}]);
});
