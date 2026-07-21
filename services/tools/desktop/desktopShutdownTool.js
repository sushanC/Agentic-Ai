/**
 * desktopShutdownTool.js
 * Tool: desktop_shutdown, Risk: HIGH
 */
import { SystemManager } from '../../desktop/SystemManager.js';
import { formatDiagnostic, createActionRecord } from '../../desktop/DesktopDiagnostics.js';
import { addDesktopAction } from '../../../storage/desktopHistoryStorage.js';
import { getPlatform } from '../../desktop/PlatformAdapter.js';
import { createPending } from '../../confirmationService.js';

const manager = new SystemManager();

export class DesktopShutdownTool {
  async execute(action) {
    const start = Date.now();
    try {
      if (!action._confirmedAt) {
        return await createPending({
          tool: 'desktop_shutdown',
          action: 'default',
          payload: action,
          preview: { action: 'System shutdown' },
          title: 'Shutdown Computer',
          message: '⚠️ This will shut down your computer. Shutdown now?'
        });
      }

      await manager.shutdown();

      const duration = ((Date.now() - start) / 1000).toFixed(2);
      const platform = getPlatform();
      
      const diag = formatDiagnostic(platform, duration, 'desktop_shutdown');
      addDesktopAction(createActionRecord('desktop_shutdown', action.input, 'success'));
      
      return `${diag}\n\n⏻ Shutting down...`;
    } catch(err) {
      return `❌ Error: ${err.message}`;
    }
  }
}
