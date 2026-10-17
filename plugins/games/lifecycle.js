// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

export function blocked({calm=false,visible=true,parked='unknown',activity=null,call=null,documentHidden=false}) {
  return calm || !visible || documentHidden || parked!=='confirmed' || !!(activity?.siri || activity?.phoneCall || activity?.navigation) || !!(call && call.state!=='idle');
}
export function cleanScores(value) {
  const scores={};
  for (const key of ['chooser','duel','gomoku','connect','tic','bingo']) if (Number.isFinite(value?.[key]) && value[key]>=0) scores[key]=Math.round(value[key]);
  return scores;
}
