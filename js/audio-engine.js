/**
 * audio-engine.js
 * -----------------------------------------------------------------------------
 * Offline Web Audio Synthesis Engine.
 * 
 * Pre-renders all Morse audio tones in memory using OfflineAudioContext.
 * Applies a 4ms linear attack and 4ms linear release envelope to every tone
 * on an offline GainNode to eliminate audio pops and clicks.
 */
(function (global) {
  'use strict';

  /**
   * Pre-renders Morse audio in memory using OfflineAudioContext.
   * @param {Array<{startTime: number, endTime: number}>} tonesToRender - Scheduled tone intervals
   * @param {number} pitch - Audio frequency in Hz (400 to 1000)
   * @param {number} totalDuration - Total track duration in seconds
   * @returns {Promise<AudioBuffer>} Rendered Web Audio buffer
   */
  async function renderAudioBuffer(tonesToRender, pitch, totalDuration) {
    const sampleRate = 44100;
    const totalSamples = Math.max(1, Math.ceil(totalDuration * sampleRate));

    const OfflineContextClass = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const offlineCtx = new OfflineContextClass(1, totalSamples, sampleRate);

    // Single continuous sine wave oscillator preserves phase coherence for warm CW transmitter tone
    const osc = offlineCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch, 0);

    const gainNode = offlineCtx.createGain();
    gainNode.gain.setValueAtTime(0, 0);

    // Schedule anti-click linear attack and release envelopes
    for (let i = 0; i < tonesToRender.length; i++) {
      const tone = tonesToRender[i];
      const toneStart = tone.startTime;
      const toneEnd = tone.endTime;
      const duration = toneEnd - toneStart;

      // 4ms envelope clamped to half the duration for extremely fast WPM
      const ramp = Math.min(0.004, duration / 2);

      // 4ms linear attack
      gainNode.gain.setValueAtTime(0, toneStart);
      gainNode.gain.linearRampToValueAtTime(1.0, toneStart + ramp);

      // 4ms linear release
      if (toneEnd - ramp > toneStart + ramp + 0.0001) {
        gainNode.gain.setValueAtTime(1.0, toneEnd - ramp);
      }
      gainNode.gain.linearRampToValueAtTime(0, toneEnd);
    }

    osc.connect(gainNode);
    gainNode.connect(offlineCtx.destination);

    osc.start(0);
    if (totalDuration > 0) {
      osc.stop(totalDuration);
    }

    return await offlineCtx.startRendering();
  }

  // Export to global scope
  global.renderAudioBuffer = renderAudioBuffer;

})(typeof window !== 'undefined' ? window : this);
