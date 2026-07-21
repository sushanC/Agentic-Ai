/**
 * DesktopDiagnostics.js
 *
 * Formats diagnostic blocks for every desktop action.
 * Used by all 29 desktop tool wrappers.
 *
 * Two calling conventions are supported for maximum compatibility:
 *
 *   Object form (preferred):
 *     formatDiagnostic({ intent, tool, target, platform, risk, confirmation, execution, duration, error })
 *
 *   Positional form (backward compat with generated tools):
 *     formatDiagnostic(platform, duration, tool)
 */

import crypto from 'crypto';

/**
 * Format the diagnostic block shown in chat after every desktop action.
 *
 * @param {object|string} opts  - Named options OR platform string (positional form)
 * @param {string} [duration]   - Duration in seconds (positional form only)
 * @param {string} [toolName]   - Tool name (positional form only)
 * @returns {string}
 */
export function formatDiagnostic(opts, duration, toolName) {

  // ── Normalise arguments ───────────────────────────────────────────────────
  let intent, tool, target, platform, risk, confirmation, execution, dur, error;

  if (typeof opts === 'object' && opts !== null) {
    // Named-object form (canonical)
    ({ intent, tool, target, platform, risk, confirmation, execution,
       duration: dur, error } = opts);
  } else {
    // Positional form: formatDiagnostic(platform, duration, tool)
    platform     = opts || 'unknown';
    dur          = duration || '0.00';
    tool         = toolName || 'desktop';
    intent       = 'DesktopControl';
    target       = '—';
    risk         = 'Low';
    confirmation = 'Not Required';
    execution    = 'Success';
    error        = null;
  }

  // ── Build output ──────────────────────────────────────────────────────────
  const platLabel = String(platform).charAt(0).toUpperCase() + String(platform).slice(1);

  let result  = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  result     += 'DESKTOP ACTION\n\n';
  result     += `Intent:       ${intent || 'DesktopControl'}\n`;
  result     += `Tool:         ${tool}\n`;
  if (target && target !== '—') {
    result   += `Target:       ${target}\n`;
  }
  result     += `Platform:     ${platLabel}\n`;
  result     += `Risk:         ${risk || 'Low'}\n`;
  result     += `Confirmation: ${confirmation || 'Not Required'}\n`;
  result     += `Execution:    ${execution || 'Success'}\n`;
  result     += `Duration:     ${dur || '0.00'} sec\n`;
  if (error) {
    result   += `Error:        ${error}\n`;
  }
  result     += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  return result;
}

/**
 * Create a structured record for persisting to desktop history storage.
 *
 * Two calling conventions supported:
 *   Object form (canonical):
 *     createActionRecord({ tool, target, risk, confirmation, execution, duration, error, platform })
 *
 *   Positional form (generated tools):
 *     createActionRecord(tool, input, executionStatus)
 *
 * @returns {object}
 */
export function createActionRecord(opts, input, executionStatus) {

  let tool, target, risk, confirmation, execution, duration, error, platform;

  if (typeof opts === 'object' && opts !== null) {
    // Named-object form
    ({ tool, target, risk, confirmation, execution, duration, error, platform } = opts);
  } else {
    // Positional form: createActionRecord(toolName, input, 'success'|'failed')
    tool         = opts || 'desktop';
    target       = typeof input === 'object' ? (input?.path || input?.appName || input?.name || JSON.stringify(input)) : String(input || '');
    risk         = 'LOW';
    confirmation = 'Not Required';
    execution    = executionStatus === 'success' ? 'Success' : 'Failed';
    duration     = '—';
    error        = null;
    platform     = 'linux';
  }

  return {
    id:           crypto.randomUUID(),
    timestamp:    new Date().toISOString(),
    tool:         tool         || 'desktop',
    target:       target       || '—',
    risk:         risk         || 'LOW',
    confirmation: confirmation || 'Not Required',
    execution:    execution    || 'Success',
    duration:     duration     || '—',
    error:        error        || null,
    platform:     platform     || 'unknown'
  };
}
