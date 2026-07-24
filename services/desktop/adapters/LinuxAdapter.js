import { spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

function runCommand(cmd, args, options = {}) {
    return new Promise((resolve) => {
        const proc = spawn(cmd, args, { stdio: 'pipe', ...options });
        let stdout = '';
        let stderr = '';
        if (proc.stdout) proc.stdout.on('data', (d) => { stdout += d.toString(); });
        if (proc.stderr) proc.stderr.on('data', (d) => { stderr += d.toString(); });
        
        proc.on('close', (code) => {
            resolve({ stdout, stderr, code, success: code === 0 });
        });
        proc.on('error', (err) => {
            resolve({ stdout, stderr: err.message, code: -1, success: false, error: err.message });
        });
    });
}

export class LinuxAdapter {
    async openApp(appPath, args = []) {
        try {
            const child = spawn(appPath, args, { detached: true, stdio: 'ignore' });
            child.unref();
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async detectInstalledApps() {
        return { success: true, output: 'Not implemented directly, use findAppPath' };
    }

    async findAppPath(name) {
        const { stdout, success } = await runCommand('which', [name]);
        if (success && stdout.trim()) return stdout.trim();
        return null;
    }

    async openFolder(folderPath) {
        const res = await runCommand('xdg-open', [folderPath]);
        return { success: res.success, error: res.stderr };
    }

    async openFile(filePath) {
        const res = await runCommand('xdg-open', [filePath]);
        return { success: res.success, error: res.stderr };
    }

    async openUrl(url) {
        const res = await runCommand('xdg-open', [url]);
        return { success: res.success, error: res.stderr };
    }

    async revealInFileManager(filePath) {
        const dir = path.dirname(filePath);
        const res = await runCommand('xdg-open', [dir]);
        return { success: res.success, error: res.stderr };
    }

    async createFolder(folderPath) {
        try {
            await fs.mkdir(folderPath, { recursive: true });
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async renameFile(oldPath, newPath) {
        try {
            await fs.rename(oldPath, newPath);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async moveFile(srcPath, destPath) {
        try {
            await fs.rename(srcPath, destPath);
            return { success: true };
        } catch (error) {
            if (error.code === 'EXDEV') {
                try {
                    await fs.cp(srcPath, destPath, { recursive: true });
                    await fs.rm(srcPath, { recursive: true, force: true });
                    return { success: true };
                } catch (cpErr) {
                    return { success: false, error: cpErr.message };
                }
            }
            return { success: false, error: error.message };
        }
    }

    async copyFile(srcPath, destPath) {
        try {
            await fs.cp(srcPath, destPath, { recursive: true });
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async deleteFile(filePath) {
        try {
            await fs.rm(filePath, { recursive: true, force: true });
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async duplicateFile(srcPath) {
        try {
            const ext = path.extname(srcPath);
            const base = path.basename(srcPath, ext);
            const dir = path.dirname(srcPath);
            const destPath = path.join(dir, `${base}_copy${ext}`);
            await fs.cp(srcPath, destPath, { recursive: true });
            return { success: true, output: destPath };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async zipFiles(files, outputPath) {
        const res = await runCommand('zip', ['-r', outputPath, ...files]);
        return { success: res.success, output: res.stdout, error: res.stderr };
    }

    async unzipFile(zipPath, destDir) {
        const res = await runCommand('unzip', ['-o', zipPath, '-d', destDir]);
        return { success: res.success, output: res.stdout, error: res.stderr };
    }

    async getMetadata(filePath) {
        try {
            const stat = await fs.stat(filePath);
            return {
                success: true,
                output: {
                    name: path.basename(filePath),
                    size: stat.size,
                    created: stat.birthtime,
                    modified: stat.mtime,
                    type: stat.isDirectory() ? 'directory' : 'file',
                    absolutePath: path.resolve(filePath)
                }
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async searchFiles({ query, directory, type, modifiedSince, largerThan }) {
        const args = [directory];
        if (query) {
            args.push('-name', `*${query}*`);
        }
        if (type === 'file') args.push('-type', 'f');
        if (type === 'directory') args.push('-type', 'd');
        const res = await runCommand('find', args);
        return { success: res.success, output: res.stdout, error: res.stderr };
    }

    async takeScreenshot(outputPath, mode = 'full') {
        const args = mode === 'window' ? ['-u', outputPath] : [outputPath];
        const res = await runCommand('scrot', args);
        if (res.success) return { success: true };
        return { success: false, error: 'scrot failed or not installed' };
    }

    async getVolume() {
        const res = await runCommand('amixer', ['get', 'Master']);
        if (res.success) {
            const match = res.stdout.match(/\[(\d+)%\]/);
            if (match) return { success: true, output: parseInt(match[1]) };
        }
        return { success: false, error: res.stderr };
    }

    async setVolume(percent) {
        const res = await runCommand('amixer', ['set', 'Master', `${percent}%`]);
        return { success: res.success, error: res.stderr };
    }

    async getBrightness() {
        try {
            const entries = await fs.readdir("/sys/class/backlight");

const device = entries[0];
            const val = await fs.readFile('/sys/class/backlight/intel_backlight/brightness', 'utf8');
            const max = await fs.readFile('/sys/class/backlight/intel_backlight/max_brightness', 'utf8');
            return { success: true, output: Math.round((parseInt(val) / parseInt(max)) * 100) };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async setBrightness(percent) {
        const res = await runCommand('brightnessctl', ['set', `${percent}%`]);
        return { success: res.success, error: res.stderr };
    }

async getBattery() {
    try {
        const powerDir = "/sys/class/power_supply";

        const devices = await fs.readdir(powerDir);
        const batteryName = devices.find(d => d.startsWith("BAT"));

        if (!batteryName) {
            return {
                success: false,
                error: "No battery detected."
            };
        }

        const base = path.join(powerDir, batteryName);

        const level = await fs.readFile(
            path.join(base, "capacity"),
            "utf8"
        );

        const status = await fs.readFile(
            path.join(base, "status"),
            "utf8"
        );

        return {
            success: true,
            output: {
                level: Number(level.trim()),
                status: status.trim()
            }
        };

    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

    async getWifiStatus() {
        const res = await runCommand('nmcli', ['-t', '-f', 'DEVICE,STATE,CONNECTION', 'device', 'status']);
        return { success: res.success, output: res.stdout };
    }

    async getBluetoothStatus() {
        const res = await runCommand('bluetoothctl', ['show']);
        return { success: res.success, output: res.stdout };
    }

    async sleep() {
        const res = await runCommand('systemctl', ['suspend']);
        return { success: res.success, error: res.stderr };
    }

    async lock() {
        let res = await runCommand('gnome-screensaver-command', ['-l']);
        if (!res.success) {
            res = await runCommand('loginctl', ['lock-session']);
        }
        return { success: res.success, error: res.stderr };
    }

    async restart() {
        const res = await runCommand('systemctl', ['reboot']);
        return { success: res.success, error: res.stderr };
    }

    async shutdown() {
        const res = await runCommand('systemctl', ['poweroff']);
        return { success: res.success, error: res.stderr };
    }

async getCpuUsage() {

    const cpus1 = os.cpus();

    await new Promise(r => setTimeout(r, 200));

    const cpus2 = os.cpus();

    let idle = 0;
    let total = 0;

    cpus1.forEach((cpu, i) => {

        const t1 = cpu.times;
        const t2 = cpus2[i].times;

        const idleDiff = t2.idle - t1.idle;

        const totalDiff =
            (t2.user - t1.user) +
            (t2.nice - t1.nice) +
            (t2.sys - t1.sys) +
            (t2.idle - t1.idle) +
            (t2.irq - t1.irq);

        idle += idleDiff;
        total += totalDiff;

    });

    return {
        success: true,
        output: {
            usage: Number(
                ((1 - idle / total) * 100).toFixed(1)
            )
        }
    };
}

async getMemoryUsage() {

    const total = os.totalmem();

    const free = os.freemem();

    const used = total - free;

    return {
        success: true,
        output: {
            totalGB: +(total / 1024 ** 3).toFixed(2),
            usedGB: +(used / 1024 ** 3).toFixed(2),
            freeGB: +(free / 1024 ** 3).toFixed(2),
            percent: +((used / total) * 100).toFixed(1)
        }
    };
}

    async getDiskUsage(path = '/') {
        const res = await runCommand('df', ['-h', path]);
        return { success: res.success, output: res.stdout, error: res.stderr };
    }

    async getNetworkStatus() {
        const res = await runCommand('nmcli', ['-t', '-f', 'TYPE,STATE,DEVICE', 'con', 'show', '--active']);
        const connected = res.stdout.trim() !== "";

return {
    success: res.success,
    output: {
        connected,
        interfaces: res.stdout.trim()
    }
};
    }

    async getSystemInfo() {
        return {
            success: true,
            output: {
    os: os.type(),
    platform: os.platform(),
    hostname: os.hostname(),
    release: os.release(),
    arch: os.arch(),
    uptime: os.uptime()
}
        };
    }

    async getClipboard() {
        const res = await runCommand('xclip', ['-selection', 'clipboard', '-o']);
        if (res.success) return { success: true, output: res.stdout };
        const res2 = await runCommand('xsel', ['-b', '-o']);
        return { success: res2.success, output: res2.stdout, error: res2.stderr };
    }

    async setClipboard(text) {
        return new Promise((resolve) => {
            const proc = spawn('xclip', ['-selection', 'clipboard']);
            proc.stdin.write(text);
            proc.stdin.end();
            proc.on('close', (code) => {
                resolve({ success: code === 0 });
            });
        });
    }

    async getCurrentUser() {
        return { success: true, output: os.userInfo().username };
    }
}
