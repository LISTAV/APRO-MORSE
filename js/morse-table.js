/**
 * morse-table.js
 * -----------------------------------------------------------------------------
 * ITU-R M.1677-1 International Morse Code Dictionary.
 * Defines standard character representations for letters (A-Z), digits (0-9),
 * and standard punctuation & prosigns.
 */
(function (global) {
  'use strict';

  const MORSE_TABLE = {
    // Letters (A-Z)
    'A': '.-',     'B': '-...',   'C': '-.-.',   'D': '-..',
    'E': '.',      'F': '..-.',   'G': '--.',    'H': '....',
    'I': '..',     'J': '.---',   'K': '-.-',    'L': '.-..',
    'M': '--',     'N': '-.',     'O': '---',    'P': '.--.',
    'Q': '--.-',   'R': '.-.',    'S': '...',    'T': '-',
    'U': '..-',    'V': '...-',   'W': '.--',    'X': '-..-',
    'Y': '-.--',   'Z': '--..',

    // Numbers (0-9)
    '0': '-----',  '1': '.----',  '2': '..---',  '3': '...--',
    '4': '....-',  '5': '.....',  '6': '-....',  '7': '--...',
    '8': '---..',  '9': '----.',

    // Punctuation & Prosigns (ITU Standard)
    '.': '.-.-.-', ',': '--..--', ':': '---...', '?': '..--..',
    "'": '.----.', '-': '-....-', '/': '-..-.',  '(': '-.--.',
    ')': '-.--.-', '"': '.-..-.', '=': '-...-',  '+': '.-.-.',
    '@': '.--.-.', '!': '-.-.--', '&': '.-...',  ';': '-.-.-.',
    '_': '..--.-', '$': '...-..-'
  };

  /**
   * Retrieves the Morse string for a given character.
   * @param {string} char - Single character
   * @returns {string|null} Morse representation or null if unsupported
   */
  function getMorseForChar(char) {
    if (!char) return null;
    return MORSE_TABLE[char.toUpperCase()] || null;
  }

  // Export to global scope
  global.MORSE_TABLE = MORSE_TABLE;
  global.getMorseForChar = getMorseForChar;

})(typeof window !== 'undefined' ? window : this);
