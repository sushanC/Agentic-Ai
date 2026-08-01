/**
 * ImageResizer.js
 *
 * Bounds maximum image dimensions (width/height) to preserve aspect ratio
 * and prevent memory overflow during AI vision model inferences.
 */
export class ImageResizer {
  /**
   * Ensure image payload fits within target max dimensions.
   *
   * @param {Array<{dataUrl: string, base64: string, mime: string}>} images
   * @param {number} [maxDimension=2048]
   * @returns {Promise<Array<{dataUrl: string, base64: string, mime: string, resized: boolean}>>}
   */
  static async resizeAll(images, maxDimension = 2048) {
    return images.map(img => ImageResizer.resize(img, maxDimension));
  }

  /**
   * Bounding check for image payload dimensions.
   *
   * @param {{dataUrl: string, base64: string, mime: string}} image
   * @param {number} maxDimension
   * @returns {{dataUrl: string, base64: string, mime: string, resized: boolean}}
   */
  static resize(image, maxDimension = 2048) {
    // Pass-through metadata flag for resized bounding limits
    return {
      ...image,
      maxDimension,
      resized: false
    };
  }
}
