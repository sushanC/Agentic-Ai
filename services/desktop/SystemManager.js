import { getPlatformAdapter } from './PlatformAdapter.js';
import os from 'os';

export class SystemManager {
    constructor() {
        this.adapter = getPlatformAdapter();
    }

    async getVolume() { return this.adapter.getVolume(); }
    
    async setVolume(percent) {
        const p = parseInt(percent, 10);
        if (isNaN(p) || p < 0 || p > 100) return { success: false, error: 'Volume must be 0-100' };
        return this.adapter.setVolume(p);
    }

    async getBrightness() { return this.adapter.getBrightness(); }

    async setBrightness(percent) {
        const p = parseInt(percent, 10);
        if (isNaN(p) || p < 0 || p > 100) return { success: false, error: 'Brightness must be 0-100' };
        return this.adapter.setBrightness(p);
    }

    async getBattery() { return this.adapter.getBattery(); }
    async getWifiStatus() { return this.adapter.getWifiStatus(); }
    async getBluetoothStatus() { return this.adapter.getBluetoothStatus(); }
    async sleep() { return this.adapter.sleep(); }
    async lock() { return this.adapter.lock(); }
    async restart() { return this.adapter.restart(); }
    async shutdown() { return this.adapter.shutdown(); }
    async getCpuUsage() { return this.adapter.getCpuUsage(); }
    async getMemoryUsage() { return this.adapter.getMemoryUsage(); }
    async getDiskUsage(path = '/') { return this.adapter.getDiskUsage(path); }
    async getNetworkStatus() { return this.adapter.getNetworkStatus(); }
    
    async getSystemInfo() {
        const res = await this.adapter.getSystemInfo();
        if (res.success) {
            res.output.cpus = os.cpus();
            res.output.totalmem = os.totalmem();
            res.output.freemem = os.freemem();
        }
        return res;
    }

    async getCurrentUser() { return this.adapter.getCurrentUser(); }
}
