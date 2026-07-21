/**
 * desktopZipTool.js
 * Tool: desktop_zip, Risk: LOW
 */
import { FileManager } from '../../desktop/FileManager.js';
import { validatePath, sanitizePath } from '../../desktop/SecurityValidator.js';
import { formatDiagnostic, createActionRecord } from '../../desktop/DesktopDiagnostics.js';
import { addDesktopAction } from '../../../storage/desktopHistoryStorage.js';
import { getPlatform } from '../../desktop/PlatformAdapter.js';

const manager = new FileManager();

export class DesktopZipTool {
  async execute(action) {
    const start = Date.now();
    try {
      let { files, outputPath } = action.input;
      
      // Basic validation
      const arrFiles = Array.isArray(files) ? files : [files];
      for (const f of arrFiles) {
        validatePath(sanitizePath(f));
      }
      outputPath = sanitizePath(outputPath);
      validatePath(outputPath);

      await manager.zipFiles(files, outputPath);

      const duration = ((Date.now() - start) / 1000).toFixed(2);
      const platform = getPlatform();
      
      const diag = formatDiagnostic(platform, duration, 'desktop_zip');
      addDesktopAction(createActionRecord('desktop_zip', action.input, 'success'));
      
      return `${diag}\n\n🗜️ Created **${outputPath}**`;
    } catch(err) {
      return `❌ Error: ${err.message}`;
    }
  }
}
