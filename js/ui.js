/**
 * ui.js
 * -----------------------------------------------------------------------------
 * User Interface & Telemetry HUD Module.
 * 
 * Manages the interactive text reader DOM elements, beacon lamp glow,
 * telemetry HUD readouts, time formatting, and reactive button states.
 */
(function (global) {
  'use strict';

  // Cache DOM element references
  const dom = {
    audio: document.getElementById('audio-playback'),
    btnPlay: document.getElementById('btn-play'),
    btnPause: document.getElementById('btn-pause'),
    btnStop: document.getElementById('btn-stop'),
    btnLoop: document.getElementById('btn-loop'),
    btnCopyMorse: document.getElementById('btn-copy-morse'),
    btnDownloadWav: document.getElementById('btn-download-wav'),

    sliderWpm: document.getElementById('slider-wpm'),
    sliderPitch: document.getElementById('slider-pitch'),
    sliderVolume: document.getElementById('slider-volume'),
    timelineSlider: document.getElementById('timeline-slider'),

    numWpm: document.getElementById('num-wpm'),
    numPitch: document.getElementById('num-pitch'),
    numVolume: document.getElementById('num-volume'),

    valWpm: document.getElementById('val-wpm'),
    valPitch: document.getElementById('val-pitch'),
    valVolume: document.getElementById('val-volume'),
    valUnitTime: document.getElementById('val-unit-time'),

    inputText: document.getElementById('input-text'),
    charCountInfo: document.getElementById('char-count-info'),
    readerBox: document.getElementById('reader-box'),

    beaconModule: document.getElementById('beacon-module'),
    beaconLabel: document.getElementById('beacon-status-label'),
    hudChar: document.getElementById('hud-char'),
    hudMorse: document.getElementById('hud-morse'),
    displayTimeCur: document.getElementById('display-time-cur'),
    displayTimeTot: document.getElementById('display-time-tot'),

    deckStatus: document.getElementById('deck-status'),
    renderIndicator: document.getElementById('render-indicator'),
    toast: document.getElementById('toast'),
    toastMsg: document.getElementById('toast-msg'),
    refGrid: document.getElementById('ref-grid'),
    refToggle: document.getElementById('ref-toggle')
  };

  /**
   * Renders the interactive visual text reader where each character is wrapped
   * in a clickable span for sample-exact playhead tracking and seek navigation.
   * @param {string} text - Message text
   * @param {Function} onCharClick - Callback when character is clicked (charIndex)
   */
  function renderVisualReader(text, onCharClick) {
    if (!text) {
      dom.readerBox.innerHTML = '<div class="reader-empty-placeholder">Enter text on the right console to generate interactive playhead manifest...</div>';
      return;
    }

    const fragment = document.createDocumentFragment();

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const span = document.createElement('span');
      span.id = `char-${i}`;
      span.className = 'reader-char';
      span.dataset.index = i;

      if (char === ' ') {
        span.innerHTML = '&nbsp;';
        span.classList.add('is-space');
      } else if (char === '\n') {
        span.textContent = '\n';
        span.classList.add('is-newline');
      } else if (char === '\t') {
        span.innerHTML = '&nbsp;&nbsp;&nbsp;&nbsp;';
      } else {
        span.textContent = char;
      }

      // Click-to-seek listener
      span.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof onCharClick === 'function') {
          onCharClick(i);
        }
      });

      fragment.appendChild(span);
    }

    dom.readerBox.innerHTML = '';
    dom.readerBox.appendChild(fragment);
  }

  /**
   * Updates highlighting of the active character in the reader.
   * @param {number} newCharIndex - Index of current character, or -1 to clear
   * @param {number} prevCharIndex - Index of previous character
   */
  function highlightCharacter(newCharIndex, prevCharIndex) {
    if (prevCharIndex >= 0 && prevCharIndex !== newCharIndex) {
      const oldEl = document.getElementById(`char-${prevCharIndex}`);
      if (oldEl) oldEl.classList.remove('is-active');
    }

    if (newCharIndex >= 0) {
      const newEl = document.getElementById(`char-${newCharIndex}`);
      if (newEl) {
        newEl.classList.add('is-active');
        newEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }

  /**
   * Updates the physical glowing beacon lamp and live telemetry HUD.
   * @param {Object|null} charMap - Active character map
   * @param {Object|null} symbol - Active symbol
   * @param {boolean} isAudioPaused - Whether playback is paused
   */
  function updateTelemetry(charMap, symbol, isAudioPaused) {
    // 1. Physical Signal Lamp (LED)
    const isToneActive = symbol && symbol.isTone;
    if (isToneActive) {
      dom.beaconModule.classList.add('active');
      dom.beaconLabel.textContent = 'CARRIER ACTIVE';
    } else {
      dom.beaconModule.classList.remove('active');
      dom.beaconLabel.textContent = isAudioPaused ? 'CARRIER OFF' : 'SILENCE';
    }

    // 2. Active Character & Monospace Morse Breakdown
    if (charMap) {
      const displayChar = charMap.char === ' ' ? '␣' : (charMap.char === '\n' ? '↵' : charMap.char);
      dom.hudChar.textContent = displayChar;

      if (charMap.morse) {
        let html = '';
        for (let i = 0; i < charMap.morse.length; i++) {
          const symChar = charMap.morse[i];
          const glyph = symChar === '.' ? '•' : '—';
          const isSounding = isToneActive && symbol.symbolIndex === i && symbol.charIndex === charMap.charIndex;
          html += `<span class="symbol-glyph ${isSounding ? 'sounding' : ''}">${glyph}</span>`;
        }
        dom.hudMorse.innerHTML = html;
      } else if (/\s/.test(charMap.char)) {
        dom.hudMorse.innerHTML = `<span style="color: var(--text-dim); font-size: 0.9rem;">WORD SPACE</span>`;
      } else {
        dom.hudMorse.innerHTML = `<span style="color: var(--text-dim); font-size: 0.9rem;">--</span>`;
      }
    } else {
      dom.hudChar.textContent = '--';
      dom.hudMorse.innerHTML = `<span style="color: var(--text-dim); font-size: 1rem;">IDLE</span>`;
    }
  }

  /**
   * Resets visual playhead indicators to initial standby state.
   */
  function resetVisuals() {
    const activeEl = dom.readerBox.querySelector('.is-active');
    if (activeEl) activeEl.classList.remove('is-active');

    dom.timelineSlider.value = 0;
    dom.displayTimeCur.textContent = '00:00.00';
    updateTelemetry(null, null, true);
  }

  /**
   * Controls the rendering and readiness state of the UI and Play button.
   * When isRendering is true, immediately disables Play button and shows spinner.
   * When false, restores the Play button if hasText is true.
   * @param {boolean} isRendering - Whether audio is actively compiling
   * @param {boolean} hasText - Whether non-empty text exists
   */
  function setRenderState(isRendering, hasText) {
    if (isRendering) {
      dom.btnPlay.disabled = true;
      dom.btnPlay.innerHTML = `
        <svg class="spin-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="12"/>
        </svg>
        RENDERING...
      `;
      dom.deckStatus.textContent = 'RENDERING';
      dom.deckStatus.style.color = 'var(--amber-400)';
      dom.renderIndicator.textContent = 'RENDERING...';
      dom.btnDownloadWav.disabled = true;
      dom.btnCopyMorse.disabled = true;
    } else {
      dom.btnPlay.disabled = !hasText;
      dom.btnPlay.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        PLAY
      `;
      dom.deckStatus.textContent = hasText ? 'READY' : 'EMPTY BUFFER';
      dom.deckStatus.style.color = hasText ? 'var(--emerald-400)' : 'var(--text-dim)';
      dom.renderIndicator.textContent = hasText ? 'SYNCED' : 'EMPTY';
      dom.btnDownloadWav.disabled = !hasText;
      dom.btnCopyMorse.disabled = !hasText;
    }
  }

  /**
   * Displays a temporary notification toast.
   * @param {string} msg - Message to display
   */
  function showToast(msg) {
    dom.toastMsg.textContent = msg;
    dom.toast.classList.add('visible');
    setTimeout(() => {
      dom.toast.classList.remove('visible');
    }, 2500);
  }

  /**
   * Formats seconds into MM:SS.CC timestamp string.
   * @param {number} seconds
   * @returns {string}
   */
  function formatTime(seconds) {
    if (!seconds || isNaN(seconds) || seconds < 0) return '00:00.00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const hundredths = Math.floor((seconds % 1) * 100);
    const pad = (n, len = 2) => String(n).padStart(len, '0');
    return `${pad(mins)}:${pad(secs)}.${pad(hundredths)}`;
  }

  /**
   * Populates the collapsible Morse symbol mapping table drawer.
   */
  function renderReferenceTable() {
    if (!global.MORSE_TABLE) return;
    const keys = Object.keys(global.MORSE_TABLE);
    let html = '';
    for (const k of keys) {
      html += `
        <div class="ref-item">
          <span class="ref-char">${k}</span>
          <span class="ref-morse">${global.MORSE_TABLE[k]}</span>
        </div>
      `;
    }
    dom.refGrid.innerHTML = html;

    dom.refToggle.addEventListener('click', () => {
      const isHidden = dom.refGrid.style.display === 'none';
      dom.refGrid.style.display = isHidden ? 'grid' : 'none';
      dom.refToggle.querySelector('span:last-child').textContent = isHidden ? '[-] COLLAPSE' : '[+] EXPAND';
    });
  }

  // Export UI interface
  global.MorseUI = {
    dom,
    renderVisualReader,
    highlightCharacter,
    updateTelemetry,
    resetVisuals,
    setRenderState,
    showToast,
    formatTime,
    renderReferenceTable
  };

})(typeof window !== 'undefined' ? window : this);
