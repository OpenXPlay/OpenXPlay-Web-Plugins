// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

export const credits = [
  '鲸鱼娘 by 上善无形\nhttps://www.bilibili.com/opus/1231977657712771073\nCC BY-NC-SA 4.0',
  'Maid design by ZipZipPipe\nhttps://www.pixiv.net/artworks/148186519\nCC BY-NC-SA 4.0',
  'Sprite atlas\n作者：YunYueSama\n仓库：https://github.com/YunYueSama/codex-deepseek-pet\nCommit: 7661c8b304c5400701f91da01b1a643a207331de\n大肥鱼项目署名许可 1.0',
  'Apron emblem removed; rows relabelled.\nOpenXPlay.org · 2026-10-16\nCC BY-NC-SA 4.0',
  'Community fan character. Not affiliated with or endorsed by DeepSeek.\nThe assets may not be used commercially.'
];
export function creditPage(index, locale) {
  if (locale === 'zh-CN' && index === 1) return credits[1].replace('Maid design by', '女仆设计：');
  if (locale === 'zh-CN' && index === 2) return credits[2].replace('Sprite atlas', '精灵图集').replace('Commit:', '版本：');
  if (locale === 'zh-CN' && index === 3) return '已移除围裙徽标；已重新标注各行。\nOpenXPlay.org · 2026-10-16\nCC BY-NC-SA 4.0';
  if (locale === 'zh-CN' && index === 4) return '本角色是社区同人角色，与 DeepSeek 无关联，亦未经其认可或代言。\n素材不得用于商业用途。';
  return credits[index];
}
export const strings = {
  en: {title:'Whale Girl', settings:'Settings', credits:'Credits', size:'Size', corner:'Corner',
    sizes:['Small','Medium','Large'], corners:['Top left','Top right','Bottom left','Bottom right'],
    apply:'Apply & show', close:'Close', back:'Back', next:'Next', saving:'Saving…', error:'Could not save. Tap Apply to retry.', note:'Silent, gentle, and offline.'},
  'zh-CN': {title:'鲸鱼娘', settings:'设置', credits:'致谢', size:'大小', corner:'位置',
    sizes:['小','中','大'], corners:['左上','右上','左下','右下'], apply:'应用并显示',close:'关闭',back:'上一页',next:'下一页',saving:'保存中…',error:'保存失败，点击应用重试。',note:'安静、轻柔，离线陪伴。'}
};
