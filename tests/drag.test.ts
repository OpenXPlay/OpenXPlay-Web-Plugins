// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import {it,expect,vi,afterEach} from 'vitest';
import {enableDragGesture} from '../sdk/oxp-plugin-sdk';
function gesture(options={}) {
  vi.useFakeTimers();
  const listeners=new Map<string,Function>();let captured:number|undefined;
  const element={style:{touchAction:'manipulation'},addEventListener:(k:string,fn:Function)=>listeners.set(k,fn),removeEventListener:(k:string)=>listeners.delete(k),
    setPointerCapture:(id:number)=>{captured=id;},hasPointerCapture:(id:number)=>captured===id,releasePointerCapture:()=>{captured=undefined;}};
  const report=vi.fn(),off=enableDragGesture(element as unknown as HTMLElement,report,options);
  function fire(type:string,extra={}) { const e={button:0,pointerId:1,isPrimary:true,screenX:100,screenY:200,clientX:undefined,clientY:undefined,detail:1,preventDefault:vi.fn(),stopImmediatePropagation:vi.fn(),...extra};listeners.get(type)?.(e);return e; }
  return {element,report,off,fire,listeners,capture:()=>captured};
}
afterEach(()=>vi.useRealTimers());
it('captures immediately, preserves a stationary hold and jitter taps, and drags past 8px',()=>{
  const g=gesture();g.fire('pointerdown');expect(g.capture()).toBe(1);
  vi.advanceTimersByTime(1000);g.fire('pointermove',{screenX:108});expect(g.report).not.toHaveBeenCalled();
  g.fire('pointerup');expect(g.fire('click').preventDefault).not.toHaveBeenCalled();
  g.fire('pointerdown');g.fire('pointermove',{screenX:109});
  expect(g.report.mock.calls.map(c=>c[0])).toEqual([{phase:'start',dx:0,dy:0},{phase:'move',dx:9,dy:0}]);
  g.fire('pointermove',{screenX:140,screenY:170,clientX:-80,clientY:800});
  expect(g.report).toHaveBeenLastCalledWith({phase:'move',dx:40,dy:-30});
  g.fire('pointerup');expect(g.report).toHaveBeenLastCalledWith({phase:'end',dx:40,dy:-30});expect(g.capture()).toBeUndefined();
  expect(g.fire('click').stopImmediatePropagation).toHaveBeenCalled();expect(g.fire('click',{detail:0}).preventDefault).not.toHaveBeenCalled();g.off();
});
it('keeps a drag active after returning to the origin and ignores secondary pointers',()=>{
  const g=gesture();g.fire('pointerdown');g.fire('pointermove',{screenX:109});g.fire('pointermove');g.fire('pointerup');
  expect(g.report).toHaveBeenLastCalledWith({phase:'end',dx:0,dy:0});expect(g.fire('click').preventDefault).toHaveBeenCalled();
  g.fire('pointerdown',{isPrimary:false});expect(g.capture()).toBeUndefined();g.off();
});
it('honours tolerance, ignores the legacy delay, and cleans up cancellation and lost capture',()=>{
  const g=gesture({delayMs:400,tolerancePx:3});g.fire('pointerdown');g.fire('pointermove',{screenX:103});expect(g.report).not.toHaveBeenCalled();
  g.fire('pointermove',{screenX:104});g.fire('pointercancel');g.fire('lostpointercapture');expect(g.report.mock.calls.map(c=>c[0].phase)).toEqual(['start','move','end']);
  g.fire('pointerdown');g.fire('pointermove',{screenX:104});g.off();expect(g.report.mock.calls.map(c=>c[0].phase)).toEqual(['start','move','end','start','move','end']);
  expect(g.listeners.size).toBe(0);expect(g.element.style.touchAction).toBe('manipulation');
});

it('measures the tolerance in local CSS pixels when the receiver is scaled',()=>{
  const g=gesture();g.fire('pointerdown',{clientX:20,clientY:30});
  g.fire('pointermove',{screenX:104,clientX:28,clientY:30});expect(g.report).not.toHaveBeenCalled();
  g.fire('pointermove',{screenX:104.5,clientX:29,clientY:30});expect(g.report).toHaveBeenLastCalledWith({phase:'move',dx:4.5,dy:0});g.off();
});
