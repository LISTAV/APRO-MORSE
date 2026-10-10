/**
 * developers.js
 * -----------------------------------------------------------------------------
 * Clean & lightweight audio handler for developer callsigns.
 */
(function () {
  'use strict';

  const MORSE_MAP = {
    'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.', 'F': '..-.',
    'G': '--.', 'H': '....', 'I': '..', 'J': '.---', 'K': '-.-', 'L': '.-..',
    'M': '--', 'N': '-.', 'O': '---', 'P': '.--.', 'Q': '--.-', 'R': '.-.',
    'S': '...', 'T': '-', 'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-',
    'Y': '-.--', 'Z': '--..', ' ': '/'
  };

  const OFFICERS = {
    madhurjya: {
      text: 'INSP MADHURJYA',
      wpm: 22,
      pitch: 700,
      btnId: 'btn-callsign-madhurjya'
    },
    himangshu: {
      text: 'ASI HIMANGSHU',
      wpm: 22,
      pitch: 620,
      btnId: 'btn-callsign-himangshu'
    }
  };

  let audioCtx = null;
  let activePlayback = null;

  function initAudio() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function textToMorseSequence(text) {
    const sequence = [];
    const upper = text.toUpperCase();

    for (let i = 0; i < upper.length; i++) {
      const char = upper[i];
      if (char === ' ') {
        sequence.push({ type: 'word_space' });
      } else if (MORSE_MAP[char]) {
        const pattern = MORSE_MAP[char];
        for (let j = 0; j < pattern.length; j++) {
          sequence.push({ type: pattern[j] === '.' ? 'dit' : 'dah' });
          if (j < pattern.length - 1) {
            sequence.push({ type: 'element_space' });
          }
        }
        if (i < upper.length - 1 && upper[i + 1] !== ' ') {
          sequence.push({ type: 'char_space' });
        }
      }
    }
    return sequence;
  }

  function playTone(freq, durationMs) {
    return new Promise((resolve) => {
      if (!audioCtx) return resolve();

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

      const now = audioCtx.currentTime;
      const durationSec = durationMs / 1000;
      const attack = 0.005;
      const release = 0.005;

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.3, now + attack);
      gain.gain.setValueAtTime(0.3, now + durationSec - release);
      gain.gain.linearRampToValueAtTime(0, now + durationSec);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(now);
      osc.stop(now + durationSec + 0.02);

      setTimeout(resolve, durationMs);
    });
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  async function playCallsign(key) {
    initAudio();
    const officer = OFFICERS[key];
    const btn = document.getElementById(officer.btnId);

    if (activePlayback && activePlayback.key === key) {
      activePlayback.cancel();
      activePlayback = null;
      return;
    }

    if (activePlayback) {
      activePlayback.cancel();
      activePlayback = null;
    }

    const sequence = textToMorseSequence(officer.text);
    const ditMs = (1.2 / officer.wpm) * 1000;

    let isCancelled = false;
    activePlayback = {
      key,
      cancel: () => {
        isCancelled = true;
        if (btn) btn.classList.remove('is-playing');
      }
    };

    if (btn) btn.classList.add('is-playing');

    try {
      for (const item of sequence) {
        if (isCancelled) break;
        if (item.type === 'dit') {
          await playTone(officer.pitch, ditMs);
        } else if (item.type === 'dah') {
          await playTone(officer.pitch, ditMs * 3);
        } else if (item.type === 'element_space') {
          await sleep(ditMs);
        } else if (item.type === 'char_space') {
          await sleep(ditMs * 3);
        } else if (item.type === 'word_space') {
          await sleep(ditMs * 7);
        }
      }
    } finally {
      if (activePlayback && activePlayback.key === key) {
        activePlayback = null;
      }
      if (btn) btn.classList.remove('is-playing');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const btnMad = document.getElementById('btn-callsign-madhurjya');
    if (btnMad) {
      btnMad.addEventListener('click', () => playCallsign('madhurjya'));
    }

    const btnHim = document.getElementById('btn-callsign-himangshu');
    if (btnHim) {
      btnHim.addEventListener('click', () => playCallsign('himangshu'));
    }
  });

})();
