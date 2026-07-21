/**
 * desktopDuplicateFileTool.js
 * Tool: desktop_duplicate_file, Risk: MEDIUM
 */
import { FileManager } from '../../desktop/FileManager.js';
import { formatDiagnostic, createActionRecord } from '../../desktop/DesktopDiagnostics.js';
import { addDesktopAction } from '../../../storage/desktopHistoryStorage.js';
import { getPlatform } from '../../desktop/PlatformAdapter.js';
import { createPending } from '../../confirmationService.js';

const manager = new FileManager();

export class DesktopDuplicateFileTool {
  async execute(action) {
    const start = Date.now();
    try {
      const { path } = action.input;
      
      // Extract filename just for the message, simplified.
      const lastSlash = path.lastIndexOf('/');
      const filename = lastSlash >= 0 ? path.substring(lastSlash + 1) : path;

      if (!action._confirmedAt) {
        return await createPending({
          tool: 'desktop_duplicate_file',
          action: 'default',
          payload: action,
          preview: { path },
          title: 'Duplicate File',
          message: `Create a copy of ${filename}?`
        });
      }

      await manager.duplicateFile(path);

      const duration = ((Date.now() - start) / 1000).toFixed(2);
      const platform = getPlatform();
      
      const diag = formatDiagnostic(platform, duration, 'desktop_duplicate_file');
      addDesktopAction(createActionRecord('desktop_duplicate_file', action.input, 'success'));
      
      return `${diag}\n\n📋 Duplicated **${filename}**`;
    } catch(err) {
      return `❌ Error: ${err.message}`;
    }
  }
}
