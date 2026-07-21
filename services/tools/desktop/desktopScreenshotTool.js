/**
 * desktopScreenshotTool.js
 * Tool: desktop_take_screenshot, Risk: LOW
 */
import { ScreenshotService } from '../../desktop/ScreenshotService.js';
import { formatDiagnostic, createActionRecord } from '../../desktop/DesktopDiagnostics.js';
import { addDesktopAction } from '../../../storage/desktopHistoryStorage.js';
import { getPlatform } from '../../desktop/PlatformAdapter.js';

const manager = new ScreenshotService();

export class DesktopScreenshotTool {
  async execute(action) {
    const start = Date.now();
    try {
      const mode = action.input?.mode || 'full';
      
      const res = await manager.takeScreenshot(mode);

      const duration = ((Date.now() - start) / 1000).toFixed(2);
      const platform = getPlatform();
      
      const diag = formatDiagnostic(platform, duration, 'desktop_take_screenshot');
      addDesktopAction(createActionRecord('desktop_take_screenshot', action.input, 'success'));
      
      return `${diag}\n\n📸 Screenshot saved: **${res.filename}**\n\nPath: \`${res.filePath}\``;
    } catch(err) {
      return `❌ Error: ${err.message}`;
    }
  }
}
