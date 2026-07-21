/**
 * desktopBatteryTool.js
 * Tool: desktop_battery, Risk: LOW
 */
import { SystemManager } from '../../desktop/SystemManager.js';
import { formatDiagnostic, createActionRecord } from '../../desktop/DesktopDiagnostics.js';
import { addDesktopAction } from '../../../storage/desktopHistoryStorage.js';
import { getPlatform } from '../../desktop/PlatformAdapter.js';

const manager = new SystemManager();

export class DesktopBatteryTool {
  async execute(action) {
    const start = Date.now();
    try {
      const battery = await manager.getBattery();

      const duration = ((Date.now() - start) / 1000).toFixed(2);
      const platform = getPlatform();
      
      const diag = formatDiagnostic(platform, duration, 'desktop_battery');
      addDesktopAction(createActionRecord('desktop_battery', action.input, 'success'));
      
      return `${diag}\n\n🔋 Battery: **${battery.level}%** (${battery.status})`;
    } catch(err) {
      return `❌ Error: ${err.message}`;
    }
  }
}
