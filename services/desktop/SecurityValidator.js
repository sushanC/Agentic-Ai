import path from 'path';
import os from 'os';

export function sanitizePath(inputPath) {
    if (!inputPath) return inputPath;
    let expandedPath = inputPath;
    if (expandedPath.startsWith('~')) {
        expandedPath = path.join(os.homedir(), expandedPath.slice(1));
    }
    return path.resolve(expandedPath);
}

export function validatePath(inputPath) {
    if (!inputPath) return { valid: false, error: 'Path is required' };
    if (inputPath.indexOf('\0') !== -1) return { valid: false, error: 'Null bytes are not allowed' };
    
    const safePath = sanitizePath(inputPath);
    const homeDir = path.resolve(os.homedir());
    const tmpDir = path.resolve(os.tmpdir());

    if (!safePath.startsWith(homeDir) && !safePath.startsWith(tmpDir)) {
        return { valid: false, error: 'Path must be within home directory or /tmp' };
    }
    return { valid: true, safePath };
}

export function validateUrl(url) {
    if (!url) return { valid: false, error: 'URL is required' };
    try {
        const parsed = new URL(url);
        if (['javascript:', 'file:', 'data:'].includes(parsed.protocol)) {
            return { valid: false, error: 'Invalid URL scheme' };
        }
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return { valid: false, error: 'Only http and https schemes are allowed' };
        }
        return { valid: true };
    } catch (e) {
        return { valid: false, error: 'Invalid URL format' };
    }
}

export function validateFilename(name) {
    if (!name) return { valid: false, error: 'Filename is required' };
    if (name.length > 255) return { valid: false, error: 'Filename too long' };
    if (name.indexOf('\0') !== -1) return { valid: false, error: 'Null bytes are not allowed' };
    if (name.includes('/') || name.includes('\\')) return { valid: false, error: 'Path separators are not allowed' };
    if (/^\.+$/.test(name)) return { valid: false, error: 'Invalid filename' };
    return { valid: true };
}

export function validateAppName(name) {
    if (!name) return { valid: false, error: 'App name is required' };
    if (name.length > 100) return { valid: false, error: 'App name too long' };
    if (!/^[a-zA-Z0-9 _\-.]+$/.test(name)) return { valid: false, error: 'Invalid characters in app name' };
    return { valid: true };
}
