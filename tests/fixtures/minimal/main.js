// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

window.addEventListener('message',event=>{
  if(event.source===parent && event.data?.oxp==='plugin/0' && event.data.type==='ping')parent.postMessage({oxp:'plugin/0',type:'pong',seq:event.data.seq},'*');
});
parent.postMessage({oxp:'plugin/0',type:'hello',spec:'oxp-web-plugin/0',sdk:'fixture/0'},'*');
