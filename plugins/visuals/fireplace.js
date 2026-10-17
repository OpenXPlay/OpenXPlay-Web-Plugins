// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import { connect } from './oxp-plugin-sdk.js';
import { motionAllowed, visualClock } from './model.js';
import { drawFire } from './render.js';
import { strings } from './i18n.js';
const host=await connect(),canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d');
const sound=document.querySelector('#sound');let audio=null, source=null, stopped=false, dirty=true, last=-Infinity, clock={wall:performance.now(),time:0};
function silence(){if(audio){void audio.close();audio=null;source=null;}sound.setAttribute('aria-pressed','false');}
function renderText(){
  const text=strings(host.locale),track=host.state.nowPlaying;document.documentElement.lang=host.locale;
  document.querySelector('h1').textContent=track?.title||text.idle;
  document.querySelector('#song p').textContent=track?.artist||text.noArtist;
  sound.textContent=audio?text.soundOn:text.soundOff;document.querySelector('#close').textContent=text.close;
}
function allowed(){return host.parked==='confirmed'&&host.surface.visible&&!host.surface.calm&&!host.reducedMotion&&!document.hidden;}
sound.onclick=async()=>{
  if(audio){silence();renderText();return;}if(!allowed())return;
  try{
    audio=new AudioContext();const current=audio;await current.resume();if(audio!==current||!allowed()){silence();return;}
    const buffer=current.createBuffer(1,current.sampleRate*4,current.sampleRate), data=buffer.getChannelData(0);
    // Quiet filtered noise with sparse, softened embers, generated locally.
    let smooth=0;for(let i=0;i<data.length;i++){smooth=smooth*.96+(Math.random()*2-1)*.04;const phase=i/current.sampleRate;data[i]=smooth*(.12+.08*Math.pow(Math.max(0,Math.sin(phase*3.1)),12));}
    source=current.createBufferSource();source.buffer=buffer;source.loop=true;
    const filter=current.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1200;
    const gain=current.createGain();gain.gain.setValueAtTime(0,current.currentTime);gain.gain.linearRampToValueAtTime(.22,current.currentTime+.4);
    source.connect(filter).connect(gain).connect(current.destination);source.start();sound.setAttribute('aria-pressed','true');renderText();
  }catch{silence();sound.textContent=strings(host.locale).audioFailed;}
};
document.querySelector('#close').onclick=()=>{silence();host.surface.close();};
host.on('nowPlaying',renderText);
host.surface.onChange(()=>{if(!allowed())silence();if(host.parked!=='confirmed')host.surface.close();dirty=true;renderText();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)silence();dirty=true;renderText();});
renderText();if(host.parked!=='confirmed')host.surface.close();
function frame(wall){
  if(stopped)return;const moving=allowed()&&motionAllowed(host.surface,host.reducedMotion);clock=visualClock(clock,wall,moving);
  if((moving||dirty)&&wall-last>=1000/24){last=wall;dirty=false;
    const w=Math.max(1,Math.round(host.surface.w/2)),h=Math.max(1,Math.round(host.surface.h/2));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    drawFire(ctx,w,h,clock.time/1000);
  }
  setTimeout(()=>requestAnimationFrame(frame),moving?42:250);
}
requestAnimationFrame(frame);
window.addEventListener('pagehide',()=>{stopped=true;silence();host.disconnect();},{once:true});
