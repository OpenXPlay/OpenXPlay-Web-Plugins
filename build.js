// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import { mkdir, readFile, writeFile, cp, rm, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { build } from 'vite';
const header='// SPDX-FileCopyrightText: 2026 OpenXPlay.org\n// SPDX-License-Identifier: Apache-2.0 OR MIT\n// Created by riko chen on 2026-10-16\n';
export async function buildAll() {
  const registry=JSON.parse(await readFile('spec/topics/registry.json','utf8'));
  await writeFile('shared/topics.js',header+'\n// Generated from spec/topics/registry.json by build.js.\nexport const registry = '+JSON.stringify(registry)+';\n');
  const schemas={};
  for (const name of (await readdir('spec/schema')).filter(name=>name.endsWith('.json'))) schemas[name.replace('.schema.json','')]=JSON.parse(await readFile(`spec/schema/${name}`,'utf8'));
  await writeFile('shared/schemas.js',`${header}\n// Generated from the normative JSON schemas by build.js.\nexport const schemas = ${JSON.stringify(schemas)};\n`);
  execFileSync(process.execPath,['node_modules/typescript/bin/tsc'],{stdio:'inherit'});
  const sdkSource=await readFile('dist/sdk/oxp-plugin-sdk.js','utf8');
  await writeFile('shared/drag.js',header+'\n// Generated from the SDK gesture helper by build.js.\n'+sdkSource.slice(sdkSource.indexOf('export function enableDragGesture')));
  const declaration='dist/sdk/oxp-plugin-sdk.d.ts';
  await writeFile(declaration,header+'\n'+await readFile(declaration,'utf8'));
  await rm('dist/install/host',{recursive:true,force:true});
  await build({configFile:false,publicDir:false,build:{outDir:'dist/install/host',emptyOutDir:true,lib:{entry:'host/host.js',formats:['es'],fileName:()=> 'host.js'},rollupOptions:{output:{banner:header}},target:'chrome120'}});
  const hostScript='dist/install/host/host.js';
  const hostSource=await readFile(hostScript,'utf8');
  if(!hostSource.startsWith(header))await writeFile(hostScript,header+'\n'+hostSource);
  await mkdir('dist/install/host',{recursive:true});
  for (const file of ['index.html','style.css','guard.js']) await cp(`host/${file}`,`dist/install/host/${file}`);
}
if (process.argv[1]?.endsWith('/build.js')) await buildAll();
