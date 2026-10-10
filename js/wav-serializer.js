/**
 * wav-serializer.js
 * -----------------------------------------------------------------------------
 * Zero-dependency pure JavaScript 16-bit PCM WAV audio serializer.
 * Encodes an AudioBuffer into an uncompressed .wav Blob using DataView.
 * Follows standard RIFF / WAVE specification with 16-bit little-endian samples
 * and hard-clipping protection [-1.0, 1.0].
 */
(function (global) {
  'use strict';

  /**
   * Serializes an AudioBuffer to an uncompressed 16-bit PCM WAV Blob.
   * @param {AudioBuffer} audioBuffer - Rendered Web Audio buffer
   * @returns {Blob} Standard audio/wav Blob
   */
  function serializeAudioBufferToWav(audioBuffer) {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = 1; // 1 = PCM uncompressed
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    const numSamples = audioBuffer.length;
    const dataByteLength = numSamples * blockAlign;
    const totalBufferLength = 44 + dataByteLength;

    const arrayBuffer = new ArrayBuffer(totalBufferLength);
    const view = new DataView(arrayBuffer);

    // Helper to write ASCII characters
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    // 1. RIFF Header
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataByteLength, true); // ChunkSize (total - 8)
    writeString(8, 'WAVE');

    // 2. "fmt " Subchunk
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);             // Subchunk1Size (16 for PCM)
    view.setUint16(20, format, true);         // AudioFormat (1 = PCM)
    view.setUint16(22, numChannels, true);   // NumChannels (1 = Mono)
    view.setUint32(24, sampleRate, true);    // SampleRate (e.g. 44100)
    view.setUint32(28, sampleRate * blockAlign, true); // ByteRate
    view.setUint16(32, blockAlign, true);    // BlockAlign
    view.setUint16(34, bitDepth, true);      // BitsPerSample (16-bit)

    // 3. "data" Subchunk
    writeString(36, 'data');
    view.setUint32(40, dataByteLength, true); // Subchunk2Size

    // 4. Sample Data Conversion with Hard Clipping Protection
    let writeOffset = 44;
    const channelData = audioBuffer.getChannelData(0); // Primary mono channel

    for (let i = 0; i < numSamples; i++) {
      let s = channelData[i];

      // Hard clipping clamp to prevent overflow distortion
      if (s < -1.0) s = -1.0;
      else if (s > 1.0) s = 1.0;

      // Convert float32 [-1.0, 1.0] to signed 16-bit integer [-32768, 32767]
      const int16 = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7FFF);
      view.setInt16(writeOffset, int16, true); // Little-endian
      writeOffset += 2;
    }

    return new Blob([view], { type: 'audio/wav' });
  }

  // Export to global scope
  global.serializeAudioBufferToWav = serializeAudioBufferToWav;

})(typeof window !== 'undefined' ? window : this);
