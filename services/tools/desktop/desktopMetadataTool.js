/**
 * desktopMetadataTool.js
 * Tool: desktop_metadata, Risk: LOW
 */
import { FileManager } from '../../desktop/FileManager.js';
import { formatDiagnostic, createActionRecord } from '../../desktop/DesktopDiagnostics.js';
import { addDesktopAction } from '../../../storage/desktopHistoryStorage.js';
import { getPlatform } from '../../desktop/PlatformAdapter.js';

const manager = new FileManager();

export class DesktopMetadataTool {
  async execute(action) {
    const start = Date.now();
    try {
      const { path } = action.input;
      
      const meta = await manager.getMetadata(path);

      const duration = ((Date.now() - start) / 1000).toFixed(2);
      const platform = getPlatform();
      
      const diag = formatDiagnostic(platform, duration, 'desktop_metadata');
      addDesktopAction(createActionRecord('desktop_metadata', action.input, 'success'));
      
      const msg = `| Property | Value |\n|---|---|\n| Name | ${meta.name} |\n| Size | ${meta.size} |\n| Type | ${meta.type} |\n| Created | ${meta.created} |\n| Modified | ${meta.modified} |\n| Path | ${meta.absolutePath} |`;
      
      return `${diag}\n\n${msg}`;
    } catch(err) {
      return `❌ Error: ${err.message}`;
    }
  }
}
