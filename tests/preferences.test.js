// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

import {it,expect} from 'vitest';
import {Policy} from '../host/policy.js';
import {loadPreferences,pruneSurfaces,rememberSurfaces,restoreSurfaces} from '../host/preferences.js';
const surfaces=[{id:'cat',kind:'companion',usage:'driving',anchor:'top-left'},{id:'sky',kind:'ambient',usage:'driving'},{id:'panel',kind:'panel',usage:'driving'},{id:'parked',kind:'companion',usage:'parked'}];
const manifests=new Map([['org.pet',{surfaces}]]);
it('roundtrips anchored, free and ambient selections, excluding transient covers',()=>{
 const loaded=surfaces.slice(0,3).map(s=>({...s,plugin:'org.pet'}));
 loaded[0].position={x:310,y:90};loaded[0].anchor='bottom-right';
 const saved=rememberSurfaces({},loaded),policy=new Policy(),pending=new Set(Object.keys(saved));
 expect(saved).toEqual({'org.pet/cat':{x:310,y:90,anchor:'bottom-right'},'org.pet/sky':{}});
 restoreSurfaces(saved,pending,manifests,policy,100);
 expect(policy.loaded).toHaveLength(2);expect(policy.loaded[0]).toMatchObject({position:{x:310,y:90},anchor:'bottom-right',restoredAnchor:'bottom-right'});expect(pending.size).toBe(0);
 const anchored=rememberSurfaces({},[{...loaded[0],position:undefined}]);
 expect(anchored['org.pet/cat']).toEqual({anchor:'bottom-right'});
});
it('defers gated restores, restores only once and respects policy limits',()=>{
 const saved={'org.pet/cat':{},'org.pet/parked':{}},pending=new Set(Object.keys(saved)),policy=new Policy();
 policy.visible=false;restoreSurfaces(saved,pending,manifests,policy,1);expect(policy.loaded).toEqual([]);
 policy.visible=true;restoreSurfaces(saved,pending,manifests,policy,2);expect(policy.loaded).toHaveLength(1);expect([...pending]).toEqual(['org.pet/parked']);
 policy.parkedUntil=100;restoreSurfaces(saved,pending,manifests,policy,3);expect(policy.loaded).toHaveLength(2);
 policy.close('org.pet','cat');restoreSurfaces(saved,pending,manifests,policy,4);expect(policy.loaded.map(s=>s.id)).toEqual(['parked']);
});
it('drops disabled, uninstalled, removed and nonpersistent surfaces and sanitizes placements',()=>{
 const saved={'org.pet/cat':{x:'bad',y:0,anchor:'bad'},'org.pet/panel':{},'org.pet/gone':{},'org.gone/cat':{}};
 expect(pruneSurfaces(saved,manifests,new Set())).toEqual({'org.pet/cat':{}});
 expect(pruneSurfaces(saved,manifests,new Set(['org.pet']))).toEqual({});
 const pending=new Set(Object.keys(saved));restoreSurfaces({},pending,manifests,new Policy(),0);expect(pending.size).toBe(0);
});
it('never restores a disabled plugin from pending selections',()=>{
 const policy=new Policy();policy.disabled.add('org.pet');
 const saved=pruneSurfaces({'org.pet/cat':{x:300,y:100}},manifests,policy.disabled),pending=new Set(['org.pet/cat']);
 restoreSurfaces(saved,pending,manifests,policy,0);expect(policy.loaded).toEqual([]);expect(pending.size).toBe(0);
});
it('migrates legacy companions but honours an explicit selection map and ignores corrupt preferences',()=>{
 const companions={'org.pet/cat':{x:300,y:100,anchor:'top-left'}};
 expect(loadPreferences({companions}).surfaces).toEqual(companions);
 expect(loadPreferences({companions,surfaces:{}}).surfaces).toEqual({});
 for(const prefs of [undefined,null,[],42,'broken'])expect(loadPreferences(prefs)).toEqual({});
 expect(loadPreferences({companions:null,surfaces:{'org.pet/cat':null}})).toEqual({companions:{},surfaces:{}});
 expect(pruneSurfaces({'org.pet/cat/extra':{}},manifests,new Set())).toEqual({});
});
