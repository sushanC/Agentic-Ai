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
      const { path } = action.input;
      const cleanPath = sanitizePath(path);
      validatePath(cleanPath);

      await manager.openFile(cleanPath);

      const duration = ((Date.now() - start) / 1000).toFixed(2);
      const platform = getPlatform();
      
      const diag = formatDiagnostic(platform, duration, 'desktop_open_file');
      addDesktopAction(createActionRecord('desktop_open_file', action.input, 'success'));
      
      return `${diag}\n\n📂 Opened file **${cleanPath}**`;
    } catch(err) {
      return `❌ Error: ${err.message}`;
    }
  }
}
