/**
 * desktopSystemInfoTool.js
 * Tool: desktop_system_info, Risk: LOW
 */
import { SystemManager } from '../../desktop/SystemManager.js';
import { formatDiagnostic, createActionRecord } from '../../desktop/DesktopDiagnostics.js';
import { addDesktopAction } from '../../../storage/desktopHistoryStorage.js';
import { getPlatform } from '../../desktop/PlatformAdapter.js';

const manager = new SystemManager();

export class DesktopSystemInfoTool {
  async execute(action) {
    const start = Date.now();
    try {
      const info = await manager.getSystemInfo();

      const duration = ((Date.now() - start) / 1000).toFixed(2);
      const platform = getPlatform();
      
      const diag = formatDiagnostic(platform, duration, 'desktop_system_info');
      addDesktopAction(createActionRecord('desktop_system_info', action.input, 'success'));
      
      const msg = `### System Info\n- OS: ${info.os}\n- Hostname: ${info.hostname}\n- Platform: ${info.platform}\n- Arch: ${info.arch}\n- Uptime: ${info.uptime}`;
      return `${diag}\n\n${msg}`;
    } catch(err) {
      return `❌ Error: ${err.message}`;
    }
  }
}
