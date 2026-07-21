import { getPlatformAdapter } from './PlatformAdapter.js';
import { validatePath } from './SecurityValidator.js';

export class FileManager {
    constructor() {
        this.adapter = getPlatformAdapter();
    }

    async createFolder(folderPath) {
        const { valid, safePath, error } = validatePath(folderPath);
        if (!valid) return { success: false, error };
        return this.adapter.createFolder(safePath);
    }

    async renameFile(oldPath, newPath) {
        const vOld = validatePath(oldPath);
        const vNew = validatePath(newPath);
        if (!vOld.valid) return { success: false, error: vOld.error };
        if (!vNew.valid) return { success: false, error: vNew.error };
        return this.adapter.renameFile(vOld.safePath, vNew.safePath);
    }

    async moveFile(srcPath, destPath) {
        const vSrc = validatePath(srcPath);
        const vDest = validatePath(destPath);
        if (!vSrc.valid) return { success: false, error: vSrc.error };
        if (!vDest.valid) return { success: false, error: vDest.error };
        return this.adapter.moveFile(vSrc.safePath, vDest.safePath);
    }

    async copyFile(srcPath, destPath) {
        const vSrc = validatePath(srcPath);
        const vDest = validatePath(destPath);
        if (!vSrc.valid) return { success: false, error: vSrc.error };
        if (!vDest.valid) return { success: false, error: vDest.error };
        return this.adapter.copyFile(vSrc.safePath, vDest.safePath);
    }

    async duplicateFile(filePath) {
        const { valid, safePath, error } = validatePath(filePath);
        if (!valid) return { success: false, error };
        return this.adapter.duplicateFile(safePath);
    }

    async deleteFile(filePath) {
        const { valid, safePath, error } = validatePath(filePath);
        if (!valid) return { success: false, error };
        return this.adapter.deleteFile(safePath);
    }

    async search({ query, directory, type, modifiedSince, largerThan }) {
        const { valid, safePath, error } = validatePath(directory);
        if (!valid) return { success: false, error };
        return this.adapter.searchFiles({ query, directory: safePath, type, modifiedSince, largerThan });
    }

    async zipFiles(files, outputPath) {
        const outValid = validatePath(outputPath);
        if (!outValid.valid) return { success: false, error: outValid.error };
        const safeFiles = [];
        for (const f of files) {
            const v = validatePath(f);
            if (!v.valid) return { success: false, error: v.error };
            safeFiles.push(v.safePath);
        }
        return this.adapter.zipFiles(safeFiles, outValid.safePath);
    }

    async unzipFile(zipPath, destDir) {
        const vZip = validatePath(zipPath);
        const vDest = validatePath(destDir);
        if (!vZip.valid) return { success: false, error: vZip.error };
        if (!vDest.valid) return { success: false, error: vDest.error };
        return this.adapter.unzipFile(vZip.safePath, vDest.safePath);
    }

    async revealInFileManager(filePath) {
        const { valid, safePath, error } = validatePath(filePath);
        if (!valid) return { success: false, error };
        return this.adapter.revealInFileManager(safePath);
    }

    async getMetadata(filePath) {
        const { valid, safePath, error } = validatePath(filePath);
        if (!valid) return { success: false, error };
        return this.adapter.getMetadata(safePath);
    }
}
