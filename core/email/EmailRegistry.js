import { gmailProvider } from "./providers/GmailProvider.js";

/**
 * EmailRegistry.js
 *
 * Dynamic registration hub for Email Providers, Action Handlers, and Policies.
 */
export class EmailRegistry {
  constructor() {
    this.providers = new Map();
    this.registerProvider(gmailProvider);
  }

  registerProvider(providerInstance) {
    if (!providerInstance || !providerInstance.name) {
      throw new Error("EmailRegistry: Provider with valid name is required.");
    }
    this.providers.set(providerInstance.name.toLowerCase(), providerInstance);
  }

  getProvider(name = "gmail") {
    return this.providers.get(name.toLowerCase()) || this.providers.get("gmail") || null;
  }
}

export const emailRegistry = new EmailRegistry();
