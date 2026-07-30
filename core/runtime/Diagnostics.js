import { RUNTIME_CONFIG } from "./RuntimeConfig.js";

export const LogLevel = Object.freeze({
  TRACE: 0,
  DEBUG: 1,
  INFO:  2,
  WARN:  3,
  ERROR: 4,
});

const LEVEL_NAMES = ["TRACE", "DEBUG", "INFO", "WARN", "ERROR"];

/**
 * Diagnostics.js
 *
 * Structured logger for the AI Runtime Reliability Layer.
 * Provides level-filtered logging (TRACE, DEBUG, INFO, WARN, ERROR)
 * with structured payloads.
 */
export class RuntimeDiagnostics {
  constructor(level = RUNTIME_CONFIG.DIAGNOSTICS.defaultLevel) {
    this.setLevel(level);
  }

  /**
   * Set log level by name string or LogLevel enum.
   * @param {string|number} level
   */
  setLevel(level) {
    if (typeof level === "string") {
      const idx = LEVEL_NAMES.indexOf(level.toUpperCase());
      this.currentLevel = idx !== -1 ? idx : LogLevel.INFO;
    } else if (typeof level === "number") {
      this.currentLevel = level;
    } else {
      this.currentLevel = LogLevel.INFO;
    }
  }

  trace(tag, message, meta) {
    this._log(LogLevel.TRACE, tag, message, meta);
  }

  debug(tag, message, meta) {
    this._log(LogLevel.DEBUG, tag, message, meta);
  }

  info(tag, message, meta) {
    this._log(LogLevel.INFO, tag, message, meta);
  }

  warn(tag, message, meta) {
    this._log(LogLevel.WARN, tag, message, meta);
  }

  error(tag, message, meta) {
    this._log(LogLevel.ERROR, tag, message, meta);
  }

  _log(level, tag, message, meta) {
    if (level < this.currentLevel) return;

    const levelName = LEVEL_NAMES[level];
    const timestamp = new Date().toISOString();
    const metaStr = meta !== undefined ? ` | ${JSON.stringify(meta)}` : "";

    if (level >= LogLevel.ERROR) {
      console.error(`[Runtime:${levelName}] [${tag}] ${message}${metaStr}`);
    } else if (level === LogLevel.WARN) {
      console.warn(`[Runtime:${levelName}] [${tag}] ${message}${metaStr}`);
    } else {
      console.log(`[Runtime:${levelName}] [${tag}] ${message}${metaStr}`);
    }
  }
}

export const diagnostics = new RuntimeDiagnostics();
