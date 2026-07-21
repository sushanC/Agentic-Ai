/**
 * desktopBrightnessTool.js
 * Tool: desktop_brightness, Risk: LOW
 */
import { SystemManager } from '../../desktop/SystemManager.js';
import { formatDiagnostic, createActionRecord } from '../../desktop/DesktopDiagnostics.js';
import { addDesktopAction } from '../../../storage/desktopHistoryStorage.js';
import { getPlatform } from '../../desktop/PlatformAdapter.js';

const manager = new SystemManager();

export class DesktopBrightnessTool {
  async execute(action) {
    const start = Date.now();
    try {
      const act = action.input.action;
      let msg = '';
      if (act === 'set') {
        const level = action.input.level;
        await manager.setBrightness(level);
        msg = `☀️ Brightness set to **${level}%**`;
      } else {
        const level = await manager.getBrightness();
        msg = `☀️ Current brightness: **${level}%**`;
      }

      const duration = ((Date.now() - start) / 1000).toFixed(2);
      const platform = getPlatform();
      
      const diag = formatDiagnostic(platform, duration, 'desktop_brightness');
      addDesktopAction(createActionRecord('desktop_brightness', action.input, 'success'));
      
      return `${diag}\n\n${msg}`;
    } catch(err) {
      return `❌ Error: ${err.message}`;
    }
  }
}
