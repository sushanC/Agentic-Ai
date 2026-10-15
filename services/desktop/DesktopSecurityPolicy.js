import { validateAppName, validateFilename, validatePathOnDisk, validateUrl } from "./SecurityValidator.js";

const CONFIRMATION_POLICY = Object.freeze({
  desktop_copy_file: ["Copy file", "Copy this file operation?"],
  desktop_move_file: ["Move file", "Move this file?"],
  desktop_rename_file: ["Rename file", "Rename this file?"],
  desktop_duplicate_file: ["Duplicate file", "Duplicate this file?"],
  desktop_delete_file: ["Delete file", "Permanently delete this file?"],
  desktop_lock: ["Lock screen", "Lock the screen now?"],
  desktop_sleep: ["Sleep", "Put the computer to sleep?"],
  desktop_restart: ["Restart computer", "Restart the computer? Unsaved work may be lost."],
  desktop_shutdown: ["Shut down computer", "Shut down the computer? Unsaved work may be lost."],
  desktop_take_screenshot: ["Take screenshot", "Take and save a screenshot of the current screen?"],
  desktop_clipboard: ["Access clipboard", "Read or change clipboard contents?"],
});

const PATH_FIELDS = new Set(["path", "filePath", "folderPath", "directory", "source", "destination", "outputPath", "zipPath", "folder", "file", "target"]);

function inputObject(input) {
  return typeof input === "string" ? { path: input } : (input && typeof input === "object" && !Array.isArray(input) ? input : null);
}

export async function validateDesktopAction(toolName, action = {}) {
  if (!toolName.startsWith("desktop_")) return { valid: true, requiresConfirmation: false };
  const input = inputObject(action.input);
  if (!input && !["desktop_lock", "desktop_sleep", "desktop_restart", "desktop_shutdown"].includes(toolName)) {
    return { valid: false, code: "INVALID_DESKTOP_INPUT", message: "Desktop action input must be an object or path string." };
  }
  const args = input || {};

  if (toolName === "desktop_open_app") {
    const app = typeof action.input === "string" ? action.input : (args.appName || args.app || args.name || "");
    const check = validateAppName(app);
    if (!check.valid) return { valid: false, code: "INVALID_DESKTOP_INPUT", message: check.error };
  }
  if (toolName === "desktop_open_url") {
    const check = validateUrl(args.url || action.input);
    if (!check.valid) return { valid: false, code: "INVALID_DESKTOP_INPUT", message: check.error };
  }
  if (toolName === "desktop_rename_file") {
    const check = validateFilename(args.newName);
    if (!check.valid) return { valid: false, code: "INVALID_DESKTOP_INPUT", message: check.error };
  }
  if (toolName === "desktop_create_folder") {
    const check = validateFilename(args.name);
    if (!check.valid) return { valid: false, code: "INVALID_DESKTOP_INPUT", message: check.error };
  }
  if (toolName === "desktop_clipboard") {
    if (!["get", "set"].includes(args.action)) {
      return { valid: false, code: "INVALID_DESKTOP_INPUT", message: "Clipboard action must be get or set." };
    }
    if (args.action === "set" && (typeof args.text !== "string" || args.text.length > 10000)) {
      return { valid: false, code: "INVALID_DESKTOP_INPUT", message: "Clipboard text must be a string of at most 10,000 characters." };
    }
  }

  const paths = [];
  for (const [key, value] of Object.entries(args)) {
    if (!PATH_FIELDS.has(key)) continue;
    if (value === undefined || value === null) continue;
    if (typeof value !== "string") {
      return { valid: false, code: "INVALID_DESKTOP_INPUT", message: "File paths must be strings." };
    }
    paths.push(value);
  }
  if (typeof args.files === "string") paths.push(args.files);
  else if (Array.isArray(args.files)) paths.push(...args.files);
  else if (args.files !== undefined && args.files !== null) {
    return { valid: false, code: "INVALID_DESKTOP_INPUT", message: "File paths must be strings." };
  }
  for (const candidate of paths) {
    if (typeof candidate !== "string") {
      return { valid: false, code: "INVALID_DESKTOP_INPUT", message: "File paths must be strings." };
    }
    const check = await validatePathOnDisk(candidate);
    if (!check.valid) return { valid: false, code: "PATH_NOT_ALLOWED", message: check.error };
  }

  const confirmation = CONFIRMATION_POLICY[toolName];
  return {
    valid: true,
    requiresConfirmation: Boolean(confirmation && !action._confirmedAt),
    ...(confirmation ? { title: confirmation[0], message: confirmation[1], preview: { operation: confirmation[0] } } : {}),
  };
}

export function getDesktopConfirmationPolicy() {
  return { ...CONFIRMATION_POLICY };
}
