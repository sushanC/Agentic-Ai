/**
 * desktopNetworkTool.js
 * Tool: desktop_network, Risk: LOW
 */
import { SystemManager } from '../../desktop/SystemManager.js';
import { formatDiagnostic, createActionRecord } from '../../desktop/DesktopDiagnostics.js';
import { addDesktopAction } from '../../../storage/desktopHistoryStorage.js';
import { getPlatform } from '../../desktop/PlatformAdapter.js';

const manager = new SystemManager();

export class DesktopNetworkTool {
  async execute(action) {
    const start = Date.now();
    try {
      const status = await manager.getNetworkStatus();

      const duration = ((Date.now() - start) / 1000).toFixed(2);
      const platform = getPlatform();
      
      const diag = formatDiagnostic(platform, duration, 'desktop_network');
      addDesktopAction(createActionRecord('desktop_network', action.input, 'success'));
      
      const msg = Array.isArray(status) ? status.map(n => `- **${n.iface}**: ${n.ip}`).join('\n') : JSON.stringify(status);
      return `${diag}\n\n${msg}`;
    } catch(err) {
      return `❌ Error: ${err.message}`;
    }
  }
}
