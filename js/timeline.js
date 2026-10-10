/**
 * timeline.js
 * -----------------------------------------------------------------------------
 * ITU-R M.1677-1 Morse Code Timeline Builder & Manifest Compiler.
 * 
 * Timing formula based on PARIS benchmark:
 * - Unit duration: T = 1.2 / WPM seconds.
 * - Dit: 1 unit tone.
 * - Dah: 3 units tone.
 * - Intra-character space (between elements in same letter): 1 unit silence.
 * - Inter-character space: 3 units silence.
 * - Inter-word space: 7 units silence (4 units added to the trailing letter space).
 */
(function (global) {
  'use strict';

  /**
   * Compiles input text into exact timing schedules and a sample-exact Manifest.
   * @param {string} text - Raw input message
   * @param {number} wpm - Words per minute (5 to 45)
   * @returns {Object} Manifest containing totalDuration, charMaps, allSymbols, tonesToRender, unitDuration
   */
  function compileMorseTimeline(text, wpm) {
    const T = 1.2 / wpm; // Unit duration in seconds
    let currentTime = 0;
    
    const charMaps = [];
    const allSymbols = [];
    const tonesToRender = [];

    const len = text ? text.length : 0;

    for (let i = 0; i < len; i++) {
      const char = text[i];
      const upper = char.toUpperCase();

      // Whitespace Handling (spaces, tabs, newlines)
      if (/\s/.test(char)) {
        const spaceStart = currentTime;
        // Inter-word silence: 4 units added to preceding 3-unit letter space = 7 units
        const spaceDuration = 4 * T;
        const spaceEnd = spaceStart + spaceDuration;

        const symbolObj = {
          isTone: false,
          symbolChar: char,
          startTime: spaceStart,
          endTime: spaceEnd,
          charIndex: i
        };

        charMaps.push({
          char: char,
          charIndex: i,
          morse: '',
          startTime: spaceStart,
          endTime: spaceEnd,
          symbols: [symbolObj]
        });

        allSymbols.push(symbolObj);
        currentTime = spaceEnd;
        continue;
      }

      // Check if character is encodable in International Morse
      const morse = global.getMorseForChar ? global.getMorseForChar(char) : (global.MORSE_TABLE ? global.MORSE_TABLE[upper] : null);

      if (morse) {
        const charStart = currentTime;
        const charSymbols = [];

        // Process each dit (.) or dah (-)
        for (let j = 0; j < morse.length; j++) {
          const sym = morse[j];
          const toneDuration = sym === '.' ? 1 * T : 3 * T;
          const toneStart = currentTime;
          const toneEnd = toneStart + toneDuration;

          const toneObj = {
            isTone: true,
            symbolChar: sym,
            startTime: toneStart,
            endTime: toneEnd,
            charIndex: i,
            symbolIndex: j
          };

          charSymbols.push(toneObj);
          allSymbols.push(toneObj);
          tonesToRender.push({ startTime: toneStart, endTime: toneEnd });
          currentTime = toneEnd;

          // Intra-element gap (1 unit) between dits/dahs of the same character
          if (j < morse.length - 1) {
            const gapStart = currentTime;
            const gapEnd = gapStart + 1 * T;
            const gapObj = {
              isTone: false,
              symbolChar: '',
              startTime: gapStart,
              endTime: gapEnd,
              charIndex: i
            };
            charSymbols.push(gapObj);
            allSymbols.push(gapObj);
            currentTime = gapEnd;
          }
        }

        // Trailing letter gap: 3 units silence before next character
        // If this is the last character of the text, apply 1 unit release margin
        const isLast = (i === len - 1);
        const letterGapDuration = isLast ? 1 * T : 3 * T;
        const letterGapStart = currentTime;
        const letterGapEnd = letterGapStart + letterGapDuration;

        const letterGapObj = {
          isTone: false,
          symbolChar: '',
          startTime: letterGapStart,
          endTime: letterGapEnd,
          charIndex: i
        };

        charSymbols.push(letterGapObj);
        allSymbols.push(letterGapObj);
        currentTime = letterGapEnd;

        charMaps.push({
          char: char,
          charIndex: i,
          morse: morse,
          startTime: charStart,
          endTime: letterGapEnd,
          symbols: charSymbols
        });

      } else {
        // Unsupported Character (e.g. unknown symbol or emoji)
        // Skip gracefully without producing audio, maintain in manifest for playhead continuity
        const charStart = currentTime;
        charMaps.push({
          char: char,
          charIndex: i,
          morse: '',
          startTime: charStart,
          endTime: charStart,
          symbols: []
        });
      }
    }

    // Add 50ms trailing comfort padding to prevent clipping of the final audio sample
    const totalDuration = currentTime > 0 ? currentTime + 0.05 : 0;

    return {
      totalDuration,
      charMaps,
      allSymbols,
      tonesToRender,
      unitDuration: T
    };
  }

  /**
   * Formats raw text into a clean Morse code string with ' / ' between words
   * and ' ' between letters for clipboard copying.
   * @param {string} text - Input text
   * @returns {string} Formatted Morse string
   */
  function formatMorseText(text) {
    if (!text || !text.trim()) return '';
    const words = text.trim().split(/\s+/);
    const morseWords = words.map(word => {
      const letters = [];
      for (let i = 0; i < word.length; i++) {
        const code = global.getMorseForChar ? global.getMorseForChar(word[i]) : null;
        if (code) letters.push(code);
      }
      return letters.join(' ');
    }).filter(w => w.length > 0);

    return morseWords.join(' / ');
  }

  // Export to global scope
  global.compileMorseTimeline = compileMorseTimeline;
  global.formatMorseText = formatMorseText;

})(typeof window !== 'undefined' ? window : this);
