import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const locks = new Map();

/** Serialize updates to one file within this Node process. */
export async function withJsonFileLock(filePath, operation) {
  const key = path.resolve(filePath);
  const previous = locks.get(key) || Promise.resolve();
  let release;
  const current = new Promise(resolve => { release = resolve; });
  locks.set(key, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (locks.get(key) === current) locks.delete(key);
  }
}

/** Missing files use the supplied default; malformed files fail closed. */
export async function readJsonFile(filePath, fallbackValue) {
  let content;
  try {
    content = await fs.readFile(filePath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return fallbackValue;
    throw err;
  }

  try {
    return JSON.parse(content);
  } catch (cause) {
    const err = new Error(`Stored JSON is malformed: ${path.basename(filePath)}`, { cause });
    err.code = "JSON_STORAGE_CORRUPT";
    console.error("[JsonStorage] Malformed JSON file", { file: path.basename(filePath), code: err.code });
    throw err;
  }
}

/** Write JSON through a same-directory temporary file and atomic rename. */
export async function writeJsonFile(filePath, value, { mode } = {}) {
  const resolved = path.resolve(filePath);
  const dir = path.dirname(resolved);
  const tempPath = path.join(dir, `.${path.basename(resolved)}.${process.pid}.${randomUUID()}.tmp`);
  const data = `${JSON.stringify(value, null, 2)}\n`;
  await fs.mkdir(dir, { recursive: true });

  let handle;
  try {
    handle = await fs.open(tempPath, "wx", mode ?? 0o600);
    await handle.writeFile(data, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(tempPath, resolved);
    if (mode !== undefined) await fs.chmod(resolved, mode).catch(() => {});
  } catch (err) {
    if (handle) await handle.close().catch(() => {});
    await fs.unlink(tempPath).catch(() => {});
    throw err;
  }
}
