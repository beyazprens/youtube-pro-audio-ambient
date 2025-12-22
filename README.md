# YouTube Pro: Audio Enhancer

A lightweight userscript that adds a **persistent audio enhancement button** to YouTube, improving clarity, bass, and overall loudness without breaking YouTube’s interface or performance.

Designed for long-term stability and compatibility with YouTube’s single-page application (SPA) behavior.

---

## Features

- 🎧 Audio enhancement using the Web Audio API
- 🔊 Improved bass and high-frequency clarity
- 🎚️ Safe gain amplification with dynamic compression
- 🖱️ One-click enable / disable
- 🧠 Control button persists across YouTube page navigation
- ⚡ Lightweight and performance-friendly
- 🔄 Works without reloading the page

---

## How It Works

### Audio Processing Chain

When enabled, the script applies the following audio pipeline:

- **Low-shelf filter** – enhances bass frequencies
- **High-shelf filter** – improves vocal and detail clarity
- **Dynamic compressor** – balances loud and quiet sounds
- **Gain control** – slightly increases perceived volume safely

All processing is done locally using the browser’s **Web Audio API**.

---

## Installation

1. Install **Tampermonkey** (or a compatible userscript manager)
2. Open the script page on **GreasyFork**
3. Click **Install**
4. Open any YouTube video and use the new audio button in the player controls

---

## Compatibility

- ✔ Chrome / Chromium-based browsers
- ✔ Firefox
- ✔ Microsoft Edge
- ✔ YouTube Desktop interface

> Mobile browsers are not officially supported.

---

## Privacy & Security

This script:

- Does **not** collect or transmit data
- Does **not** perform network requests
- Does **not** track user behavior

All processing happens locally in your browser.

---

## License

MIT License

---

## Disclaimer

This project is **not affiliated with or endorsed by YouTube or Google**.  
Use at your own discretion.
