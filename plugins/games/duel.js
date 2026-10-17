// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

export function newDuel() { return {scores:[0,0],phase:'ready',greenAt:0,bestMs:null,winner:null,lastMs:null,falseStart:false}; }
export function startRound(state, now, random=Math.random) {
  if (state.winner!==null) return state;
  return {...state,phase:'waiting',greenAt:now+1500+Math.floor(random()*2500),lastMs:null,falseStart:false};
}
export function duelPhase(state, now) { return state.phase==='waiting' && now>=state.greenAt ? 'green' : state.phase; }
export function tapDuel(state, side, now) {
  if (![0,1].includes(side) || state.phase!=='waiting') return state;
  const falseStart=now<state.greenAt, point=falseStart ? 1-side : side;
  const scores=[...state.scores]; scores[point]++;
  const lastMs=falseStart ? null : Math.max(0,Math.round(now-state.greenAt));
  return {...state,scores,phase:'result',lastMs,falseStart,bestMs:lastMs===null ? state.bestMs : Math.min(state.bestMs??Infinity,lastMs),winner:scores[point]>=3 ? point : null};
}
// A resumed waiting round always gets a fresh unpredictable delay.
export function resumeDuel(state) { return state.phase==='waiting' ? {...state,phase:'ready',greenAt:0} : state; }
