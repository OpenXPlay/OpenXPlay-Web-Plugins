// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16
const topics = ['session', 'nowPlaying', 'call', 'activity', 'route', 'motion', 'parked', 'audioSource'];
const object = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const number = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
function topicValue(topic, v) {
    if (v === null)
        return true;
    if (!object(v))
        return false;
    if (topic === 'motion')
        return (v.speedMps === null || number(v.speedMps)) && (v.accuracyM === null || number(v.accuracyM)) && ['geolocation', 'vehicle', null].includes(v.source);
    if (topic === 'parked')
        return ['parked', 'moving', 'unknown'].includes(String(v.state)) && ['speed', 'user', null].includes(v.confirmedBy);
    if (topic === 'audioSource')
        return v.appName === null || typeof v.appName === 'string';
    if (topic === 'route')
        return typeof v.active === 'boolean' && [v.destination, v.appName].every(x => x === null || typeof x === 'string') && [v.etaMs, v.distanceRemainingM].every(x => x === null || number(x)) && (v.maneuver === null || object(v.maneuver) && (v.maneuver.type === null || number(v.maneuver.type) && Number.isInteger(v.maneuver.type) && v.maneuver.type <= 255) && (v.maneuver.road === null || typeof v.maneuver.road === 'string') && (v.maneuver.distanceM === null || number(v.maneuver.distanceM)));
    if (topic === 'session')
        return v.carplay === 'connected' || v.carplay === 'disconnected';
    if (topic === 'call')
        return ['idle', 'ringing', 'dialing', 'active', 'held', 'ending'].includes(String(v.state));
    if (topic === 'activity')
        return ['siri', 'phoneCall', 'navigation'].every(k => typeof v[k] === 'boolean');
    return ['title', 'artist', 'album'].every(k => typeof v[k] === 'string') && ['durationMs', 'elapsedMs', 'rate'].every(k => number(v[k])) && typeof v.playing === 'boolean';
}
export function connect() {
    return new Promise((resolve, reject) => {
        if (window.parent === window) {
            reject(new Error('Plugin must run inside the host'));
            return;
        }
        let ready = false, counter = 0, closed = false;
        let parked = 'unknown', locale = 'en', theme = 'dark', reducedMotion = false;
        const state = {};
        let availableTopics = [];
        function setTopics(value) {
            if (!Array.isArray(value) || !value.every(t => topics.includes(t)))
                return;
            availableTopics = [...new Set(value)];
            for (const topic of topics)
                if (!availableTopics.includes(topic))
                    delete state[topic];
            if (ready)
                emit('topics', [...availableTopics]);
        }
        const listeners = new Map();
        const pending = new Map();
        function emit(key, value) { for (const fn of listeners.get(key) ?? []) {
            try {
                fn(value);
            }
            catch (error) {
                console.error(error);
            }
        } }
        function on(key, fn) {
            const set = listeners.get(key) ?? new Set();
            set.add(fn);
            listeners.set(key, set);
            return () => { set.delete(fn); };
        }
        function send(type, data = {}) { if (!closed)
            window.parent.postMessage({ oxp: 'plugin/0', type, ...data }, '*'); }
        function request(type, value) {
            if (closed)
                return Promise.reject(new Error('Disconnected'));
            const id = String(++counter);
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => { pending.delete(id); reject(new Error('Storage timed out')); }, 10000);
                pending.set(id, { resolve, reject, timer });
                send(type, { id, ...(value === undefined ? {} : { value }) });
            });
        }
        const drags = new Set();
        const surface = { id: '', kind: 'companion', w: 0, h: 0, visible: true, calm: false,
            get size() { return { w: surface.w, h: surface.h }; },
            enableDrag: (element, options) => {
                const off = enableDragGesture(element, move => { if (surface.kind === 'companion')
                    send('surface-request', { move }); }, options);
                const dispose = () => { off(); drags.delete(dispose); };
                drags.add(dispose);
                return dispose;
            },
            onChange: fn => on('surface', fn), open: surface => send('open', { surface }), close: () => send('close'), request: options => send('surface-request', options) };
        function geometry(m) {
            const video = m.video;
            if (object(video) && ['x', 'y'].every(k => typeof video[k] === 'number' && Number.isFinite(video[k])) && number(video.w) && number(video.h))
                surface.video = video;
            if (object(m.viewport) && number(m.viewport.w) && number(m.viewport.h))
                surface.viewport = m.viewport;
            if (typeof m.closing === 'boolean')
                surface.closing = m.closing;
            if (typeof m.anchor === 'string' && ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'left', 'right', 'top', 'bottom'].includes(m.anchor))
                surface.anchor = m.anchor;
        }
        const connection = { state, get topics() { return [...availableTopics]; }, available: topic => availableTopics.includes(topic), on: on,
            storage: { get: () => request('storage-get'), set: value => {
                    if (!object(value))
                        return Promise.reject(new Error('Storage requires a JSON object'));
                    try {
                        JSON.stringify(value);
                    }
                    catch {
                        return Promise.reject(new Error('Storage requires JSON'));
                    }
                    return request('storage-set', value);
                } }, surface,
            quickActions: { on: (id, fn) => on(`quick:${id}`, fn), setState: (id, value) => {
                    if (value.badge !== undefined && [...value.badge].length > 3)
                        throw new Error('Badge exceeds three characters');
                    send('quick-action-state', { id, ...value });
                } }, get parked() { return parked; }, get locale() { return locale; }, get theme() { return theme; }, get reducedMotion() { return reducedMotion; },
            onArtwork: fn => on('artwork', fn), disconnect: () => {
                for (const off of drags)
                    off();
                closed = true;
                window.removeEventListener('message', receive);
                clearTimeout(timeout);
                for (const p of pending.values()) {
                    clearTimeout(p.timer);
                    p.reject(new Error('Disconnected'));
                }
                pending.clear();
                listeners.clear();
            } };
        const timeout = setTimeout(() => { connection.disconnect(); reject(new Error('Host handshake timed out')); }, 10000);
        function receive(event) {
            if (event.source !== window.parent || !object(event.data) || event.data.oxp !== 'plugin/0')
                return;
            const m = event.data;
            if (m.type === 'ping' && number(m.seq)) {
                send('pong', { seq: m.seq });
                return;
            }
            if (m.type === 'welcome' && !ready) {
                if (m.spec !== undefined && m.spec !== 'oxp-web-plugin/0') {
                    connection.disconnect();
                    reject(new Error('Unsupported host spec'));
                    return;
                }
                if (!object(m.surface) || typeof m.surface.id !== 'string' || !['companion', 'ambient', 'panel', 'fullscreen'].includes(String(m.surface.kind)) || !number(m.surface.w) || !number(m.surface.h) || !object(m.state) || !Array.isArray(m.permissions) || typeof m.locale !== 'string' || !['light', 'dark'].includes(String(m.theme)) || typeof m.reducedMotion !== 'boolean' || !['confirmed', 'unknown'].includes(String(m.parked)))
                    return;
                Object.assign(surface, m.surface);
                geometry(m);
                locale = m.locale;
                theme = m.theme;
                reducedMotion = m.reducedMotion;
                parked = m.parked;
                for (const topic of topics)
                    if (Object.hasOwn(m.state, topic) && topicValue(topic, m.state[topic]))
                        Object.assign(state, { [topic]: m.state[topic] });
                setTopics(m.topics ?? Object.keys(state));
                ready = true;
                clearTimeout(timeout);
                resolve(connection);
                return;
            }
            if (!ready)
                return;
            if (m.type === 'topics')
                setTopics(m.topics);
            if (m.type === 'state' && topics.includes(m.topic) && topicValue(m.topic, m.value)) {
                Object.assign(state, { [m.topic]: m.value });
                emit(m.topic, m.value);
            }
            if (m.type === 'surface' && number(m.w) && number(m.h) && typeof m.visible === 'boolean' && typeof m.calm === 'boolean') {
                Object.assign(surface, { w: m.w, h: m.h, visible: m.visible, calm: m.calm });
                geometry(m);
                if (typeof m.locale === 'string')
                    locale = m.locale;
                if (m.theme === 'dark' || m.theme === 'light')
                    theme = m.theme;
                if (typeof m.reducedMotion === 'boolean')
                    reducedMotion = m.reducedMotion;
                emit('surface', surface);
            }
            if (m.type === 'parked' && (m.value === 'confirmed' || m.value === 'unknown')) {
                parked = m.value;
                emit('surface', surface);
            }
            if (m.type === 'quick-action' && typeof m.id === 'string')
                emit(`quick:${m.id}`, undefined);
            if (m.type === 'artwork' && typeof ImageBitmap !== 'undefined' && m.bitmap instanceof ImageBitmap)
                emit('artwork', m.bitmap);
            if (['storage', 'storage-ok', 'error'].includes(String(m.type)) && typeof m.id === 'string') {
                const p = pending.get(m.id);
                if (!p)
                    return;
                clearTimeout(p.timer);
                pending.delete(m.id);
                if (m.type === 'error')
                    p.reject(new Error(String(m.code)));
                else if (m.type === 'storage' && (m.value === null || object(m.value)))
                    p.resolve(m.value);
                else if (m.type === 'storage-ok')
                    p.resolve(undefined);
                else
                    p.reject(new Error('Invalid storage response'));
            }
        }
        window.addEventListener('message', receive);
        send('hello', { spec: 'oxp-web-plugin/0', sdk: '0.1.0' });
    });
}
// Screen deltas remain stable when the containing iframe moves under the pointer.
export function enableDragGesture(element, report, options = {}) {
    let pointer, x = 0, y = 0, clientX = 0, clientY = 0, dx = 0, dy = 0, active = false, suppress = false;
    const previousTouchAction = element.style.touchAction;
    element.style.touchAction = 'none';
    function down(e) {
        if (pointer !== undefined || e.button !== 0 || e.isPrimary === false)
            return;
        pointer = e.pointerId;
        x = e.screenX;
        y = e.screenY;
        clientX = e.clientX;
        clientY = e.clientY;
        dx = dy = 0;
        active = false;
        suppress = false;
        element.setPointerCapture(pointer);
    }
    function move(e) {
        if (pointer !== e.pointerId)
            return;
        dx = e.screenX - x;
        dy = e.screenY - y;
        if (!active) {
            // Before activation, local coordinates measure CSS pixels even in a scaled simulator.
            // Once the frame follows the pointer, only screen deltas remain stable.
            const tx = Number.isFinite(e.clientX - clientX) ? e.clientX - clientX : dx;
            const ty = Number.isFinite(e.clientY - clientY) ? e.clientY - clientY : dy;
            if (Math.hypot(tx, ty) <= (options.tolerancePx ?? 8))
                return;
            active = true;
            suppress = true;
            report({ phase: 'start', dx: 0, dy: 0 });
        }
        e.preventDefault();
        report({ phase: 'move', dx, dy });
    }
    function finish(e) {
        if (pointer === undefined || e && e.pointerId !== pointer)
            return;
        if (e?.type === 'pointercancel' || e?.type === 'lostpointercapture')
            suppress = true;
        if (active)
            report({ phase: 'end', dx, dy });
        const id = pointer;
        pointer = undefined;
        active = false;
        if (element.hasPointerCapture(id))
            element.releasePointerCapture(id);
    }
    function click(e) { if (suppress && e.detail !== 0) {
        suppress = false;
        e.preventDefault();
        e.stopImmediatePropagation();
    } }
    function context(e) { e.preventDefault(); }
    element.addEventListener('pointerdown', down);
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', finish);
    element.addEventListener('pointercancel', finish);
    element.addEventListener('lostpointercapture', finish);
    element.addEventListener('click', click, true);
    element.addEventListener('contextmenu', context);
    return () => {
        finish();
        element.style.touchAction = previousTouchAction;
        element.removeEventListener('pointerdown', down);
        element.removeEventListener('pointermove', move);
        element.removeEventListener('pointerup', finish);
        element.removeEventListener('pointercancel', finish);
        element.removeEventListener('lostpointercapture', finish);
        element.removeEventListener('click', click, true);
        element.removeEventListener('contextmenu', context);
    };
}
