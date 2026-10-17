// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

const controls=document.querySelector('#controls'), head=document.querySelector('#head'), status=document.querySelector('#status');
const state={route:{active:false,destination:'Home',etaMs:600000,distanceRemainingM:5000,maneuver:{type:2,road:'Main Street',distanceM:200},appName:'Maps'},audioSource:{appName:'Music'},session:{carplay:'connected'},nowPlaying:{title:'Evening drive',artist:'OpenXPlay fixture',album:'Offline samples',durationMs:180000,elapsedMs:0,playing:true,rate:1},call:{state:'idle'},activity:{siri:false,phoneCall:false,navigation:false}};
const send=(type,value)=>head.contentWindow.postMessage({simulator:true,type,value},location.origin);
async function update(topic) { const response=await fetch('/simulator/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({topic,value:state[topic]})}); if (!response.ok) status.textContent=await response.text(); }
function button(label,fn) { const b=document.createElement('button'); b.textContent=label; b.onclick=fn; controls.append(b); }
function select(label,values,fn) { const l=document.createElement('label'); l.append(`${label} `); const s=document.createElement('select'); for (const value of values) { const o=document.createElement('option'); o.textContent=value; s.append(o); } s.onchange=()=>fn(s.value); l.append(s); controls.append(l); }
button('Enable / disable plugins',async()=>{ const current=await (await fetch('/simulator/config')).json(); const next=await (await fetch('/simulator/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:!current.plugins})})).json(); send('config',next); });
button('Connect / disconnect',()=>{ state.session.carplay=state.session.carplay==='connected'?'disconnected':'connected'; void update('session'); });
button('Play / pause',()=>{ state.nowPlaying.playing=!state.nowPlaying.playing; void update('nowPlaying'); });
let track=0;
button('Next track',()=>{ track++; state.nowPlaying={...state.nowPlaying,title:`Sample track ${track}`,artist:`Artist ${track%3+1}`,album:`Collection ${track%2+1}`,elapsedMs:0}; void update('nowPlaying'); });
select('Call',['idle','ringing','dialing','active','held','ending'],value=>{state.call.state=value; void update('call');});
for (const field of ['siri','phoneCall','navigation']) button(field,()=>{state.activity[field]=!state.activity[field]; void update('activity');});
const seek=document.createElement('input'); seek.type='range'; seek.min='0'; seek.max='180000'; seek.setAttribute('aria-label','Seek'); seek.oninput=()=>{state.nowPlaying.elapsedMs=Number(seek.value); void update('nowPlaying');}; controls.append(seek);
select('Developer mode',['false','true'],value=>send('settings',{developer:value==='true'}));
select('Theme',['dark','light'],theme=>send('settings',{theme}));
select('Language',['en','zh-CN'],locale=>send('settings',{locale}));
select('Reduced motion',['false','true'],value=>send('settings',{reducedMotion:value==='true'}));
select('Screen',['876x518','1372x686','1280x720'],value=>{ const [w,h]=value.split('x'); head.width=w; head.height=h; });
button('Stall host',()=>send('stall'));
window.addEventListener('message',event=>{ if (event.source===head.contentWindow && event.origin===location.origin && event.data.diagnostic) status.textContent=JSON.stringify(event.data.diagnostic); });
// The existing simulator capabilities route is independent of plugin discovery.
const config=await (await fetch('/simulator/config')).json();
state.nowPlaying.artwork={url:config.artwork,type:'image/png'};
for (const topic of Object.keys(state)) await update(topic);

// Refresh receiver geometry when the containing page changes its frame scale.
window.addEventListener('resize',()=>send('settings',{}));

function input(label, value, change, type='text') {
  const l=document.createElement('label'), i=document.createElement('input');i.type=type;i.value=String(value);i.setAttribute('aria-label',label);l.append(label,i);controls.append(l);i.oninput=()=>change(i.value===''?null:type==='number'?Number(i.value):i.value);return i;
}
button('Route active',()=>{state.route.active=!state.route.active;void update('route');});
for(const key of ['destination','appName','etaMs','distanceRemainingM'])input(`Route ${key}`,state.route[key],value=>{state.route[key]=value;void update('route');},typeof state.route[key]==='number'?'number':'text');
for(const key of ['type','road','distanceM'])input(`Maneuver ${key}`,state.route.maneuver[key],value=>{state.route.maneuver[key]=value;void update('route');},key==='road'?'text':'number');
input('Audio source',state.audioSource.appName,value=>{state.audioSource.appName=value||null;void update('audioSource');});
let motionMode='off', simulatedSpeed=0;
select('Receiver motion',['off','geolocation','simulated'],mode=>{motionMode=mode;send('motion',{mode,speedMps:simulatedSpeed});});
const speed=input('Simulated speed (m/s)',0,value=>{simulatedSpeed=Number(value);if(motionMode==='simulated')send('motion',{mode:motionMode,speedMps:simulatedSpeed});},'range');speed.min='0';speed.max='40';speed.step='0.1';speed.value='0';
