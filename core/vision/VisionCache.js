import crypto from "crypto";

/**
 * VisionCache.js
 *
 * Caches vision analysis results keyed by SHA-256 hashes of image payloads
 * and prompts to prevent duplicate inferences.
 */
export class VisionCache {
  constructor(maxEntries = 100, ttlMs = 3600000) {
    this.cache = new Map(); // hash -> { result, timestamp }
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
  }

  /**
   * Generate SHA-256 cache key from normalized images and prompt.
   *
   * @param {Array<{base64: string}>} images
   * @param {string} prompt
   * @param {string} task
   * @returns {string} SHA-256 hash
   */
  generateKey(images, prompt, task) {
    const hash = crypto.createHash("sha256");
    for (const img of images) {
      hash.update(img.base64 || "");
    }
    hash.update(prompt || "");
    hash.update(task || "");
    return hash.digest("hex");
  }

  /**
   * Get cached result if available and non-expired.
   *
   * @param {string} key
   * @returns {object|null}
   */
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    return entry.result;
  }

  /**
   * Store result in cache.
   *
   * @param {string} key
   * @param {object} result
   */
  set(key, result) {
    if (this.cache.size >= this.maxEntries) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, { result, timestamp: Date.now() });
  }

  clear() {
    this.cache.clear();
  }
}

export const visionCache = new VisionCache();
