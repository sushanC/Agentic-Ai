/**
 * desktopSleepTool.js
 * Tool: desktop_sleep, Risk: HIGH
 */
import { SystemManager } from '../../desktop/SystemManager.js';
import { formatDiagnostic, createActionRecord } from '../../desktop/DesktopDiagnostics.js';
import { addDesktopAction } from '../../../storage/desktopHistoryStorage.js';
import { getPlatform } from '../../desktop/PlatformAdapter.js';
import { createPending } from '../../confirmationService.js';

const manager = new SystemManager();

export class DesktopSleepTool {
  async execute(action) {
    const start = Date.now();
    try {
      if (!action._confirmedAt) {
        return await createPending({
          tool: 'desktop_sleep',
          action: 'default',
          payload: action,
          preview: { action: 'System sleep' },
          title: 'Sleep',
          message: 'Put the computer to sleep?'
        });
      }

      await manager.sleep();

      const duration = ((Date.now() - start) / 1000).toFixed(2);
      const platform = getPlatform();
      
      const diag = formatDiagnostic(platform, duration, 'desktop_sleep');
      addDesktopAction(createActionRecord('desktop_sleep', action.input, 'success'));
      
      return `${diag}\n\n💤 Going to sleep...`;
    } catch(err) {
      return `❌ Error: ${err.message}`;
    }
  }
}
