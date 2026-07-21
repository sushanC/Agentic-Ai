/**
 * desktopRestartTool.js
 * Tool: desktop_restart, Risk: HIGH
 */
import { SystemManager } from '../../desktop/SystemManager.js';
import { formatDiagnostic, createActionRecord } from '../../desktop/DesktopDiagnostics.js';
import { addDesktopAction } from '../../../storage/desktopHistoryStorage.js';
import { getPlatform } from '../../desktop/PlatformAdapter.js';
import { createPending } from '../../confirmationService.js';

const manager = new SystemManager();

export class DesktopRestartTool {
  async execute(action) {
    const start = Date.now();
    try {
      if (!action._confirmedAt) {
        return await createPending({
          tool: 'desktop_restart',
          action: 'default',
          payload: action,
          preview: { action: 'System restart' },
          title: 'Restart Computer',
          message: '⚠️ This will restart your computer. All unsaved work will be lost. Restart now?'
        });
      }

      await manager.restart();

      const duration = ((Date.now() - start) / 1000).toFixed(2);
      const platform = getPlatform();
      
      const diag = formatDiagnostic(platform, duration, 'desktop_restart');
      addDesktopAction(createActionRecord('desktop_restart', action.input, 'success'));
      
      return `${diag}\n\n🔄 Restarting...`;
    } catch(err) {
      return `❌ Error: ${err.message}`;
    }
  }
}
