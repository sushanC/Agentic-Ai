/**
 * desktopUnzipTool.js
 * Tool: desktop_unzip, Risk: LOW
 */
import { FileManager } from '../../desktop/FileManager.js';
import { formatDiagnostic, createActionRecord } from '../../desktop/DesktopDiagnostics.js';
import { addDesktopAction } from '../../../storage/desktopHistoryStorage.js';
import { getPlatform } from '../../desktop/PlatformAdapter.js';

const manager = new FileManager();

export class DesktopUnzipTool {
  async execute(action) {
    const start = Date.now();
    try {
      const { path, destination } = action.input;
      
      await manager.unzipFile(path, destination);

      // Extract filename just for the message, simplified.
      const lastSlash = path.lastIndexOf('/');
      const filename = lastSlash >= 0 ? path.substring(lastSlash + 1) : path;
      const dest = destination || '.';

      const duration = ((Date.now() - start) / 1000).toFixed(2);
      const platform = getPlatform();
      
      const diag = formatDiagnostic(platform, duration, 'desktop_unzip');
      addDesktopAction(createActionRecord('desktop_unzip', action.input, 'success'));
      
      return `${diag}\n\n📦 Extracted **${filename}** to **${dest}**`;
    } catch(err) {
      return `❌ Error: ${err.message}`;
    }
  }
}
