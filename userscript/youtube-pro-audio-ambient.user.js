// ==UserScript==
// @name         YouTube Pro: Audio Enhancer (Final)
// @namespace    https://github.com/Beyazprens/youtube-pro-audio-ambient
// @version      2.5.1
// @description  Cinema-quality audio enhancer + slowed reverb for YouTube (run independently or together)
// @author       Beyazprens
// @match        https://www.youtube.com/*
// @license      MIT
// @homepageURL  https://github.com/Beyazprens/youtube-pro-audio-ambient
// @supportURL   https://github.com/Beyazprens/youtube-pro-audio-ambient/issues
// @grant        none
// @downloadURL https://update.greasyfork.org/scripts/559816/YouTube%20Pro%3A%20Audio%20Enhancer%20%28Final%29.user.js
// @updateURL https://update.greasyfork.org/scripts/559816/YouTube%20Pro%3A%20Audio%20Enhancer%20%28Final%29.meta.js
// ==/UserScript==

(() => {
    'use strict';

    /* ===================== STATE ===================== */

    let audioCtx;

    let enhancerEnabled     = localStorage.getItem('yt-pro-audio-enabled')  === 'true';
    let slowedReverbEnabled = localStorage.getItem('yt-pro-slowed-enabled') === 'true';
    let lastInject = 0;

    // SR persistent nodes (convolver is expensive — built once, reused)
    let srReverbNode = null;
    let srConnected  = false;

    /* ===================== CSS ===================== */

    const CSS = `
    /* ── shared button base ── */
    .yt-pro-btn {
        display: inline-flex !important;
        align-items: center;
        justify-content: center;
        width: 44px; height: 100%;
        cursor: pointer;
        background: none; border: 0;
        opacity: .85;
        transition: opacity .2s ease;
    }
    .yt-pro-btn:hover { opacity: 1; }
    .yt-pro-btn svg {
        width: 24px; height: 24px;
        pointer-events: none;
        transition: fill .25s ease, filter .25s ease;
    }

    /* ── Audio Enhancer — blue, with fade-pulse when active ── */
    .audio-enhance-btn svg { fill: #fff; }

    .audio-enhance-btn.active svg {
        fill: #3ea6ff !important;
        filter: drop-shadow(0 0 5px rgba(62,166,255,.9));
        animation: yt-pro-fade-pulse 2.4s ease-in-out infinite;
    }

    @keyframes yt-pro-fade-pulse {
        0%,100% { opacity: 1;   filter: drop-shadow(0 0 4px rgba(62,166,255,.7)); }
        50%      { opacity: .55; filter: drop-shadow(0 0 11px rgba(62,166,255,1)); }
    }

    /* when BOTH effects are active → dual-colour shimmer */
    .audio-enhance-btn.active.both svg {
        fill: #80d8ff !important;
        animation: yt-pro-fade-pulse-both 2.4s ease-in-out infinite;
    }
    @keyframes yt-pro-fade-pulse-both {
        0%,100% {
            opacity: 1;
            filter: drop-shadow(0 0 5px rgba(62,166,255,.8))
                    drop-shadow(0 0 5px rgba(206,147,216,.5));
        }
        50% {
            opacity: .55;
            filter: drop-shadow(0 0 12px rgba(62,166,255,1))
                    drop-shadow(0 0 9px rgba(206,147,216,.95));
        }
    }

    /* ── Slowed Reverb (Lo-fi) — white idle, red fill + glow when active ── */
    .slowed-reverb-btn svg {
        fill: #fff;
        transition: fill .25s ease, filter .25s ease;
    }

    .slowed-reverb-btn.active svg {
        fill: #ff5252 !important;
        filter: drop-shadow(0 0 6px rgba(255,82,82,.9));
        animation: yt-pro-lofi-pulse 2.8s ease-in-out infinite;
    }
    @keyframes yt-pro-lofi-pulse {
        0%,100% {
            opacity: 1;
            filter: drop-shadow(0 0 4px rgba(255,82,82,.75));
        }
        50% {
            opacity: .55;
            filter: drop-shadow(0 0 12px rgba(255,82,82,1))
                    drop-shadow(0 0 6px rgba(255,160,160,.7));
        }
    }
    `;

    function ensureStyle() {
        if (document.getElementById('yt-pro-audio-style')) return;
        const s = document.createElement('style');
        s.id = 'yt-pro-audio-style';
        s.textContent = CSS;
        document.head.appendChild(s);
    }

    /* ===================== AUDIO CONTEXT ===================== */

    function getCtx() {
        if (!audioCtx) audioCtx = new AudioContext();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        return audioCtx;
    }

    function ensureSource(video) {
        const ctx = getCtx();
        if (!video._ytSource || video._ytSource.mediaElement !== video) {
            video._ytSource = ctx.createMediaElementSource(video);
        }
        return video._ytSource;
    }

    /* ===================== GRAPH REBUILD =====================
     *
     *  Every toggle calls rebuildGraph() which fully tears down and rewires:
     *
     *  A) Neither  → source ──────────────────────────────► dest
     *
     *  B) Enhancer → source → [EQ × 5] → comp → gain → lim ► dest
     *
     *  C) Lo-fi    → source ──► gainNode(0.6) ──────────────► dest
     *                       └──► reverbNode ─────────────────► dest
     *             + playbackRate 0.9
     *
     *  D) Both     → source → [EQ × 5] → comp → gain → lim ──► gainNode(0.6) ──► dest
     *                                                       └──► reverbNode ──────► dest
     *             + playbackRate 0.9
     *
     * ============================================================ */

    function rebuildGraph(video) {
        if (!video) return;

        const ctx    = getCtx();
        const source = ensureSource(video);

        // — Tear everything down —
        try { source.disconnect(); } catch {}
        if (video._ytChain) {
            video._ytChain.forEach(n => { try { n.disconnect(); } catch {} });
            video._ytChain = null;
        }
        if (srReverbNode) { try { srReverbNode.disconnect(); } catch {} }
        srConnected            = false;
        video._ytAudioEnhanced = false;
        video._ytSlowedReverb  = false;

        // — Playback rate —
        if (slowedReverbEnabled) {
            video.preservesPitch = false;
            video.playbackRate   = 0.9;
        } else {
            video.preservesPitch = true;
            video.playbackRate   = 1.0;
        }

        // — A: passthrough —
        if (!enhancerEnabled && !slowedReverbEnabled) {
            source.connect(ctx.destination);
            return;
        }

        // — Build EQ + dynamics chain (shared by B and D) —
        let tail = source;

        if (enhancerEnabled) {
            const sub = ctx.createBiquadFilter();
            sub.type = 'lowshelf'; sub.frequency.value = 95; sub.gain.value = 6.5;

            const impact = ctx.createBiquadFilter();
            impact.type = 'peaking'; impact.frequency.value = 60;
            impact.Q.value = 1.0; impact.gain.value = 3.0;

            const cut = ctx.createBiquadFilter();
            cut.type = 'peaking'; cut.frequency.value = 350;
            cut.Q.value = 1.2; cut.gain.value = -2.5;

            const presence = ctx.createBiquadFilter();
            presence.type = 'peaking'; presence.frequency.value = 3000;
            presence.Q.value = 1.0; presence.gain.value = 1.8;

            const high = ctx.createBiquadFilter();
            high.type = 'highshelf'; high.frequency.value = 9000; high.gain.value = -1.5;

            const comp = ctx.createDynamicsCompressor();
            comp.threshold.value = -24; comp.knee.value = 30;
            comp.ratio.value = 3.5; comp.attack.value = 0.03; comp.release.value = 0.2;

            const makeupGain = ctx.createGain();
            makeupGain.gain.value = 1.05;

            const limiter = ctx.createDynamicsCompressor();
            limiter.threshold.value = -1; limiter.knee.value = 0;
            limiter.ratio.value = 20; limiter.attack.value = 0.003; limiter.release.value = 0.05;

            tail.connect(sub)
                .connect(impact).connect(cut).connect(presence)
                .connect(high).connect(comp).connect(makeupGain).connect(limiter);

            video._ytChain = [sub, impact, cut, presence, high, comp, makeupGain, limiter];
            video._ytAudioEnhanced = true;
            tail = limiter;
        }

        // — Wire reverb section (C and D share this) —
        if (slowedReverbEnabled) {
            if (!srReverbNode) {
                srReverbNode = ctx.createConvolver();
                const len     = 1 * ctx.sampleRate;
                const impulse = ctx.createBuffer(2, len, ctx.sampleRate);
                for (let ch = 0; ch < 2; ch++) {
                    const d = impulse.getChannelData(ch);
                    for (let i = 0; i < len; i++) {
                        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
                    }
                }
                srReverbNode.buffer = impulse;
            }

            const srGain = ctx.createGain();
            srGain.gain.setValueAtTime(0.6, ctx.currentTime);

            // dry path
            tail.connect(srGain);
            srGain.connect(ctx.destination);

            // wet path
            tail.connect(srReverbNode);
            srReverbNode.connect(ctx.destination);

            srConnected           = true;
            video._ytSlowedReverb = true;
        } else {
            // No reverb — tail goes straight to output
            tail.connect(ctx.destination);
        }
    }

    /* ===================== SVG HELPERS ===================== */

    const _svgNS = 'http://www.w3.org/2000/svg';

    function _el(tag, attrs) {
        const e = document.createElementNS(_svgNS, tag);
        Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
        return e;
    }

    function makeLofiSVG() {
        const svg = document.createElementNS(_svgNS, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        // All child elements inherit fill from the SVG element itself,
        // which is controlled by the CSS `.slowed-reverb-btn svg { fill }` rule.

        // Headband arc
        const band = document.createElementNS(_svgNS, 'path');
        band.setAttribute('d', 'M12 3C7.03 3 3 7.03 3 12v1h2v-1c0-3.87 3.13-7 7-7s7 3.13 7 7v1h2v-1c0-4.97-4.03-9-9-9z');
        svg.appendChild(band);

        // Left ear-cup
        const lcup = document.createElementNS(_svgNS, 'rect');
        lcup.setAttribute('x', '2'); lcup.setAttribute('y', '13');
        lcup.setAttribute('width', '4'); lcup.setAttribute('height', '6');
        lcup.setAttribute('rx', '1.5');
        svg.appendChild(lcup);

        // Right ear-cup
        const rcup = document.createElementNS(_svgNS, 'rect');
        rcup.setAttribute('x', '18'); rcup.setAttribute('y', '13');
        rcup.setAttribute('width', '4'); rcup.setAttribute('height', '6');
        rcup.setAttribute('rx', '1.5');
        svg.appendChild(rcup);

        return svg;
    }

    /** Original music-note icon for the Enhancer button */
    function makeEnhancerSVG() {
        const svg = document.createElementNS(_svgNS, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        const p = document.createElementNS(_svgNS, 'path');
        p.setAttribute('d', 'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3z');
        svg.appendChild(p);
        return svg;
    }

    /** Toggle the .both class on the enhancer button */
    function syncBothClass() {
        const btn = document.querySelector('.audio-enhance-btn');
        if (!btn) return;
        btn.classList.toggle('both', enhancerEnabled && slowedReverbEnabled);
    }

    /* ===================== UI INJECTION ===================== */

    function inject() {
        const now = performance.now();
        if (now - lastInject < 300) return;
        lastInject = now;

        const controls = document.querySelector('.ytp-left-controls');
        if (!controls) return;

        ensureStyle();

        const video = document.querySelector('video');

        // ── Lo-fi / Slowed Reverb button (LEFT) ──────────────────────────────
        if (!document.querySelector('.slowed-reverb-btn')) {
            const srBtn = document.createElement('button');
            srBtn.className = 'ytp-button yt-pro-btn slowed-reverb-btn';
            srBtn.title = 'Lo-fi / Slowed Reverb';
            srBtn.appendChild(makeLofiSVG());

            if (slowedReverbEnabled && video) {
                rebuildGraph(video);
                srBtn.classList.add('active');
            }

            srBtn.onclick = e => {
                e.stopPropagation();
                const v = document.querySelector('video');
                if (!v) return;
                slowedReverbEnabled = !slowedReverbEnabled;
                localStorage.setItem('yt-pro-slowed-enabled', slowedReverbEnabled);
                rebuildGraph(v);
                srBtn.classList.toggle('active', slowedReverbEnabled);
                syncBothClass();
            };

            const existingEnhBtn = controls.querySelector('.audio-enhance-btn');
            const timeDisplay    = controls.querySelector('.ytp-time-display');

            if (existingEnhBtn) {
                controls.insertBefore(srBtn, existingEnhBtn);
            } else if (timeDisplay) {
                timeDisplay.insertAdjacentElement('afterend', srBtn);
            } else {
                controls.appendChild(srBtn);
            }
        }

        // ── Audio Enhancer button (RIGHT) ─────────────────────────────────────
        if (!document.querySelector('.audio-enhance-btn')) {
            const btn = document.createElement('button');
            btn.className = 'ytp-button yt-pro-btn audio-enhance-btn';
            btn.title = 'Audio Enhancer';
            btn.appendChild(makeEnhancerSVG());

            if (enhancerEnabled && video) {
                rebuildGraph(video);
                btn.classList.add('active');
            }

            btn.onclick = e => {
                e.stopPropagation();
                const v = document.querySelector('video');
                if (!v) return;
                enhancerEnabled = !enhancerEnabled;
                localStorage.setItem('yt-pro-audio-enabled', enhancerEnabled);
                rebuildGraph(v);
                btn.classList.toggle('active', enhancerEnabled);
                syncBothClass();
            };

            const srBtn       = controls.querySelector('.slowed-reverb-btn');
            const timeDisplay = controls.querySelector('.ytp-time-display');

            if (srBtn) {
                srBtn.insertAdjacentElement('afterend', btn);
            } else if (timeDisplay) {
                timeDisplay.insertAdjacentElement('afterend', btn);
            } else {
                controls.appendChild(btn);
            }

            syncBothClass();
        }
    }

    /* ===================== OBSERVERS & LIFECYCLE ===================== */

    const obs = new MutationObserver(inject);

    const waitPlayer = setInterval(() => {
        const player = document.querySelector('#player');
        if (!player) return;
        clearInterval(waitPlayer);
        obs.observe(player, { childList: true, subtree: true, attributes: false });
        inject();
    }, 500);

    window.addEventListener('yt-navigate-finish', () => {
        // New page = potentially new video element → reset all cached nodes
        srReverbNode = null;
        srConnected  = false;

        const video = document.querySelector('video');
        if (video) {
            video._ytSource        = null;
            video._ytChain         = null;
            video._ytAudioEnhanced = false;
            video._ytSlowedReverb  = false;
        }

        inject();

        const v = document.querySelector('video');
        if (v && (enhancerEnabled || slowedReverbEnabled)) rebuildGraph(v);
        syncBothClass();
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') inject();
    });

})();
