/**
 * desktopRevealFileTool.js
 * Tool: desktop_reveal_file, Risk: LOW
 */
import { FileManager } from '../../desktop/FileManager.js';
import { formatDiagnostic, createActionRecord } from '../../desktop/DesktopDiagnostics.js';
import { addDesktopAction } from '../../../storage/desktopHistoryStorage.js';
import { getPlatform } from '../../desktop/PlatformAdapter.js';

const manager = new FileManager();

export class DesktopRevealFileTool {
  async execute(action) {
    const start = Date.now();
    try {
      const { path } = action.input;
      
      await manager.revealInFileManager(path);

      // Extract filename just for the message, simplified.
      const lastSlash = path.lastIndexOf('/');
      const filename = lastSlash >= 0 ? path.substring(lastSlash + 1) : path;

      const duration = ((Date.now() - start) / 1000).toFixed(2);
      const platform = getPlatform();
      
      const diag = formatDiagnostic(platform, duration, 'desktop_reveal_file');
      addDesktopAction(createActionRecord('desktop_reveal_file', action.input, 'success'));
      
      return `${diag}\n\n📂 Revealed **${filename}** in file manager.`;
    } catch(err) {
      return `❌ Error: ${err.message}`;
    }
  }
}
