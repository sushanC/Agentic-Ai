/**
 * desktopDiskTool.js
 * Tool: desktop_disk, Risk: LOW
 */
import { SystemManager } from '../../desktop/SystemManager.js';
import { formatDiagnostic, createActionRecord } from '../../desktop/DesktopDiagnostics.js';
import { addDesktopAction } from '../../../storage/desktopHistoryStorage.js';
import { getPlatform } from '../../desktop/PlatformAdapter.js';

const manager = new SystemManager();

export class DesktopDiskTool {
  async execute(action) {
    const start = Date.now();
    try {
      const path = action.input.path || '/';
      const disk = await manager.getDiskUsage(path);

      const duration = ((Date.now() - start) / 1000).toFixed(2);
      const platform = getPlatform();
      
      const diag = formatDiagnostic(platform, duration, 'desktop_disk');
      addDesktopAction(createActionRecord('desktop_disk', action.input, 'success'));
      
      let msg = '| Filesystem | Size | Used | Avail | Use% | Mounted on |\n|---|---|---|---|---|---|\n';
      if (Array.isArray(disk)) {
        msg += disk.map(d => `| ${d.fs} | ${d.size} | ${d.used} | ${d.avail} | ${d.use} | ${d.mount} |`).join('\n');
      } else {
        msg += `| ${disk.fs || '-'} | ${disk.size || '-'} | ${disk.used || '-'} | ${disk.avail || '-'} | ${disk.use || '-'} | ${disk.mount || '-'} |`;
      }
      
      return `${diag}\n\n${msg}`;
    } catch(err) {
      return `❌ Error: ${err.message}`;
    }
  }
}
