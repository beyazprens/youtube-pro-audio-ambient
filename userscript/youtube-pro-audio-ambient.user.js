// ==UserScript==
// @name         YouTube Pro: Audio Enhancer
// @namespace    https://github.com/Beyazprens/youtube-pro-audio-ambient
// @version      2.0.0
// @description  Cinema-quality sound with a professional 5-band EQ and multiband compressor.
// @author       Beyazprens
// @match        https://www.youtube.com/*
// @license      MIT
// @homepageURL  https://github.com/Beyazprens/youtube-pro-audio-ambient
// @supportURL   https://github.com/Beyazprens/youtube-pro-audio-ambient/issues
// @grant        none
// ==/UserScript==
(function () {
    'use strict';

    let audioCtx = null, source = null;
    let filters = {}, isEnhanced = false, connected = false;


    const css = `
        .audio-enhance-btn {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            cursor: pointer !important;
            background: none !important;
            border: none !important;
            outline: none !important;
            vertical-align: top !important;
            width: 48px !important;
            height: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            opacity: 0.9;
            transition: opacity 0.2s;
            position: relative;
        }
        .audio-enhance-btn:hover {
            opacity: 1;
        }
        .audio-enhance-btn svg {
            width: 28px !important;
            height: 28px !important;
            fill: #fff !important;
            transition: transform 0.2s, fill 0.2s;
        }
        .audio-enhance-btn:active svg {
            transform: scale(0.95);
        }

        .audio-enhance-btn.active svg {
            fill: #3ea6ff !important;
            filter: drop-shadow(0 0 8px rgba(62,166,255,0.8));
        }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    function createAudioGraph(video) {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (connected) return;

        try {
            source = audioCtx.createMediaElementSource(video);
        } catch (e) {
            return;
        }

        filters.subBass = audioCtx.createBiquadFilter();
        filters.subBass.type = 'lowshelf';
        filters.subBass.frequency.value = 60;
        filters.subBass.gain.value = 5.0;

        filters.mudCut = audioCtx.createBiquadFilter();
        filters.mudCut.type = 'peaking';
        filters.mudCut.frequency.value = 250;
        filters.mudCut.Q.value = 1.0;
        filters.mudCut.gain.value = -3.0;

        filters.presence = audioCtx.createBiquadFilter();
        filters.presence.type = 'peaking';
        filters.presence.frequency.value = 2500;
        filters.presence.Q.value = 1.0;
        filters.presence.gain.value = 2.5;

        filters.brilliance = audioCtx.createBiquadFilter();
        filters.brilliance.type = 'highshelf';
        filters.brilliance.frequency.value = 8000;
        filters.brilliance.gain.value = 5.0;

        filters.comp = audioCtx.createDynamicsCompressor();
        filters.comp.threshold.value = -18;
        filters.comp.knee.value = 20;
        filters.comp.ratio.value = 3.5;
        filters.comp.attack.value = 0.05;
        filters.comp.release.value = 0.20;


        filters.gain = audioCtx.createGain();
        filters.gain.gain.value = 1.15;

        source.connect(audioCtx.destination);
        connected = true;
    }

    function enableEnhancement() {
        if (!connected || !source) return;
        try {
            source.disconnect();
            source
                .connect(filters.subBass)
                .connect(filters.mudCut)
                .connect(filters.presence)
                .connect(filters.brilliance)
                .connect(filters.comp)
                .connect(filters.gain)
                .connect(audioCtx.destination);
            isEnhanced = true;
        } catch (e) {
            console.warn('[AudioEnhancer] Enable failed:', e);
        }
    }

    function disableEnhancement() {
        if (!connected || !source) return;
        try {
            source.disconnect();
            source.connect(audioCtx.destination);
            isEnhanced = false;
        } catch (e) {
            console.warn('[AudioEnhancer] Disable failed:', e);
        }
    }

    function toggle(video, btn) {
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        createAudioGraph(video);

        if (isEnhanced) {
            disableEnhancement();
            btn.classList.remove('active');
        } else {
            enableEnhancement();
            btn.classList.add('active');
        }
    }

    function injectButton() {
        const leftControls = document.querySelector('.ytp-left-controls');
        const timeDisplay = document.querySelector('.ytp-time-display');
        if (!leftControls || !timeDisplay) return;
        if (document.querySelector('.audio-enhance-btn')) return;

        const btn = document.createElement('button');
        btn.className = 'ytp-button audio-enhance-btn';
        btn.title = 'Enchance Audio';
        btn.innerHTML = `
            <svg viewBox="0 0 24 24">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21
                0-4 1.79-4 4s1.79 4 4 4
                4-1.79 4-4V7h4V3h-6z"/>
            </svg>
        `;
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const video = document.querySelector('video');
            if (video) toggle(video, btn);
        });

        leftControls.insertBefore(btn, timeDisplay);
    }

    const observer = new MutationObserver(() => {
        injectButton();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener('yt-navigate-finish', injectButton);
    injectButton();
})();
