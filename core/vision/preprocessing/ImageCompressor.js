/**
 * ImageCompressor.js
 *
 * Ensures image Base64 payloads stay within max byte limits (e.g., 10MB) for AI vision model APIs.
 */
export class ImageCompressor {
  /**
   * Compress image payloads if total byte size exceeds target threshold.
   *
   * @param {Array<{dataUrl: string, base64: string, mime: string}>} images
   * @param {number} [maxBytes=10485760] - Default 10MB limit
   * @returns {Promise<Array<{dataUrl: string, base64: string, mime: string, compressed: boolean}>>}
   */
  static async compressAll(images, maxBytes = 10485760) {
    return images.map(img => ImageCompressor.compress(img, maxBytes));
  }

  /**
   * Compress a single image payload.
   *
   * @param {{dataUrl: string, base64: string, mime: string}} image
   * @param {number} maxBytes
   * @returns {{dataUrl: string, base64: string, mime: string, compressed: boolean}}
   */
  static compress(image, maxBytes = 10485760) {
    const sizeInBytes = Math.ceil((image.base64.length * 3) / 4);
    const compressed = sizeInBytes > maxBytes;

    return {
      ...image,
      compressedSize: sizeInBytes,
      compressed
    };
  }
}
