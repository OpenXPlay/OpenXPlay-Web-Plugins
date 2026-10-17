// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

// Keep stored moods and engine states independent of the artwork's row names.
export const STATES = ['idle','running-right','running-left','waving','jumping','failed','waiting','running','review','sleeping','yawning','sunbathing','hungry','happy'];
export function spriteState(state) {
  return ({running:'walking','running-right':'walking','running-left':'walking',
    waving:'greeting',jumping:'run',failed:'laying',waiting:'sitting',review:'sitting',
    yawning:'sitting',sunbathing:'sitting',hungry:'purr'})[state] || state;
}

// Triangle path starts at the centre, reflects at both walls and never clips.
// Integer coordinates preserve the source pixel grid. Speed is CSS pixels/second.
export function walkPosition(elapsedMs, width, spriteWidth, speed = 8) {
  const span=Math.max(0,Math.floor(width-spriteWidth));
  if(!span)return {x:0,left:false};
  const phase=((Math.max(0,elapsedMs)*speed/1000+span/2)%(2*span));
  return {x:Math.round(phase<=span?phase:2*span-phase),left:phase>span};
}
