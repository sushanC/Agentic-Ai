/**
 * desktopCpuTool.js
 * Tool: desktop_cpu, Risk: LOW
 */
import { SystemManager } from '../../desktop/SystemManager.js';
import { formatDiagnostic, createActionRecord } from '../../desktop/DesktopDiagnostics.js';
import { addDesktopAction } from '../../../storage/desktopHistoryStorage.js';
import { getPlatform } from '../../desktop/PlatformAdapter.js';

const manager = new SystemManager();

export class DesktopCpuTool {
  async execute(action) {
    const start = Date.now();
    try {
      const usage = await manager.getCpuUsage();

      const duration = ((Date.now() - start) / 1000).toFixed(2);
      const platform = getPlatform();
      
      const diag = formatDiagnostic(platform, duration, 'desktop_cpu');
      addDesktopAction(createActionRecord('desktop_cpu', action.input, 'success'));
      
      return `${diag}\n\n💻 CPU Usage: **${usage}%**`;
    } catch(err) {
      return `❌ Error: ${err.message}`;
    }
  }
}
