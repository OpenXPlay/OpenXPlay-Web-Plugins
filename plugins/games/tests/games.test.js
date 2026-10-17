// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import { describe, it, expect } from 'vitest';
import { RULES, newBoard, play, aiMove, legalMoves, winningPlayer, restoreBoard } from '../boards.js';
import { newChooser, fingerChange, choose, remaining } from '../chooser.js';
import { newDuel, startRound, tapDuel, duelPhase, resumeDuel } from '../duel.js';
import { newBingo, markSong, bingoLines, restoreBingo } from '../bingo.js';
import { blocked, cleanScores } from '../lifecycle.js';
import { readFile } from 'fs/promises';

describe('board rules and local AI',()=> {
  it('keeps invalid or occupied moves unchanged and never mutates the input',()=> {
    const empty=newBoard('tic'), first=play(empty,0);
    expect(empty.cells[0]).toBe(0); expect(first.cells[0]).toBe(1);
    for(const move of [0,-1,9,1.2,NaN]) expect(play(first,move)).toBe(first);
  });
  it('finds horizontal, vertical and both diagonal wins in every board',()=> {
    for(const [kind,{cols,rows,run}] of Object.entries(RULES)) {
      for(const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]) {
        const cells=Array(rows*cols).fill(0), start=dc<0?run-1:0;
        for(let i=0;i<run;i++) cells[dr*i*cols+start+dc*i]=2;
        expect(winningPlayer(cells,kind)).toBe(2);
      }
    }
  });
  it('does not join rows at their edges',()=> {
    expect(winningPlayer([0,0,1,1,1,0,0,0,0],'tic')).toBe(0);
  });
  it('detects a draw and locks completed boards',()=> {
    const board={...newBoard('tic'),cells:[1,2,1,1,2,2,2,1,1],winner:3};
    expect(winningPlayer(board.cells,'tic')).toBe(3);
    expect(legalMoves(board)).toEqual([]);expect(play(board,0)).toBe(board);
  });
  it('drops to the lowest free cell and rejects full columns',()=> {
    let board=newBoard('connect');
    board=play(board,2);expect(board.cells[37]).toBe(1);
    for(let i=1;i<6;i++) board=play(board,2);
    expect(legalMoves(board)).not.toContain(2);expect(play(board,2)).toBe(board);
  });
  it('AI wins before blocking, and blocks immediate threats for all boards',()=> {
    for(const [kind,{cols,rows,run}] of Object.entries(RULES)) {
      for(const attacker of [1,2]) {
        const board=newBoard(kind);board.turn=2;
        for(let c=0;c<run-1;c++)board.cells[(rows-1)*cols+c]=attacker;
        const move=aiMove(board), next=play(board,move);
        expect(move).toBe(kind==='connect'?run-1:(rows-1)*cols+run-1);
        if(attacker===2) expect(next.winner).toBe(2);
      }
    }
  });
  it('AI only chooses legal moves through complete solo games',()=> {
    for(const kind of Object.keys(RULES)) {
      let board=newBoard(kind);
      while(!board.winner) {const move=aiMove(board);expect(legalMoves(board)).toContain(move);board=play(board,move);}
      expect(board.moves).toBeLessThanOrEqual(board.cells.length);
    }
  });
  it('restores a valid board and discards corrupt snapshots',()=> {
    const board=play(newBoard('gomoku'),24);
    expect(restoreBoard(board,'gomoku')).toEqual(board);
    expect(restoreBoard({...board,cells:[2]},'gomoku')).toEqual(newBoard('gomoku'));
    expect(restoreBoard({...newBoard('tic'),cells:Array(9).fill(2)},'tic')).toEqual(newBoard('tic'));
  });
});
describe('five point finger chooser',()=> {
  it('requires at least two fingers and three stable seconds',()=> {
    let s=fingerChange(newChooser(),1,true,0);
    expect(choose(s,5000)).toBe(s);
    s=fingerChange(s,2,true,1000); expect(remaining(s,1000)).toBe(3);
    expect(choose(s,3999)).toBe(s); expect(choose(s,4000,()=>0).result).toHaveLength(1);
  });
  it('caps at five, ignores duplicates, and resets on release or replacement',()=> {
    let s=newChooser();for(let i=0;i<6;i++)s=fingerChange(s,i,true,100);
    expect(s.fingers).toHaveLength(5);expect(fingerChange(s,0,true,200)).toBe(s);
    s=fingerChange(s,0,false,2000);expect(choose(s,4000)).toBe(s);
    s=fingerChange(s,6,true,3000);expect(choose(s,5999)).toBe(s);expect(choose(s,6000).result).toHaveLength(1);
  });
  it('splits balanced teams and gives unique ranks with all five participants',()=> {
    for(const mode of ['teams','order']) {
      let s=newChooser(mode);for(let i=0;i<5;i++)s=fingerChange(s,i,true,0);
      s=choose(s,3000,()=>.4);expect(new Set(s.result.map(x=>x.id)).size).toBe(5);
      if(mode==='teams')expect(s.result.filter(x=>x.label===1)).toHaveLength(3);
      else expect(s.result.map(x=>x.label)).toEqual([1,2,3,4,5]);
      expect(choose(s,9000)).toBe(s);expect(fingerChange(s,0,false,4000)).toBe(s);
    }
  });
});
describe('reaction duel',()=> {
  it('awards false starts to the opponent and ignores duplicate taps',()=> {
    const s=startRound(newDuel(),100,()=>0), next=tapDuel(s,0,1599);
    expect(next.scores).toEqual([0,1]);expect(next.falseStart).toBe(true);
    expect(next.bestMs).toBeNull();expect(tapDuel(next,1,1600)).toBe(next);
  });
  it('turns green at the deadline and ends at three points',()=> {
    let s=newDuel();
    for(let i=0;i<3;i++) {s=startRound(s,1000*i,()=>0);expect(duelPhase(s,s.greenAt)).toBe('green');s=tapDuel(s,0,s.greenAt+180-i*10);}
    expect(s.winner).toBe(0);expect(s.bestMs).toBe(160);expect(startRound(s,9999)).toBe(s);
  });
  it('never counts paused time in a resumed waiting round',()=> {
    const s=resumeDuel(startRound(newDuel(),10,()=>0));expect(s.phase).toBe('ready');expect(tapDuel(s,0,99999)).toBe(s);
    expect(startRound(s,100000,()=>0).greenAt).toBe(101500);
  });
});
const song={title:'Love You Tonight',artist:'The Owls',album:'Home',durationMs:360000,elapsedMs:0,playing:true,rate:1};
describe('automatic song bingo',()=> {
  it('explains missing metadata via an unchanged card, and ignores paused tracks',()=> {
    const s=newBingo();for(const value of [null,{...song,playing:false},{...song,title:''},{...song,artist:''}])expect(markSong(s,value)).toBe(s);
  });
  it('matches real metadata and deduplicates elapsed-time updates',()=> {
    let s=markSong(newBingo(),song);expect(s.marks[0]).toBe(true);expect(s.marks[1]).toBe(true);expect(s.marks[2]).toBe(false);
    s=markSong(s,{...song,elapsedMs:10000});expect(s.tracks).toBe(1);expect(s.marks[2]).toBe(false);
    s=markSong(s,{...song,title:'A second song'});expect(s.marks[2]).toBe(true);expect(s.tracks).toBe(2);expect(bingoLines(s)).toBeGreaterThan(0);
  });
  it('fills 4 × 4 rules including Chinese, duration and number conditions',()=> {
    const s=markSong(newBingo(4),{...song,title:'Home 123456789 中国 sun live',artist:'Alice',durationMs:200000});
    for(const i of [7,8,9,10,11,12,13,14,15])expect(s.marks[i]).toBe(true);
  });
  it('counts rows, columns and diagonals for either size',()=> {
    for(const size of [3,4])expect(bingoLines({...newBingo(size),marks:Array(size*size).fill(true)})).toBe(2*size+2);
  });
  it('restores only safe cards',()=> { expect(restoreBingo(newBingo(4))).toEqual(newBingo(4));expect(restoreBingo({size:100})).toEqual(newBingo()); });
});
describe('pause and storage policy',()=> {
  it('blocks immediately for every calm trigger and for non-parked or hidden surfaces',()=> {
    const safe={parked:'confirmed',visible:true};expect(blocked(safe)).toBe(false);
    for(const patch of [{calm:true},{visible:false},{parked:'unknown'},{documentHidden:true},{call:{state:'active'}},{activity:{siri:true}},{activity:{phoneCall:true}},{activity:{navigation:true}}])expect(blocked({...safe,...patch})).toBe(true);
  });
  it('sanitizes stored score values',()=> { expect(cleanScores({tic:5,duel:140.1,bingo:-1,chooser:'5',gomoku:Infinity,unexpected:4})).toEqual({tic:5,duel:140}); });
});
describe('packaged contract',()=> {
  it('uses the guard first, parked surfaces and a local SDK',async()=> {
    const base=new URL('../',import.meta.url), manifest=JSON.parse(await readFile(new URL('oxp-plugin.json',base),'utf8'));
    expect(manifest.surfaces.every(s=>s.usage==='parked')).toBe(true);
    expect(manifest.surfaces.filter(s=>s.kind==='fullscreen')).toHaveLength(6);
    const html=await readFile(new URL('index.html',base),'utf8');expect(html.match(/<script[^>]+>/)[0]).toBe('<script crossorigin="anonymous" src="/plugins/host/guard.js">');
    const sdk=await readFile(new URL('oxp-plugin-sdk.js',base),'utf8');expect(sdk).toContain('export function connect()');
  });
});
