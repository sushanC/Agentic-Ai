/**
 * desktopVolumeTool.js
 * Tool: desktop_volume, Risk: LOW
 */
import { SystemManager } from '../../desktop/SystemManager.js';
import { formatDiagnostic, createActionRecord } from '../../desktop/DesktopDiagnostics.js';
import { addDesktopAction } from '../../../storage/desktopHistoryStorage.js';
import { getPlatform } from '../../desktop/PlatformAdapter.js';

const manager = new SystemManager();

export class DesktopVolumeTool {
  async execute(action) {
    const start = Date.now();
    try {
      const act = action.input.action;
      let msg = '';
      if (act === 'set') {
        let level = action.input.level;
        if (level < 0) level = 0;
        if (level > 100) level = 100;
        await manager.setVolume(level);
        msg = `🔊 Volume set to **${level}%**`;
      } else {
        const level = await manager.getVolume();
        msg = `🔊 Current volume: **${level}%**`;
      }

      const duration = ((Date.now() - start) / 1000).toFixed(2);
      const platform = getPlatform();
      
      const diag = formatDiagnostic(platform, duration, 'desktop_volume');
      addDesktopAction(createActionRecord('desktop_volume', action.input, 'success'));
      
      return `${diag}\n\n${msg}`;
    } catch(err) {
      return `❌ Error: ${err.message}`;
    }
  }
}
