// ==UserScript==
// @name         YouTube Pro: Audio Enhancer (Final)
// @namespace    https://github.com/Beyazprens/youtube-pro-audio-ambient
// @version      2.2.1
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

        if (!video._ytSource) {
            video._ytSource = ctx.createMediaElementSource(video);
        }

        const source = video._ytSource;
        // 1. KATMAN: OTOBAN BASI (Derin Uğultu)
        const sub = ctx.createBiquadFilter();
        sub.type = 'lowshelf';
        sub.frequency.value = 85;   // 85Hz altındaki her şeyi kaldırır
        sub.gain.value = 10.0;      // +10dB! Görseldeki o yüksek tepeyi burası yapar.


        // 2. KATMAN: GÖĞÜS TİTRETEN VURUŞ (Punch)
        const impact = ctx.createBiquadFilter();
        impact.type = 'peaking';
        impact.frequency.value = 55; // Kick davulunun tam "güm" dediği yer
        impact.Q.value = 1.4;        // Sadece vuruşa odaklanır
        impact.gain.value = 4.5;     // Shelf'in üstüne +4.5dB daha biner (Toplam ~14.5dB)


        // 3. KATMAN: BOŞLUK YARATMA (Mid Scoop)
        // Görselde çizgi aşağı iniyor ya, işte burası o.
        // Basın öne çıkması için orta sesleri çekiyoruz.
        const cut = ctx.createBiquadFilter();
        cut.type = 'peaking';
        cut.frequency.value = 400;
        cut.Q.value = 1.0;
        cut.gain.value = -3.5;      // Basın altında ezilmesin diye vokali biraz geriye alır


        // 4. KATMAN: YUMUŞAK TİZLER (Dark Highs)
        // Görselde tizler düz -3dB gidiyor.
        // Parlaklık yok, sadece sıcaklık var.
        const high = ctx.createBiquadFilter();
        high.type = 'highshelf';
        high.frequency.value = 8000;
        high.gain.value = -2.0;     // Tizleri kıstık, kafa ütülemez.


        // 5. KATMAN: BASI TOPARLAYICI (Compressor)
        // Bu kadar bas normalde sesi patlatır (clip).
        // Bu ayar bas vurduğunda sesi kısmaz, sadece "toklaştırır".
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -26;  // Basları çok erken yakalar
        comp.knee.value = 35;        // Çok yumuşak
        comp.ratio.value = 5.0;      // Güçlü sıkıştırma (Limiter gibi)
        comp.attack.value = 0.02;    // Vurur vurmaz yakalar
        comp.release.value = 0.15;   // Bas uzaması bitmeden bırakmaz


        // ÇIKIŞ SESİ
        const gain = ctx.createGain();
        gain.gain.value = 1.25;      // Midleri kıstığımız için genel sesi biraz açtık.

        // BAĞLANTILAR (Zinciri güncellememiz lazım çünkü isimler değişti)
        source.disconnect();
        source.connect(sub)
            .connect(impact)
            .connect(cut)
            .connect(high)
            .connect(comp)
            .connect(gain)
            .connect(ctx.destination);

        video._ytChain = [sub, impact, cut, high, comp, gain];
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
        if (now - lastInject < 500) return;
        lastInject = now;

        const controls = document.querySelector('.ytp-left-controls');
        if (!controls || document.querySelector('.audio-enhance-btn')) return;

        ensureStyle();

        const btn = document.createElement('button');
        btn.className = 'ytp-button audio-enhance-btn';
        btn.innerHTML = `
        <svg viewBox="0 0 24 24">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3z"/>
        </svg>`;

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

        const volumePanel = controls.querySelector('.ytp-volume-panel');
        if (volumePanel && volumePanel.nextSibling) {
            controls.insertBefore(btn, volumePanel.nextSibling);
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
        obs.observe(player, { childList: true, subtree: false });
        inject();
    }, 500);

    window.addEventListener('yt-navigate-finish', () => {
        const video = document.querySelector('video');
        disableEnhancer(video);
        inject();
        if (enabled && video) buildChain(video);
    });

})();
