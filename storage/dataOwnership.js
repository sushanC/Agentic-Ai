import fs from "node:fs/promises";
import path from "node:path";
import { constants } from "node:fs";
import { getStoragePath } from "./storagePath.js";

const MANIFEST_VERSION = 1;
const ADOPTION_CONFIRMATION = "I_CONFIRM_DATA_OWNER_ADOPTION";

function validateIdentity({ issuer, subject }) {
  let parsedIssuer;
  try { parsedIssuer = new URL(issuer); } catch { throw new Error("A valid OIDC issuer URL is required."); }
  if (parsedIssuer.protocol !== "https:" || parsedIssuer.username || parsedIssuer.password || parsedIssuer.search || parsedIssuer.hash) {
    throw new Error("OIDC issuer must be a clean HTTPS URL.");
  }
  if (typeof subject !== "string" || subject.length < 1 || subject.length > 512 || /[\u0000-\u001f\u007f]/.test(subject)) {
    throw new Error("A valid OIDC subject is required.");
  }
  return { issuer: parsedIssuer.href, subject };
}

export function getDataOwnerManifestPath() {
  return getStoragePath("data-owner.json");
}

export async function readDataOwnerManifest(filePath = getDataOwnerManifestPath()) {
  let handle;
  try {
    const directoryStat = await fs.lstat(path.dirname(filePath));
    if (!directoryStat.isDirectory() || (process.platform !== "win32" && (directoryStat.mode & 0o077) !== 0)) {
      throw new Error("Application data directory must be private before OIDC mode.");
    }
    const noFollow = constants.O_NOFOLLOW || 0;
    handle = await fs.open(filePath, constants.O_RDONLY | noFollow);
    const stat = await handle.stat();
    if (!stat.isFile() || (process.platform !== "win32" && (stat.mode & 0o077) !== 0)) {
      throw new Error("Data ownership manifest must be a private regular file.");
    }
    const value = JSON.parse(await handle.readFile("utf8"));
    if (value?.version !== MANIFEST_VERSION || typeof value.issuer !== "string" || typeof value.subject !== "string") {
      throw new Error("Data ownership manifest is invalid.");
    }
    return validateIdentity(value);
  } catch (error) {
    if (error.code === "ENOENT") {
      const missing = new Error("Data ownership has not been adopted. Run the explicit owner-adoption command before OIDC mode.");
      missing.code = "DATA_OWNER_NOT_CONFIGURED";
      throw missing;
    }
    throw error;
  } finally {
    await handle?.close();
  }
}

/** One-time explicit adoption: assigns the existing single-owner JSON dataset to an OIDC subject. */
export async function adoptExistingDataOwner({ issuer, subject, confirmation, filePath = getDataOwnerManifestPath(), now = new Date() }) {
  if (confirmation !== ADOPTION_CONFIRMATION) {
    const error = new Error(`Pass the exact confirmation phrase ${ADOPTION_CONFIRMATION} to adopt existing data.`);
    error.code = "DATA_OWNER_ADOPTION_CONFIRMATION_REQUIRED";
    throw error;
  }
  const identity = validateIdentity({ issuer, subject });
  const manifest = { version: MANIFEST_VERSION, ...identity, adoptedAt: now.toISOString() };
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const directoryStat = await fs.lstat(path.dirname(filePath));
  if (!directoryStat.isDirectory() || (process.platform !== "win32" && (directoryStat.mode & 0o077) !== 0)) {
    throw new Error("Application data directory must have private permissions before owner adoption.");
  }
  let handle;
  try {
    handle = await fs.open(filePath, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await handle.sync();
  } catch (error) {
    if (error.code === "EEXIST") {
      const conflict = new Error("A data owner is already recorded; adoption will not overwrite it.");
      conflict.code = "DATA_OWNER_ALREADY_CONFIGURED";
      throw conflict;
    }
    throw error;
  } finally {
    await handle?.close();
  }
  return manifest;
}

export const DATA_OWNER_ADOPTION_CONFIRMATION = ADOPTION_CONFIRMATION;
