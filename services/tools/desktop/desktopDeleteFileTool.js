/**
 * desktopDeleteFileTool.js
 * Tool: desktop_delete_file, Risk: HIGH
 */
import { FileManager } from '../../desktop/FileManager.js';
import { formatDiagnostic, createActionRecord } from '../../desktop/DesktopDiagnostics.js';
import { addDesktopAction } from '../../../storage/desktopHistoryStorage.js';
import { getPlatform } from '../../desktop/PlatformAdapter.js';
import { createPending } from '../../confirmationService.js';

const manager = new FileManager();

export class DesktopDeleteFileTool {
  async execute(action) {
    const start = Date.now();
    try {
      const { path } = action.input;

      if (!action._confirmedAt) {
        return await createPending({
          tool: 'desktop_delete_file',
          action: 'default',
          payload: action,
          preview: { path },
          title: 'Delete File',
          message: `⚠️ Permanently delete **${path}**? This cannot be undone.`
        });
      }

      await manager.deleteFile(path);

      const duration = ((Date.now() - start) / 1000).toFixed(2);
      const platform = getPlatform();
      
      const diag = formatDiagnostic(platform, duration, 'desktop_delete_file');
      addDesktopAction(createActionRecord('desktop_delete_file', action.input, 'success'));
      
      return `${diag}\n\n🗑️ Deleted **${path}**`;
    } catch(err) {
      return `❌ Error: ${err.message}`;
    }
  }
}
