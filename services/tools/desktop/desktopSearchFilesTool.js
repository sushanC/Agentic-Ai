/**
 * desktopSearchFilesTool.js
 * Tool: desktop_search_files, Risk: LOW
 */
import { FileManager } from '../../desktop/FileManager.js';
import { validatePath, sanitizePath } from '../../desktop/SecurityValidator.js';
import { formatDiagnostic, createActionRecord } from '../../desktop/DesktopDiagnostics.js';
import { addDesktopAction } from '../../../storage/desktopHistoryStorage.js';
import { getPlatform } from '../../desktop/PlatformAdapter.js';

const manager = new FileManager();

export class DesktopSearchFilesTool {
  async execute(action) {
    const start = Date.now();
    try {
      let { query, directory, type, modifiedSince, largerThan } = action.input;
      if (directory) {
        directory = sanitizePath(directory);
        validatePath(directory);
      }

      const results = await manager.search({ query, directory, type, modifiedSince, largerThan });

      const duration = ((Date.now() - start) / 1000).toFixed(2);
      const platform = getPlatform();
      
      const diag = formatDiagnostic(platform, duration, 'desktop_search_files');
      addDesktopAction(createActionRecord('desktop_search_files', action.input, 'success'));
      
      if (!results || results.length === 0) {
        return `${diag}\n\nNo files found matching ${query}`;
      }
      
      const fileList = results.map(f => `- ${f}`).join('\n');
      return `${diag}\n\n${fileList}`;
    } catch(err) {
      return `❌ Error: ${err.message}`;
    }
  }
}
