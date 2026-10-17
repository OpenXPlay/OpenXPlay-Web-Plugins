// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import { it,expect } from 'vitest';
import { runInNewContext } from 'node:vm';
import { readFileSync } from 'node:fs';
it('removes RTC constructors before plugin code and prevents reassignment',()=>{
  const window={RTCPeerConnection:()=>{},webkitRTCPeerConnection:()=>{},RTCDataChannel:()=>{},RTCSessionDescription:()=>{},unrelated:1};
  runInNewContext(readFileSync('host/guard.js','utf8'),{window});
  for(const name of ['RTCPeerConnection','webkitRTCPeerConnection','RTCDataChannel','RTCSessionDescription']){expect(window[name]).toBeUndefined();expect(Object.getOwnPropertyDescriptor(window,name).writable).toBe(false);}
  expect(window.unrelated).toBe(1);
});
it('makes only companion documents transparent and overrides dark color schemes',()=>{
  const listeners=[],styles=[],parent={};
  const window={parent,addEventListener:(_,fn)=>listeners.push(fn)},document={createElement:()=>({}),documentElement:{append:s=>styles.push(s)}};
  runInNewContext(readFileSync('host/guard.js','utf8'),{window,document});
  const welcome={oxp:'plugin/0',type:'welcome',surface:{kind:'companion'}};
  listeners[0]({source:{},data:welcome});listeners[0]({source:parent,data:{...welcome,surface:{kind:'panel'}}});expect(styles).toEqual([]);
  listeners[0]({source:parent,data:welcome});expect(styles[0].textContent).toContain('background:transparent!important');expect(styles[0].textContent).toContain('color-scheme:light!important');
});
