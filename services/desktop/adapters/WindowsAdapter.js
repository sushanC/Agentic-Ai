export class WindowsAdapter {
    constructor() {
        this.notImplemented = { success: false, error: 'Not implemented on Windows — coming soon' };
    }

    async openApp() { return this.notImplemented; }
    async detectInstalledApps() { return this.notImplemented; }
    async findAppPath() { return this.notImplemented; }
    async openFolder() { return this.notImplemented; }
    async openFile() { return this.notImplemented; }
    async openUrl() { return this.notImplemented; }
    async revealInFileManager() { return this.notImplemented; }
    async createFolder() { return this.notImplemented; }
    async renameFile() { return this.notImplemented; }
    async moveFile() { return this.notImplemented; }
    async copyFile() { return this.notImplemented; }
    async deleteFile() { return this.notImplemented; }
    async duplicateFile() { return this.notImplemented; }
    async zipFiles() { return this.notImplemented; }
    async unzipFile() { return this.notImplemented; }
    async getMetadata() { return this.notImplemented; }
    async searchFiles() { return this.notImplemented; }
    async takeScreenshot() { return this.notImplemented; }
    async getVolume() { return this.notImplemented; }
    async setVolume() { return this.notImplemented; }
    async getBrightness() { return this.notImplemented; }
    async setBrightness() { return this.notImplemented; }
    async getBattery() { return this.notImplemented; }
    async getWifiStatus() { return this.notImplemented; }
    async getBluetoothStatus() { return this.notImplemented; }
    async sleep() { return this.notImplemented; }
    async lock() { return this.notImplemented; }
    async restart() { return this.notImplemented; }
    async shutdown() { return this.notImplemented; }
    async getCpuUsage() { return this.notImplemented; }
    async getMemoryUsage() { return this.notImplemented; }
    async getDiskUsage() { return this.notImplemented; }
    async getNetworkStatus() { return this.notImplemented; }
    async getSystemInfo() { return this.notImplemented; }
    async getClipboard() { return this.notImplemented; }
    async setClipboard() { return this.notImplemented; }
    async getCurrentUser() { return this.notImplemented; }
}
