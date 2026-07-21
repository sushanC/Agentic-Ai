import path from 'path';
import fs from 'fs';
import { getStoragePath } from '../../storage/storagePath.js';
import { getPlatformAdapter } from './PlatformAdapter.js';
import { validateFilename } from './SecurityValidator.js';

export class ScreenshotService {
    constructor() {
        // Handle potentially async or sync getStoragePath
        const resolvedPath = getStoragePath('screenshots');
        if (resolvedPath instanceof Promise) {
            resolvedPath.then(dir => {
                this.screenshotsDir = dir;
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            });
        } else {
            this.screenshotsDir = resolvedPath;
            if (!fs.existsSync(this.screenshotsDir)) fs.mkdirSync(this.screenshotsDir, { recursive: true });
        }
        this.adapter = getPlatformAdapter();
    }

    async takeScreenshot(mode = 'full') {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `screenshot_${timestamp}.png`;
            const dir = await Promise.resolve(this.screenshotsDir || getStoragePath('screenshots'));
            const fullPath = path.join(dir, filename);
            
            const res = await this.adapter.takeScreenshot(fullPath, mode);
            if (!res.success) return res;

            const base64 = fs.readFileSync(fullPath).toString('base64');
            return {
                success: true,
                filePath: fullPath,
                filename,
                base64,
                timestamp: new Date().toISOString()
            };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async listScreenshots() {
        const dir = await Promise.resolve(this.screenshotsDir || getStoragePath('screenshots'));
        if (!fs.existsSync(dir)) return [];
        const files = fs.readdirSync(dir);
        return files.map(file => {
            const filePath = path.join(dir, file);
            const stats = fs.statSync(filePath);
            return {
                filename: file,
                filePath,
                timestamp: stats.mtime.toISOString(),
                size: stats.size
            };
        });
    }

    async deleteScreenshot(filename) {
        const { valid, error } = validateFilename(filename);
        if (!valid) return { success: false, error };
        
        try {
            const dir = await Promise.resolve(this.screenshotsDir || getStoragePath('screenshots'));
            const filePath = path.join(dir, filename);
            fs.unlinkSync(filePath);
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    getScreenshotsDir() {
        return this.screenshotsDir;
    }
}
