// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

const en = { title:'Quiet Lights', hint:'A little atmosphere for the margins.', progress:'Song progress', album:'Album glow', sky:'Day / night sky', on:'Lights on', off:'Lights off', brightness:'Brightness', low:'Soft', medium:'Warm', high:'Bright', start:'Apply & show lights', cozy:'Cozy fireplace', close:'Close', soundOff:'Crackle: off', soundOn:'Crackle: on', parked:'Confirm parked mode in the host to open Cozy.', idle:'A quiet moment', noArtist:'Settle in and enjoy the warmth', failed:'Could not save. Please try again.', saved:'Saved', audioFailed:'Sound unavailable', note:'The host clips light to available margins. Pin Lights in the launcher for a quick toggle.', back:'Back', next:'More options' };
const zh = { title:'静谧光景', hint:'为画面留白添一点温度。', progress:'歌曲进度光带', album:'封面氛围光', sky:'日夜天空', on:'光景已开启', off:'光景已关闭', brightness:'亮度', low:'柔和', medium:'温暖', high:'明亮', start:'应用并显示光景', cozy:'温馨壁炉', close:'关闭', soundOff:'柴火声：关', soundOn:'柴火声：开', parked:'请先在主界面确认驻车，再打开壁炉。', idle:'静享此刻', noArtist:'坐下来，享受这一刻的温暖', failed:'保存失败，请重试。', saved:'已保存', audioFailed:'声音不可用', note:'光景仅显示在可用留白中。可在启动面板固定「光景」以便快速开关。', back:'返回', next:'更多选项' };
export function strings(locale) { return /^zh(?:-|$)/i.test(locale) ? zh : en; }
