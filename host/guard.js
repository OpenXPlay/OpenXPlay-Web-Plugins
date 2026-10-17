// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

// Mitigation, not a guarantee: reviewed code and network isolation remain necessary.
for (const name of Object.getOwnPropertyNames(window).filter(name => /^(?:webkit|moz)?RTC/.test(name))) {
  try { Object.defineProperty(window, name, { value: undefined, configurable: false, writable: false }); } catch { try { delete window[name]; } catch {} }
}
// The opaque sandbox prevents the host from styling a plugin document directly.
// Apply the companion canvas policy before application welcome listeners run.
if (typeof document !== 'undefined') window.addEventListener('message', event => {
  if (event.source !== window.parent || event.data?.oxp !== 'plugin/0' || event.data.type !== 'welcome' || event.data.surface?.kind !== 'companion') return;
  const style=document.createElement('style');
  style.textContent='html,body{background:transparent!important;color-scheme:light!important}';
  document.documentElement.append(style);
});
