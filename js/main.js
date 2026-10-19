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
     1. CENTRAL APPLICATION STATE & 4 TRANSMISSION SLOTS (TX 1 to TX 4)
     ======================================================================== */
  const defaultSlots = [
    {
      id: 1,
      name: 'TX 1',
      title: 'APRO Net Preamble',
      formData: {
        warnings: 'ROUTINE',
        call: 'APRO',
        priority: 'P',
        trans: 'TRANS',
        nr: '01',
        gr: '9',
        to: 'ALL STATIONS',
        w: 'CID',
        v: 'HQ DISPUR',
        orgNo: '104/WT',
        date1: '14/10',
        inReplyTo: '',
        date2: '',
        security: 'UNCLASS',
        text: 'APRO POLICE WIRELESS NET ESTD 1946 QRK 5 OVER',
        too: '1200',
        thi: '1205'
      },
      duration: 0,
      words: 9,
      status: 'ready'
    },
    {
      id: 2,
      name: 'TX 2',
      title: 'Guwahati Sitrep',
      formData: {
        warnings: '',
        call: 'APRO',
        priority: 'ROUTINE',
        trans: '',
        nr: '02',
        gr: '7',
        to: 'GUWAHATI NET',
        w: '',
        v: 'CONTROL',
        orgNo: '105/WT',
        date1: '14/10',
        inReplyTo: '',
        date2: '',
        security: 'UNCLASS',
        text: 'QRK 5 QTH GUWAHATI QTR 1200 K',
        too: '1200',
        thi: '1202'
      },
      duration: 0,
      words: 7,
      status: 'ready'
    },
    {
      id: 3,
      name: 'TX 3',
      title: 'Emergency Patrol Call',
      formData: {
        warnings: 'HIGH PRIORITY',
        call: 'PATROL 1',
        priority: 'EMERGENCY',
        trans: 'DIRECT',
        nr: '09',
        gr: '15',
        to: 'POLICE CONTROL',
        w: 'SP CRIME',
        v: 'MOBILE PATROL',
        orgNo: '22/WT',
        date1: '14/10',
        inReplyTo: '',
        date2: '',
        security: 'CONFIDENTIAL',
        text: 'MAYDAY MAYDAY MAYDAY DE POLICE MOBILE UNIT LAT 26 11 N LONG 91 44 E OVER',
        too: '0430',
        thi: '0435'
      },
      duration: 0,
      words: 15,
      status: 'ready'
    },
    {
      id: 4,
      name: 'TX 4',
      title: 'Silchar Relay Bulletin',
      formData: {
        warnings: '',
        call: 'APRO 4',
        priority: 'ROUTINE',
        trans: 'RELAY',
        nr: '12',
        gr: '10',
        to: 'SILCHAR WT',
        w: 'HQ DISPUR',
        v: 'CENTRAL RELAY',
        orgNo: '88/WT',
        date1: '14/10',
        inReplyTo: '',
        date2: '',
        security: 'UNCLASS',
        text: 'ALL SECTORS NORMAL WX CLEAR NO TRAFFIC PENDING AR K',
        too: '0600',
        thi: '0605'
      },
      duration: 0,
      words: 10,
      status: 'ready'
    }
  ];

  const state = {
    wpm: 20,
    pitch: 650,
    volume: 0.8,
    loop: false,
    text: '',

    isRendering: false,
    manifest: null,
    currentAudioBlob: null,
    currentAudioUrl: null,

    activeCharIndex: -1,
    rafId: null,
    debounceTimer: null,
    transmitMode: 'full', // 'full' (all non-empty message pad fields) or 'body' (text area only)

    // Batch Queue State (3 Prepared Transmissions)
    slots: defaultSlots,
    activeSlotIndex: 0,
    isBatchPlaying: false,
    batchCurrentSlot: -1,
    batchTimer: null,
    interMessageGapSeconds: 2.5
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

      // Sync duration with active transmission slot
      if (state.slots && state.slots[state.activeSlotIndex]) {
        state.slots[state.activeSlotIndex].duration = manifest.totalDuration;
        ui.updateSlotTabUI(state.activeSlotIndex, {
          duration: manifest.totalDuration,
          words: state.slots[state.activeSlotIndex].words
        });
      }

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
    stopPlaybackLoop();
    dom.beaconModule.classList.remove('active');
    dom.beaconLabel.textContent = 'CARRIER OFF';

    if (state.isBatchPlaying && state.batchCurrentSlot >= 0) {
      handleBatchSlotCompletion();
    } else {
      dom.deckStatus.textContent = 'COMPLETE';
      dom.deckStatus.style.color = 'var(--text-muted)';
    }
  }

  /**
   * Advances the batch playback queue to the next transmission slot after the inter-message gap.
   */
  function handleBatchSlotCompletion() {
    const finishedSlot = state.batchCurrentSlot;
    const nextSlot = finishedSlot + 1;

    ui.updateSlotTabUI(finishedSlot, { status: 'done' });

    if (nextSlot < state.slots.length) {
      dom.deckStatus.textContent = `PAUSE (${state.interMessageGapSeconds}s) → NEXT: TX ${nextSlot + 1}`;
      dom.deckStatus.style.color = 'var(--amber-400)';
      ui.showToast(`TX ${finishedSlot + 1} finished. Inter-message pause ${state.interMessageGapSeconds}s...`);

      if (state.batchTimer) clearTimeout(state.batchTimer);
      state.batchTimer = setTimeout(async () => {
        if (!state.isBatchPlaying) return;
        await playSlotInBatch(nextSlot);
      }, state.interMessageGapSeconds * 1000);
    } else {
      // Finished all 3 slots in the batch!
      if (state.loop) {
        dom.deckStatus.textContent = `LOOP: RESTARTING BATCH QUEUE (${state.interMessageGapSeconds}s)...`;
        dom.deckStatus.style.color = 'var(--amber-400)';
        if (state.batchTimer) clearTimeout(state.batchTimer);
        state.batchTimer = setTimeout(async () => {
          if (!state.isBatchPlaying) return;
          await playSlotInBatch(0);
        }, state.interMessageGapSeconds * 1000);
      } else {
        state.isBatchPlaying = false;
        state.batchCurrentSlot = -1;
        ui.clearTransmittingSlots();
        dom.deckStatus.textContent = 'BATCH COMPLETE';
        dom.deckStatus.style.color = 'var(--emerald-400)';
        ui.showToast('Batch transmission queue finished!');
      }
    }
  }

  /**
   * Plays a specific transmission slot during batch queue execution.
   * @param {number} slotIndex
   */
  async function playSlotInBatch(slotIndex) {
    if (!state.isBatchPlaying) return;
    state.batchCurrentSlot = slotIndex;

    // Load target slot to form so operator sees live form data
    loadSlotToForm(slotIndex);
    ui.setTransmittingSlot(slotIndex);

    // Update pipeline for this slot
    await updatePipeline();

    if (!state.text || !state.text.trim()) {
      // Empty slot: skip to next
      handleBatchSlotCompletion();
      return;
    }

    try {
      dom.deckStatus.textContent = `TRANSMITTING TX ${slotIndex + 1}/${state.slots.length}`;
      dom.deckStatus.style.color = 'var(--emerald-400)';
      dom.audio.currentTime = 0;
      await dom.audio.play();
      startPlaybackLoop();
    } catch (err) {
      console.warn('[Batch Play Error]', err);
      handleBatchSlotCompletion();
    }
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
    if (state.batchTimer) {
      clearTimeout(state.batchTimer);
      state.batchTimer = null;
    }
    state.isBatchPlaying = false;
    state.batchCurrentSlot = -1;
    ui.clearTransmittingSlots();

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

  /* ========================================================================
     5. TELEGRAPH MESSAGE PAD & BATCH QUEUE MANAGEMENT
     ======================================================================== */
  /**
   * Composes the full telegraphic message string from the message pad fields
   * following standard Police Wireless / WT radiogram format.
   * @param {Object} [customData] - Optional form data override
   * @returns {string}
   */
  function composeTransmissionText(customData = null) {
    const d = customData || {
      warnings: dom.msgWarnings ? dom.msgWarnings.value : '',
      call: dom.msgCall ? dom.msgCall.value : '',
      priority: dom.msgPriority ? dom.msgPriority.value : '',
      trans: dom.msgTrans ? dom.msgTrans.value : '',
      nr: dom.msgNr ? dom.msgNr.value : '',
      gr: dom.msgGr ? dom.msgGr.value : '',
      to: dom.msgTo ? dom.msgTo.value : '',
      w: dom.msgW ? dom.msgW.value : '',
      v: dom.msgV ? dom.msgV.value : '',
      orgNo: dom.msgOrgNo ? dom.msgOrgNo.value : '',
      date1: dom.msgDate1 ? dom.msgDate1.value : '',
      inReplyTo: dom.msgInReplyTo ? dom.msgInReplyTo.value : '',
      date2: dom.msgDate2 ? dom.msgDate2.value : '',
      security: dom.msgSecurity ? dom.msgSecurity.value : '',
      text: dom.inputText ? dom.inputText.value : '',
      too: dom.msgToo ? dom.msgToo.value : '',
      thi: dom.msgThi ? dom.msgThi.value : ''
    };

    const bodyText = (d.text || '').trim();

    // If transmitMode is 'body', only transmit the message text portion
    if (state.transmitMode === 'body') {
      return bodyText;
    }

    const warnings = (d.warnings || '').trim();
    const call = (d.call || '').trim();
    const priority = (d.priority || '').trim();
    const trans = (d.trans || '').trim();
    const nr = (d.nr || '').trim();
    const gr = (d.gr || '').trim();
    const to = (d.to || '').trim();
    const w = (d.w || '').trim();
    const v = (d.v || '').trim();
    const orgNo = (d.orgNo || '').trim();
    const date1 = (d.date1 || '').trim();
    const inReplyTo = (d.inReplyTo || '').trim();
    const date2 = (d.date2 || '').trim();
    const security = (d.security || '').trim();
    const too = (d.too || '').trim();
    const thi = (d.thi || '').trim();

    const hasHeaders = Boolean(
      warnings || call || priority || trans || nr || gr ||
      to || w || v || orgNo || date1 || inReplyTo || date2 || security || too || thi
    );

    // If no header or footer fields are filled, transmit just the body
    if (!hasHeaders) {
      return bodyText;
    }

    const lines = [];

    // Line 0: Warnings (Handling Instructions)
    if (warnings) {
      lines.push(warnings);
    }

    // Line 1: CALL | PRIORITY | TRANS | NR | GR
    const headerParts = [];
    if (call) headerParts.push(call);
    if (priority) headerParts.push(priority);
    if (trans) headerParts.push(trans);
    if (nr) headerParts.push(nr.toUpperCase().startsWith('NR') ? nr : `NR ${nr}`);
    if (gr) headerParts.push(gr.toUpperCase().startsWith('GR') ? gr : `GR ${gr}`);
    if (headerParts.length) lines.push(headerParts.join(' '));

    // Line 2: TO | W | V (Routing)
    const routingParts = [];
    if (to) routingParts.push(`TO ${to}`);
    if (w) routingParts.push(`W ${w}`);
    if (v) routingParts.push(`V ${v}`);
    if (routingParts.length) lines.push(routingParts.join(' '));

    // Line 3: ORG No. | DATE | IN REPLY TO | DATE | SECURITY CLASSIFICATION
    const refParts = [];
    if (orgNo) refParts.push(`ORG ${orgNo}`);
    if (date1) refParts.push(date1);
    if (inReplyTo) refParts.push(`IN REPLY TO ${inReplyTo}`);
    if (date2) refParts.push(date2);
    if (security) refParts.push(security);
    if (refParts.length) lines.push(refParts.join(' '));

    // Line 4: MESSAGE TEXT PORTION
    if (bodyText) {
      lines.push(bodyText);
    }

    // Line 5: T.O.O & T.H.I (Footer Transmission Times)
    const footerParts = [];
    if (too) footerParts.push(`TOO ${too}`);
    if (thi) footerParts.push(`THI ${thi}`);
    if (footerParts.length) lines.push(footerParts.join(' '));

    return lines.join('\n');
  }

  /**
   * Saves the current DOM form fields into the active transmission slot in memory.
   */
  function saveFormToCurrentSlot() {
    if (!state.slots || !state.slots[state.activeSlotIndex]) return;
    const slot = state.slots[state.activeSlotIndex];

    slot.formData = {
      warnings: dom.msgWarnings ? dom.msgWarnings.value : '',
      call: dom.msgCall ? dom.msgCall.value : '',
      priority: dom.msgPriority ? dom.msgPriority.value : '',
      trans: dom.msgTrans ? dom.msgTrans.value : '',
      nr: dom.msgNr ? dom.msgNr.value : '',
      gr: dom.msgGr ? dom.msgGr.value : '',
      to: dom.msgTo ? dom.msgTo.value : '',
      w: dom.msgW ? dom.msgW.value : '',
      v: dom.msgV ? dom.msgV.value : '',
      orgNo: dom.msgOrgNo ? dom.msgOrgNo.value : '',
      date1: dom.msgDate1 ? dom.msgDate1.value : '',
      inReplyTo: dom.msgInReplyTo ? dom.msgInReplyTo.value : '',
      date2: dom.msgDate2 ? dom.msgDate2.value : '',
      security: dom.msgSecurity ? dom.msgSecurity.value : '',
      text: dom.inputText ? dom.inputText.value : '',
      too: dom.msgToo ? dom.msgToo.value : '',
      thi: dom.msgThi ? dom.msgThi.value : ''
    };

    const words = slot.formData.text.trim() ? slot.formData.text.trim().split(/\s+/).length : 0;
    slot.words = words;

    if (slot.formData.call && slot.formData.to) {
      slot.title = `${slot.formData.call} → ${slot.formData.to}`;
    } else if (slot.formData.text.trim()) {
      const wordsArr = slot.formData.text.trim().split(/\s+/);
      const snippet = wordsArr.slice(0, 3).join(' ');
      slot.title = snippet.length > 20 ? snippet.slice(0, 18) + '...' : snippet;
    }

    if (state.manifest) {
      slot.duration = state.manifest.totalDuration;
    }

    ui.updateSlotTabUI(state.activeSlotIndex, {
      title: slot.title,
      duration: slot.duration,
      words: slot.words,
      status: state.batchCurrentSlot === state.activeSlotIndex ? 'transmitting' : (slot.formData.text.trim() ? 'ready' : 'empty')
    });
  }

  /**
   * Loads a transmission slot's data into the DOM message pad form.
   * @param {number} slotIndex
   */
  function loadSlotToForm(slotIndex) {
    if (!state.slots || slotIndex < 0 || slotIndex >= state.slots.length) return;
    state.activeSlotIndex = slotIndex;
    const slot = state.slots[slotIndex];
    const d = slot.formData;

    if (dom.msgWarnings) dom.msgWarnings.value = d.warnings || '';
    if (dom.msgCall) dom.msgCall.value = d.call || '';
    if (dom.msgPriority) dom.msgPriority.value = d.priority || '';
    if (dom.msgTrans) dom.msgTrans.value = d.trans || '';
    if (dom.msgNr) dom.msgNr.value = d.nr || '';
    if (dom.msgGr) dom.msgGr.value = d.gr || '';
    if (dom.msgTo) dom.msgTo.value = d.to || '';
    if (dom.msgW) dom.msgW.value = d.w || '';
    if (dom.msgV) dom.msgV.value = d.v || '';
    if (dom.msgOrgNo) dom.msgOrgNo.value = d.orgNo || '';
    if (dom.msgDate1) dom.msgDate1.value = d.date1 || '';
    if (dom.msgInReplyTo) dom.msgInReplyTo.value = d.inReplyTo || '';
    if (dom.msgDate2) dom.msgDate2.value = d.date2 || '';
    if (dom.msgSecurity) dom.msgSecurity.value = d.security || '';
    if (dom.inputText) dom.inputText.value = d.text || '';
    if (dom.msgToo) dom.msgToo.value = d.too || '';
    if (dom.msgThi) dom.msgThi.value = d.thi || '';

    if (dom.msgGr && !dom.msgGr.value.trim()) {
      const words = d.text.trim() ? d.text.trim().split(/\s+/).length : 0;
      dom.msgGr.placeholder = words ? String(words) : 'GR';
    }

    ui.setActiveSlotTab(slotIndex);
    state.text = composeTransmissionText();
    updateTextStats(state.text);
  }

  function updateTextStats(txt) {
    const chars = txt ? txt.length : 0;
    const words = txt && txt.trim() ? txt.trim().split(/\s+/).length : 0;
    dom.charCountInfo.textContent = `${chars} characters • ${words} words`;
  }

  // Reactive handler when any message pad field is modified
  function onMessageFormChange() {
    state.text = composeTransmissionText();
    updateTextStats(state.text);
    saveFormToCurrentSlot();

    // Auto-update group count (GR) placeholder based on words in body
    if (dom.msgGr && !dom.msgGr.value.trim()) {
      const bodyVal = dom.inputText ? dom.inputText.value.trim() : '';
      const words = bodyVal ? bodyVal.split(/\s+/).length : 0;
      dom.msgGr.placeholder = words ? String(words) : 'GR';
    }

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
  }

  // Bind input listener across all fields in the telegraph form pad
  const msgInputs = [
    dom.msgWarnings, dom.msgCall, dom.msgPriority, dom.msgTrans, dom.msgNr, dom.msgGr,
    dom.msgTo, dom.msgW, dom.msgV, dom.msgOrgNo, dom.msgDate1, dom.msgInReplyTo,
    dom.msgDate2, dom.msgSecurity, dom.inputText, dom.msgToo, dom.msgThi
  ].filter(Boolean);

  msgInputs.forEach(input => {
    input.addEventListener('input', onMessageFormChange);
  });

  // Slot Selector Tabs Listener
  if (dom.slotTabs) {
    dom.slotTabs.forEach(tab => {
      tab.addEventListener('click', async () => {
        const slotIdx = parseInt(tab.dataset.slot, 10);
        if (isNaN(slotIdx) || slotIdx === state.activeSlotIndex) return;

        // If batch playing, halt batch sequence
        if (state.isBatchPlaying) {
          if (state.batchTimer) {
            clearTimeout(state.batchTimer);
            state.batchTimer = null;
          }
          state.isBatchPlaying = false;
          state.batchCurrentSlot = -1;
          ui.clearTransmittingSlots();
          dom.audio.pause();
          stopPlaybackLoop();
        }

        saveFormToCurrentSlot();
        loadSlotToForm(slotIdx);
        ui.setRenderState(true, state.text.trim().length > 0);
        await updatePipeline();
      });
    });
  }

  // Play All (Batch Queue 1 → 2 → 3) Button Listener
  if (dom.btnPlayAll) {
    dom.btnPlayAll.addEventListener('click', async () => {
      saveFormToCurrentSlot();

      // If already playing batch, toggle to stop
      if (state.isBatchPlaying) {
        if (state.batchTimer) {
          clearTimeout(state.batchTimer);
          state.batchTimer = null;
        }
        state.isBatchPlaying = false;
        state.batchCurrentSlot = -1;
        ui.clearTransmittingSlots();
        dom.audio.pause();
        stopPlaybackLoop();
        dom.beaconModule.classList.remove('active');
        dom.beaconLabel.textContent = 'CARRIER OFF';
        dom.deckStatus.textContent = 'QUEUE STOPPED';
        dom.deckStatus.style.color = 'var(--text-muted)';
        ui.showToast('Stopped batch transmission');
        return;
      }

      state.isBatchPlaying = true;
      ui.showToast(`Starting batch transmission queue (TX 1 → ... → TX ${state.slots.length})...`);
      await playSlotInBatch(0);
    });
  }

  // Inter-message Pause Duration (GAP input field in seconds)
  const gapInput = dom.inputQueueDelay || dom.selectQueueDelay;
  if (gapInput) {
    const onGapChange = (e) => {
      let val = parseFloat(e.target.value);
      if (isNaN(val) || val < 0) val = 0;
      state.interMessageGapSeconds = val;
    };
    gapInput.addEventListener('input', onGapChange);
    gapInput.addEventListener('change', (e) => {
      onGapChange(e);
      ui.showToast(`Pause before next TX set to ${state.interMessageGapSeconds}s`);
    });
  }

  // Transmission Mode Selector (Full Pad vs Text Only)
  if (dom.modeTransmitFull) {
    dom.modeTransmitFull.addEventListener('change', () => {
      if (dom.modeTransmitFull.checked) {
        state.transmitMode = 'full';
        onMessageFormChange();
      }
    });
  }
  if (dom.modeTransmitBody) {
    dom.modeTransmitBody.addEventListener('change', () => {
      if (dom.modeTransmitBody.checked) {
        state.transmitMode = 'body';
        onMessageFormChange();
      }
    });
  }

  // Clear Current Transmission Slot
  if (dom.btnClearForm) {
    dom.btnClearForm.addEventListener('click', () => {
      msgInputs.forEach(inp => {
        inp.value = '';
      });
      if (dom.msgGr) dom.msgGr.placeholder = 'GR';
      onMessageFormChange();
      saveFormToCurrentSlot();
      ui.showToast(`Cleared TX ${state.activeSlotIndex + 1} fields`);
    });
  }

  // Presets Data & Chip Listeners
  const presetsData = {
    'apro': {
      warnings: 'ROUTINE',
      call: 'APRO',
      priority: 'P',
      trans: 'TRANS',
      nr: '01',
      gr: '9',
      to: 'ALL STATIONS',
      w: 'CID',
      v: 'HQ DISPUR',
      orgNo: '104/WT',
      date1: '14/10',
      inReplyTo: '',
      date2: '',
      security: 'UNCLASS',
      text: 'APRO POLICE WIRELESS NET ESTD 1946 QRK 5 OVER',
      too: '1200',
      thi: '1205'
    },
    'q-signals': {
      call: 'APRO',
      priority: 'ROUTINE',
      trans: '',
      nr: '02',
      gr: '7',
      to: 'GUWAHATI NET',
      w: '',
      v: 'CONTROL',
      orgNo: '105/WT',
      date1: '14/10',
      inReplyTo: '',
      date2: '',
      security: 'UNCLASS',
      text: 'QRK 5 QTH GUWAHATI QTR 1200 K',
      too: '1200',
      thi: '1202'
    },
    'sos': {
      warnings: 'DISTRESS',
      call: 'MAYDAY',
      priority: 'FLASH',
      trans: 'EMERGENCY',
      nr: '01',
      gr: '3',
      to: 'ALL STATIONS',
      w: 'COAST GUARD',
      v: 'VESSEL',
      orgNo: '01/EMG',
      date1: '14/10',
      inReplyTo: '',
      date2: '',
      security: 'EMERGENCY',
      text: 'SOS SOS SOS',
      too: '0001',
      thi: '0002'
    },
    'cq': {
      call: 'APRO',
      priority: 'ROUTINE',
      trans: 'TRANS',
      nr: '03',
      gr: '6',
      to: 'CQ CQ CQ',
      w: '',
      v: 'APRO',
      orgNo: '106/WT',
      date1: '14/10',
      inReplyTo: '',
      date2: '',
      security: 'UNCLASS',
      text: 'CQ CQ CQ DE APRO K',
      too: '1000',
      thi: '1005'
    },
    'pangram': {
      text: 'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG'
    },
    'paris': {
      text: 'PARIS PARIS PARIS'
    },
    'emergency': {
      warnings: 'HIGH PRIORITY',
      call: 'PATROL 1',
      priority: 'EMERGENCY',
      trans: 'DIRECT',
      nr: '09',
      gr: '15',
      to: 'POLICE CONTROL',
      w: 'SP CRIME',
      v: 'MOBILE PATROL',
      orgNo: '22/WT',
      date1: '14/10',
      inReplyTo: '',
      date2: '',
      security: 'CONFIDENTIAL',
      text: 'MAYDAY MAYDAY MAYDAY DE POLICE MOBILE UNIT LAT 26 11 N LONG 91 44 E OVER',
      too: '0430',
      thi: '0435'
    }
  };

  document.querySelectorAll('.preset-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const presetKey = btn.dataset.preset;
      const data = presetsData[presetKey];
      if (!data) return;

      // Reset all fields first
      msgInputs.forEach(inp => {
        inp.value = '';
      });

      if (dom.msgWarnings) dom.msgWarnings.value = data.warnings || '';
      if (dom.msgCall) dom.msgCall.value = data.call || '';
      if (dom.msgPriority) dom.msgPriority.value = data.priority || '';
      if (dom.msgTrans) dom.msgTrans.value = data.trans || '';
      if (dom.msgNr) dom.msgNr.value = data.nr || '';
      if (dom.msgGr) dom.msgGr.value = data.gr || '';
      if (dom.msgTo) dom.msgTo.value = data.to || '';
      if (dom.msgW) dom.msgW.value = data.w || '';
      if (dom.msgV) dom.msgV.value = data.v || '';
      if (dom.msgOrgNo) dom.msgOrgNo.value = data.orgNo || '';
      if (dom.msgDate1) dom.msgDate1.value = data.date1 || '';
      if (dom.msgInReplyTo) dom.msgInReplyTo.value = data.inReplyTo || '';
      if (dom.msgDate2) dom.msgDate2.value = data.date2 || '';
      if (dom.msgSecurity) dom.msgSecurity.value = data.security || '';
      if (dom.inputText) dom.inputText.value = data.text || '';
      if (dom.msgToo) dom.msgToo.value = data.too || '';
      if (dom.msgThi) dom.msgThi.value = data.thi || '';

      onMessageFormChange();
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

    // Pre-calculate timing and status for all 3 transmission slots
    for (let i = 0; i < state.slots.length; i++) {
      const slot = state.slots[i];
      const slotText = composeTransmissionText(slot.formData);
      slot.compiledText = slotText;
      if (slotText && slotText.trim()) {
        try {
          const m = global.compileMorseTimeline(slotText, state.wpm);
          slot.duration = m.totalDuration;
        } catch (e) {
          slot.duration = 0;
        }
      }
      ui.updateSlotTabUI(i, {
        title: slot.title,
        duration: slot.duration,
        words: slot.words,
        status: slot.status
      });
    }

    // Initialize Theme Mode (Light / Dark)
    ui.initTheme();
    if (dom.btnThemeToggle) {
      dom.btnThemeToggle.addEventListener('click', () => {
        ui.toggleTheme();
      });
    }

    // Load transmission slot 0 into active form
    loadSlotToForm(0);
    updateTextStats(state.text);
    await updatePipeline();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(typeof window !== 'undefined' ? window : this);
