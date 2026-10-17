// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

const send=(type,data={})=>parent.postMessage({oxp:'plugin/0',type,...data},'*');
const button=document.querySelector('button'); let taps=0;
button.onclick=()=>{ button.textContent=String(++taps); send('quick-action-state',{id:'tap',badge:String(taps).slice(-3),active:true}); };
window.addEventListener('message',event=>{
  if (event.source!==parent || event.data?.oxp!=='plugin/0') return;
  const m=event.data;
  if (m.type==='ping') send('pong',{seq:m.seq});
  if (m.type==='welcome') button.title=m.pluginId;
  if (m.type==='quick-action') button.click();
  if (m.type==='artwork') { document.querySelector('canvas').getContext('2d').drawImage(m.bitmap,0,0,64,64); m.bitmap.close(); }
});
send('hello',{spec:'oxp-web-plugin/0',sdk:'fixture/0'});
