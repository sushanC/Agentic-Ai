import os from 'os';
import { LinuxAdapter } from './adapters/LinuxAdapter.js';
import { WindowsAdapter } from './adapters/WindowsAdapter.js';
import { MacAdapter } from './adapters/MacAdapter.js';

let instance = null;

export function getPlatformAdapter() {
    if (instance) return instance;
    const platform = os.platform();
    if (platform === 'linux') {
        instance = new LinuxAdapter();
    } else if (platform === 'win32') {
        instance = new WindowsAdapter();
    } else if (platform === 'darwin') {
        instance = new MacAdapter();
    } else {
        throw new Error(`Unsupported platform: ${platform}`);
    }
    return instance;
}

export function getPlatform() {
    const p = os.platform();
    if (['linux', 'win32', 'darwin'].includes(p)) return p;
    return 'unknown';
}
