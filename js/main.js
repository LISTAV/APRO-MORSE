/**
 * main.js
 * -----------------------------------------------------------------------------
 * Morse Synthesizer Main Application Controller.
 * 
 * Orchestrates application state, the offline audio rendering pipeline,
 * sample-exact visual playhead tracking, reactive user events, and exports.
 */
(function (global) {
  'use strict';

  // Import UI helper and elements
  const ui = global.MorseUI;
  const dom = ui.dom;

  /* ========================================================================
     1. CENTRAL APPLICATION STATE
     ======================================================================== */
  const state = {
    wpm: 20,
    pitch: 650,
    volume: 0.8,
    loop: false,
    text: 'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG',

    isRendering: false,
    manifest: null,
    currentAudioBlob: null,
    currentAudioUrl: null,

    activeCharIndex: -1,
    rafId: null,
    debounceTimer: null
  };

  /* ========================================================================
     2. AUDIO PIPELINE ORCHESTRATOR
     ======================================================================== */
  /**
   * Compiles Morse code timing, renders offline audio, and updates audio source.
   * @param {Object} [options]
   * @param {number} [options.preserveCharIndex] - Character index to seek back to
   * @param {boolean} [options.resumePlayback=false] - Whether to seamlessly resume playback
   */
  async function updatePipeline(options = {}) {
    if (state.isRendering) return;
    state.isRendering = true;

    const trimmedText = state.text ? state.text.trim() : '';
    const hasText = trimmedText.length > 0;

    ui.setRenderState(true, hasText);

    try {
      if (!hasText) {
        // Handle empty input state cleanly
        teardownAudio();
        state.manifest = null;
        ui.renderVisualReader('', onCharacterClicked);
        ui.setRenderState(false, false);
        dom.displayTimeTot.textContent = '00:00.00';
        dom.timelineSlider.max = 0;
        state.isRendering = false;
        return;
      }

      // 1. Compile ITU-R M.1677-1 timeline and manifest
      const manifest = global.compileMorseTimeline(state.text, state.wpm);
      state.manifest = manifest;

      // 2. Pre-render offline audio with anti-click envelopes
      const audioBuffer = await global.renderAudioBuffer(
        manifest.tonesToRender,
        state.pitch,
        manifest.totalDuration
      );

      // 3. Serialize to uncompressed 16-bit PCM WAV Blob
      const wavBlob = global.serializeAudioBufferToWav(audioBuffer);
      state.currentAudioBlob = wavBlob;

      // 4. Memory-safe Object URL binding
      if (state.currentAudioUrl) {
        URL.revokeObjectURL(state.currentAudioUrl);
      }
      state.currentAudioUrl = URL.createObjectURL(wavBlob);

      const wasPlaying = options.resumePlayback || (!dom.audio.paused && !dom.audio.ended);

      dom.audio.src = state.currentAudioUrl;
      dom.audio.volume = state.volume;
      dom.audio.loop = state.loop;

      // Wait for audio metadata to load before seeking
      await new Promise((resolve) => {
        const onLoaded = () => {
          dom.audio.removeEventListener('loadedmetadata', onLoaded);
          resolve();
        };
        dom.audio.addEventListener('loadedmetadata', onLoaded);
        dom.audio.load();
      });

      // 5. Restore target seek time if preserving active character
      if (options.preserveCharIndex !== undefined && options.preserveCharIndex >= 0) {
        const targetCharMap = manifest.charMaps.find(m => m.charIndex === options.preserveCharIndex);
        if (targetCharMap) {
          dom.audio.currentTime = targetCharMap.startTime;
        }
      }

      // 6. Refresh Interactive Text Reader
      ui.renderVisualReader(state.text, onCharacterClicked);

      // Update total time and timeline track limits
      dom.displayTimeTot.textContent = ui.formatTime(manifest.totalDuration);
      dom.timelineSlider.max = manifest.totalDuration;

      // Mark audio ready and reactivate Play button
      ui.setRenderState(false, true);

      // Resume playback seamlessly if requested
      if (wasPlaying) {
        await dom.audio.play();
        dom.deckStatus.textContent = 'TRANSMITTING';
        dom.deckStatus.style.color = 'var(--emerald-400)';
        startPlaybackLoop();
      }

    } catch (err) {
      console.error('[Morse Pipeline Error]', err);
      ui.setRenderState(false, false);
      dom.deckStatus.textContent = 'ERROR';
      dom.deckStatus.style.color = 'var(--red-400)';
    } finally {
      state.isRendering = false;
    }
  }

  function teardownAudio() {
    dom.audio.pause();
    dom.audio.currentTime = 0;
    if (state.currentAudioUrl) {
      URL.revokeObjectURL(state.currentAudioUrl);
      state.currentAudioUrl = null;
    }
    dom.audio.removeAttribute('src');
    state.currentAudioBlob = null;
    stopPlaybackLoop();
    ui.resetVisuals();
  }

  /* ========================================================================
     3. VISUAL PLAYHEAD SYNCHRONIZATION (requestAnimationFrame)
     ======================================================================== */
  function startPlaybackLoop() {
    if (state.rafId) cancelAnimationFrame(state.rafId);

    function tick() {
      if (!dom.audio.paused && !dom.audio.ended) {
        syncVisualPlayhead(dom.audio.currentTime);
        state.rafId = requestAnimationFrame(tick);
      } else {
        if (dom.audio.ended && !dom.audio.loop) {
          onPlaybackComplete();
        }
      }
    }
    state.rafId = requestAnimationFrame(tick);
  }

  function stopPlaybackLoop() {
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }
  }

  /**
   * Continuous sample-exact playhead tracking polling audio.currentTime.
   * Executes O(log N) binary search for instant character and tone lookup.
   */
  function syncVisualPlayhead(currentTime) {
    if (!state.manifest) return;

    dom.timelineSlider.value = currentTime;
    dom.displayTimeCur.textContent = ui.formatTime(currentTime);

    // 1. Binary search active character in O(log N)
    const activeCharMap = global.binarySearchByTime(state.manifest.charMaps, currentTime);

    // 2. Binary search active tone symbol in O(log M)
    const activeSymbol = global.binarySearchByTime(state.manifest.allSymbols, currentTime);

    // Update active character highlight in visual reader
    const newCharIndex = activeCharMap ? activeCharMap.charIndex : -1;
    if (newCharIndex !== state.activeCharIndex) {
      ui.highlightCharacter(newCharIndex, state.activeCharIndex);
      state.activeCharIndex = newCharIndex;
    }

    // Update glowing beacon lamp and telemetry HUD
    ui.updateTelemetry(activeCharMap, activeSymbol, dom.audio.paused);
  }

  function onPlaybackComplete() {
    dom.deckStatus.textContent = 'COMPLETE';
    dom.deckStatus.style.color = 'var(--text-muted)';
    dom.beaconModule.classList.remove('active');
    dom.beaconLabel.textContent = 'CARRIER OFF';
    stopPlaybackLoop();
  }

  /**
   * Click-to-seek handler: seeks audio directly to character start time and plays.
   * Starts playback immediately on the very first click.
   */
  async function onCharacterClicked(charIndex) {
    if (!state.manifest || state.isRendering) return;

    const charMap = state.manifest.charMaps.find(m => m.charIndex === charIndex);
    if (!charMap) return;

    dom.audio.currentTime = charMap.startTime;
    syncVisualPlayhead(charMap.startTime);

    try {
      await dom.audio.play();
      dom.deckStatus.textContent = 'TRANSMITTING';
      dom.deckStatus.style.color = 'var(--emerald-400)';
      startPlaybackLoop();
    } catch (e) {
      console.warn('[Autoplay blocked]', e);
    }
  }

  /* ========================================================================
     4. TRANSPORT BUTTONS & AUDIO CONTROLS
     ======================================================================== */
  // Play Button: Starts playback immediately on single click without double-click lag
  dom.btnPlay.addEventListener('click', async () => {
    if (state.isRendering || !state.text.trim()) return;

    if (!state.manifest || !state.currentAudioUrl) {
      await updatePipeline();
    }
    if (!state.manifest) return;

    // Restart from beginning if playback previously finished
    if (dom.audio.ended || (dom.audio.duration && dom.audio.currentTime >= dom.audio.duration - 0.05)) {
      dom.audio.currentTime = 0;
      syncVisualPlayhead(0);
    }

    try {
      await dom.audio.play();
      dom.deckStatus.textContent = 'TRANSMITTING';
      dom.deckStatus.style.color = 'var(--emerald-400)';
      startPlaybackLoop();
    } catch (err) {
      console.error('[Play Error]', err);
    }
  });

  dom.btnPause.addEventListener('click', () => {
    dom.audio.pause();
    dom.deckStatus.textContent = 'PAUSED';
    dom.deckStatus.style.color = 'var(--amber-400)';
    dom.beaconModule.classList.remove('active');
    dom.beaconLabel.textContent = 'PAUSED';
    stopPlaybackLoop();
  });

  dom.btnStop.addEventListener('click', () => {
    dom.audio.pause();
    dom.audio.currentTime = 0;
    dom.deckStatus.textContent = 'STOPPED';
    dom.deckStatus.style.color = 'var(--text-muted)';
    stopPlaybackLoop();
    ui.resetVisuals();
  });

  dom.btnLoop.addEventListener('click', () => {
    state.loop = !state.loop;
    dom.audio.loop = state.loop;
    if (state.loop) {
      dom.btnLoop.classList.add('btn-active');
    } else {
      dom.btnLoop.classList.remove('btn-active');
    }
  });

  dom.audio.addEventListener('play', () => {
    dom.deckStatus.textContent = 'TRANSMITTING';
    dom.deckStatus.style.color = 'var(--emerald-400)';
    startPlaybackLoop();
  });

  dom.audio.addEventListener('pause', () => {
    if (!dom.audio.ended) {
      dom.deckStatus.textContent = 'PAUSED';
      dom.deckStatus.style.color = 'var(--amber-400)';
      dom.beaconModule.classList.remove('active');
      dom.beaconLabel.textContent = 'PAUSED';
    }
  });

  dom.audio.addEventListener('ended', () => {
    if (!state.loop) {
      onPlaybackComplete();
    }
  });

  /* ========================================================================
     5. PARAMETER SLIDERS & REACTIVE INPUT LISTENERS
     ======================================================================== */
  function onParamChangeDebounced() {
    const isPlaying = !dom.audio.paused && !dom.audio.ended;
    if (!isPlaying) {
      ui.setRenderState(true, state.text.trim().length > 0);
    } else {
      dom.renderIndicator.textContent = 'BUFFER DIRTY';
    }

    if (state.debounceTimer) clearTimeout(state.debounceTimer);

    state.debounceTimer = setTimeout(async () => {
      const activeIndex = state.activeCharIndex >= 0 ? state.activeCharIndex : 0;
      await updatePipeline({
        preserveCharIndex: activeIndex,
        resumePlayback: isPlaying
      });
    }, 200);
  }

  // --- SPEED (WPM): Slider & Manual Number Input ---
  function updateWpmDisplay(val) {
    if (dom.numWpm && String(dom.numWpm.value) !== String(val)) {
      dom.numWpm.value = val;
    }
    const unitMs = Math.round((1.2 / val) * 1000);
    if (dom.valUnitTime) {
      dom.valUnitTime.textContent = `(${unitMs}ms/unit)`;
    }
  }

  dom.sliderWpm.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    state.wpm = val;
    updateWpmDisplay(val);
    onParamChangeDebounced();
  });

  if (dom.numWpm) {
    dom.numWpm.addEventListener('input', (e) => {
      let val = parseInt(e.target.value, 10);
      if (!isNaN(val) && val >= 5 && val <= 45) {
        state.wpm = val;
        dom.sliderWpm.value = val;
        const unitMs = Math.round((1.2 / val) * 1000);
        if (dom.valUnitTime) dom.valUnitTime.textContent = `(${unitMs}ms/unit)`;
        onParamChangeDebounced();
      }
    });

    dom.numWpm.addEventListener('change', (e) => {
      let val = parseInt(e.target.value, 10);
      if (isNaN(val)) val = 20;
      val = Math.max(5, Math.min(45, val));
      state.wpm = val;
      dom.sliderWpm.value = val;
      updateWpmDisplay(val);
      onParamChangeDebounced();
    });
  }

  // --- TONE PITCH (Hz): Slider & Manual Number Input ---
  dom.sliderPitch.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    state.pitch = val;
    if (dom.numPitch && String(dom.numPitch.value) !== String(val)) {
      dom.numPitch.value = val;
    }
    onParamChangeDebounced();
  });

  if (dom.numPitch) {
    dom.numPitch.addEventListener('input', (e) => {
      let val = parseInt(e.target.value, 10);
      if (!isNaN(val) && val >= 400 && val <= 1000) {
        state.pitch = val;
        dom.sliderPitch.value = val;
        onParamChangeDebounced();
      }
    });

    dom.numPitch.addEventListener('change', (e) => {
      let val = parseInt(e.target.value, 10);
      if (isNaN(val)) val = 650;
      val = Math.max(400, Math.min(1000, val));
      state.pitch = val;
      dom.sliderPitch.value = val;
      dom.numPitch.value = val;
      onParamChangeDebounced();
    });
  }

  // --- VOLUME (%): Slider & Manual Number Input ---
  dom.sliderVolume.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    state.volume = val / 100;
    if (dom.numVolume && String(dom.numVolume.value) !== String(val)) {
      dom.numVolume.value = val;
    }
    dom.audio.volume = state.volume;
  });

  if (dom.numVolume) {
    dom.numVolume.addEventListener('input', (e) => {
      let val = parseInt(e.target.value, 10);
      if (!isNaN(val) && val >= 0 && val <= 100) {
        state.volume = val / 100;
        dom.sliderVolume.value = val;
        dom.audio.volume = state.volume;
      }
    });

    dom.numVolume.addEventListener('change', (e) => {
      let val = parseInt(e.target.value, 10);
      if (isNaN(val)) val = 80;
      val = Math.max(0, Math.min(100, val));
      state.volume = val / 100;
      dom.sliderVolume.value = val;
      dom.numVolume.value = val;
      dom.audio.volume = state.volume;
    });
  }

  // Timeline Progress Scrubber
  dom.timelineSlider.addEventListener('input', (e) => {
    const targetTime = parseFloat(e.target.value);
    dom.audio.currentTime = targetTime;
    syncVisualPlayhead(targetTime);
  });

  // Textarea input: Immediately shows rendering and deactivates Play button until ready
  dom.inputText.addEventListener('input', (e) => {
    state.text = e.target.value;
    updateTextStats(state.text);

    // Stop active playback immediately to avoid out-of-sync audio
    if (!dom.audio.paused && !dom.audio.ended) {
      dom.audio.pause();
      stopPlaybackLoop();
      dom.beaconModule.classList.remove('active');
      dom.beaconLabel.textContent = 'CARRIER OFF';
    }

    // Immediately show rendering status and deactivate play button
    ui.setRenderState(true, state.text.trim().length > 0);

    if (state.debounceTimer) clearTimeout(state.debounceTimer);
    state.debounceTimer = setTimeout(() => {
      updatePipeline({ preserveCharIndex: 0 });
    }, 300);
  });

  function updateTextStats(txt) {
    const chars = txt ? txt.length : 0;
    const words = txt && txt.trim() ? txt.trim().split(/\s+/).length : 0;
    dom.charCountInfo.textContent = `${chars} characters • ${words} words`;
  }

  // Quick Preset Chips
  document.querySelectorAll('.preset-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const presetText = btn.dataset.text;
      dom.inputText.value = presetText;
      state.text = presetText;
      updateTextStats(presetText);

      if (!dom.audio.paused && !dom.audio.ended) {
        dom.audio.pause();
        stopPlaybackLoop();
        dom.beaconModule.classList.remove('active');
        dom.beaconLabel.textContent = 'CARRIER OFF';
      }

      ui.setRenderState(true, true);
      updatePipeline({ preserveCharIndex: 0 });
    });
  });

  /* ========================================================================
     6. EXPORT UTILITIES (DOWNLOAD .WAV & COPY MORSE)
     ======================================================================== */
  // Download 16-Bit PCM WAV File
  dom.btnDownloadWav.addEventListener('click', () => {
    if (!state.currentAudioBlob) {
      ui.showToast('Generate audio before downloading.');
      return;
    }

    const downloadUrl = URL.createObjectURL(state.currentAudioBlob);
    const a = document.createElement('a');
    const filename = `morse_${state.wpm}wpm_${state.pitch}hz.wav`;
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);

    ui.showToast(`Downloaded ${filename}`);
  });

  // Copy Formatted Morse Code to Clipboard
  dom.btnCopyMorse.addEventListener('click', async () => {
    const formattedMorse = global.formatMorseText(state.text);
    if (!formattedMorse) {
      ui.showToast('Buffer is empty.');
      return;
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(formattedMorse);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = formattedMorse;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      ui.showToast('Copied Morse to clipboard!');
    } catch (err) {
      console.error('[Clipboard Error]', err);
      ui.showToast('Failed to copy to clipboard.');
    }
  });

  /* ========================================================================
     7. BOOTSTRAP INITIALIZATION
     ======================================================================== */
  async function init() {
    ui.renderReferenceTable();
    updateTextStats(state.text);
    await updatePipeline();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(typeof window !== 'undefined' ? window : this);
