/**
 * search.js
 * -----------------------------------------------------------------------------
 * High-performance O(log N) Binary Search Algorithm.
 * 
 * Provides sample-exact lookup to find the currently active character map
 * and active tone symbol at any arbitrary audio.currentTime.
 */
(function (global) {
  'use strict';

  /**
   * Finds the item in a chronologically ordered array that encloses the given time.
   * @param {Array<{startTime: number, endTime: number}>} items - Sorted array of time intervals
   * @param {number} time - Current playback time in seconds
   * @returns {Object|null} Matching interval object or null
   */
  function binarySearchByTime(items, time) {
    if (!items || items.length === 0 || time < 0) return null;

    let low = 0;
    let high = items.length - 1;

    while (low <= high) {
      const mid = (low + high) >> 1;
      const item = items[mid];

      if (time >= item.startTime && time < item.endTime) {
        return item;
      } else if (time < item.startTime) {
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    return null;
  }

  // Export to global scope
  global.binarySearchByTime = binarySearchByTime;

})(typeof window !== 'undefined' ? window : this);
