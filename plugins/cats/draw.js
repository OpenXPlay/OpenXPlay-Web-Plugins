// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import {createRenderer, createAnimator} from './kit/index.js';
import {atlases} from './assets/atlases.js';
import {spriteState} from './poses.js';

// Image elements load only packaged assets, with opaque-frame CORS enabled.
export function mountCat(canvas, breed) {
  const descriptor=atlases[breed]||atlases.orange;
  const image=new Image();image.crossOrigin='anonymous';
  const meow=new Image();meow.crossOrigin='anonymous';
  const renderer=createRenderer(canvas,image,descriptor,{pixelArt:true,meow});
  const timeline=createAnimator(descriptor,{draw:renderer.draw});
  let previous,disposed=false;
  image.onload=meow.onload=()=>{if(!disposed)timeline.redraw();};
  image.src=new URL(`./assets/${descriptor.image}`,import.meta.url).href;
  meow.src=new URL('./assets/meow-vfx.png',import.meta.url).href;
  const animator={
    setFlags:timeline.setFlags,
    play(state,{baseState='idle',key}={}) {
      const mapped=spriteState(state),base=spriteState(baseState);
      const sleeping=breed==='silver'?'sleeping2':'sleeping';
      if(mapped==='happy')timeline.play('greeting',{baseState:base,key,followState:'happy'});
      else if(mapped==='sleeping'&&previous==='laying')timeline.play(sleeping,{baseState:sleeping,key});
      else if(mapped==='sleeping'&&previous!=='sleeping')timeline.play('laying',{baseState:sleeping,key});
      else if(previous==='sleeping'&&mapped!=='sleeping'&&mapped!=='greeting')timeline.play('stretch',{baseState:base,key});
      else if(mapped==='sleeping'&&previous==='sleeping') {
        // Keep the laying transition alive until its own timeline completes.
      } else timeline.play(mapped,{baseState:base==='laying'?'sleeping':base,key});
      previous=mapped;
    },
    dispose(){disposed=true;image.onload=meow.onload=null;timeline.dispose();}
  };
  return {descriptor,animator,resize(size){renderer.resize(size,size,1);timeline.redraw();}};
}
