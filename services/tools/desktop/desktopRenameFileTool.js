/**
 * desktopRenameFileTool.js
 * Tool: desktop_rename_file, Risk: MEDIUM
 */
import { FileManager } from '../../desktop/FileManager.js';
import { validateFilename } from '../../desktop/SecurityValidator.js';
import { formatDiagnostic, createActionRecord } from '../../desktop/DesktopDiagnostics.js';
import { addDesktopAction } from '../../../storage/desktopHistoryStorage.js';
import { getPlatform } from '../../desktop/PlatformAdapter.js';
import { createPending } from '../../confirmationService.js';

const manager = new FileManager();

export class DesktopRenameFileTool {
  async execute(action) {
    const start = Date.now();
    try {
      const { path, newName } = action.input;
      validateFilename(newName);

      if (!action._confirmedAt) {
        return await createPending({
          tool: 'desktop_rename_file',
          action: 'default',
          payload: action,
          preview: { oldPath: path, newName },
          title: 'Rename File',
          message: `Rename to ${newName}?`
        });
      }

      // Very simple extraction of directory path. Assumes standard paths.
      const lastSlash = path.lastIndexOf('/');
      const dir = lastSlash >= 0 ? path.substring(0, lastSlash) : '.';
      const newPath = `${dir}/${newName}`;

      await manager.renameFile(path, newPath);

      const duration = ((Date.now() - start) / 1000).toFixed(2);
      const platform = getPlatform();
      
      const diag = formatDiagnostic(platform, duration, 'desktop_rename_file');
      addDesktopAction(createActionRecord('desktop_rename_file', action.input, 'success'));
      
      return `${diag}\n\n✏️ Renamed to **${newName}**`;
    } catch(err) {
      return `❌ Error: ${err.message}`;
    }
  }
}
