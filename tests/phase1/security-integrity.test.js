import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { GoogleAuthManager } from "../../core/google/GoogleAuthManager.js";
import { createPendingActionsStorage } from "../../storage/pendingActionsStorage.js";
import { readJsonFile, withJsonFileLock, writeJsonFile } from "../../storage/jsonFile.js";
import { createConfirmationService } from "../../services/confirmationService.js";
import { createLocalApiGuard, isAllowedLocalOrigin, isLoopbackAddress, logSafeError } from "../../services/httpSecurity.js";
import { validateDesktopAction } from "../../services/desktop/DesktopSecurityPolicy.js";
import { validatePath } from "../../services/desktop/SecurityValidator.js";

async function withTempDir(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "samgpt-phase1-"));
  try { await run(dir); } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

function makePending(id, overrides = {}) {
  return {
    id, tool: "test_tool", action: "run", payload: { tool: "test_tool", action: "run", input: {} },
    preview: {}, title: "Test action", message: "Confirm?",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    status: "pending", ...overrides,
  };
}

test("JSON writes are atomic, private when requested, and malformed JSON is surfaced", async () => {
  await withTempDir(async dir => {
    const file = path.join(dir, "private.json");
    await writeJsonFile(file, { value: 1 }, { mode: 0o600 });
    assert.deepEqual(await readJsonFile(file, null), { value: 1 });
    if (process.platform !== "win32") assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
    await fs.writeFile(file, "{broken", "utf8");
    await assert.rejects(readJsonFile(file, {}), err => err.code === "JSON_STORAGE_CORRUPT");
    assert.equal(await fs.readFile(file, "utf8"), "{broken", "corrupt source remains recoverable");
  });
});

test("concurrent JSON read-modify-write operations do not lose updates", async () => {
  await withTempDir(async dir => {
    const file = path.join(dir, "counter.json");
    await writeJsonFile(file, { count: 0 });
    await Promise.all(Array.from({ length: 40 }, () => withJsonFileLock(file, async () => {
      const value = await readJsonFile(file, { count: 0 });
      await new Promise(resolve => setImmediate(resolve));
      await writeJsonFile(file, { count: value.count + 1 });
    })));
    assert.equal((await readJsonFile(file, {})).count, 40);
  });
});

test("concurrent confirmation attempts claim and execute an action once", async () => {
  await withTempDir(async dir => {
    const storage = createPendingActionsStorage(path.join(dir, "pending.json"));
    await storage.addPendingAction(makePending("concurrent"));
    let calls = 0;
    let release;
    const service = createConfirmationService({ storage, executeTool: async () => {
      calls++;
      await new Promise(resolve => { release = resolve; });
      return { success: true, value: "done" };
    } });
    const first = service.confirmAction("concurrent");
    while (!release) await new Promise(resolve => setImmediate(resolve));
    const second = await service.confirmAction("concurrent");
    assert.equal(second.success, false);
    assert.equal(second.status, "already_claimed");
    assert.equal(calls, 1);
    release();
    assert.equal((await first).success, true);
    assert.equal((await storage.loadPendingActions())[0].status, "completed");
  });
});

test("confirmation handles expired, cancelled, missing, and already-claimed records", async () => {
  await withTempDir(async dir => {
    const storage = createPendingActionsStorage(path.join(dir, "pending.json"));
    let executions = 0;
    const service = createConfirmationService({ storage, executeTool: async () => { executions++; return "done"; } });
    await storage.addPendingAction(makePending("expired", { expiresAt: new Date(Date.now() - 1).toISOString() }));
    assert.equal((await service.confirmAction("expired")).status, "expired");
    assert.equal((await service.confirmAction("absent")).status, "missing");

    await storage.addPendingAction(makePending("cancelled"));
    assert.equal((await service.cancelAction("cancelled")).success, true);
    assert.equal((await service.confirmAction("cancelled")).status, "missing");

    await storage.addPendingAction(makePending("claimed"));
    assert.equal((await storage.claimPendingAction("claimed")).status, "claimed");
    assert.equal((await service.confirmAction("claimed")).status, "already_claimed");
    assert.equal(executions, 0);
  });
});

test("structured tool success:false is propagated and becomes non-executable failed state", async () => {
  await withTempDir(async dir => {
    const storage = createPendingActionsStorage(path.join(dir, "pending.json"));
    await storage.addPendingAction(makePending("failed"));
    const service = createConfirmationService({ storage, executeTool: async () => ({ success: false, code: "AUTH_REQUIRED", message: "provider token=secret", error: { message: "provider token=secret" } }) });
    const result = await service.confirmAction("failed");
    assert.equal(result.success, false);
    assert.equal(result.result.code, "AUTH_REQUIRED");
    assert.equal(JSON.stringify(result).includes("provider token=secret"), false);
    assert.equal((await storage.loadPendingActions())[0].status, "failed");
    assert.equal((await service.confirmAction("failed")).status, "already_claimed");
  });
});

test("OAuth state rejects missing, mismatched, expired, and reused values", () => {
  let now = 1000;
  const auth = new GoogleAuthManager({ now: () => now, stateTtlMs: 50 });
  assert.equal(auth.consumeOAuthState(undefined, ["gmail"]), false);
  auth._pendingOAuthStates.set("mismatch-state-value-long-enough-0001", { purpose: "calendar", expiresAt: now + 40 });
  assert.equal(auth.consumeOAuthState("mismatch-state-value-long-enough-0001", ["gmail"]), false);
  auth._pendingOAuthStates.set("expired-state-value-long-enough-0002", { purpose: "gmail", expiresAt: now });
  assert.equal(auth.consumeOAuthState("expired-state-value-long-enough-0002", ["gmail"]), false);
  auth._pendingOAuthStates.set("valid-state-value-long-enough-00003", { purpose: "gmail", expiresAt: now + 40 });
  assert.equal(auth.consumeOAuthState("valid-state-value-long-enough-00003", ["gmail"]), true);
  assert.equal(auth.consumeOAuthState("valid-state-value-long-enough-00003", ["gmail"]), false);
  now += 100;
});

test("local API policy blocks remote peers and untrusted browser origins", () => {
  assert.equal(isLoopbackAddress("::ffff:127.0.0.1"), true);
  assert.equal(isLoopbackAddress("192.168.1.4"), false);
  assert.equal(isAllowedLocalOrigin("http://localhost:5173"), true);
  assert.equal(isAllowedLocalOrigin("https://attacker.example"), false);
  assert.equal(isAllowedLocalOrigin("null"), false);

  const responseFor = (address, origin) => new Promise(resolve => {
    const res = { status(code) { this.statusCode = code; return this; }, json(body) { resolve({ status: this.statusCode, body }); } };
    createLocalApiGuard()({ socket: { remoteAddress: address }, headers: { origin } }, res, () => resolve({ next: true }));
  });
  return Promise.all([
    responseFor("10.0.0.2", undefined).then(result => assert.equal(result.status, 403)),
    responseFor("127.0.0.1", "https://attacker.example").then(result => assert.equal(result.status, 403)),
    responseFor("127.0.0.1", "http://localhost:5173").then(result => assert.deepEqual(result, { next: true })),
  ]);
});

test("server error logging emits safe codes and never the raw error message", () => {
  const original = console.error;
  let output;
  console.error = (...args) => { output = args; };
  try { logSafeError("test", Object.assign(new Error("private recipient and body"), { code: "GMAIL_REAUTH_REQUIRED" })); }
  finally { console.error = original; }
  assert.equal(JSON.stringify(output).includes("private recipient"), false);
  assert.deepEqual(output[1], { code: "GMAIL_REAUTH_REQUIRED" });
});

test("desktop policy validates paths and gates sensitive operations centrally", async () => {
  assert.equal(validatePath("/home/not-the-user-segment/file").valid, false);
  const outside = await validateDesktopAction("desktop_delete_file", { input: { path: "/etc/passwd" } });
  assert.equal(outside.valid, false);
  const screenshot = await validateDesktopAction("desktop_take_screenshot", { input: { mode: "full" } });
  assert.equal(screenshot.requiresConfirmation, true);
  const clipboard = await validateDesktopAction("desktop_clipboard", { input: { action: "read" } });
  assert.equal(clipboard.valid, false);
  const app = await validateDesktopAction("desktop_open_app", { input: { appName: "bad;command" } });
  assert.equal(app.valid, false);
  const folder = await validateDesktopAction("desktop_create_folder", { input: { path: "/tmp", name: "../escape" } });
  assert.equal(folder.valid, false);
  const invalidName = await validateDesktopAction("desktop_rename_file", { input: { path: "/tmp/file", newName: 12 } });
  assert.equal(invalidName.valid, false);
});
