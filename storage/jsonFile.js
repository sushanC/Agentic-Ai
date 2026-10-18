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

function cloneFallback(value) {
  if (value === undefined || value === null || typeof value !== "object") return value;
  return structuredClone(value);
}

/** Create a small JSON store with shape validation and serialized mutations. */
export function createJsonFileStore(filePath, { fallbackValue, validate = () => true, mode } = {}) {
  const resolved = path.resolve(filePath);

  function assertValid(value, operation) {
    if (!validate(value)) {
      const err = new Error(`Stored JSON has an invalid shape: ${path.basename(resolved)}`);
      err.code = operation === "read" ? "JSON_STORAGE_CORRUPT" : "JSON_STORAGE_INVALID";
      throw err;
    }
  }

  async function read() {
    const value = await readJsonFile(resolved, cloneFallback(fallbackValue));
    assertValid(value, "read");
    return value;
  }

  async function write(value) {
    assertValid(value, "write");
    return withJsonFileLock(resolved, () => writeJsonFile(resolved, value, { mode }));
  }

  async function update(mutator) {
    if (typeof mutator !== "function") throw new TypeError("JSON store update requires a function.");
    return withJsonFileLock(resolved, async () => {
      const current = await readJsonFile(resolved, cloneFallback(fallbackValue));
      assertValid(current, "read");
      const next = await mutator(current);
      assertValid(next, "write");
      await writeJsonFile(resolved, next, { mode });
      return next;
    });
  }

  return { filePath: resolved, read, write, update };
}

/** Write JSON through a same-directory temporary file and atomic rename. */
export async function writeJsonFile(filePath, value, { mode, renameFile = fs.rename } = {}) {
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
    await renameFile(tempPath, resolved);
    if (mode !== undefined) await fs.chmod(resolved, mode).catch(() => {});
  } catch (err) {
    if (handle) await handle.close().catch(() => {});
    await fs.unlink(tempPath).catch(() => {});
    throw err;
  }
}
