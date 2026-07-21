/**
 * desktopMemoryTool.js
 * Tool: desktop_memory, Risk: LOW
 */
import { SystemManager } from '../../desktop/SystemManager.js';
import { formatDiagnostic, createActionRecord } from '../../desktop/DesktopDiagnostics.js';
import { addDesktopAction } from '../../../storage/desktopHistoryStorage.js';
import { getPlatform } from '../../desktop/PlatformAdapter.js';

const manager = new SystemManager();

export class DesktopMemoryTool {
  async execute(action) {
    const start = Date.now();
    try {
      const memory = await manager.getMemoryUsage();

      const duration = ((Date.now() - start) / 1000).toFixed(2);
      const platform = getPlatform();
      
      const diag = formatDiagnostic(platform, duration, 'desktop_memory');
      addDesktopAction(createActionRecord('desktop_memory', action.input, 'success'));
      
      return `${diag}\n\n🧠 Memory: **${memory.used}GB** used of **${memory.total}GB** (${memory.percent}%)`;
    } catch(err) {
      return `❌ Error: ${err.message}`;
    }
  }
}
