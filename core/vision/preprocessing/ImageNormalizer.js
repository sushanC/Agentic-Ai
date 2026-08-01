import fs from "fs/promises";
import path from "path";

/**
 * ImageNormalizer.js
 *
 * Normalizes file paths, raw base64 strings, and binary buffers into
 * standard data URIs and Base64 payloads suitable for multimodal AI API providers.
 */
export class ImageNormalizer {
  /**
   * Normalize an array of validated image items.
   *
   * @param {Array<{type: string, value: any, mime?: string}>} validatedImages
   * @returns {Promise<Array<{dataUrl: string, base64: string, mime: string}>>}
   */
  static async normalizeAll(validatedImages) {
    const normalized = [];

    for (const item of validatedImages) {
      try {
        const norm = await ImageNormalizer.normalize(item);
        if (norm) normalized.push(norm);
      } catch (err) {
        console.warn(`[ImageNormalizer] Failed to normalize image item:`, err.message);
      }
    }

    return normalized;
  }

  /**
   * Normalize a single validated image item.
   *
   * @param {{type: string, value: any, mime?: string}} item
   * @returns {Promise<{dataUrl: string, base64: string, mime: string}>}
   */
  static async normalize(item) {
    if (item.type === "data-url") {
      const parts = item.value.split(",");
      const mimeMatch = item.value.match(/data:(image\/[^;]+);base64,/);
      const mime = mimeMatch ? mimeMatch[1] : "image/png";
      const base64 = parts[1] || parts[0];
      return { dataUrl: item.value, base64, mime };
    }

    if (item.type === "base64") {
      const mime = item.mime || "image/png";
      return {
        dataUrl: `data:${mime};base64,${item.value}`,
        base64: item.value,
        mime
      };
    }

    if (item.type === "buffer") {
      const mime = item.mime || "image/png";
      const base64 = item.value.toString("base64");
      return {
        dataUrl: `data:${mime};base64,${base64}`,
        base64,
        mime
      };
    }

    if (item.type === "file-path") {
      const filePath = path.resolve(item.value);
      const ext = path.extname(filePath).toLowerCase();
      const mimeMap = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".bmp": "image/bmp",
        ".tiff": "image/tiff",
        ".tif": "image/tiff",
      };
      const mime = mimeMap[ext] || "image/png";
      const buffer = await fs.readFile(filePath);
      const base64 = buffer.toString("base64");
      return {
        dataUrl: `data:${mime};base64,${base64}`,
        base64,
        mime
      };
    }

    return null;
  }
}
