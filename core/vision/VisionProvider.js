/**
 * VisionProvider.js
 *
 * Abstract base class for Vision Providers (Gemini, OpenAI, Ollama).
 * Enforces standardized vision inference interface and health check contracts.
 */
export class VisionProvider {
  /**
   * @param {string} name - Provider identifier ("gemini", "openai", "ollama")
   * @param {string} displayName - Human readable provider name
   * @param {number} [priority=50] - Failover priority (higher = preferred)
   */
  constructor(name, displayName, priority = 50) {
    this.name = name;
    this.displayName = displayName;
    this.priority = priority;
    this.isInitialized = false;
  }

  /**
   * Lazy initialization hook.
   */
  async initialize() {
    this.isInitialized = true;
  }

  /**
   * Perform vision inference on images.
   *
   * @param {Array<{dataUrl: string, base64: string, mime: string}>} images
   * @param {string} prompt - Vision analysis prompt
   * @param {object} [options={}] - Temperature, systemPrompt, maxTokens
   * @returns {Promise<{rawText: string, model: string, provider: string}>}
   */
  async analyze(images, prompt, options = {}) {
    throw new Error(`VisionProvider.analyze() not implemented on provider "${this.name}".`);
  }

  /**
   * Health check for provider availability.
   * @returns {Promise<boolean>}
   */
  async health() {
    return true;
  }
}
