/**
 * EmailValidationPolicy.js
 *
 * Validates email recipient format, CC/BCC lists, subject, and payload integrity.
 */
export class EmailValidationPolicy {
  static EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  static isValidEmail(str) {
    return typeof str === "string" && EmailValidationPolicy.EMAIL_REGEX.test(str.trim());
  }

  static validateEmailList(list) {
    if (!list || (Array.isArray(list) && list.length === 0)) {
      return { valid: true, invalidEntries: [] };
    }
    const arr = Array.isArray(list) ? list : [list];
    const filtered = arr.filter(Boolean);
    const invalid = filtered.filter(e => !EmailValidationPolicy.isValidEmail(e));
    return { valid: invalid.length === 0, invalidEntries: invalid };
  }

  static validatePayload({ to, cc, bcc, subject, body }) {
    const errors = [];

    if (!EmailValidationPolicy.isValidEmail(to)) {
      errors.push(`Invalid recipient email address: "${to}"`);
    }

    const ccCheck = EmailValidationPolicy.validateEmailList(cc);
    if (!ccCheck.valid) {
      errors.push(`Invalid CC address(es): ${ccCheck.invalidEntries.join(", ")}`);
    }

    const bccCheck = EmailValidationPolicy.validateEmailList(bcc);
    if (!bccCheck.valid) {
      errors.push(`Invalid BCC address(es): ${bccCheck.invalidEntries.join(", ")}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
