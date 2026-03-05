// ==UserScript==
// @name         YouTube Pro: Audio Enhancer (Final)
// @namespace    https://github.com/Beyazprens/youtube-pro-audio-ambient
// @version      2.2.7
// @description  Stable, optimized cinema-quality audio enhancer for YouTube
// @author       Beyazprens
// @match        https://www.youtube.com/*
// @license      MIT
// @homepageURL  https://github.com/Beyazprens/youtube-pro-audio-ambient
// @supportURL   https://github.com/Beyazprens/youtube-pro-audio-ambient/issues
// @grant        none
// ==/UserScript==

(() => {
    'use strict';

    let audioCtx;
    let enabled = localStorage.getItem('yt-pro-audio-enabled') === 'true';
    let lastInject = 0;

    /* ===================== CSS ===================== */

    const CSS = `
    .audio-enhance-btn {
        display:inline-flex!important;
        align-items:center;
        justify-content:center;
        width:48px;height:100%;
        cursor:pointer;
        background:none;border:0;
        opacity:.9;
    }
    .audio-enhance-btn:hover { opacity:1; }
    .audio-enhance-btn.active svg {
        fill:#3ea6ff!important;
        filter:drop-shadow(0 0 6px rgba(62,166,255,.8));
    }
    .audio-enhance-btn svg {
        width:26px;height:26px;
        fill:#fff;
        pointer-events:none;
    }`;

    function ensureStyle() {
        if (document.getElementById('yt-pro-audio-style')) return;
        const s = document.createElement('style');
        s.id = 'yt-pro-audio-style';
        s.textContent = CSS;
        document.head.appendChild(s);
    }

    /* ===================== AUDIO ===================== */

    function getCtx() {
        if (!audioCtx) audioCtx = new AudioContext();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        return audioCtx;
    }

    function cleanupChain(video) {
        if (!video?._ytChain) return;

        video._ytChain.forEach(n => {
            try { n.disconnect(); } catch {}
        });

        video._ytChain = null;
        video._ytAudioEnhanced = false;
    }


  function buildChain(video) {
        if (video._ytChain) return;

        const ctx = getCtx();

        if (!video._ytSource || video._ytSource.mediaElement !== video) {
            video._ytSource = ctx.createMediaElementSource(video);
        }

        const source = video._ytSource;

        const lowCut = ctx.createBiquadFilter();
        lowCut.type = "highpass";
        lowCut.frequency.value = 25;

        const sub = ctx.createBiquadFilter();
        sub.type = "lowshelf";
        sub.frequency.value = 65;
        sub.gain.value = 4.5;

        const punch = ctx.createBiquadFilter();
        punch.type = "peaking";
        punch.frequency.value = 95;
        punch.Q.value = 1.2;
        punch.gain.value = 2.5;

        const mudCut = ctx.createBiquadFilter();
        mudCut.type = "peaking";
        mudCut.frequency.value = 300;
        mudCut.Q.value = 0.8;
        mudCut.gain.value = -3.5;

        const presence = ctx.createBiquadFilter();
        presence.type = "peaking";
        presence.frequency.value = 3500;
        presence.Q.value = 1.0;
        presence.gain.value = 2.0;

        const air = ctx.createBiquadFilter();
        air.type = "highshelf";
        air.frequency.value = 11500;
        air.gain.value = 2.5;

        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -15;
        comp.knee.value = 30;
        comp.ratio.value = 2.2;
        comp.attack.value = 0.03;
        comp.release.value = 0.2;

        const gain = ctx.createGain();
        gain.gain.value = 1.15;

        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -0.5;
        limiter.knee.value = 0;
        limiter.ratio.value = 20;
        limiter.attack.value = 0.002;
        limiter.release.value = 0.05;

        try { source.disconnect(); } catch {}

        source
            .connect(lowCut)
            .connect(sub)
            .connect(punch)
            .connect(mudCut)
            .connect(presence)
            .connect(air)
            .connect(comp)
            .connect(gain)
            .connect(limiter)
            .connect(ctx.destination);

        video._ytChain =[lowCut, sub, punch, mudCut, presence, air, comp, gain, limiter];
        video._ytAudioEnhanced = true;
    }

    function disableEnhancer(video) {
        if (!video?._ytSource) return;

        cleanupChain(video);

        try {
            video._ytSource.disconnect();
            video._ytSource.connect(getCtx().destination);
        } catch {}
    }

    /* ===================== UI ===================== */

    function inject() {
        const now = performance.now();
        if (now - lastInject < 300) return;
        lastInject = now;

        const controls = document.querySelector('.ytp-left-controls');
        if (!controls || document.querySelector('.audio-enhance-btn')) return;

        ensureStyle();

        const btn = document.createElement('button');
        btn.className = 'ytp-button audio-enhance-btn';
        btn.title = 'Audio Enhancer';

        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("viewBox", "0 0 24 24");

        const path = document.createElementNS(svgNS, "path");
        path.setAttribute("d", "M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3z");

        svg.appendChild(path);
        btn.appendChild(svg);

        const video = document.querySelector('video');

        if (enabled && video) {
            buildChain(video);
            btn.classList.add('active');
        }

        btn.onclick = e => {
            e.stopPropagation();
            const v = document.querySelector('video');
            if (!v) return;

            if (v._ytAudioEnhanced) {
                disableEnhancer(v);
                btn.classList.remove('active');
                enabled = false;
            } else {
                buildChain(v);
                btn.classList.add('active');
                enabled = true;
            }

            localStorage.setItem('yt-pro-audio-enabled', enabled);
        };

        const timeDisplay = controls.querySelector('.ytp-time-display');
        if (timeDisplay) {
            timeDisplay.insertAdjacentElement('afterend', btn);
        } else {
            controls.appendChild(btn);
        }
    }

    /* ===================== OBSERVERS ===================== */

    const obs = new MutationObserver(inject);

    const waitPlayer = setInterval(() => {
        const player = document.querySelector('#player');
        if (!player) return;
        clearInterval(waitPlayer);
        obs.observe(player, { childList: true, subtree: true, attributes: false });
        inject();
    }, 500);

    window.addEventListener('yt-navigate-finish', () => {
        const video = document.querySelector('video');
        disableEnhancer(video);
        inject();
        if (enabled && video) buildChain(video);
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            inject();
        }
    });

})();
