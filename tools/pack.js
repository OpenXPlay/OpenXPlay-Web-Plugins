// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import { mkdir, writeFile, cp, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pluginDirs, validatePackage } from './validate.js';
import { writeZip, MAX_PACKAGE } from './zip.js';
export async function pack(paths) {
  execFileSync(process.execPath,['build.js'],{stdio:'inherit'});
  await rm('dist/install/p',{recursive:true,force:true}); await mkdir('dist/install/p',{recursive:true}); await rm('dist/packages',{recursive:true,force:true}); await mkdir('dist/packages',{recursive:true});
  for (const path of paths) {
    const result=await validatePackage(path);
    if (result.errors.length) throw new Error(result.errors.join('\n'));
    const {manifest,files}=result;
    const archive=writeZip(files); if (archive.length>MAX_PACKAGE) throw new Error(`${manifest.id}: archive exceeds 8 MiB`);
    await writeFile(`dist/packages/${manifest.id}-${manifest.version}.oxpplugin`,archive);
    for (const [name,data] of files) {
      const target=`dist/install/p/${manifest.id}/${name}`; await mkdir(resolve(target,'..'),{recursive:true}); await writeFile(target,data);
    }
    console.log(`Packed ${manifest.id}`);
  }
}
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try { await pack(process.argv.length>2 ? process.argv.slice(2) : await pluginDirs()); } catch(error) { console.error(error.message); process.exitCode=1; }
}
