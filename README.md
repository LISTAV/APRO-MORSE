# APRO-MORSE // APRO Training School Morse Trainer

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live%20Demo-2ea44f?style=for-the-badge&logo=github)](https://listav.github.io/APRO-MORSE/)
[![Standard](https://img.shields.io/badge/ITU--R-M.1677--1-f59e0b?style=for-the-badge)](https://www.itu.int/rec/R-REC-M.1677-1-200910-I/en)
[![Audio Engine](https://img.shields.io/badge/Web%20Audio-OfflineAudioContext-3b82f6?style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/API/OfflineAudioContext)
[![Architecture](https://img.shields.io/badge/Zero--Dependency-Vanilla%20ES6%2B-10b981?style=for-the-badge)](https://github.com/LISTAV/APRO-MORSE)

> **Assam Police Radio Organisation (APRO) • Established 1946**  
> **APRO PWCC L-III Morse Code Telegraphy Synthesizer & Real-time Training Console**

---

## 📡 Live Application

Access the live web deployment directly via GitHub Pages:  
👉 **[https://listav.github.io/APRO-MORSE/](https://listav.github.io/APRO-MORSE/)**

---

## 📻 Overview

**APRO-MORSE** is a zero-dependency, standalone local web application developed for telegraphy and wireless communication training under the **Assam Police Radio Organisation (APRO)** Police Wireless Communication Course (PWCC Level-III). 

It translates alphanumeric text into international Morse code, compiles a sample-exact timing manifest according to the ITU-R PARIS standard, synthesizes the complete acoustic transmission into an uncompressed 16-bit PCM WAV audio file via the Web Audio API (`OfflineAudioContext`), and provides sample-exact playhead tracking with visual signal lamp illumination and click-to-seek playback.

---

## ⚡ Key Technical Features

### 1. Pre-rendered Offline Audio Pipeline
- **`OfflineAudioContext` Engine**: Renders all Morse audio in memory prior to playback, eliminating audio buffer jitter or timer drift.
- **PARIS Benchmark Compliance (ITU-R M.1677-1)**:
  - Unit duration: $T = 1.2 / \text{WPM}$ seconds
  - Dit: $1T$ tone
  - Dah: $3T$ tone
  - Intra-character space: $1T$ silence
  - Inter-character space: $3T$ silence
  - Inter-word space: $7T$ silence
- **Anti-Click Trapezoidal Envelopes**: Built-in 4ms linear attack and 4ms linear release envelopes on offline `GainNode` stages to eliminate audio pops and clicks.
- **Pure JavaScript WAV Serializer**: Generates 16-bit signed integer PCM `.wav` Blobs dynamically in browser memory using `DataView` with RIFF header encapsulation and hard clipping protection.

### 2. Sample-Exact Manifest & Synchronized Visual Reader
- **$O(\log N)$ Binary Search Lookup**: High-speed binary search locates active characters and tone symbols for any given `audio.currentTime`.
- **Interactive Reader Deck**: Real-time accent highlighting, auto-scrolling (`scrollIntoView`), and click-to-seek jump capabilities on every character.
- **Visual Signal Beacon**: Amber LED lamp illuminating synchronously with active sounding tones (dits and dahs) and extinguishing during silent intervals.
- **Audio Scrubber & Dual Controls**: Synchronized bidirectional range sliders and manual numeric inputs for frequency (Hz) and speed (WPM).

### 3. Tactical militaristic UI & Engineering Dossier
- Dark militaristic radar-console design with amber phosphor glow and high-contrast tactical telemetry HUD.
- Responsive mobile & desktop layout.
- Quick Morse Symbol Reference dictionary expander.
- Dedicated **APRO Technical Wing Engineering Dossier** (`developers.html`) showcasing project architects, coders, and interactive callsign Morse audition buttons.

---

## 📂 Project Architecture

```
APRO-MORSE/
├── .github/
│   └── workflows/
│       └── deploy.yml      # Automated GitHub Pages CI/CD deployment
├── assets/
│   ├── apro-logo.png       # APRO insignia emblem
│   └── logo.png            # High-resolution badge asset
├── js/
│   ├── audio-engine.js     # Web Audio OfflineAudioContext with anti-click envelopes
│   ├── developers.js       # Engineering dossier interactivity & callsign synthesis
│   ├── main.js             # Central reactive state controller & transport logic
│   ├── morse-table.js      # ITU-R M.1677-1 Morse code dictionary & mapping
│   ├── search.js           # O(log N) binary search playhead lookup algorithm
│   ├── timeline.js         # PARIS timing compiler & sample-exact manifest generator
│   ├── ui.js               # DOM rendering, HUD telemetry & visual reader updates
│   └── wav-serializer.js   # Pure DataView 16-bit PCM WAV binary encoder
├── 1prompt.md              # Technical specification & architecture prompt
├── app.js                  # Modular architecture index reference
├── developers.css          # Styling for Developer Credits & engineering cards
├── developers.html         # APRO Engineering Team Dossier (Credits)
├── index.html              # Main Morse Synthesizer & Training Console
├── styles.css              # Militaristic dark radar theme stylesheet
├── .nojekyll               # Disables Jekyll processing for GitHub Pages
└── README.md               # Project documentation
```

---

## 🚀 Running Locally

No npm dependencies, package managers, or build steps required.

1. **Clone the repository:**
   ```bash
   git clone https://github.com/LISTAV/APRO-MORSE.git
   cd APRO-MORSE
   ```

2. **Open in browser:**
   - Double-click `index.html` to open directly in any modern browser (Chrome, Edge, Firefox, Safari).
   - Alternatively, serve via a local static server:
     ```bash
     npx serve .
     # or
     python -m http.server 8080
     ```

---

## 🎖️ Engineering Team Credits

Developed for the **Assam Police Radio Organisation (APRO)** Training School:

- **Inspector Madhurjya** — *System Architect* (APRO Technical Wing)
  - *Architecture, timing manifest specifications, Web Audio pipeline design & ITU-R compliance.*
- **ASI Himangshu** — *Lead Developer / Coder* (APRO Cyber & Comms Wing)
  - *Modular ES6+ implementation, PCM WAV serializer, binary search playhead engine & tactical UI.*

---

## 📜 License & Compliance

Complies with International Telecommunication Union standard **ITU-R M.1677-1** (International Morse code).  
Assam Police Radio Organisation (Estd. 1946).
