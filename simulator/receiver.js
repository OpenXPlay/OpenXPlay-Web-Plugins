// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import { ReceiverSlot, discover, hostPrefs, acceptHostPrefs } from './receiver-policy.js';
import { enableDragGesture } from '../shared/drag.js';
import { readPrefs, savePrefs, validPosition } from '../shared/positions.js';
import { frameScale, layoutDelta } from '../shared/coordinates.js';
import { resetPositions } from '../host/preferences.js';
import { clipPath } from '../host/layout.js';
import { validMessage } from '../shared/protocol.js';
const canvas=document.querySelector('canvas'), context=canvas.getContext('2d'), gear=document.querySelector('#gear'), dialog=document.querySelector('dialog');
let gearPosition=readPrefs(localStorage,'oxp.sim.gear'), gearStart;
let frame, side='right', settings={developer:false,locale:'en',theme:'dark',reducedMotion:false}, capabilities={};
let diagnosticsAt=-Infinity, fadeTimer;
function wakeGear() {
  gear.classList.remove('faded'); send('geometry',geometry()); clearTimeout(fadeTimer);
  fadeTimer=setTimeout(()=>{if(!dialog.open){gear.classList.add('faded');send('geometry',geometry());}},3000);
}
let motionMode='off', motion=null, geoWatch;
function publishMotion() { send('geometry',geometry()); if(motionMode!=='off')send('state',{topic:'motion',value:motion}); }
function configureMotion(value) {
  if(geoWatch!==undefined)navigator.geolocation?.clearWatch(geoWatch);
  geoWatch=undefined; motionMode=value.mode; motion=null;
  if(motionMode==='simulated')motion={speedMps:value.speedMps,accuracyM:0,source:'vehicle'};
  if(motionMode==='geolocation' && frame && navigator.geolocation)geoWatch=navigator.geolocation.watchPosition(position=>{
    motion={speedMps:position.coords.speed,accuracyM:position.coords.accuracy,source:'geolocation'};publishMotion();
  },()=>{motion=null;publishMotion();},{enableHighAccuracy:true});
  publishMotion();
}
function geometry() {
  const w=innerWidth,h=innerHeight, box=gear.getBoundingClientRect();
  const outer=window.frameElement;
  const screenScale=outer ? frameScale(outer.getBoundingClientRect(),outer.offsetWidth,outer.offsetHeight) : {x:1,y:1};
  return {...settings,topics:motionMode==='off'?[]:['motion'],screenScale,hostPrefs:hostPrefs(localStorage),viewport:{w,h},video:{x:18,y:12,w:w-36,h:h-24},gear:{gap:parseFloat(getComputedStyle(document.documentElement).fontSize)*.5,x:box.x,y:box.y,w:box.width,h:box.height,side,faded:gear.classList.contains('faded')},channel:'/plugins/channel'};
}
const slot=new ReceiverSlot(geometry());
function send(type,data={}) { frame?.contentWindow.postMessage({oxp:'host/0',type,...data},'*'); }
function clip() { if (frame) frame.style.clipPath=clipPath(slot.regions); }
function draw() {
  canvas.width=innerWidth; canvas.height=innerHeight;
  context.fillStyle='#080d14'; context.fillRect(0,0,canvas.width,canvas.height);
  context.fillStyle=settings.theme==='dark' ? '#15273c' : '#d2e0ea'; context.fillRect(18,12,innerWidth-36,innerHeight-24);
  const labels=['Maps','Music','Phone','Messages','Library','Settings'];
  labels.forEach((label,i)=>{ const x=52+i%3*(innerWidth-104)/3, y=80+Math.floor(i/3)*170; context.fillStyle=['#427b72','#a2546b','#4779a6'][i%3]; context.fillRect(x,y,Math.min(180,(innerWidth-140)/3),110); context.fillStyle='white'; context.font='22px system-ui'; context.fillText(label,x+16,y+62); });
  context.fillStyle='#93a9bc'; context.font='18px system-ui'; context.fillText('Phone projection · simulator',48,44);
}
function place() {
  document.documentElement.style.colorScheme=settings.theme;
  document.querySelector('#reset-positions').textContent=settings.locale==='zh-CN'?'重置按钮位置':'Reset button positions';
  const box=gear.getBoundingClientRect(),style=getComputedStyle(gear);
  const top=parseFloat(style.marginTop),right=parseFloat(style.marginRight),bottom=parseFloat(style.marginBottom),left=parseFloat(style.marginLeft);
  const clamp=(value,length,size,low,high)=>{
    const space=Math.max(0,length-size),min=Math.min(Math.max(24,low),space/2),max=Math.max(min,space-Math.max(24,high));
    return Math.max(min,Math.min(max,value));
  };
  const position=validPosition(gearPosition)?gearPosition:{x:innerWidth-box.width-right,y:top};
  const r={x:clamp(position.x,innerWidth,box.width,left,right),y:clamp(position.y,innerHeight,box.height,top,bottom),w:box.width,h:box.height};
  if (validPosition(gearPosition)) gearPosition={x:r.x,y:r.y}; side=r.x+r.w/2<innerWidth/2?'left':'right';
  gear.style.left=`${r.x-left}px`; gear.style.top=`${r.y-top}px`;
  slot.geometry=geometry(); draw(); send('geometry',slot.geometry);
}
function mount() {
  if(geoWatch!==undefined)navigator.geolocation?.clearWatch(geoWatch);geoWatch=undefined;motionMode='off';motion=null;
  frame?.remove(); frame=undefined;
  const preference=localStorage.getItem('oxp.sim.plugins')!=='false';
  document.querySelector('#enabled').checked=preference;
  const host=discover(capabilities,location.href,preference); if (!host) return;
  frame=document.createElement('iframe'); frame.title='Plugin host'; frame.setAttribute('sandbox','allow-scripts'); frame.setAttribute('allow',''); frame.referrerPolicy='no-referrer'; frame.src=host;
  slot.mount(performance.now()); document.body.insertBefore(frame,gear);
}
window.addEventListener('message',event=>{
  const m=event.data;
  if (event.source===frame?.contentWindow && validMessage('host',m)) {
    if (m.type==='ready') { send('init',geometry()); if(motionMode!=='off')send('state',{topic:'motion',value:motion}); send('receiver-state',{state:'playing'}); send('visibility',{visible:!document.hidden}); }
    if (m.type==='wake') wakeGear();
    if (m.type==='host-prefs') acceptHostPrefs(localStorage,m);
    if (m.type==='pong') slot.pong(m.seq,performance.now());
    if (m.type==='layout') { slot.layout(m); clip(); }
    if (m.type==='diagnostic' && performance.now()-diagnosticsAt>=1000) { diagnosticsAt=performance.now(); parent.postMessage({diagnostic:m},location.origin); }
    return;
  }
  if (event.source!==parent || event.origin!==location.origin || !m?.simulator) return;
  if (m.type==='motion') configureMotion(m.value);
  if (m.type==='settings') { settings={...settings,...m.value}; place(); }
  if (m.type==='stall') send('simulate-stall');
  if (m.type==='config') { capabilities=m.value; mount(); }
});
enableDragGesture(gear,move=>{
  if(move.phase==='start') { const box=gear.getBoundingClientRect(); gearStart={x:box.x,y:box.y}; }
  if(!gearStart)return;
  const delta=layoutDelta(move,geometry().screenScale);
  gearPosition={x:gearStart.x+delta.dx,y:gearStart.y+delta.dy}; place();
  if(move.phase==='end') { savePrefs(localStorage,'oxp.sim.gear',gearPosition);gearStart=undefined; }
});
gear.onclick=()=>{
  if (slot.cover!=='none' && frame) { slot.collapse(); clip(); send('collapse'); return; }
  dialog.showModal();
};
document.addEventListener('pointerdown',wakeGear,{passive:true});
dialog.addEventListener('close',wakeGear);
document.querySelector('#reset-positions').onclick=()=>{
  gearPosition={}; gearStart=undefined; localStorage.removeItem('oxp.sim.gear');
  savePrefs(localStorage,'oxp.sim.hostPrefs',resetPositions(hostPrefs(localStorage)));
  send('reset-positions'); place(); wakeGear();
};
document.querySelector('#close').onclick=()=>dialog.close();
document.querySelector('#enabled').onchange=event=>{ localStorage.setItem('oxp.sim.plugins',String(event.target.checked)); mount(); };
document.addEventListener('visibilitychange',()=>send('visibility',{visible:!document.hidden}));
new ResizeObserver(place).observe(document.body);
setInterval(()=>{ if (frame) send('ping',{seq:slot.ping()}); },2000);
setInterval(()=>{
  if (!frame) return; const result=slot.tick(performance.now()); if (result==='ok') return;
  frame.remove(); frame=undefined; parent.postMessage({diagnostic:{code:'plugins-host-stalled'}},location.origin);
  if (result==='reload') mount();
},250);
place(); wakeGear(); capabilities=await (await fetch('/simulator/config')).json(); mount();
