// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import { lstat, readdir, readFile } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { safePath } from '../shared/paths.js';
import { manifestErrors } from '../shared/protocol.js';
import { MAX_PACKAGE, readZip } from './zip.js';
/** Top-level source directories that stay out of packages: tests and build tools. */
export const DEV_DIRS=new Set(['tests','tools']);
export async function readPackage(path) {
  const files=new Map(), errors=[]; let total=0;
  async function walk(dir) {
    for (const entry of await readdir(dir,{withFileTypes:true})) {
      const full=join(dir,entry.name), name=relative(path,full).split('\\').join('/');
      // Development-only directories of a source package are never part of the package.
      if (dir===path && DEV_DIRS.has(entry.name) && entry.isDirectory()) continue;
      const stat=await lstat(full);
      if (stat.isSymbolicLink()) { errors.push(`${name}: symlinks forbidden`); continue; }
      if (stat.isDirectory()) {
        if (!name.split('/').every(p=>/^[a-z0-9][a-z0-9._-]*$/.test(p))) errors.push(`${name}: invalid directory path`);
        await walk(full);
      } else if (stat.isFile()) {
        total+=stat.size;
        if (total>MAX_PACKAGE) { errors.push(`${name}: package exceeds 8 MiB`); continue; }
        files.set(name,await readFile(full));
      } else errors.push(`${name}: not a regular file`);
    }
  }
  const stat=await lstat(path);
  if (stat.isSymbolicLink()) throw new Error('package symlink forbidden');
  if (stat.isDirectory()) await walk(path);
  else if (path.endsWith('.oxpplugin')) return {files:readZip(await readFile(path)),errors};
  else throw new Error('expected directory or .oxpplugin');
  return {files,errors};
}
function decoded(text) {
  return text.replace(/&#(?:x([0-9a-f]+)|([0-9]+));?/gi,(_,h,d) => String.fromCodePoint(parseInt(h??d,h?16:10))).replace(/&colon;/gi,':').replace(/\\u\{([0-9a-f]+)\}|\\u([0-9a-f]{4})|\\x([0-9a-f]{2})/gi,(_,a,b,c)=>String.fromCodePoint(parseInt(a??b??c,16))).replace(/\\([0-9a-f]{1,6})\s?/gi,(_,h)=>String.fromCodePoint(parseInt(h,16)));
}
export function validateFiles(files) {
  const errors=[]; let manifest;
  const error=(file,detail) => errors.push(`${file}: ${detail}`);
  let total=0;
  for (const [name,data] of files) {
    total+=data.length;
    if (!safePath(name)) error(name,'invalid path or file type');
    if (!/\.(html|js|mjs|css|svg)$/.test(name)) continue;
    const source=decoded(data.toString('utf8'));
    if (/(?:\b(?:src|href|action|poster|srcset)\s*=\s*["'\x60]?\s*(?:[a-z][a-z0-9+.-]*:|\/\/))|(?:\burl\(\s*["'\x60]?\s*(?:[a-z][a-z0-9+.-]*:|\/\/))|(?:@import\s*["'\x60]\s*(?:[a-z][a-z0-9+.-]*:|\/\/))/i.test(source)) error(name,'remote reference');
    if (/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|(?:webkit|moz)?RTCPeerConnection|RTCDataChannel)\b/.test(source)) error(name,'network API forbidden');
    if (/\bimportScripts\s*\([^)]*["'\x60]\s*(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(source)) error(name,'remote importScripts');
    if (/\b(?:import|export)\s*(?:[^;]*?\bfrom\s*)?["'\x60]\s*(?:[a-z][a-z0-9+.-]*:|\/\/)|\bimport\s*\(\s*["'\x60]\s*(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(source)) error(name,'remote module specifier');
  }
  if (total>MAX_PACKAGE) error('package','exceeds 8 MiB');
  try { manifest=JSON.parse(files.get('oxp-plugin.json')?.toString('utf8') ?? ''); }
  catch { error('oxp-plugin.json','missing or invalid JSON'); return {errors:[...new Set(errors)],manifest}; }
  const checks=manifestErrors(manifest); for (const issue of checks) error('oxp-plugin.json',issue);
  if (checks.length) return {errors:[...new Set(errors)],manifest};
  for (const icon of [manifest.icon,...manifest.quickActions.map(a=>a.icon)]) {
    if (!safePath(icon) || !/\.(svg|png)$/.test(icon)) error(icon,'icon must be a local SVG or PNG');
    if (!files.has(icon)) error(icon,'missing icon');
    else {
      const data=files.get(icon);
      if (data.length>65536) error(icon,'icon exceeds 64 KiB');
      if (icon.endsWith('.png') ? !data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : !/<svg(?:\s|>)/i.test(data.toString('utf8'))) error(icon,'invalid icon format');
    }
  }
  for (const surface of manifest.surfaces) {
    const file=files.get(surface.entry);
    if (!safePath(surface.entry) || !file) { error(surface.entry,'missing or invalid entry'); continue; }
    const source=file.toString('utf8').replace(/<!--[\s\S]*?-->/g,'');
    const first=source.match(/<script\b([^>]*)>/i);
    if (!first || (first[1].match(/(?:^|\s)src\s*=/gi)??[]).length!==1 || !/(?:^|\s)src\s*=\s*(["'\x60])\/plugins\/host\/guard\.js\1/i.test(first[1]) || /\b(?:async|defer|nomodule|type\s*=)/i.test(first[1])) error(surface.entry,'first script must synchronously load /plugins/host/guard.js');
  }
  return {errors:[...new Set(errors)],manifest};
}
export async function validatePackage(path) {
  try { const {files,errors}=await readPackage(path); const result=validateFiles(files); return {...result,files,errors:[...errors,...result.errors]}; }
  catch (error) { return {errors:[`${path}: ${error.message}`],files:new Map()}; }
}
export async function pluginDirs(base='plugins') {
  return (await readdir(base,{withFileTypes:true})).filter(e=>!e.name.startsWith('.') && e.isDirectory()).map(e=>join(base,e.name));
}
async function main() {
  let paths=process.argv.slice(2); if (!paths.length || paths.every(p=>p==='plugins/*')) paths=await pluginDirs();
  let failed=false;
  for (const path of paths) { const result=await validatePackage(path); for (const error of result.errors) console.error(`${path}: ${error}`); if (result.errors.length) failed=true; else console.log(`${path}: valid`); }
  if (!paths.length) console.log('No plugins; validation passed.');
  process.exitCode=failed ? 1 : 0;
}
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) await main();
