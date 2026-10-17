// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

export const RULES = { gomoku: {rows:7, cols:7, run:5}, connect:{rows:6, cols:7, run:4}, tic:{rows:3, cols:3, run:3} };
export function newBoard(kind) {
  const rule = RULES[kind];
  return {kind, cells:Array(rule.rows * rule.cols).fill(0), turn:1, winner:0, moves:0};
}
export function winningPlayer(cells, kind) {
  const {rows,cols,run} = RULES[kind];
  for (let r=0;r<rows;r++) for (let c=0;c<cols;c++) {
    const player=cells[r*cols+c];
    if (!player) continue;
    for (const [dr,dc] of [[1,0],[0,1],[1,1],[1,-1]]) {
      const er=r+dr*(run-1), ec=c+dc*(run-1);
      if (er<0 || er>=rows || ec<0 || ec>=cols) continue;
      if (Array.from({length:run},(_,i)=>cells[(r+dr*i)*cols+c+dc*i]).every(v=>v===player)) return player;
    }
  }
  return cells.every(Boolean) ? 3 : 0;
}
export function legalMoves(board) {
  if (board.winner) return [];
  const {cols}=RULES[board.kind];
  return board.kind==='connect' ? Array.from({length:cols},(_,c)=>c).filter(c=>!board.cells[c]) : board.cells.flatMap((v,i)=>v ? [] : [i]);
}
export function play(board, move) {
  if (!Number.isInteger(move) || !legalMoves(board).includes(move)) return board;
  const {rows,cols}=RULES[board.kind], cells=[...board.cells];
  let index=move;
  if (board.kind==='connect') for (let r=rows-1;r>=0;r--) if (!cells[r*cols+move]) { index=r*cols+move; break; }
  cells[index]=board.turn;
  return {...board,cells,turn:3-board.turn,moves:board.moves+1,winner:winningPlayer(cells,board.kind)};
}
// Win now, block the opponent, then prefer the centre and neighbouring stones.
export function aiMove(board) {
  const moves=legalMoves(board);
  for (const player of [board.turn,3-board.turn]) {
    const win=moves.find(m=>play({...board,turn:player},m).winner===player);
    if (win!==undefined) return win;
  }
  const {rows,cols}=RULES[board.kind];
  const score=m=> {
    if (board.kind==='connect') return -Math.abs(m-(cols-1)/2);
    const r=Math.floor(m/cols),c=m%cols;
    let s=-Math.hypot(r-(rows-1)/2,c-(cols-1)/2);
    for (let dr=-1;dr<=1;dr++) for (let dc=-1;dc<=1;dc++) if (r+dr>=0 && r+dr<rows && c+dc>=0 && c+dc<cols && board.cells[(r+dr)*cols+c+dc]) s+=2;
    return s;
  };
  return moves.sort((a,b)=>score(b)-score(a))[0];
}
export function restoreBoard(value, kind) {
  const rule=RULES[kind];
  if (!value || value.kind!==kind || !Array.isArray(value.cells) || value.cells.length!==rule.rows*rule.cols || !value.cells.every(v=>[0,1,2].includes(v))) return newBoard(kind);
  const one=value.cells.filter(v=>v===1).length, two=value.cells.filter(v=>v===2).length;
  if (one!==two && one!==two+1) return newBoard(kind);
  return {kind,cells:[...value.cells],turn:one===two?1:2,moves:one+two,winner:winningPlayer(value.cells,kind)};
}
