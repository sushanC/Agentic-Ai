import { loadMemory, updateMemoryValue } from "../../../features/memory/index.js";

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
    const memory = await loadMemory();
    return memory.contacts || {};
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
      const cleanName = name.trim();
      await updateMemoryValue("contacts", current => {
        const contacts = current && typeof current === "object" && !Array.isArray(current) ? current : {};
        const existing = contacts[cleanName] || {};
        return {
          ...contacts,
          [cleanName]: {
            ...existing,
            name: cleanName,
            email: email.trim(),
            aliases: metadata.aliases || existing.aliases || [cleanName.toLowerCase()],
            relationship: metadata.relationship || existing.relationship || "",
            savedAt: new Date().toISOString()
          }
        };
      });
      console.log("[ContactRepository] Contact saved");
      return true;
    } catch (err) {
      console.error("[ContactRepository] Contact save failed", { code: err.code || "STORAGE_ERROR" });
      return false;
    }
  }
}
