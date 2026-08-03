import { ContactRepository } from "./ContactRepository.js";
import { EmailValidationPolicy } from "../policy/EmailValidationPolicy.js";

/**
 * ContactResolver.js
 *
 * Resolves recipient queries against Cognitive Memory contacts using a deterministic
 * ranked matching hierarchy:
 *   1. Explicit Email Address (confidence: 1.0)
 *   2. Exact Contact Name (confidence: 1.0)
 *   3. Exact Alias Match (confidence: 0.95)
 *   4. Exact Relationship Match (confidence: 0.90)
 *   5. Safe Token Match (candidate for ambiguity check)
 *   6. Partial/Fuzzy Match (requires clarification, never auto-selected)
 *   7. Unknown
 *
 * Prevents unsafe substring matching (e.g. "Friend" will NEVER resolve to "Professor").
 */
export class ContactResolver {
  /**
   * Resolve a recipient query string or email address.
   *
   * @param {string} query - Recipient name, relationship, or email address
   * @returns {Promise<{
   *   status: "resolved" | "ambiguous" | "unknown",
   *   email?: string,
   *   name?: string,
   *   matchType?: string,
   *   confidence?: number,
   *   candidateCount?: number,
   *   matches?: Array<{name: string, email: string}>
   * }>}
   */
  static async resolve(query) {
    if (!query || typeof query !== "string") {
      return { status: "unknown", matchType: "none", confidence: 0.0, candidateCount: 0 };
    }

    const trimmed = query.trim();

    // Hierarchy Tier 1: Explicit Email Address
    if (EmailValidationPolicy.isValidEmail(trimmed)) {
      return {
        status: "resolved",
        email: trimmed,
        name: trimmed.split("@")[0],
        matchType: "explicit_email",
        confidence: 1.0,
        candidateCount: 1
      };
    }

    const contacts = await ContactRepository.loadContacts();
    const norm = trimmed.toLowerCase();
    const normNoMy = norm.replace(/^my\s+/i, "").trim();

    const matches = [];

    for (const [key, data] of Object.entries(contacts)) {
      if (!data || !data.email || !EmailValidationPolicy.isValidEmail(data.email)) {
        continue;
      }

      const name = data.name || key;
      const email = data.email;
      const nameNorm = name.toLowerCase();
      const aliases = (Array.isArray(data.aliases) ? data.aliases : [nameNorm]).map(a => String(a).toLowerCase());
      const relationship = (data.relationship || "").toLowerCase();

      // Check Tier 2: Exact Contact Name Match
      if (nameNorm === norm) {
        matches.push({ name, email, rank: 1, matchType: "exact_name", confidence: 1.0 });
        continue;
      }

      // Check Tier 3: Exact Alias Match
      if (aliases.includes(norm)) {
        matches.push({ name, email, rank: 2, matchType: "exact_alias", confidence: 0.95 });
        continue;
      }

      // Check Tier 4: Exact Relationship Match
      if (relationship && (relationship === norm || relationship === normNoMy)) {
        matches.push({ name, email, rank: 3, matchType: "exact_relationship", confidence: 0.90 });
        continue;
      }

      // Check Tier 5: Safe Token / Full Word Match in Name
      const tokenRegex = new RegExp(`\\b${norm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (tokenRegex.test(nameNorm)) {
        matches.push({ name, email, rank: 4, matchType: "token_match", confidence: 0.80 });
        continue;
      }

      // Check Tier 6: Partial / Substring Match (min length 3)
      if (norm.length >= 3 && nameNorm.includes(norm)) {
        matches.push({ name, email, rank: 5, matchType: "partial_match", confidence: 0.50 });
      }
    }

    if (matches.length === 0) {
      return {
        status: "unknown",
        name: trimmed,
        matchType: "none",
        confidence: 0.0,
        candidateCount: 0
      };
    }

    // Find highest priority rank (lowest numerical rank value)
    const bestRank = Math.min(...matches.map(m => m.rank));
    const topCandidates = matches.filter(m => m.rank === bestRank);

    // Tiers 1-3: Automatic resolution ONLY if exactly one top candidate
    if (bestRank <= 3) {
      if (topCandidates.length === 1) {
        const winner = topCandidates[0];
        return {
          status: "resolved",
          name: winner.name,
          email: winner.email,
          matchType: winner.matchType,
          confidence: winner.confidence,
          candidateCount: 1
        };
      }
      return {
        status: "ambiguous",
        matches: topCandidates.map(c => ({ name: c.name, email: c.email })),
        matchType: topCandidates[0].matchType,
        confidence: topCandidates[0].confidence,
        candidateCount: topCandidates.length
      };
    }

    // Tiers 4-5 (Token / Partial): NEVER automatically resolve for sending side effects!
    return {
      status: "ambiguous",
      matches: topCandidates.map(c => ({ name: c.name, email: c.email })),
      matchType: topCandidates[0].matchType,
      confidence: topCandidates[0].confidence,
      candidateCount: topCandidates.length
    };
  }

  /**
   * Store a newly provided contact into Cognitive Memory.
   * @param {string} name
   * @param {string} email
   * @param {object} [metadata]
   * @returns {Promise<boolean>}
   */
  static async saveNewContact(name, email, metadata) {
    return await ContactRepository.saveContact(name, email, metadata);
  }
}
