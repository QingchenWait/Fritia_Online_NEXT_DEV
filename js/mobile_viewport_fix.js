(function () {
    'use strict';

    var DEFAULT_CONTENT = 'width=device-width, initial-scale=1.0, viewport-fit=cover';
    var REPAIR_STEPS = [0, 60, 140, 260, 420];
    var lastOrientation = getOrientation();
    var rememberedPortraitWidth = 0;
    var lastAppliedContent = '';

    function isTouchDevice() {
        return Boolean(('ontouchstart' in window) || navigator.maxTouchPoints > 0 || match('(pointer: coarse)'));
    }

    function match(query) {
        return Boolean(window.matchMedia && window.matchMedia(query).matches);
    }

    function getOrientation() {
        var size = getViewportSize();
        return size.height >= size.width ? 'portrait' : 'landscape';
    }

    function getViewportSize() {
        var vv = window.visualViewport;
        var width = Number(vv && vv.width) || window.innerWidth || document.documentElement.clientWidth || 0;
        var height = Number(vv && vv.height) || window.innerHeight || document.documentElement.clientHeight || 0;
        return { width: width, height: height };
    }

    function getViewportMeta() {
        return document.querySelector('meta[name="viewport"]');
    }

    function normalizeViewportMeta(content) {
        var meta = getViewportMeta();
        if (!meta) return;
        var next = content || DEFAULT_CONTENT;
        if (next === lastAppliedContent && meta.getAttribute('content') === next) return;
        lastAppliedContent = next;
        meta.setAttribute('content', next);
    }

    function getPortraitDeviceWidth() {
        var preferred = Number(rememberedPortraitWidth);
        if (isFinite(preferred) && preferred >= 240 && preferred <= 820) {
            return String(Math.round(preferred));
        }
        var values = [
            Number(window.screen && window.screen.width),
            Number(window.screen && window.screen.height),
            Number(window.screen && window.screen.availWidth),
            Number(window.screen && window.screen.availHeight)
        ].filter(function (value) {
            return isFinite(value) && value >= 240 && value <= 820;
        });
        if (!values.length) {
            values = [
                Number(window.screen && window.screen.width),
                Number(window.screen && window.screen.height),
                Number(window.screen && window.screen.availWidth),
                Number(window.screen && window.screen.availHeight)
            ].filter(function (value) {
                return isFinite(value) && value >= 240 && value <= 1400;
            });
        }
        if (!values.length) return 'device-width';
        return String(Math.round(Math.min.apply(Math, values)));
    }

    function getViewportContentForOrientation(orientation) {
        if (orientation !== 'portrait') return DEFAULT_CONTENT;
        return 'width=' + getPortraitDeviceWidth() + ', initial-scale=1.0, maximum-scale=1.0, viewport-fit=cover';
    }

    function forceViewportReflow() {
        var root = document.documentElement;
        var body = document.body;
        if (!root || !body) return;
        root.style.minWidth = '0';
        body.style.minWidth = '0';
        void root.offsetWidth;
        root.style.removeProperty('min-width');
        body.style.removeProperty('min-width');
    }

    function applyViewportForCurrentOrientation() {
        if (!isTouchDevice()) {
            normalizeViewportMeta(DEFAULT_CONTENT);
            return;
        }
        var orientation = getOrientation();
        if (orientation === 'portrait') rememberPortraitWidth();
        normalizeViewportMeta(getViewportContentForOrientation(orientation));
        forceViewportReflow();
    }

    function rememberPortraitWidth() {
        var size = getViewportSize();
        if (size.height < size.width) return;
        if (size.width < 240 || size.width > 820) return;
        if (!rememberedPortraitWidth || size.width < rememberedPortraitWidth) {
            rememberedPortraitWidth = size.width;
        }
    }

    function schedulePortraitRepair() {
        if (!isTouchDevice()) return;
        REPAIR_STEPS.forEach(function (delay) {
            window.setTimeout(function () {
                if (getOrientation() === 'portrait') applyViewportForCurrentOrientation();
            }, delay);
        });
    }

    function handleViewportChange() {
        if (!isTouchDevice()) return;
        var next = getOrientation();
        if (lastOrientation === 'landscape' && next === 'portrait') {
            schedulePortraitRepair();
        } else {
            applyViewportForCurrentOrientation();
        }
        lastOrientation = next;
    }

    rememberPortraitWidth();
    applyViewportForCurrentOrientation();
    window.addEventListener('orientationchange', handleViewportChange, { passive: true });
    window.addEventListener('resize', handleViewportChange, { passive: true });
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', handleViewportChange, { passive: true });
    }
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) handleViewportChange();
    });
})();
