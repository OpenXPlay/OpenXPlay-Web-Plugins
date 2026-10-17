// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import { connect } from './oxp-plugin-sdk.js';
import { RULES, newBoard, play, aiMove, restoreBoard } from './boards.js';
import { newChooser, fingerChange, choose, remaining } from './chooser.js';
import { newDuel, startRound, tapDuel, duelPhase, resumeDuel } from './duel.js';
import { CONDITIONS, newBingo, markSong, bingoLines, restoreBingo } from './bingo.js';
import { blocked, cleanScores } from './lifecycle.js';

const app=document.querySelector('#app');
const names={menu:['Pocket Playroom','口袋游戏屋'],chooser:['Finger chooser','手指抽签'],duel:['Reaction duel','反应对决'],gomoku:['Gomoku','五子棋'],connect:['Connect Four','四子棋'],tic:['Tic-tac-toe','井字棋'],bingo:['Song bingo','猜歌宾果']};
const descriptions={chooser:['2–5 fingers · hold together','2–5人 · 同时按住'],duel:['2 players · first to 3','2人 · 三分获胜'],gomoku:['7 × 7 · five in a row','7 × 7 · 五子连线'],connect:['Drop discs · connect four','落子 · 四子连线'],tic:['Three in a row','三子连线'],bingo:['Discover music together','一起发现音乐']};
let connection, kind, chinese=false, paused=true, page=0, scores={}, saved={}, storageReady=false, storageFailed=false;
let board, solo=false, chooser=newChooser(), duel=newDuel(), bingo=newBingo();
let points=new Map(), clock=null, aiTimer=null, saveTimer=null, saving=false, dirty=false, lastSave=-Infinity;
let zone, status, overlay, lastLocale;
const t=(en,zh)=>chinese?zh:en;
const label=key=>names[key][chinese?1:0];
const element=(tag,className,text)=> { const e=document.createElement(tag); if(className)e.className=className; if(text!==undefined)e.textContent=text; return e; };
function button(text, fn, className='') { const b=element('button',className,text); b.type='button'; b.onclick=fn; return b; }
function unavailable() { return !connection || blocked({...connection.surface,parked:connection.parked,activity:connection.state.activity,call:connection.state.call,documentHidden:document.hidden}); }
function canPlay() { return storageReady && !paused && !unavailable(); }
function snapshot() {
  if (board) saved[kind]={board,solo};
  if (kind==='duel') saved.duel=resumeDuel(duel);
  if (kind==='bingo') saved.bingo=bingo;
  return {version:1,scores,saved};
}
// Coalesce locally: the reference broker currently does not coalesce writes.
function persist() { if (!storageReady) return; dirty=true; void flush(); }
async function flush() {
  if (!dirty || saving || !connection) return;
  clearTimeout(saveTimer);
  const delay=2100-(performance.now()-lastSave);
  if (delay>0) { saveTimer=setTimeout(flush,delay); return; }
  saving=true; dirty=false; lastSave=performance.now();
  try { await connection.storage.set(snapshot()); storageFailed=false; }
  catch { storageFailed=true; dirty=true; }
  saving=false;
  if (dirty) saveTimer=setTimeout(flush,2200);
  updateStorageNote();
}
async function leave(surfaceId, trigger) {
  if (dirty || saving) {
    trigger.disabled=true; trigger.textContent=t('Saving…','保存中…');
    const deadline=performance.now()+12000;
    while ((dirty || saving) && performance.now()<deadline) {
      await flush();
      if (dirty || saving) await new Promise(resolve=>setTimeout(resolve,100));
    }
    if (dirty || saving) {
      trigger.disabled=false; trigger.textContent=t('Save failed · retry','保存失败 · 重试');
      return;
    }
  }
  if (surfaceId) connection.surface.open(surfaceId); else connection.surface.close();
}
function updateStorageNote() {
  const note=document.querySelector('#storage-note');
  if (note) note.textContent=storageFailed?t('Scores are kept for this visit; saving will retry.','本次保留成绩；稍后重试保存。'):t('Best scores saved on this receiver.','最佳成绩保存在此接收器。');
}
function record(key, value, lower=false) {
  if (!Number.isFinite(value)) return;
  scores[key]=scores[key]===undefined ? value : lower?Math.min(scores[key],value):Math.max(scores[key],value);
  persist();
}
function stopTimers() { clearTimeout(clock); clearTimeout(aiTimer); clock=null; aiTimer=null; }
function pause() {
  if (!paused) { paused=true; stopTimers(); chooser=newChooser(chooser.mode); points.clear(); duel=resumeDuel(duel); persist(); }
  showPause();
}
function showPause() {
  app.dataset.paused=String(paused);
  if (!overlay) return;
  overlay.hidden=kind==='menu' || !paused;
  overlay.replaceChildren();
  const locked=unavailable();
  overlay.append(element('h2','',locked?t('Taking a quiet moment','暂时休息'):t('Ready when you are','准备好了就开始')),
    element('p','',locked?t('Games pause during calls, Siri or navigation. Park to play.','通话、Siri或导航时暂停。请停车后再玩。'):t('Tap to begin or resume. Waiting reaction rounds restart.','轻触开始或继续。反应对决的等待回合将重新开始。')));
  const b=button(storageReady?t('Let’s play','开始游戏'):t('Loading…','加载中…'),()=> {
    if (unavailable() || !storageReady) return;
    paused=false; overlay.hidden=true;
    if (kind==='bingo') onSong(connection.state.nowPlaying);
    if (board) scheduleAI();
  },'primary');
  b.disabled=locked||!storageReady; overlay.append(b);
}
function resetGame() {
  if (!canPlay()) return;
  stopTimers();
  if (board) board=newBoard(kind);
  if (kind==='chooser') { chooser=newChooser(chooser.mode); points.clear(); }
  if (kind==='duel') duel=newDuel();
  if (kind==='bingo') bingo=newBingo(bingo.size);
  persist(); render();
}
function render() {
  stopTimers(); chinese=connection.locale.toLowerCase().startsWith('zh'); lastLocale=connection.locale;
  document.documentElement.lang=chinese?'zh-CN':'en';
  app.className=kind==='menu'?'panel':'fullscreen'; app.dataset.reduced=String(connection.reducedMotion); app.replaceChildren();
  const header=element('header');
  const back=button(kind==='menu'?t('Close','关闭'):t('Games','游戏'),()=>leave(kind==='menu'?null:'menu',back));
  header.append(element('h1','',label(kind)),back);
  app.append(header);
  if (kind==='menu') { renderMenu(); return; }
  const content=element('section','content'); app.append(content);
  if (board) renderBoard(content);
  if (kind==='chooser') renderChooser(content);
  if (kind==='duel') renderDuel(content);
  if (kind==='bingo') renderBingo(content);
  overlay=element('div','pause'); overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true'); app.append(overlay); showPause();
  if (canPlay() && board) scheduleAI();
  if (canPlay() && kind==='duel') armDuel();
}
function renderMenu() {
  const keys=['chooser','duel','gomoku','connect','tic','bingo'];
  const list=element('div','menu-list');
  for (const key of keys.slice(page*2,page*2+2)) {
    const b=button('',()=>connection.surface.open(key),'game-card');
    const symbol=element('span','card-symbol',({chooser:'✿',duel:'⚑',gomoku:'●',connect:'▦',tic:'×',bingo:'♪'})[key]); symbol.setAttribute('aria-hidden','true');
    const body=element('span','card-copy'); body.append(element('strong','',label(key)),element('span','',descriptions[key][chinese?1:0]));
    const value=scores[key];
    body.append(element('span','best',value===undefined?t('Best · —','最佳 · —'):key==='duel'?t(`Best · ${value} ms`,`最快 · ${value} 毫秒`):key==='bingo'?t(`Best · ${value} lines`,`最佳 · ${value} 条线`):key==='chooser'?t(`${value} draws together`,`一起抽签 ${value} 次`):t(`${value} wins`,`获胜 ${value} 次`)));
    b.append(symbol,body); list.append(b);
  }
  app.append(list,button(t(`More games → ${page+1}/3`,`更多游戏 → ${page+1}/3`),()=>{page=(page+1)%3;render();}));
  const note=element('p','fine'); note.id='storage-note'; app.append(note); updateStorageNote();
}
function controls(parent) {
  const side=element('aside','side'); status=element('p','status'); status.setAttribute('aria-live','polite'); side.append(status); parent.append(side); return side;
}
function renderBoard(parent) {
  const side=controls(parent);
  const winner=board.winner;
  status.textContent=winner===3?t('A friendly draw!','平局，也很精彩！'):winner?t(`Player ${winner} wins!`,`玩家${winner}获胜！`):t(`Player ${board.turn} · your turn`,`轮到玩家${board.turn}`);
  side.append(element('p','',descriptions[kind][chinese?1:0]),button(solo?t('Mode: local AI','模式：本地电脑'):t('Mode: two players','模式：双人'),()=>{if(!canPlay())return; solo=!solo; board=newBoard(kind);persist();render();}),button(t('New game','重新开始'),resetGame),element('p','fine',t('Coral plays first. Tap a square; no dragging.','珊瑚色先手。轻触落子，无需拖动。')));
  const {rows,cols}=RULES[kind], grid=element('div',`board ${kind}`); grid.style.setProperty('--cols',cols); grid.style.setProperty('--rows',rows); grid.setAttribute('aria-label',label(kind));
  for (let r=0;r<rows;r++) for (let c=0;c<cols;c++) {
    const value=board.cells[r*cols+c];
    const cell=button(value?(kind==='tic'?(value===1?'×':'○'):'●'):'',()=> {
      if (!canPlay() || (solo&&board.turn===2)) return;
      moveBoard(kind==='connect'?c:r*cols+c);
    },`cell player-${value}`);
    cell.setAttribute('aria-label',t(`Row ${r+1}, column ${c+1}: ${value?`player ${value}`:'empty'}`,`第${r+1}行，第${c+1}列：${value?`玩家${value}`:'空位'}`));
    cell.disabled=!!winner || (kind!=='connect' && !!value); grid.append(cell);
  }
  parent.append(grid);
}
function moveBoard(move) {
  const next=play(board,move); if(next===board)return;
  board=next;
  if (board.winner && board.winner!==3 && (!solo||board.winner===1)) record(kind,(scores[kind]??0)+1);
  persist();render();
}
function scheduleAI() {
  if (solo && board.turn===2 && !board.winner) aiTimer=setTimeout(()=> { if(canPlay())moveBoard(aiMove(board)); },350);
}
function renderChooser(parent) {
  const side=controls(parent);
  for (const [mode,en,zh] of [['one','Pick one','选一人'],['teams','Two teams','分两队'],['order','Order','排顺序']]) {
    const b=button(t(en,zh),()=> {if(!canPlay())return;chooser=newChooser(mode);points.clear();render();},chooser.mode===mode?'selected':''); b.setAttribute('aria-pressed',String(chooser.mode===mode));side.append(b);
  }
  side.append(button(t('Again','再来一次'),resetGame),element('p','fine',t('Hold 2–5 fingers in the play area. Stay still for 3 seconds.','2–5根手指按住游戏区，保持3秒。')));
  zone=element('div','finger-zone'); parent.append(zone);
  const change=(event,down)=> {
    if (!canPlay() || chooser.result) return;
    if(down) {
      if(chooser.fingers.length>=5)return;
      event.preventDefault(); zone.setPointerCapture(event.pointerId);
      const rect=zone.getBoundingClientRect();
      points.set(event.pointerId,{x:event.clientX-rect.left,y:event.clientY-rect.top,originX:event.clientX,originY:event.clientY});
    } else points.delete(event.pointerId);
    chooser=fingerChange(chooser,event.pointerId,down,performance.now()); drawFingers(); armChooser();
  };
  zone.onpointerdown=e=>change(e,true); zone.onpointerup=e=>change(e,false); zone.onpointercancel=e=>change(e,false); zone.onlostpointercapture=e=>change(e,false);
  zone.onpointermove=e=> {
    if(!canPlay()||chooser.result)return;
    const point=points.get(e.pointerId); if(!point)return;
    if(Math.hypot(e.clientX-point.originX,e.clientY-point.originY)>18) {
      const rect=zone.getBoundingClientRect(); points.set(e.pointerId,{x:e.clientX-rect.left,y:e.clientY-rect.top,originX:e.clientX,originY:e.clientY}); chooser={...chooser,changedAt:performance.now()};drawFingers();armChooser();
    }
  };
  drawFingers();
}
function drawFingers() {
  zone.replaceChildren();
  status.textContent=chooser.result?t('Chosen! Lift your fingers.','结果揭晓！可以松开手指。'):chooser.fingers.length<2?t('Everyone, hold a finger','大家一起按住'):t(`Hold… ${remaining(chooser,performance.now())}`,`请保持… ${remaining(chooser,performance.now())}`);
  if(!points.size)zone.append(element('p','zone-hint',t('Your fingers belong here\n2–5 friends · 3 seconds','把手指放在这里\n2–5人 · 保持3秒')));
  for(const [id,p] of points) {
    const result=chooser.result?.find(x=>x.id===id), index=chooser.fingers.indexOf(id);
    const circle=element('div',`finger ${result?'chosen':''} ${chooser.result&&!result?'not-chosen':''}`,result?chooser.mode==='teams'?t(`Team ${result.label}`,`${result.label}队`):chooser.mode==='order'?String(result.label):t('YOU!','选中！'):String(index+1));
    circle.style.left=`${Math.max(42,Math.min(zone.clientWidth-42,p.x))}px`; circle.style.top=`${Math.max(42,Math.min(zone.clientHeight-42,p.y))}px`;
    if(result)circle.classList.add(`team-${result.label}`); zone.append(circle);
  }
}
function armChooser() {
  clearTimeout(clock);
  if (!canPlay() || chooser.result || chooser.fingers.length<2)return;
  clock=setTimeout(()=> {
    if(!canPlay())return;
    const next=choose(chooser,performance.now());
    if(next!==chooser) {chooser=next;record('chooser',(scores.chooser??0)+1);}
    drawFingers(); if(!chooser.result)armChooser();
  },100);
}
function renderDuel(parent) {
  parent.classList.add('duel-content');
  const top=element('div','duel-top'); status=element('p','status'); status.setAttribute('aria-live','polite');
  const phase=duelPhase(duel,performance.now());
  status.textContent=duel.winner!==null?t(`Player ${duel.winner+1} wins the match!`,`玩家${duel.winner+1}赢得比赛！`):duel.phase==='result'?duel.falseStart?t('False start! Opponent scores.','抢跑！对手得分。'):t(`Quick paws! ${duel.lastMs} ms`,`反应真快！${duel.lastMs} 毫秒`):phase==='green'?t('GO! Tap your side!','开始！轻触你的一侧！'):phase==='waiting'?t('Wait for green…','等待变绿…'):t('First to 3 · best of 5','五局三胜');
  const start=button(duel.winner!==null?t('New match','新比赛'):t('Next round','开始回合'),()=> {
    if(!canPlay())return;
    if(duel.winner!==null)duel=newDuel();
    duel=startRound(duel,performance.now());persist();render();
  }); start.disabled=duel.phase==='waiting'; top.append(status,start); parent.append(top);
  const pads=element('div','duel-pads');
  for(let side=0;side<2;side++) {
    const pad=button('',()=> {
      if(!canPlay())return;
      const next=tapDuel(duel,side,performance.now()); if(next===duel)return; duel=next;
      if(duel.lastMs!==null)record('duel',duel.lastMs,true);
      persist();render();
    },`duel-pad side-${side} ${phase==='green'?'green':''}`);
    pad.onpointerdown=event=>{event.preventDefault();pad.onclick();};
    pad.append(element('strong','',t(`Player ${side+1}`,`玩家${side+1}`)),element('span','score',String(duel.scores[side])),element('span','',phase==='green'?t('GO!','开始！'):t('Wait for green','等待变绿'))); pads.append(pad);
  }
  parent.append(pads);
}
function armDuel() {
  if(duel.phase==='waiting' && duelPhase(duel,performance.now())!=='green') clock=setTimeout(()=> { if(canPlay())render(); },Math.max(1,duel.greenAt-performance.now()));
}
function renderBingo(parent) {
  const side=controls(parent);
  status.textContent=t(`${bingoLines(bingo)} lines · ${bingo.tracks} songs`,`${bingoLines(bingo)} 条线 · ${bingo.tracks} 首歌`);
  side.append(element('p','metadata',metadataText()),element('p','fine',t('Squares mark themselves from playing song metadata. No music control or audio is needed.','根据正在播放的歌曲信息自动标记。不控制音乐，也不播放声音。')),button(bingo.size===3?'4 × 4':'3 × 3',()=> {if(!canPlay())return;bingo=newBingo(bingo.size===3?4:3);persist();render();onSong(connection.state.nowPlaying);}),button(t('Fresh card','新卡片'),()=> {resetGame();onSong(connection.state.nowPlaying);}));
  const card=element('div','bingo-card');card.style.setProperty('--size',bingo.size);
  bingo.marks.forEach((mark,i)=> {
    const square=element('div',`bingo-square ${mark?'marked':''}`); square.append(element('span','',mark?'✓':'♪'),element('span','',CONDITIONS[i][chinese?2:1]));card.append(square);
  });parent.append(card);
}
function metadataText() {
  const song=connection.state.nowPlaying;
  if(!song || !song.title?.trim() || !song.artist?.trim()) return t('Waiting for music metadata. Bingo only works when the phone shares title and artist.','等待音乐信息。手机分享歌名和歌手后，宾果才能运行。');
  if(!song.playing)return t('Music is paused. Waiting for a playing track.','音乐已暂停。等待歌曲播放。');
  return `${song.title} · ${song.artist}`;
}
function onSong(song) {
  if(kind!=='bingo'||!canPlay())return;
  const next=markSong(bingo,song);
  if(JSON.stringify(next)!==JSON.stringify(bingo)) { bingo=next;record('bingo',bingoLines(bingo));persist();render(); }
  else {const meta=document.querySelector('.metadata');if(meta)meta.textContent=metadataText();}
}
async function boot() {
  connection=await connect();kind=connection.surface.id;
  if(!names[kind])kind='menu';
  if(RULES[kind])board=newBoard(kind);
  connection.surface.onChange(()=> {
    app.dataset.reduced=String(connection.reducedMotion);
    if(unavailable())pause();
    else if(lastLocale!==connection.locale)render();
    else showPause();
  });
  connection.on('activity',()=>{if(unavailable())pause();else showPause();});
  connection.on('call',()=>{if(unavailable())pause();else showPause();});
  connection.on('nowPlaying',onSong);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();else showPause();});
  window.addEventListener('blur',pause);
  render();
  try {
    const store=await connection.storage.get();scores=cleanScores(store?.scores);saved=store?.saved&&typeof store.saved==='object'&&!Array.isArray(store.saved)?store.saved:{};
    if(board) {board=restoreBoard(saved[kind]?.board,kind);solo=saved[kind]?.solo===true;}
    if(kind==='bingo')bingo=restoreBingo(saved.bingo);
    if(kind==='duel') {
      const d=saved.duel;
      if(d && Array.isArray(d.scores) && d.scores.length===2 && d.scores.every(s=>Number.isInteger(s)&&s>=0&&s<=3) && d.scores.reduce((a,b)=>a+b,0)<=5) {
        duel={...newDuel(),scores:d.scores,phase:'ready',winner:d.scores.indexOf(3)>=0?d.scores.indexOf(3):null};
      }
    }
  } catch {storageFailed=true;}
  storageReady=true;render();
}
boot().catch(()=>{app.replaceChildren(element('p','', 'Open this game through the OpenXPlay host. / 请通过OpenXPlay打开游戏。'));});
