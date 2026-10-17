// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import {connect} from './oxp-plugin-sdk.js';
import {settings, language, SIZES, CORNERS} from './behaviour.js';
import {strings, credits, creditPage} from './credits.js';
const sdk = await connect();
const content = document.querySelector('#content'), status = document.querySelector('#status');
let preference = settings(), section = 'settings', page = 0, saving = false, dirty = false, disposed = false;
function button(text, action, selected) {
  const node = document.createElement('button'); node.textContent = text;
  if (selected !== undefined) node.setAttribute('aria-pressed', String(selected));
  node.addEventListener('click', action); return node;
}
async function save(show = false) {
  if (saving || disposed) return;
  saving = true; status.textContent = strings[language(sdk.locale)].saving;
  try {
    await sdk.storage.set(preference); dirty = false;
    status.textContent = '';
    if (show && !disposed) { sdk.surface.open('companion'); sdk.surface.close(); }
  } catch { if (!disposed) status.textContent = strings[language(sdk.locale)].error; }
  finally { saving = false; }
}
function draw() {
  const lang = language(sdk.locale), t = strings[lang];
  document.documentElement.lang = lang;
  document.querySelector('#title').textContent = t.title;
  document.querySelector('#close').setAttribute('aria-label', t.close);
  for (const name of ['settings','credits']) {
    const tab = document.querySelector(`#${name}-tab`); tab.textContent = t[name];
    tab.setAttribute('aria-pressed', String(section === name));
  }
  content.replaceChildren();
  if (section === 'settings') {
    const size = button(`${t.size}: ${t.sizes[SIZES.indexOf(preference.size)]}`, () => {
      if (saving) return;
      preference = {...preference, size:SIZES[(SIZES.indexOf(preference.size)+1)%SIZES.length]}; dirty = true; draw();
    });
    content.append(size);
    const label = document.createElement('h2'); label.textContent = t.corner; content.append(label);
    const group = document.createElement('div'); group.className = 'grid';
    CORNERS.forEach((value, i) => group.append(button(t.corners[i], () => {
      if (saving) return;
      preference = {...preference,corner:value}; dirty = true; draw();
    }, preference.corner === value)));
    content.append(group);
    const apply = button(t.apply, () => void save(true)); apply.className = 'apply'; content.append(apply);

  } else {
    const text = document.createElement('p'); text.className = 'credit'; text.textContent = creditPage(page, lang); content.append(text);
    const pager = document.createElement('div'); pager.className = 'row pager';
    const previous = button(t.back, () => { page--; draw(); }); previous.disabled = page === 0;
    const next = button(t.next, () => { page++; draw(); }); next.disabled = page === credits.length - 1;
    pager.append(previous, next); content.append(pager);
    const number = document.createElement('p'); number.textContent = `${page + 1} / ${credits.length}`; content.append(number);
  }
}
for (const name of ['settings','credits']) document.querySelector(`#${name}-tab`).onclick = () => { section = name; draw(); };
document.querySelector('#close').onclick = () => sdk.surface.close();
const off = sdk.surface.onChange(() => { if (sdk.surface.closing && dirty) void save(); draw(); });
window.addEventListener('pagehide', () => { disposed = true; off(); sdk.disconnect(); }, {once:true});
draw();
try { const stored = await sdk.storage.get(); if (!dirty && !disposed) { preference = settings(stored); draw(); } }
catch { /* Settings remain usable with defaults. */ }
