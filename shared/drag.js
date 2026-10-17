// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

// Generated from the SDK gesture helper by build.js.
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
