// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import { spdxExpression, languageTag } from './spdx.js';
import { schemas } from './schemas.js';
import { registry } from './topics.js';
import { validate } from './validate.js';
export const SPEC = 'oxp-web-plugin/0';
export const TOPICS = registry.topics.filter(t=>t.provider==='relay').map(t=>t.id);
export function validMessage(kind, value) { return validate(schemas[`${kind}-message`], value).length === 0; }
export function parseMessage(kind, raw) {
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > 65536) return null;
  try { const value = JSON.parse(raw); return validMessage(kind, value) ? value : null; } catch { return null; }
}
export function manifestErrors(manifest) {
  const errors = validate(schemas.manifest, manifest);
  if (errors.length) return errors;
  if (!spdxExpression(manifest.license)) errors.push('license: invalid SPDX expression syntax');
  for (const permission of manifest.permissions) if (!registry.permissions.includes(permission)) errors.push('permissions: unregistered '+permission);
  const ids = new Set();
  for (const surface of manifest.surfaces) {
    if (ids.has(surface.id)) errors.push(`surfaces: duplicate ${surface.id}`);
    ids.add(surface.id);
    if (surface.kind === 'fullscreen' && surface.usage !== 'parked') errors.push(`${surface.id}: fullscreen requires parked usage`);
    if (surface.kind === 'companion' && surface.size && (surface.size.w > 160 || surface.size.h > 160)) errors.push(`${surface.id}: companion exceeds 160x160`);
  }
  const quick = new Set();
  for (const action of manifest.quickActions) {
    if (quick.has(action.id)) errors.push(`quickActions: duplicate ${action.id}`);
    quick.add(action.id);
    if (action.opens && !ids.has(action.opens)) errors.push(`${action.id}: unknown surface`);
  }
  for (const field of ['name', 'description', ...manifest.surfaces.flatMap((s,i)=>s.label ? [`surfaces.${i}.label`] : []), ...(manifest.attributions ?? []).map((_,i)=>`attributions.${i}.text`), ...manifest.quickActions.map((_, i) => `quickActions.${i}.label`)]) {
    const map = field.split('.').reduce((v, k) => v[k], manifest);
    if (Object.keys(map).some(k => !languageTag(k))) errors.push(`${field}: invalid language tag`);
  }
  if (new Set(manifest.permissions).size !== manifest.permissions.length) errors.push('permissions: duplicates');
  // Check SemVer numeric prerelease identifiers without coercing their value.
  const pre = manifest.version.split('+')[0].split('-').slice(1).join('-');
  if (pre.split('.').some(v => /^0[0-9]+$/.test(v))) errors.push('version: leading zero in prerelease');
  return errors;
}
