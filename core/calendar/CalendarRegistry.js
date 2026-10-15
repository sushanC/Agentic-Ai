import { googleCalendarProvider } from "./providers/GoogleCalendarProvider.js";

/**
 * CalendarRegistry.js
 *
 * Dynamic registration hub for Calendar Providers.
 * Mirrors EmailRegistry.js in structure and API.
 *
 * CalendarManager uses this to obtain the active provider without
 * depending on GoogleCalendarProvider directly.
 */
export class CalendarRegistry {
  constructor() {
    this.providers = new Map();
    this.registerProvider(googleCalendarProvider);
  }

  /**
   * Register a calendar provider instance.
   * @param {import("./providers/BaseCalendarProvider.js").BaseCalendarProvider} providerInstance
   */
  registerProvider(providerInstance) {
    if (!providerInstance || !providerInstance.name) {
      throw new Error("CalendarRegistry: Provider with valid name is required.");
    }
    this.providers.set(providerInstance.name.toLowerCase(), providerInstance);
  }

  /**
   * Get a provider by name, defaulting to "google".
   * @param {string} [name="google"]
   * @returns {import("./providers/BaseCalendarProvider.js").BaseCalendarProvider|null}
   */
  getProvider(name = "google") {
    return this.providers.get(name.toLowerCase()) || this.providers.get("google") || null;
  }
}

export const calendarRegistry = new CalendarRegistry();
