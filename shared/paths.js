// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

export const EXTENSIONS = new Set('html js mjs css json svg png webp jpg woff2 wasm mp3 ogg wav txt'.split(' '));
export function safePath(path) {
  return typeof path === 'string' && /^[a-z0-9._/-]+$/.test(path) && path.split('/').every(p => p && !p.startsWith('.')) && EXTENSIONS.has(path.split('.').at(-1));
}
export function headers(origin, plugin) {
  origin = new URL(origin).origin;
  const base = `${origin}/plugins/${plugin ? `p/${plugin}` : 'host'}/`;
  const guard = `${origin}/plugins/host/guard.js`;
  const artwork = `${origin}/plugins/artwork/`;
  const channel = `${origin.replace(/^http/, 'ws')}/plugins/channel`;
  const csp = `default-src 'none'; script-src ${base} ${guard} 'wasm-unsafe-eval'; style-src ${base} 'unsafe-inline'; img-src ${base} data: blob:${plugin ? '' : ` ${artwork} ${origin}/plugins/p/`}; media-src ${base} data: blob:; font-src ${base} data:; worker-src ${base} blob:; connect-src ${plugin ? "'none'" : `${channel} ${artwork}`}; frame-src ${plugin ? "'none'" : `${origin}/plugins/p/`}; form-action 'none'; base-uri 'none'`;
  return { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'same-origin', 'Cache-Control': 'no-cache', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), usb=(), bluetooth=(), serial=(), hid=(), payment=()', 'Content-Security-Policy': csp };
}
export const MIME = { html:'text/html; charset=utf-8', js:'text/javascript', mjs:'text/javascript', css:'text/css', json:'application/json', svg:'image/svg+xml', png:'image/png', webp:'image/webp', jpg:'image/jpeg', woff2:'font/woff2', wasm:'application/wasm', mp3:'audio/mpeg', ogg:'audio/ogg', wav:'audio/wav', txt:'text/plain' };
