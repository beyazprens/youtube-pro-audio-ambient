// ==UserScript==
// @name         YouTube Pro: Audio Enhancer
// @namespace    https://github.com/Beyazprens/youtube-pro-audio-ambient
// @version      4.1.0
// @description  Adds a persistent audio enhancement button to YouTube for clearer sound and balanced loudness.
// @author       Beyazprens
// @match        https://www.youtube.com/*
// @license      MIT
// @homepageURL  https://github.com/Beyazprens/youtube-pro-audio-ambient
// @supportURL   https://github.com/Beyazprens/youtube-pro-audio-ambient/issues
// @grant        none
// ==/UserScript==


(function () {
    'use strict';

    let audioCtx, source, compressor, filterH, filterL, gain;
    let isEnhanced = false;

    const styles = `
        .audio-enhance-btn {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            cursor: pointer !important;
            background: none !important;
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
            z-index: 1000 !important;
        }

        .audio-enhance-btn svg {
            fill: #fff !important;
            pointer-events: none !important;
        }

        .audio-enhance-btn:hover svg {
            filter: drop-shadow(0 0 3px #fff);
        }

        .audio-enhance-btn.active svg {
            fill: #3ea6ff !important;
            filter: drop-shadow(0 0 10px rgba(62, 166, 255, 0.9)) !important;
        }
    `;

    const styleSheet = document.createElement('style');
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);

    function initAudio(video) {
        if (audioCtx) return;

        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        source = audioCtx.createMediaElementSource(video);

        filterL = audioCtx.createBiquadFilter();
        filterL.type = 'lowshelf';
        filterL.frequency.value = 150;
        filterL.gain.value = 6;

        filterH = audioCtx.createBiquadFilter();
        filterH.type = 'highshelf';
        filterH.frequency.value = 3000;
        filterH.gain.value = 8;

        compressor = audioCtx.createDynamicsCompressor();

        gain = audioCtx.createGain();
        gain.gain.value = 1.2;

        source.connect(audioCtx.destination);
    }

    function toggleEnhance(video, btn) {
        initAudio(video);
        isEnhanced = !isEnhanced;

        source.disconnect();

        if (isEnhanced) {
            source
                .connect(filterL)
                .connect(filterH)
                .connect(compressor)
                .connect(gain)
                .connect(audioCtx.destination);

            btn.classList.add('active');
        } else {
            source.connect(audioCtx.destination);
            btn.classList.remove('active');
        }
    }

    function injectButton() {
        const timeDisplay = document.querySelector('.ytp-time-display');
        const leftControls = document.querySelector('.ytp-left-controls');

        if (!timeDisplay || !leftControls || document.querySelector('.audio-enhance-btn')) return;

        const btn = document.createElement('button');
        btn.className = 'ytp-button audio-enhance-btn';
        btn.title = 'Audio Enhancer';

        btn.innerHTML = `
            <svg viewBox="0 0 24 24">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
            </svg>
        `;

        btn.onclick = (e) => {
            e.preventDefault();
            const video = document.querySelector('video');
            if (video) toggleEnhance(video, btn);
        };

        leftControls.insertBefore(btn, timeDisplay);
    }

    const observer = new MutationObserver(injectButton);
    observer.observe(document.body, { childList: true, subtree: true });

    injectButton();
})();
