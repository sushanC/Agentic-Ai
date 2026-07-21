/**
 * desktopOpenFolderTool.js
 *
 * Tool: desktop_open_folder
 * Risk: LOW — no confirmation required
 *
 * Opens a folder in the system file manager.
 * Input: { path: string }
 */

import { DesktopManager } from '../../desktop/DesktopManager.js';
import { validatePath, sanitizePath } from '../../desktop/SecurityValidator.js';
import { formatDiagnostic, createActionRecord } from '../../desktop/DesktopDiagnostics.js';
import { addDesktopAction } from '../../../storage/desktopHistoryStorage.js';
import { getPlatform } from '../../desktop/PlatformAdapter.js';

const manager = new DesktopManager();

export class DesktopOpenFolderTool {
  async execute(action) {
    const start = Date.now();
    const rawPath = action.input?.path || action.input?.folder || action.input?.directory || '';
    const platform = getPlatform();

    // ── Validation ───────────────────────────────────────────────────────────
    if (!rawPath.trim()) {
      return '❌ Desktop: Folder path is required.';
    }

    const safePath = sanitizePath(rawPath);
    const validation = validatePath(safePath);
    if (!validation.valid) {
      return `❌ Desktop Security: ${validation.error}`;
    }

    // ── Execution ────────────────────────────────────────────────────────────
    let execution = 'Success';
    let errorMsg = null;

    try {
      const result = await manager.openFolder(validation.safePath);
      if (!result.success) {
        execution = 'Failed';
        errorMsg = result.error;
      }
    } catch (err) {
      execution = 'Failed';
      errorMsg = err.message;
    }

    const duration = ((Date.now() - start) / 1000).toFixed(2);
    const record = createActionRecord({ tool: 'desktop_open_folder', target: rawPath, risk: 'LOW', confirmation: 'Not Required', execution, duration, error: errorMsg, platform });
    await addDesktopAction(record);

    const diag = formatDiagnostic({ intent: 'DesktopControl', tool: 'desktop_open_folder', target: rawPath, platform: platform.charAt(0).toUpperCase() + platform.slice(1), risk: 'Low', confirmation: 'Not Required', execution, duration, error: errorMsg });

    if (execution === 'Failed') return `${diag}\n\n❌ Could not open folder **${rawPath}**: ${errorMsg}`;
    return `${diag}\n\n📁 Opened folder **${rawPath}** in file manager.`;
  }
}
