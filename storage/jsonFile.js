import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import os from "os";
import { AsyncLocalStorage } from "async_hooks";

const locks = new Map();
const heldDirectoryLocks = new AsyncLocalStorage();
const LOCK_TIMEOUT_MS = 10_000;
const LOCK_RETRY_MS = 25;
const OWNERLESS_LOCK_GRACE_MS = 2_000;

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function processExists(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code === "EPERM"; }
}

async function acquireCrossProcessLock(filePath, { timeoutMs = LOCK_TIMEOUT_MS } = {}) {
  const lockPath = `${path.resolve(filePath)}.lock`;
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  const started = Date.now();
  const token = randomUUID();
  while (true) {
    try {
      await fs.mkdir(lockPath, { mode: 0o700 });
      try {
        await fs.writeFile(path.join(lockPath, "owner.json"), JSON.stringify({
          pid: process.pid, host: os.hostname(), token, createdAt: Date.now(),
        }), { flag: "wx", mode: 0o600 });
      } catch (error) {
        await fs.rm(lockPath, { recursive: true, force: true });
        throw error;
      }
      return async () => {
        try {
          const owner = JSON.parse(await fs.readFile(path.join(lockPath, "owner.json"), "utf8"));
          if (owner.token === token) await fs.rm(lockPath, { recursive: true, force: true });
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      let owner;
      let stat;
      try {
        [owner, stat] = await Promise.all([
          fs.readFile(path.join(lockPath, "owner.json"), "utf8").then(JSON.parse),
          fs.stat(lockPath),
        ]);
      } catch (readError) {
        if (readError.code !== "ENOENT" && readError.code !== "ENOTDIR") throw readError;
      }
      const localOwner = owner?.host === os.hostname();
      const stale = localOwner && !(await processExists(owner.pid));
      const ownerlessStale = !owner && stat && Date.now() - stat.mtimeMs > OWNERLESS_LOCK_GRACE_MS;
      if (stale || ownerlessStale) {
        const claimPath = path.join(lockPath, "reclaim");
        let claimHandle;
        try {
          claimHandle = await fs.open(claimPath, "wx", 0o600);
          await claimHandle.writeFile(JSON.stringify({ pid: process.pid, token }), "utf8");
          await claimHandle.close();
          claimHandle = null;
        } catch (claimError) {
          if (claimHandle) await claimHandle.close().catch(() => {});
          if (claimError.code !== "EEXIST" && claimError.code !== "ENOENT" && claimError.code !== "ENOTDIR") throw claimError;
          await delay(LOCK_RETRY_MS);
          continue;
        }
        const quarantine = `${lockPath}.stale.${process.pid}.${token}`;
        try {
          let latestOwner;
          try { latestOwner = JSON.parse(await fs.readFile(path.join(lockPath, "owner.json"), "utf8")); }
          catch { latestOwner = undefined; }
          const stillStale = latestOwner
            ? latestOwner.host === os.hostname() && !(await processExists(latestOwner.pid))
            : true;
          if (!stillStale) {
            await fs.unlink(claimPath).catch(() => {});
            continue;
          }
          await fs.rename(lockPath, quarantine);
          await fs.rm(quarantine, { recursive: true, force: true });
          continue;
        } catch (renameError) {
          await fs.unlink(claimPath).catch(() => {});
          if (!new Set(["ENOENT", "EEXIST", "ENOTEMPTY"]).has(renameError.code)) throw renameError;
        }
      }
      if (Date.now() - started >= timeoutMs) {
        const lockError = new Error(`Timed out waiting for JSON store lock: ${path.basename(filePath)}`);
        lockError.code = "JSON_STORAGE_LOCK_TIMEOUT";
        throw lockError;
      }
      await delay(LOCK_RETRY_MS);
    }
  }
}

/** Serialize updates to one file in this process and across processes on a local filesystem. */
export async function withJsonFileLock(filePath, operation, options = {}) {
  const key = path.resolve(filePath);
  const dataDirectory = path.dirname(key);
  const previous = locks.get(key) || Promise.resolve();
  let release;
  const current = new Promise(resolve => { release = resolve; });
  locks.set(key, current);
  await previous;
  let releaseGlobalLock;
  let releaseFileLock;
  try {
    const held = heldDirectoryLocks.getStore();
    if (!held?.has(dataDirectory)) releaseGlobalLock = await acquireCrossProcessLock(path.join(dataDirectory, ".samgpt-storage-coordination"), options);
    releaseFileLock = await acquireCrossProcessLock(key, options);
    const nextHeld = new Set(held || []);
    nextHeld.add(dataDirectory);
    return await heldDirectoryLocks.run(nextHeld, operation);
  } finally {
    try { await releaseFileLock?.(); }
    finally {
      try { await releaseGlobalLock?.(); }
      finally { release(); }
    }
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
    return withJsonFileLock(resolved, async () => {
      const value = await readJsonFile(resolved, cloneFallback(fallbackValue));
      assertValid(value, "read");
      return value;
    });
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

/** Atomically replace generated text output with a private same-directory temp file. */
export async function writeTextFileAtomic(filePath, text, { mode = 0o600 } = {}) {
  const resolved = path.resolve(filePath);
  const dir = path.dirname(resolved);
  const tempPath = path.join(dir, `.${path.basename(resolved)}.${process.pid}.${randomUUID()}.tmp`);
  return withJsonFileLock(resolved, async () => {
    await fs.mkdir(dir, { recursive: true });
    let handle;
    try {
      handle = await fs.open(tempPath, "wx", mode);
      await handle.writeFile(String(text), "utf8");
      await handle.sync();
      await handle.close();
      handle = null;
      await fs.rename(tempPath, resolved);
      await fs.chmod(resolved, mode).catch(() => {});
    } catch (error) {
      if (handle) await handle.close().catch(() => {});
      await fs.unlink(tempPath).catch(() => {});
      throw error;
    }
  });
}
