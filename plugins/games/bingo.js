// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

export const CONDITIONS = [
  ['love','Title contains “love”','歌名含“love”'], ['long','Song over 5 minutes','歌曲超过5分钟'], ['repeat','Same artist, two songs','同歌手的两首歌'],
  ['t','Artist starts with T','歌手以T开头'], ['night','Title contains “night”','歌名含“night”'], ['short','Song under 3 minutes','歌曲少于3分钟'],
  ['you','Title contains “you”','歌名含“you”'], ['album','Album name available','有专辑名称'], ['zh','Chinese title','中文歌名'],
  ['sun','Title contains “sun”','歌名含“sun”'], ['a','Artist starts with A','歌手以A开头'], ['live','Title contains “live”','歌名含“live”'],
  ['digit','Title has a number','歌名含数字'], ['four','Song 3–4 minutes','歌曲3到4分钟'], ['longtitle','Title over 20 characters','歌名超过20个字'], ['home','Title contains “home”','歌名含“home”']
];
export function newBingo(size=3) { return {size,marks:Array(size*size).fill(false),artists:[],lastTrack:'',tracks:0}; }
export function bingoLines(state) {
  const n=state.size, lines=[];
  for (let i=0;i<n;i++) { lines.push(Array.from({length:n},(_,j)=>i*n+j)); lines.push(Array.from({length:n},(_,j)=>j*n+i)); }
  lines.push(Array.from({length:n},(_,i)=>i*n+i),Array.from({length:n},(_,i)=>i*n+n-1-i));
  return lines.filter(line=>line.every(i=>state.marks[i])).length;
}
export function markSong(state, song) {
  if (!song || !song.playing || !song.title?.trim() || !song.artist?.trim()) return state;
  const title=song.title.trim().toLowerCase(), artist=song.artist.trim().toLowerCase();
  const key=JSON.stringify([title,artist,song.album]);
  const changed=key!==state.lastTrack;
  const repeat=changed && state.artists.includes(artist);
  const duration=song.durationMs;
  const matches={love:title.includes('love'),long:duration>300000,repeat,t:artist.startsWith('t'),night:title.includes('night'),short:duration>0&&duration<180000,you:title.includes('you'),album:!!song.album?.trim(),zh:/[\u3400-\u9fff]/.test(title),sun:title.includes('sun'),a:artist.startsWith('a'),live:title.includes('live'),digit:/[0-9]/.test(title),four:duration>=180000&&duration<=240000,longtitle:[...title].length>20,home:title.includes('home')};
  return {...state,marks:state.marks.map((marked,i)=>marked||!!matches[CONDITIONS[i][0]]),artists:changed ? [...new Set([...state.artists,artist])].slice(-128) : state.artists,lastTrack:key,tracks:state.tracks+(changed?1:0)};
}
export function restoreBingo(value) {
  if (!value || ![3,4].includes(value.size) || !Array.isArray(value.marks) || value.marks.length!==value.size**2 || !value.marks.every(v=>typeof v==='boolean') || !Array.isArray(value.artists) || !value.artists.every(v=>typeof v==='string') || typeof value.lastTrack!=='string' || !Number.isSafeInteger(value.tracks) || value.tracks<0) return newBingo();
  return {...value,artists:value.artists.slice(-128)};
}
