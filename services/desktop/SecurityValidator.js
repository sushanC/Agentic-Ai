import path from 'path';
import os from 'os';
import fs from 'fs/promises';

function isWithinRoot(candidate, root) {
    const relative = path.relative(root, candidate);
    return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export function sanitizePath(inputPath) {
    if (typeof inputPath !== 'string' || !inputPath) return inputPath;
    let expandedPath = inputPath;
    if (expandedPath === '~') {
        expandedPath = os.homedir();
    } else if (expandedPath.startsWith('~/') || expandedPath.startsWith('~\\')) {
        expandedPath = path.join(os.homedir(), expandedPath.slice(2));
    }
    return path.resolve(expandedPath);
}

export function validatePath(inputPath) {
    if (typeof inputPath !== 'string' || !inputPath) return { valid: false, error: 'Path must be a non-empty string' };
    if (inputPath.indexOf('\0') !== -1) return { valid: false, error: 'Null bytes are not allowed' };
    
    const safePath = sanitizePath(inputPath);
    const homeDir = path.resolve(os.homedir());
    const tmpDir = path.resolve(os.tmpdir());

    if (!isWithinRoot(safePath, homeDir) && !isWithinRoot(safePath, tmpDir)) {
        return { valid: false, error: 'Path must be within home directory or /tmp' };
    }
    return { valid: true, safePath };
}

/** Also reject existing symlink paths whose resolved target escapes allowed roots. */
export async function validatePathOnDisk(inputPath) {
    const lexical = validatePath(inputPath);
    if (!lexical.valid) return lexical;

    const roots = await Promise.all([os.homedir(), os.tmpdir()].map(root => fs.realpath(root).catch(() => path.resolve(root))));
    let cursor = lexical.safePath;
    const suffix = [];
    let realAncestor;
    while (!realAncestor) {
        try {
            realAncestor = await fs.realpath(cursor);
        } catch (err) {
            if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') {
                return { valid: false, error: 'Path could not be safely resolved' };
            }
            const parent = path.dirname(cursor);
            if (parent === cursor) return { valid: false, error: 'Path could not be safely resolved' };
            suffix.unshift(path.basename(cursor));
            cursor = parent;
        }
    }
    const resolvedPath = path.resolve(realAncestor, ...suffix);
    if (!roots.some(root => isWithinRoot(resolvedPath, root))) {
        return { valid: false, error: 'Path resolves outside the allowed directories' };
    }
    return { valid: true, safePath: lexical.safePath };
}

export function validateUrl(url) {
    if (typeof url !== 'string' || !url) return { valid: false, error: 'URL must be a non-empty string' };
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
    if (typeof name !== 'string' || !name) return { valid: false, error: 'Filename must be a non-empty string' };
    if (name.length > 255) return { valid: false, error: 'Filename too long' };
    if (name.indexOf('\0') !== -1) return { valid: false, error: 'Null bytes are not allowed' };
    if (name.includes('/') || name.includes('\\')) return { valid: false, error: 'Path separators are not allowed' };
    if (/^\.+$/.test(name)) return { valid: false, error: 'Invalid filename' };
    return { valid: true };
}

export function validateAppName(name) {
    if (typeof name !== 'string' || !name) return { valid: false, error: 'App name must be a non-empty string' };
    if (name.length > 100) return { valid: false, error: 'App name too long' };
    if (!/^[a-zA-Z0-9 _\-.]+$/.test(name)) return { valid: false, error: 'Invalid characters in app name' };
    return { valid: true };
}
