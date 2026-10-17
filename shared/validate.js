// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

export function validate(schema, value, path = '$') {
  const errors = [];
  const fail = detail => errors.push(`${path}: ${detail}`);
  if (schema.const !== undefined && JSON.stringify(value) !== JSON.stringify(schema.const)) fail('unexpected constant');
  if (schema.enum && !schema.enum.some(v => JSON.stringify(v) === JSON.stringify(value))) fail('not in enum');
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (schema.type && !types.some(t => t === type || t === 'integer' && Number.isInteger(value))) { fail(`expected ${schema.type}`); return errors; }
  if (type === 'number') {
    if (!Number.isFinite(value)) fail('not finite');
    if (schema.minimum !== undefined && value < schema.minimum) fail('below minimum');
    if (schema.maximum !== undefined && value > schema.maximum) fail('above maximum');
  }
  if (type === 'string') {
    const length = [...value].length;
    if (schema.minLength !== undefined && length < schema.minLength) fail('too short');
    if (schema.maxLength !== undefined && length > schema.maxLength) fail('too long');
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) fail('pattern mismatch');
  }
  if (schema['x-maxJsonBytes'] !== undefined) {
    try { if (new TextEncoder().encode(JSON.stringify(value)).length > schema['x-maxJsonBytes']) fail('JSON byte limit exceeded'); } catch { fail('invalid JSON'); }
  }
  if (type === 'object') {
    for (const key of schema.required ?? []) if (!Object.hasOwn(value, key)) fail(`missing ${key}`);
    for (const [key, item] of Object.entries(value)) {
      const child = schema.properties?.[key];
      if (child) errors.push(...validate(child, item, `${path}.${key}`));
      else if (schema.additionalProperties === false) fail(`unknown ${key}`);
      else if (typeof schema.additionalProperties === 'object') errors.push(...validate(schema.additionalProperties, item, `${path}.${key}`));
    }
  }
  if (type === 'array') {
    if (schema.maxItems !== undefined && value.length > schema.maxItems) fail('too many items');
    if (schema.items) value.forEach((v, i) => errors.push(...validate(schema.items, v, `${path}[${i}]`)));
  }
  for (const keyword of ['oneOf', 'anyOf']) if (schema[keyword]) {
    const matches = schema[keyword].filter(s => !validate(s, value, path).length).length;
    if (keyword === 'oneOf' ? matches !== 1 : matches < 1) fail(`no unambiguous ${keyword} variant`);
  }
  return errors;
}
