import { loadMemory, saveMemory } from "../../../features/memory/index.js";

/**
 * ContactRepository.js
 *
 * Interface to Cognitive Memory contact persistence.
 * Stores and retrieves contacts under memory.contacts in profile.json.
 * Supports legacy contacts as well as rich metadata (aliases, relationship).
 */
export class ContactRepository {
  /**
   * Load all saved contacts from Cognitive Memory.
   * @returns {Promise<Record<string, {name?: string, email: string, savedAt?: string, aliases?: string[], relationship?: string}>>}
   */
  static async loadContacts() {
    try {
      const memory = await loadMemory();
      return memory.contacts || {};
    } catch {
      return {};
    }
  }

  /**
   * Save or update a contact in Cognitive Memory.
   *
   * @param {string} name - Contact display name
   * @param {string} email - Validated email address
   * @param {object} [metadata={}] - Optional metadata { aliases, relationship }
   * @returns {Promise<boolean>}
   */
  static async saveContact(name, email, metadata = {}) {
    if (!name || !email) return false;

    try {
      const memory = await loadMemory();
      if (!memory.contacts) memory.contacts = {};

      const existing = memory.contacts[name.trim()] || {};

      memory.contacts[name.trim()] = {
        ...existing,
        name: name.trim(),
        email: email.trim(),
        aliases: metadata.aliases || existing.aliases || [name.trim().toLowerCase()],
        relationship: metadata.relationship || existing.relationship || "",
        savedAt: new Date().toISOString()
      };

      await saveMemory(memory);
      console.log(`📧 [ContactRepository] Contact Saved: "${name}" → ${email}`);
      return true;
    } catch (err) {
      console.error(`❌ [ContactRepository] Failed to save contact "${name}":`, err.message);
      return false;
    }
  }
}
