/**
 * desktopCopyFileTool.js
 * Tool: desktop_copy_file, Risk: MEDIUM
 */
import { FileManager } from '../../desktop/FileManager.js';
import { formatDiagnostic, createActionRecord } from '../../desktop/DesktopDiagnostics.js';
import { addDesktopAction } from '../../../storage/desktopHistoryStorage.js';
import { getPlatform } from '../../desktop/PlatformAdapter.js';
import { createPending } from '../../confirmationService.js';

const manager = new FileManager();

export class DesktopCopyFileTool {
  async execute(action) {
    const start = Date.now();
    try {
      const { source, destination } = action.input;

      if (!action._confirmedAt) {
        return await createPending({
          tool: 'desktop_copy_file',
          action: 'default',
          payload: action,
          preview: { source, destination },
          title: 'Copy File',
          message: `Copy ${source} to ${destination}?`
        });
      }

      await manager.copyFile(source, destination);

      const duration = ((Date.now() - start) / 1000).toFixed(2);
      const platform = getPlatform();
      
      const diag = formatDiagnostic(platform, duration, 'desktop_copy_file');
      addDesktopAction(createActionRecord('desktop_copy_file', action.input, 'success'));
      
      return `${diag}\n\n📄 Copied **${source}** → **${destination}**`;
    } catch(err) {
      return `❌ Error: ${err.message}`;
    }
  }
}
