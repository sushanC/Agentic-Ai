/**
 * desktopCreateFolderTool.js
 * Tool: desktop_create_folder, Risk: LOW
 */
import { FileManager } from '../../desktop/FileManager.js';
import { validatePath, sanitizePath } from '../../desktop/SecurityValidator.js';
import { formatDiagnostic, createActionRecord } from '../../desktop/DesktopDiagnostics.js';
import { addDesktopAction } from '../../../storage/desktopHistoryStorage.js';
import { getPlatform } from '../../desktop/PlatformAdapter.js';

const manager = new FileManager();

export class DesktopCreateFolderTool {
  async execute(action) {
    const start = Date.now();
    try {
      const { path: p, name } = action.input;
      const fullPath = name ? `${p}/${name}` : p;
      const cleanPath = sanitizePath(fullPath);
      validatePath(cleanPath);

      await manager.createFolder(cleanPath);

      const duration = ((Date.now() - start) / 1000).toFixed(2);
      const platform = getPlatform();
      
      const diag = formatDiagnostic(platform, duration, 'desktop_create_folder');
      addDesktopAction(createActionRecord('desktop_create_folder', action.input, 'success'));
      
      return `${diag}\n\n📁 Created folder **${cleanPath}**`;
    } catch(err) {
      return `❌ Error: ${err.message}`;
    }
  }
}
