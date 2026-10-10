Here is a comprehensive, production-grade prompt designed to be copied directly into an AI coding assistant (or used as your own project specification) to generate the complete application in a single shot without missing edge cases.

---

### Copy-Paste Prompt:

```markdown
Build a production-grade, zero-dependency, standalone local web application (single self-contained `index.html` file combining modern HTML5, CSS, and vanilla ES6+ JavaScript) that translates text into Morse code, pre-renders the entire sequence to an uncompressed 16-bit PCM WAV audio file using the Web Audio API (`OfflineAudioContext`), and provides sample-exact visual playhead tracking.

DO NOT use external libraries, CDNs, or frameworks (No React, Vue, jQuery, or third-party audio packages).

---

### Key Functional & Technical Requirements:

#### 1. Audio Architecture (Pre-rendered Offline Pipeline)
- Use `OfflineAudioContext` to render all Morse audio in memory before playback begins.
- Formula & Standard: Follow ITU-R M.1677-1 standard based on the PARIS benchmark:
  - Unit duration: $T = 1.2 / \text{WPM}$ seconds.
  - Dit: 1 unit tone.
  - Dah: 3 units tone.
  - Intra-character space (between elements in same letter): 1 unit silence.
  - Inter-character space: 3 units silence.
  - Inter-word space: 7 units silence (4 units added to the trailing letter space).
- Anti-Click Envelopes: Apply a 4ms linear attack and 4ms linear release envelope to every tone on the offline `GainNode` to eliminate audio pops and clicks.
- Zero-Dependency WAV Serializer: Implement a pure JavaScript function that encodes the resulting `AudioBuffer` into an uncompressed 16-bit PCM `.wav` Blob using `DataView` (handling RIFF header, fmt subchunk, and 16-bit signed integer sample conversion with hard clipping protection).
- Playback Mechanism: Bind the generated Blob to an HTML5 `<audio>` element using `URL.createObjectURL(blob)`. Manage memory responsibly by revoking previous object URLs (`URL.revokeObjectURL`) when a new file is rendered.

#### 2. Sample-Exact Character & Symbol Manifest
- When generating the audio waveform, simultaneously construct a `Manifest` object containing:
  - `totalDuration` (in seconds).
  - An array of `CharMap` objects containing:
    - `char`: the raw character.
    - `charIndex`: zero-based index pointing to the original input text.
    - `morse`: the Morse string (e.g. `.-`).
    - `startTime` and `endTime` (in seconds).
    - `symbols`: Array of individual `{ isTone: boolean, startTime: number, endTime: number }` objects.
- Binary Search Lookup: Implement a binary search algorithm $O(\log N)$ to find the active character and active tone symbol at any given `audio.currentTime`.

#### 3. Visual Synchronization & Interactive Reader
- Synchronized Visual Deck:
  - Render an interactive text reader where each character is wrapped in an individual `<span id="char-{index}">`.
  - Driven by `requestAnimationFrame`, continuously poll `audio.currentTime` when playing.
  - Highlight the currently active character with an accent background and smoothly scroll into view (`scrollIntoView({ block: 'nearest' })`).
  - Active Beacon: A visual LED/Signal Lamp indicator that glows bright amber whenever an active tone (dit or dah) is currently sounding, and turns off during gaps.
  - Current Morse Display: Display the active character's Morse symbol breakdown in large monospace typography.
- Click-to-Seek: Clicking any character in the interactive reader must seek `audio.currentTime` directly to that character's `startTime` and continue playback.

#### 4. UI Controls & Reactive State Management
- Input: Textarea supporting paragraphs, punctuation, and spaces, with a character counter and quick sample preset buttons (e.g. "SOS", "Pangram", "CQ CQ CQ").
- Controls:
  - Play, Pause, Stop, and Loop toggle.
  - Range sliders:
    - Speed (WPM): 5 to 45 WPM (Default: 20 WPM).
    - Tone Pitch: 400 Hz to 1000 Hz (Default: 650 Hz).
    - Volume: 0% to 100% (Modulates `<audio>` element volume directly in real-time).
- Re-render Handling:
  - Modifying Volume alters `audio.volume` immediately with zero re-rendering.
  - Changing WPM, Pitch, or Text marks the audio buffer as dirty.
  - If the user tweaks WPM or Pitch while playing, debounce by 200ms, store the active `charIndex`, re-render the buffer in the background, update the audio source, seek to the corresponding `startTime` in the new manifest, and seamlessly continue playback.
- Export Feature:
  - "Download .WAV" button that triggers an immediate local download of the generated audio file.
  - "Copy Morse" button to copy the raw `.-` string to the clipboard.

#### 5. Design & Polish
- Dark-mode, high-contrast radio/instrument-panel aesthetic (slate/zinc palette with amber/orange active indicators).
- Fully responsive layout for mobile and desktop screens.
- Handle edge cases: Empty input, unsupported characters (skip gracefully without breaking timing), audio unlock on mobile iOS Safari, and clean teardown on stop/reset.

Provide the complete, bug-free, fully implemented `index.html` file containing all HTML, CSS in `<style>`, and JavaScript in `<script>`.

```