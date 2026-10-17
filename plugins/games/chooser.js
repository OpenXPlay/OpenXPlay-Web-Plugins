// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

export function newChooser(mode='one') { return {mode, fingers:[], changedAt:0, result:null}; }
export function fingerChange(state, id, down, now) {
  if (state.result) return state;
  const fingers=down ? (state.fingers.includes(id) || state.fingers.length>=5 ? state.fingers : [...state.fingers,id]) : state.fingers.filter(x=>x!==id);
  if (fingers===state.fingers || fingers.length===state.fingers.length) return state;
  return {...state,fingers,changedAt:now};
}
export function choose(state, now, random=Math.random) {
  if (state.result || state.fingers.length<2 || now-state.changedAt<3000) return state;
  const ordered=[...state.fingers];
  for (let i=ordered.length-1;i>0;i--) { const j=Math.min(i,Math.floor(Math.max(0,random())*(i+1))); [ordered[i],ordered[j]]=[ordered[j],ordered[i]]; }
  const result=state.mode==='one' ? [{id:ordered[0],label:1}] : ordered.map((id,i)=>({id,label:state.mode==='teams' ? i%2+1 : i+1}));
  return {...state,result};
}
export function remaining(state, now) { return state.fingers.length<2 ? 3 : Math.max(0,Math.ceil((3000-now+state.changedAt)/1000)); }
