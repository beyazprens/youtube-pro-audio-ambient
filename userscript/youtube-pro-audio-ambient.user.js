// ==UserScript==
// @name         YouTube Pro: Audio Enhancer (DEV)
// @namespace    https://github.com/Beyazprens/youtube-pro-audio-ambient
// @version      2.2.8
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

        // ===== INPUT STAGE =====
        // Girişte hafif boost — kaynak sinyali besler ama zorlamaz
        const input = ctx.createGain();
        input.gain.value = 1.05;

        // ===== SUB-RUMBLE CUT =====
        // 30Hz altındaki duyulmayan gürültüyü keser (hoparlör/kulaklık nefes alır)
        const rumble = ctx.createBiquadFilter();
        rumble.type = "highpass";
        rumble.frequency.value = 30;
        rumble.Q.value = 0.707;

        // ===== SUB-BASS (Derinlik) =====
        // 60Hz — göğüste hissedilen derin bass. Şişmez, sadece "var".
        const sub = ctx.createBiquadFilter();
        sub.type = "lowshelf";
        sub.frequency.value = 60;
        sub.gain.value = 4.0;

        // ===== MID-BASS (Sıcaklık) =====
        // 110Hz — kick drum ve bass gitarın gövdesi. Yumuşak dolgunluk.
        const bassBody = ctx.createBiquadFilter();
        bassBody.type = "peaking";
        bassBody.frequency.value = 110;
        bassBody.Q.value = 1.1;
        bassBody.gain.value = 2.5;

        // ===== MUD CUT (Temizlik) =====
        // 280Hz — kafa şişmesini engeller ama fazla kesmez (doğallık kalır)
        const mud = ctx.createBiquadFilter();
        mud.type = "peaking";
        mud.frequency.value = 280;
        mud.Q.value = 1.0;
        mud.gain.value = -2.0;

        // ===== LOWER-MID WARMTH =====
        // 500Hz hafif dip — vokalin altını temizler
        const lowMid = ctx.createBiquadFilter();
        lowMid.type = "peaking";
        lowMid.frequency.value = 500;
        lowMid.Q.value = 1.2;
        lowMid.gain.value = -1.0;

        // ===== VOCAL CLARITY =====
        // 2.5kHz — vokal öne gelir, anlaşılırlık artar
        const vocal = ctx.createBiquadFilter();
        vocal.type = "peaking";
        vocal.frequency.value = 2500;
        vocal.Q.value = 1.0;
        vocal.gain.value = 2.5;

        // ===== PRESENCE (Tatlı Parlaklık) =====
        // 5kHz — enstrümanlara canlılık, ama tırmalamaz
        const presence = ctx.createBiquadFilter();
        presence.type = "peaking";
        presence.frequency.value = 5000;
        presence.Q.value = 1.2;
        presence.gain.value = 2.0;

        // ===== DE-ESSER (Kritik!) =====
        // 7.5kHz — "S", "Ş", "Z" seslerinin tırmalayıcı bölgesini yumuşatır
        // Bu olmadan hi-shelf kaldırınca kulak acır
        const deEsser = ctx.createBiquadFilter();
        deEsser.type = "peaking";
        deEsser.frequency.value = 7500;
        deEsser.Q.value = 3.5;
        deEsser.gain.value = -3.0;

        // ===== AIR (Nefes / Ferahlık) =====
        // 12kHz — havadar, ferah, "hi-fi" hissi. Tiz değil, atmosfer.
        const air = ctx.createBiquadFilter();
        air.type = "highshelf";
        air.frequency.value = 12000;
        air.gain.value = 2.5;

        // ===== GLUE COMPRESSOR (Yumuşak birleştirici) =====
        // Tüm frekansları birbirine "yapıştırır" — profesyonel his verir
        const glue = ctx.createDynamicsCompressor();
        glue.threshold.value = -22;
        glue.knee.value = 24;
        glue.ratio.value = 2.5;
        glue.attack.value = 0.020; // Transient'leri korur (drum vuruşu ölmez)
        glue.release.value = 0.250;

        // ===== SAFETY LIMITER (Görünmez koruma) =====
        // Ani ses patlamalarını yakalar — clipping asla olmaz
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -2.0;
        limiter.knee.value = 0;
        limiter.ratio.value = 20;
        limiter.attack.value = 0.001;
        limiter.release.value = 0.100;

        // ===== OUTPUT (Makyaj Gain) =====
        // Kompresyon sonrası kaybedilen ses seviyesini geri kazandırır
        const output = ctx.createGain();
        output.gain.value = 1.10;

        try { source.disconnect(); } catch {}

        source
            .connect(input)
            .connect(rumble)
            .connect(sub)
            .connect(bassBody)
            .connect(mud)
            .connect(lowMid)
            .connect(vocal)
            .connect(presence)
            .connect(deEsser)
            .connect(air)
            .connect(glue)
            .connect(limiter)
            .connect(output)
            .connect(ctx.destination);

        video._ytChain = [
            input, rumble, sub, bassBody, mud, lowMid,
            vocal, presence, deEsser, air, glue, limiter, output
        ];

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
