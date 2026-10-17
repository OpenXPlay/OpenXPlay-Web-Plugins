// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

export const strings={
  en:{title:'Cozy Cats',look:'Cat',place:'Place',mood:'Mood',breed:'Breed',name:'Name (optional)',size:'Size',corner:'Corner',
    save:'Save & show',close:'Close',saved:'Saved',saving:'Saving…',error:'Retry save',unavailable:'Storage unavailable. Try saving again.',
    hint:'Pin Pet for a meow and purr. Play unlocks when parked.',play:'Play room',yarn:'Catch yarn',catches:'Yarn catches',
    orange:'Orange tabby',silver:'Silver shaded',golden:'Golden shaded',ragdoll:'Ragdoll',
    small:'Small',medium:'Medium',large:'Large','bottom-right':'Bottom right','bottom-left':'Bottom left','top-right':'Top right','top-left':'Top left',
    idle:'Relaxed',hungry:'Snack time?',sleeping:'Dreaming',waving:'Hello, friend',running:'Enjoying the music',jumping:'New song!',happy:'Feeling loved',floppy:'Happy and floppy',sunbathing:'Sunbathing',yawning:'Bedtime yawn',failed:'See you soon',review:'Listening quietly',waiting:'Ears up',pats:'Pats'},
  'zh-CN':{title:'猫咪伙伴',look:'猫咪',place:'位置',mood:'心情',breed:'品种',name:'名字（可选）',size:'大小',corner:'位置',
    save:'保存并显示',close:'关闭',saved:'已保存',saving:'保存中…',error:'重试保存',unavailable:'存储暂不可用，请重试保存。',
    hint:'固定“摸摸”，听猫咪无声问好、撒娇。确认停车后可玩耍。',play:'玩耍小屋',yarn:'接毛线球',catches:'接球次数',
    orange:'橘猫',silver:'银渐层',golden:'金渐层',ragdoll:'布偶',small:'小',medium:'中',large:'大','bottom-right':'右下角','bottom-left':'左下角','top-right':'右上角','top-left':'左上角',
    idle:'悠闲',hungry:'想吃点心啦',sleeping:'做美梦',waving:'你好呀',running:'听歌中',jumping:'换歌啦',happy:'被爱包围',floppy:'开心躺平',sunbathing:'晒太阳',yawning:'该睡啦',failed:'一会儿见',review:'安静聆听',waiting:'竖起耳朵',pats:'摸摸次数'}
};
export function words(locale){return strings[/^zh(?:-|$)/i.test(locale)?'zh-CN':'en'];}
