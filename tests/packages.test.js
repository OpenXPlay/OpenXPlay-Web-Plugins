// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import { it,expect,describe } from 'vitest';
import { mkdtemp,writeFile,symlink,mkdir,rm,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validatePackage,validateFiles,readPackage } from '../tools/validate.js';
import { readZip,writeZip,crc32,MAX_PACKAGE } from '../tools/zip.js';
const valid=(await readPackage('tests/fixtures/valid')).files;
const modified=(name,content)=>new Map([...valid,[name,Buffer.from(content)]]);
describe('package validator',()=>{
  for(const [fixture,ok] of [['minimal',true],['valid',true],['network',false],['missing-guard',false],['bad-manifest',false]])it(`fixture ${fixture}`,async()=>expect((await validatePackage(`tests/fixtures/${fixture}`)).errors.length===0).toBe(ok));
  for(const [name,content] of [['main.js','fetch("/local")'],['main.js','new XMLHttpRequest()'],['main.js','navigator.sendBeacon("/local")'],['main.js','new EventSource("/local")'],['main.js','new RTCPeerConnection()'],['main.js','import "https://example.invalid/a.js"'],['main.js','import("//example.invalid/a.js")'],['main.js','importScripts("//example.invalid/a.js")'],['style.css','a{background:url(https://example.invalid/x)}'],['style.css','@import "https://example.invalid/x"'],['icon.svg','<svg><image href="//example.invalid/x"/></svg>'],['index.html','<img src="https&#58;//example.invalid/x">']])it(`rejects ${content}`,()=>expect(validateFiles(modified(name,content)).errors.length).toBeGreaterThan(0));
  it('rejects async or delayed guard',()=>{for (const source of ['<script>1</script><script src="/plugins/host/guard.js"></script>','<script async src="/plugins/host/guard.js"></script>','<script type="module" src="/plugins/host/guard.js"></script>'])expect(validateFiles(modified('index.html',source)).errors.length).toBeGreaterThan(0);});
  it('rejects oversized package and icon',()=>{expect(validateFiles(modified('large.wasm',Buffer.alloc(MAX_PACKAGE))).errors.some(e=>e.includes('8 MiB'))).toBe(true);expect(validateFiles(modified('icon.svg',Buffer.alloc(65537))).errors.some(e=>e.includes('64 KiB'))).toBe(true);});
  it('rejects missing assets and unsafe paths',()=>{const files=new Map(valid);files.delete('icon.svg');files.set('../bad.js',Buffer.alloc(0));expect(validateFiles(files).errors).toEqual(expect.arrayContaining([expect.stringContaining('missing icon'),expect.stringContaining('invalid path')]));});
  it('rejects all symlinks, including internal targets',async()=>{const dir=await mkdtemp(join(tmpdir(),'oxp-validator-'));try{await writeFile(join(dir,'file.js'),'');await symlink('file.js',join(dir,'link.js'));expect((await validatePackage(dir)).errors.some(e=>e.includes('symlinks forbidden'))).toBe(true);}finally{await rm(dir,{recursive:true,force:true});}});
  it('reads stored archive without extracting untrusted paths',async()=>{const dir=await mkdtemp(join(tmpdir(),'oxp-zip-'));try{const path=join(dir,'fixture.oxpplugin');await writeFile(path,writeZip(valid));expect((await validatePackage(path)).errors).toEqual([]);await writeFile(path,writeZip(new Map([...valid,['../escape.js',Buffer.alloc(0)]])));expect((await validatePackage(path)).errors.some(e=>e.includes('invalid path'))).toBe(true);}finally{await rm(dir,{recursive:true,force:true});}});
});
describe('stored ZIP',()=>{
  it('round trips and uses standard CRC32',()=>{expect(readZip(writeZip(valid))).toEqual(valid);expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);});
  it('rejects corrupt CRC, symlink attributes and truncation',()=>{const bytes=writeZip(valid),bad=Buffer.from(bytes);bad[40]^=1;expect(()=>readZip(bad)).toThrow();expect(()=>readZip(bytes.subarray(0,bytes.length-1))).toThrow();const link=Buffer.from(bytes);const central=link.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));link.writeUInt32LE(0xa1ff0000,central+38);expect(()=>readZip(link)).toThrow(/symlink/);});
});
describe('development directories', () => {
  it('keeps top-level tests and tools out of a source package', async () => {
    const dir=await mkdtemp(join(tmpdir(),'oxp-dev-dirs-'));
    try {
      await mkdir(join(dir,'tests')); await mkdir(join(dir,'tools')); await mkdir(join(dir,'assets'));
      await writeFile(join(dir,'tests','Plugin.Test.JS'),'x');
      await writeFile(join(dir,'tools','edit.py'),'x');
      await writeFile(join(dir,'assets','tools.txt'),'x');
      const { files }=await readPackage(dir);
      expect([...files.keys()]).toEqual(['assets/tools.txt']);
    } finally { await rm(dir,{recursive:true,force:true}); }
  });
});
