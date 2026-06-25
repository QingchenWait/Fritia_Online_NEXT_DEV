/* =============================================================
   芙提雅 ONLINE NEXT — 移动端横屏交互系统（独立模块）
   -------------------------------------------------------------
   本文件是「移动端横屏专用 UI 交互逻辑」的唯一检测入口。
   职责：仅在「触屏设备 + 横屏」时给 <html> 挂上 `ml-active`，
   并把真实视口尺寸写入 CSS 变量，供 css/mobile_landscape.css 使用。

   设计原则（务必遵守，详见 UI_MOBILE.md）：
   - 完全独立、可一键移除：本文件 + css/mobile_landscape.css 是闭环，
     删掉 index.html 里两行引用即可彻底还原桌面端/竖屏行为。
   - 本文件「只」负责切换根 class 与写 CSS 变量，不直接改任何浮层布局
     （布局全部在 css/mobile_landscape.css，挂在 html.ml-active 下）。
   - 桌面端、移动端竖屏：永远不会被加上 ml-active，行为零改动。

   调试开关（仅用于桌面对照测试，不影响真机判定）：
   - URL 参数 `?ml=1` 强制开启 / `?ml=0` 强制关闭；
   - localStorage `fritia_force_ml` = '1' / '0' 同义，优先级低于 URL。
   ============================================================= */
(function () {
    'use strict';

    var ROOT = document.documentElement;
    var SHORT_H = 400;       // 视口高度 ≤ 此值视为「矮屏」，进一步压缩
    var ULTRA_AR = 2.1;      // 宽高比 ≥ 此值视为「超宽」(≈19:9 以上)
    var lastActive = null;

    /* ---------- 强制开关 ---------- */
    function forcedMode() {
        var v = null;
        try {
            var q = new URLSearchParams(window.location.search).get('ml');
            if (q === '1' || q === '0') v = q;
            if (v === null) {
                var ls = window.localStorage.getItem('fritia_force_ml');
                if (ls === '1' || ls === '0') v = ls;
            }
        } catch (e) { /* 隐私模式等忽略 */ }
        return v; // '1' | '0' | null
    }

    /* ---------- 设备 / 朝向判定 ---------- */
    function matches(q) {
        return Boolean(window.matchMedia && window.matchMedia(q).matches);
    }

    // 手机 + 平板（触屏设备）。粗指针是最稳的信号；叠加 touch + 移动 UA 兜底 WebView。
    function isMobileDevice() {
        if (matches('(pointer: coarse)')) return true;
        var hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        var ua = navigator.userAgent || '';
        var mobileUa = /Android|iPhone|iPad|iPod|HarmonyOS|Mobile|; *wv|Windows Phone/i.test(ua);
        return hasTouch && mobileUa;
    }

    function viewport() {
        var vv = window.visualViewport;
        var w = (vv && vv.width) || window.innerWidth || ROOT.clientWidth || 0;
        var h = (vv && vv.height) || window.innerHeight || ROOT.clientHeight || 0;
        return { w: w, h: h };
    }

    function isLandscape(vp) {
        if (matches('(orientation: landscape)')) return true;
        if (matches('(orientation: portrait)')) return false;
        return vp.w >= vp.h; // 兜底
    }

    /* ---------- 应用状态 ---------- */
    function apply() {
        var vp = viewport();
        var forced = forcedMode();
        var active;
        if (forced === '1') active = true;
        else if (forced === '0') active = false;
        else active = isMobileDevice() && isLandscape(vp);

        // 把真实视口尺寸写入 CSS 变量（解决移动浏览器 100vh 抖动；横屏布局据此 clamp 缩放）
        var hPx = Math.max(1, Math.round(vp.h));
        var wPx = Math.max(1, Math.round(vp.w));
        ROOT.style.setProperty('--ml-vh', (vp.h / 100) + 'px');
        ROOT.style.setProperty('--ml-vw', (vp.w / 100) + 'px');
        ROOT.style.setProperty('--ml-h', hPx + 'px');
        ROOT.style.setProperty('--ml-w', wPx + 'px');

        var aspect = vp.h > 0 ? vp.w / vp.h : 1;
        ROOT.classList.toggle('ml-active', active);
        ROOT.classList.toggle('ml-short', active && vp.h <= SHORT_H);
        ROOT.classList.toggle('ml-ultrawide', active && aspect >= ULTRA_AR);

        syncRoundtable(active);

        if (active !== lastActive) {
            lastActive = active;
            try {
                window.dispatchEvent(new CustomEvent('ml-mode-changed', { detail: { active: active } }));
            } catch (e) { /* 老内核忽略 */ }
        }
    }

    /* ---------- 圆桌密语：进入群聊后的 DOM 搬移（CSS 无法重新挂载，故用 JS） ----------
       群聊步：① 把「圆桌密语进行中」状态文字搬到标题区当副标题；
              ② 把底栏右下角的时间/警告/错误浮窗搬到左栏（+/-/返回 按钮组下方）；
              ③ 给面板加 .ml-rt-chat（CSS 据此隐藏底栏、让位副标题）。
       退出群聊 / 关闭横屏模式时原样还原。仅在 ml-active 下生效。 */
    var rtMoved = false;
    var rtHomes = []; // [{node, parent, next}]

    function rtRecord(node) {
        if (node) rtHomes.push({ node: node, parent: node.parentNode, next: node.nextSibling });
    }

    function syncRoundtable(active) {
        var panel = document.getElementById('roundtable-whispers-panel');
        if (!panel) return;
        var chat = document.getElementById('roundtable-step-chat');
        var titles = panel.querySelector('.otome-panel__titles');
        var roster = panel.querySelector('.roundtable-roster');
        var status = document.getElementById('roundtable-chat-status');
        var timebar = panel.querySelector('.roundtable-foot-timebar');
        var popover = document.getElementById('roundtable-bug-popover');

        var chatVisible = active
            && chat && !chat.classList.contains('hidden')
            && !panel.classList.contains('hidden');

        if (chatVisible && !rtMoved && titles && roster) {
            rtHomes = [];
            if (status) { rtRecord(status); titles.appendChild(status); }
            if (timebar) { rtRecord(timebar); roster.appendChild(timebar); }
            // 错误浮窗 position:fixed，移出底栏避免被隐藏的底栏 display:none 连带隐藏
            if (popover) { rtRecord(popover); panel.querySelector('.otome-panel').appendChild(popover); }
            panel.classList.add('ml-rt-chat');
            rtMoved = true;
        } else if (!chatVisible && rtMoved) {
            for (var i = rtHomes.length - 1; i >= 0; i--) {
                var h = rtHomes[i];
                if (h.parent) h.parent.insertBefore(h.node, h.next);
            }
            rtHomes = [];
            panel.classList.remove('ml-rt-chat');
            rtMoved = false;
        }
    }

    // 监听圆桌在「设置↔群聊」之间切换（不一定伴随 resize），及时重排
    function watchRoundtable() {
        var panel = document.getElementById('roundtable-whispers-panel');
        var chat = document.getElementById('roundtable-step-chat');
        if (!panel || !chat || !window.MutationObserver) return;
        var mo = new MutationObserver(function () {
            syncRoundtable(ROOT.classList.contains('ml-active'));
        });
        mo.observe(chat, { attributes: true, attributeFilter: ['class'] });
        mo.observe(panel, { attributes: true, attributeFilter: ['class'] });
    }

    /* ---------- rAF 去抖 ---------- */
    var scheduled = false;
    function schedule() {
        if (scheduled) return;
        scheduled = true;
        var run = function () { scheduled = false; apply(); };
        if (window.requestAnimationFrame) window.requestAnimationFrame(run);
        else window.setTimeout(run, 16);
    }

    /* ---------- 对外只读接口（供战斗 JS 读取，不暴露写能力） ---------- */
    window.FritiaMobileLandscape = {
        isActive: function () { return ROOT.classList.contains('ml-active'); },
        refresh: schedule
    };

    /* ---------- 事件绑定 ---------- */
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('orientationchange', schedule, { passive: true });
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', schedule, { passive: true });
    }
    // 朝向媒体查询变化（部分内核 resize 不触发）
    if (window.matchMedia) {
        var mq = window.matchMedia('(orientation: landscape)');
        var onMq = function () { schedule(); };
        if (mq.addEventListener) mq.addEventListener('change', onMq);
        else if (mq.addListener) mq.addListener(onMq);
    }

    apply();
    watchRoundtable();
    // 进入全屏 / 旋转后尺寸可能延迟稳定，补一拍
    window.setTimeout(schedule, 300);
})();
