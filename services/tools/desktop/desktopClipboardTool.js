/**
 * desktopClipboardTool.js
 * Tool: desktop_clipboard, Risk: MEDIUM
 */
import { DesktopManager } from '../../desktop/DesktopManager.js';
import { formatDiagnostic, createActionRecord } from '../../desktop/DesktopDiagnostics.js';
import { addDesktopAction } from '../../../storage/desktopHistoryStorage.js';
import { getPlatform } from '../../desktop/PlatformAdapter.js';
import { createPending } from '../../confirmationService.js';

const manager = new DesktopManager();

export class DesktopClipboardTool {
  async execute(action) {
    const start = Date.now();
    try {
      const act = action.input.action;
      
      if (act === 'set' && !action._confirmedAt) {
        return await createPending({
          tool: 'desktop_clipboard',
          action: 'default',
          payload: action,
          preview: { text: action.input.text },
          title: 'Set Clipboard',
          message: 'Update clipboard content?'
        });
      }

      let msg = '';
      if (act === 'set') {
        await manager.setClipboard(action.input.text);
        msg = '📋 Clipboard updated.';
      } else {
        const content = await manager.getClipboard();
        msg = `📋 Clipboard contents:\n\n${content}`;
      }

      const duration = ((Date.now() - start) / 1000).toFixed(2);
      const platform = getPlatform();
      
      const diag = formatDiagnostic(platform, duration, 'desktop_clipboard');
      addDesktopAction(createActionRecord('desktop_clipboard', action.input, 'success'));
      
      return `${diag}\n\n${msg}`;
    } catch(err) {
      return `❌ Error: ${err.message}`;
    }
  }
}
