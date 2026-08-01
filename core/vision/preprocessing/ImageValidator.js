/**
 * ImageValidator.js
 *
 * Validates input images for the Vision Framework.
 * Supports PNG, JPEG, WEBP, GIF (first frame), BMP, and TIFF formats.
 * Handles single image payloads, data URIs, file paths, base64 buffers, and image arrays.
 */

export const SUPPORTED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/tiff"
]);

export const SUPPORTED_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff", ".tif"
]);

export class ImageValidator {
  /**
   * Validate image input.
   *
   * @param {any} input - Image file path, data URL, base64 string, Buffer, or array thereof
   * @returns {{ valid: boolean, errors: string[], images: Array }}
   */
  static validate(input) {
    const errors = [];
    const images = Array.isArray(input) ? input : (input ? [input] : []);

    if (images.length === 0) {
      return {
        valid: false,
        errors: ["No image payload or file path provided."],
        images: []
      };
    }

    const validatedImages = [];

    for (let i = 0; i < images.length; i++) {
      const item = images[i];
      if (!item) {
        errors.push(`Item at index ${i} is empty or null.`);
        continue;
      }

      if (typeof item === "string") {
        if (item.startsWith("data:image/")) {
          const mime = item.substring(5, item.indexOf(";"));
          if (!SUPPORTED_MIME_TYPES.has(mime.toLowerCase())) {
            errors.push(`Unsupported data URI MIME type: ${mime}`);
            continue;
          }
          validatedImages.push({ type: "data-url", value: item, mime });
        } else if (/^[a-zA-Z0-9+/=]+$/.test(item.replace(/\s/g, "")) && item.length > 100) {
          // Plain Base64 string
          validatedImages.push({ type: "base64", value: item.trim(), mime: "image/png" });
        } else {
          // File path
          const ext = item.substring(item.lastIndexOf(".")).toLowerCase();
          if (!SUPPORTED_EXTENSIONS.has(ext)) {
            errors.push(`Unsupported file extension for image '${item}': ${ext}`);
            continue;
          }
          validatedImages.push({ type: "file-path", value: item, extension: ext });
        }
      } else if (Buffer.isBuffer(item)) {
        validatedImages.push({ type: "buffer", value: item, mime: "image/png" });
      } else if (typeof item === "object" && item.value) {
        validatedImages.push(item);
      } else {
        errors.push(`Unrecognized image object format at index ${i}`);
      }
    }

    return {
      valid: errors.length === 0 && validatedImages.length > 0,
      errors,
      images: validatedImages
    };
  }
}
