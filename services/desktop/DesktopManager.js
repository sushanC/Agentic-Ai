import os from 'os';
import { getPlatformAdapter, getPlatform } from './PlatformAdapter.js';
import { AppLauncher } from './AppLauncher.js';
import { validatePath, validateUrl } from './SecurityValidator.js';
import { ScreenshotService } from './ScreenshotService.js';

export class DesktopManager {
    constructor() {
        this.adapter = getPlatformAdapter();
        this.appLauncher = new AppLauncher();
        this.screenshotService = new ScreenshotService();
    }

    async openApp(appName) {
        return this.appLauncher.launch(appName);
    }

    async openFolder(folderPath) {
        const { valid, safePath, error } = validatePath(folderPath);
        if (!valid) return { success: false, error };
        return this.adapter.openFolder(safePath);
    }

    async openFile(filePath) {
        const { valid, safePath, error } = validatePath(filePath);
        if (!valid) return { success: false, error };
        return this.adapter.openFile(safePath);
    }

    async openUrl(url) {
        const { valid, error } = validateUrl(url);
        if (!valid) return { success: false, error };
        return this.adapter.openUrl(url);
    }

    async getClipboard() {
        return this.adapter.getClipboard();
    }

    async setClipboard(text) {
        return this.adapter.setClipboard(text);
    }

    async getDesktopInfo() {
        const screensDir = os.homedir();
        return {
            success: true,
            output: {
                platform: getPlatform(),
                username: os.userInfo().username,
                hostname: os.hostname(),
                homeDir: os.homedir(),
                screensDir
            }
        };
    }

    async takeScreenshot(mode = 'full') {
        return this.screenshotService.takeScreenshot(mode);
    }
}
