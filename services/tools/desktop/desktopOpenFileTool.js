/**
 * desktopOpenFileTool.js
 * Tool: desktop_open_file, Risk: LOW
 */
import { DesktopManager } from '../../desktop/DesktopManager.js';
import { validatePath, sanitizePath } from '../../desktop/SecurityValidator.js';
import { formatDiagnostic, createActionRecord } from '../../desktop/DesktopDiagnostics.js';
import { addDesktopAction } from '../../../storage/desktopHistoryStorage.js';
import { getPlatform } from '../../desktop/PlatformAdapter.js';

const manager = new DesktopManager();

export class DesktopOpenFileTool {
  async execute(action) {
    const start = Date.now();
    try {
      let rawPath = '';
      if (typeof action.input === 'string') {
        rawPath = action.input.trim();
      } else if (action.input && typeof action.input === 'object') {
        rawPath = action.input.path || action.input.filePath || action.input.file || action.input.target || action.input.name || '';
      }
      rawPath = (rawPath || '').trim() || 'specified file';
      const cleanPath = sanitizePath(rawPath);
      validatePath(cleanPath);

      await manager.openFile(cleanPath);

      const duration = ((Date.now() - start) / 1000).toFixed(2);
      const platform = getPlatform();

      const diag = formatDiagnostic({
        intent: 'DesktopControl',
        tool: 'desktop_open_file',
        target: cleanPath,
        platform,
        risk: 'Low',
        confirmation: 'Not Required',
        execution: 'Success',
        duration,
      });

      addDesktopAction(createActionRecord({
        tool: 'desktop_open_file',
        target: cleanPath,
        risk: 'LOW',
        confirmation: 'Not Required',
        execution: 'Success',
        duration,
        platform,
      }));

      return `${diag}\n\n📂 Opened file **${cleanPath}**`;
    } catch(err) {
      return `❌ Error: ${err.message}`;
    }
  }
}
