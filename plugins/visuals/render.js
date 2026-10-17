// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import { flames, skyAt, clamp } from './model.js';
export const rgb = color => `rgb(${color.join(',')})`;
export function drawSky(ctx, w, h, hour) {
  const sky = skyAt(hour), gradient = ctx.createLinearGradient(0,0,0,h);
  gradient.addColorStop(0,rgb(sky.top)); gradient.addColorStop(1,rgb(sky.bottom));
  ctx.fillStyle=gradient; ctx.fillRect(0,0,w,h);
  ctx.fillStyle=`rgba(255,242,210,${sky.stars*0.65})`;
  for (let i=0;i<40;i++) { const x=((i*137.508)%997)/997*w, y=((i*71.21)%613)/613*h*0.7; ctx.beginPath(); ctx.arc(x,y,i%3 ? 0.7 : 1.2,0,Math.PI*2); ctx.fill(); }
  const x=sky.x*w, y=sky.y*h, radius=Math.max(6,Math.min(w,h)*0.045);
  ctx.fillStyle=sky.daylight ? '#ffe3a2' : '#ece6ca'; ctx.beginPath(); ctx.arc(x,y,radius,0,Math.PI*2); ctx.fill();
  if (!sky.daylight) { ctx.fillStyle=rgb(sky.top); ctx.beginPath(); ctx.arc(x+radius*0.48,y-radius*0.3,radius*0.86,0,Math.PI*2); ctx.fill(); }
}
export function drawGlow(ctx,w,h,color) {
  const gradient=ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,Math.hypot(w,h)/2);
  gradient.addColorStop(0,`rgba(${color.join(',')},0.04)`);
  gradient.addColorStop(0.65,`rgba(${color.join(',')},0.22)`);
  gradient.addColorStop(1,`rgba(${color.join(',')},0.8)`);
  ctx.fillStyle=gradient; ctx.fillRect(0,0,w,h);
}
// Host v0 supplies no video rectangle. A perimeter sweep fills the clipped margins;
// the outer hairline is a fallback until picture geometry is exposed to plugins.
export function drawProgress(ctx,w,h,amount,color) {
  if (amount === null || amount <= 0) return;
  const points=[[w/2,0],[w,0],[w,h],[0,h],[0,0],[w/2,0]];
  let left=clamp(amount)*2*(w+h), x=w/2, y=0;
  ctx.beginPath(); ctx.moveTo(w/2,h/2); ctx.lineTo(x,y);
  for (let i=1;i<points.length;i++) {
    const [nx,ny]=points[i], length=Math.hypot(nx-x,ny-y), fraction=Math.min(1,left/length);
    ctx.lineTo(x+(nx-x)*fraction,y+(ny-y)*fraction); left-=length; x=nx; y=ny;
    if (left<=0) break;
  }
  ctx.closePath(); ctx.save(); ctx.clip();
  drawGlow(ctx,w,h,color);
  ctx.strokeStyle=rgb(color); ctx.lineWidth=2; ctx.strokeRect(2,2,w-4,h-4); ctx.restore();
}
export function drawFire(ctx,w,h,time) {
  ctx.fillStyle='#140e13';ctx.fillRect(0,0,w,h);
  const halo=ctx.createRadialGradient(w*.5,h*.8,0,w*.5,h*.8,w*.55);
  halo.addColorStop(0,'#613226');halo.addColorStop(1,'#140e13');ctx.fillStyle=halo;ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='#543931'; ctx.lineWidth=5; ctx.beginPath();ctx.roundRect(w*.16,h*.22,w*.68,h*.63,[w*.12,w*.12,8,8]);ctx.stroke();
  ctx.fillStyle='#2b1c1d';ctx.beginPath();ctx.roundRect(w*.19,h*.25,w*.62,h*.57,[w*.1,w*.1,4,4]);ctx.fill();
  for(const f of flames(time)) {
    const x=w*(0.24+f.x*.52), base=h*.78, height=h*f.height, width=w*f.width;
    const gradient=ctx.createLinearGradient(x,base,x,base-height);
    gradient.addColorStop(0,'#e89648');gradient.addColorStop(.4,'#e87534');gradient.addColorStop(1,'#c84e2d');
    ctx.fillStyle=gradient;ctx.beginPath();ctx.moveTo(x-width,base);
    ctx.bezierCurveTo(x-width*1.2,base-height*.4,x+f.lean*w,base-height*.55,x+f.lean*w,base-height);
    ctx.bezierCurveTo(x+width*.25,base-height*.4,x+width*1.2,base-height*.3,x+width,base);ctx.fill();
    ctx.fillStyle='#ffd48a';ctx.beginPath();ctx.ellipse(x,base-height*.17,width*.4,height*.27,-.1,0,Math.PI*2);ctx.fill();
  }
  ctx.lineCap='round';ctx.lineWidth=h*.045;ctx.strokeStyle='#6c4031';ctx.beginPath();ctx.moveTo(w*.3,h*.78);ctx.lineTo(w*.7,h*.82);ctx.moveTo(w*.3,h*.82);ctx.lineTo(w*.7,h*.78);ctx.stroke();
  ctx.lineWidth=2;ctx.strokeStyle='#aa7350';ctx.beginPath();ctx.moveTo(w*.32,h*.785);ctx.lineTo(w*.66,h*.817);ctx.stroke();
}
