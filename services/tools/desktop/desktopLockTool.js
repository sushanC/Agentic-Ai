/**
 * desktopLockTool.js
 * Tool: desktop_lock, Risk: HIGH
 */
import { SystemManager } from '../../desktop/SystemManager.js';
import { formatDiagnostic, createActionRecord } from '../../desktop/DesktopDiagnostics.js';
import { addDesktopAction } from '../../../storage/desktopHistoryStorage.js';
import { getPlatform } from '../../desktop/PlatformAdapter.js';
import { createPending } from '../../confirmationService.js';

const manager = new SystemManager();

export class DesktopLockTool {
  async execute(action) {
    const start = Date.now();
    try {
      if (!action._confirmedAt) {
        return await createPending({
          tool: 'desktop_lock',
          action: 'default',
          payload: action,
          preview: { action: 'Lock screen' },
          title: 'Lock Screen',
          message: 'Lock the screen now?'
        });
      }

      await manager.lock();

      const duration = ((Date.now() - start) / 1000).toFixed(2);
      const platform = getPlatform();
      
      const diag = formatDiagnostic(platform, duration, 'desktop_lock');
      addDesktopAction(createActionRecord('desktop_lock', action.input, 'success'));
      
      return `${diag}\n\n🔒 Screen locked.`;
    } catch(err) {
      return `❌ Error: ${err.message}`;
    }
  }
}
