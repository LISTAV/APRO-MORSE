/**
 * app.js
 * -----------------------------------------------------------------------------
 * NOTE: This file has been refactored and decomposed into modular components
 * located in the `js/` directory for enhanced human readability and separation of concerns:
 * 
 * 1. js/morse-table.js    - ITU-R M.1677-1 Morse code dictionary & mapping
 * 2. js/wav-serializer.js - Pure DataView 16-bit PCM WAV binary encoder
 * 3. js/timeline.js       - PARIS benchmark timing & sample-exact manifest compiler
 * 4. js/audio-engine.js   - Web Audio OfflineAudioContext with anti-click envelopes
 * 5. js/search.js         - O(log N) binary search lookup algorithm
 * 6. js/ui.js             - DOM management, visual reader rendering, and telemetry HUD
 * 7. js/main.js           - Central application controller, reactive state, and transport logic
 * 
 * See index.html where these modular scripts are linked in order.
 */
