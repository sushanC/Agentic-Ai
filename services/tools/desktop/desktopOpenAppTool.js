/**
 * desktopOpenAppTool.js
 *
 * Tool: desktop_open_app
 * Risk: LOW — no confirmation required
 *
 * Opens an installed application by name using the AppLauncher.
 * Supports natural language aliases (e.g. "VS Code" → code, "Chrome" → google-chrome).
 *
 * Input: { appName: string }
 */

import { AppLauncher } from '../../desktop/AppLauncher.js';
import { validateAppName } from '../../desktop/SecurityValidator.js';
import { formatDiagnostic, createActionRecord } from '../../desktop/DesktopDiagnostics.js';
import { addDesktopAction } from '../../../storage/desktopHistoryStorage.js';
import { getPlatform } from '../../desktop/PlatformAdapter.js';
import os from 'os';

const launcher = new AppLauncher();

export class DesktopOpenAppTool {
  async execute(action) {
    const start = Date.now();
let appName = "";

if (typeof action.input === "string") {
  appName = action.input.trim();
} else if (action.input && typeof action.input === "object") {
  appName =
    action.input.appName ||
    action.input.app ||
    action.input.name ||
    "";
}

appName = appName.trim();    const platform = getPlatform();

    // ── Validation ───────────────────────────────────────────────────────────
    const validation = validateAppName(appName);
    if (!validation.valid) {
      return `❌ Desktop: ${validation.error}`;
    }

    // ── Execution ────────────────────────────────────────────────────────────
    let execution = 'Success';
    let errorMsg = null;
    let result;

    try {
      result = await launcher.launch(appName);
      if (!result.success) {
        execution = 'Failed';
        errorMsg = result.error;
      }
    } catch (err) {
      execution = 'Failed';
      errorMsg = err.message;
    }

    const duration = ((Date.now() - start) / 1000).toFixed(2);

    // ── Diagnostics ──────────────────────────────────────────────────────────
    const record = createActionRecord({
      tool:         'desktop_open_app',
      target:       appName,
      risk:         'LOW',
      confirmation: 'Not Required',
      execution,
      duration,
      error:        errorMsg,
      platform
    });
    await addDesktopAction(record);

    const diag = formatDiagnostic({
      intent:       'DesktopControl',
      tool:         'desktop_open_app',
      target:       appName,
      platform:     platform.charAt(0).toUpperCase() + platform.slice(1),
      risk:         'Low',
      confirmation: 'Not Required',
      execution,
      duration,
      error:        errorMsg
    });

    if (execution === 'Failed') {
      return `${diag}\n\n❌ Could not open **${appName}**: ${errorMsg}`;
    }

    return `${diag}\n\n✅ Opened **${appName}** successfully.${result?.resolvedPath ? ` (${result.resolvedPath})` : ''}`;
  }
}
