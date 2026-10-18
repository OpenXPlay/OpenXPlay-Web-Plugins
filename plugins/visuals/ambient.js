// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import { connect } from './oxp-plugin-sdk.js';
import { settings, trackKey, progress, fallbackColor, palette, blend, motionAllowed, visualClock } from './model.js';
import { drawGlow, drawProgress, drawSky } from './render.js';
const host=await connect(), canvas=document.querySelector('canvas'), ctx=canvas.getContext('2d');
let value=settings(null), track=host.state.nowPlaying, received=performance.now(), key=trackKey(track);
let from=fallbackColor(track), to=from, fadeStart=0, clock={wall:performance.now(),time:0}, lastDraw=-Infinity, dirty=true, stopped=false;
let frozenProgress=progress(track,received,received), frozenHour=hourNow(), wasMoving=false;
function hourNow() {const date=new Date();return date.getHours()+date.getMinutes()/60+date.getSeconds()/3600;}
function color() {return blend(from,to,(clock.time-fadeStart)/4000);}
function target(next) {from=color();to=next;fadeStart=clock.time;dirty=true;}
host.on('nowPlaying',next=>{
  const nextKey=trackKey(next);track=next;received=performance.now();
  if(nextKey!==key){key=nextKey;target(fallbackColor(next));}
  if(!host.surface.calm)frozenProgress=progress(track,received,received);
  dirty=true;
});
host.onArtwork(bitmap=>{
  try {const tiny=document.createElement('canvas');tiny.width=32;tiny.height=32;const c=tiny.getContext('2d',{willReadFrequently:true});c.drawImage(bitmap,0,0,32,32);target(palette(c.getImageData(0,0,32,32).data,fallbackColor(track)));}
  catch {target(fallbackColor(track));} finally {bitmap.close();}
});
host.surface.onChange(()=>{dirty=true;});
let syncing=false, revision=0;
async function refresh() {
  if(syncing||stopped)return;syncing=true;
  try {const atStart=revision, stored=await host.storage.get();if(atStart===revision&&!writing&&!writeTimer){value=settings(stored);dirty=true;host.quickActions.setState('toggle',{active:value.enabled});}}catch{/* Keep the last usable local settings. */}
  finally{syncing=false;}
}
let writing=false, writeTimer=null;
host.quickActions.on('toggle',()=>{
  if(writing)return;
  revision++;value={...value,enabled:!value.enabled};dirty=true;
  host.quickActions.setState('toggle',{active:value.enabled});
  clearTimeout(writeTimer);
  // Coalesce rapid dock taps to respect the host's two-second write limit.
  writeTimer=setTimeout(async()=>{
    writeTimer=null;writing=true;
    try{await host.storage.set(value);}catch{/* The toggle remains usable for this surface session. */}
    finally{writing=false;}
  },2100);
});
await refresh();
const poll=setInterval(()=>{if(!writing&&!writeTimer)void refresh();},2500);
function frame(wall) {
  if(stopped)return;
  const moving=motionAllowed(host.surface,host.reducedMotion)&&!document.hidden;
  clock=visualClock(clock,wall,moving);
  if(moving){frozenProgress=progress(track,received,wall);frozenHour=hourNow();}
  if(moving!==wasMoving){dirty=true;wasMoving=moving;}
  const animating=moving&&value.enabled&&(value.effect==='progress'&&track?.playing || value.effect==='album'&&clock.time-fadeStart<4000);
  const due=value.effect==='sky'&&moving&&wall-lastDraw>30000;
  if(host.surface.visible&&(dirty||animating||due)&&wall-lastDraw>=1000/24){
    lastDraw=wall;dirty=false;
    const w=Math.max(1,Math.round(host.surface.w/2)),h=Math.max(1,Math.round(host.surface.h/2));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    ctx.clearRect(0,0,w,h);
    ctx.globalAlpha=value.brightness;
    if(value.enabled&&w>=4&&h>=4){
      if(value.effect==='progress') {
        const rect=host.surface.video;
        const video=rect?{x:rect.x*w/host.surface.w,y:rect.y*h/host.surface.h,w:rect.w*w/host.surface.w,h:rect.h*h/host.surface.h}:undefined;
        drawProgress(ctx,w,h,frozenProgress,color(),video);
      }
      if(value.effect==='album')drawGlow(ctx,w,h,host.reducedMotion?to:color());
      if(value.effect==='sky')drawSky(ctx,w,h,frozenHour);
    }
  }
  // A timeout avoids a continuous display-refresh callback for static effects.
  setTimeout(()=>requestAnimationFrame(frame),animating?42:250);
}
requestAnimationFrame(frame);
window.addEventListener('pagehide',()=>{stopped=true;clearInterval(poll);clearTimeout(writeTimer);host.disconnect();},{once:true});
