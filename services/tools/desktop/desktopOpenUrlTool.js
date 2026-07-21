/**
 * desktopOpenUrlTool.js
 * Tool: desktop_open_url, Risk: LOW
 */
import { DesktopManager } from '../../desktop/DesktopManager.js';
import { validateUrl } from '../../desktop/SecurityValidator.js';
import { formatDiagnostic, createActionRecord } from '../../desktop/DesktopDiagnostics.js';
import { addDesktopAction } from '../../../storage/desktopHistoryStorage.js';
import { getPlatform } from '../../desktop/PlatformAdapter.js';

const manager = new DesktopManager();

export class DesktopOpenUrlTool {
  async execute(action) {
    const start = Date.now();
    try {
      const { url } = action.input;
      validateUrl(url);

      await manager.openUrl(url);

      const duration = ((Date.now() - start) / 1000).toFixed(2);
      const platform = getPlatform();
      
      const diag = formatDiagnostic(platform, duration, 'desktop_open_url');
      addDesktopAction(createActionRecord('desktop_open_url', action.input, 'success'));
      
      return `${diag}\n\n🌐 Opened **${url}** in browser.`;
    } catch(err) {
      return `❌ Error: ${err.message}`;
    }
  }
}
