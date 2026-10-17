// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import { describe,it,expect } from 'vitest';
import { readFile,readdir } from 'node:fs/promises';
import { validate } from '../shared/validate.js';
import { schemas } from '../shared/schemas.js';
import { safePath,headers } from '../shared/paths.js';
const json=async file=>JSON.parse(await readFile(file,'utf8'));
const schemaFiles=(await readdir('spec/schema')).filter(f=>f.endsWith('.json'));
const vectors=await json('spec/vectors/schema.json'), paths=await json('spec/vectors/paths.json'), csp=await json('spec/vectors/csp.json');
describe('normative schema vectors',()=>{
  for (const vector of vectors) it(vector.name,async()=>{
    const schema=await json(`spec/schema/${vector.schema}.schema.json`);
    expect(validate(schema,vector.value).length===0).toBe(vector.valid);
  });
  for (const file of schemaFiles) it(`runtime schema mirrors ${file}`,async()=>{
    const schema=await json(`spec/schema/${file}`), runtime=schemas[file.replace('.schema.json','')];
    const {$schema,$id,...body}=schema; const {$schema:runtimeVersion,$id:runtimeId,...runtimeBody}=runtime;
    expect(runtimeBody).toEqual(body);
  });
});
describe('path and CSP vectors',()=>{
  for (const vector of paths) it(`${vector.path}: ${vector.reason}`,()=>expect(safePath(vector.path)).toBe(vector.allowed));
  for (const vector of csp) it(vector.name,()=>expect(headers(vector.origin,vector.plugin)).toEqual(vector.headers));
});
describe('schema subset',()=>{
  it('rejects extra properties where closed',()=>expect(validate({type:'object',additionalProperties:false},{x:1})).not.toEqual([]));
  it('checks typed extra properties',()=>expect(validate({type:'object',additionalProperties:{type:'string'}},{x:1})).not.toEqual([]));
  it('checks integer, range, finite numbers',()=>{for (const value of [1.5,-1,4,Infinity]) expect(validate({type:'integer',minimum:0,maximum:3},value)).not.toEqual([]);});
  it('counts Unicode codepoints',()=>expect(validate({type:'string',maxLength:1},'😀')).toEqual([]));
  it('rejects ambiguous oneOf',()=>expect(validate({oneOf:[{},{}]},null)).not.toEqual([]));
  it('applies array limits and items',()=>expect(validate({type:'array',maxItems:1,items:{type:'string'}},[1,2])).toHaveLength(3));
});
