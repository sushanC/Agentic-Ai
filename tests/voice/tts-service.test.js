import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createTTSService } from "../../features/voice/ttsService.js";

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "samgpt-tts-test-"));
const sensitiveText = "private transcript must never appear in diagnostics";
const logOutput = [];
const originalConsoleError = console.error;
const originalConsoleLog = console.log;
console.error = (...args) => logOutput.push(args.join(" "));
console.log = (...args) => logOutput.push(args.join(" "));

function mockChild({ code = 0, stderr = "", audio = Buffer.from([0xff, 0xfb, 0x90, 0x64]), writeFile = true, spawnError = null, hang = false } = {}) {
  return (pythonExecutable, args) => {
    assert.ok(path.isAbsolute(pythonExecutable));
    const child = new EventEmitter();
    child.stderr = new EventEmitter();
    child.killed = false;
    child.kill = () => { child.killed = true; };
    if (!hang) {
      queueMicrotask(() => {
        if (spawnError) {
          child.emit("error", Object.assign(new Error("private process details"), { code: spawnError }));
          return;
        }
        if (stderr) child.stderr.emit("data", Buffer.from(stderr));
        const outputIndex = args.indexOf("--output");
        if (writeFile && outputIndex >= 0) fs.writeFileSync(args[outputIndex + 1], audio);
        child.emit("close", code);
      });
    }
    return child;
  };
}

function service(spawnProcess, options = {}) {
  return createTTSService({
    spawnProcess,
    tempDirectory,
    pythonExecutable: process.execPath,
    synthesisScript: fileURLToPath(import.meta.url),
    ...options,
  });
}

try {
  // A successful child must produce a nonempty MP3 frame before it is accepted.
  const generated = await service(mockChild())(sensitiveText);
  assert.ok(fs.statSync(generated).size > 0);
  assert.ok(!logOutput.join("\n").includes(sensitiveText));
  fs.unlinkSync(generated);

  // Missing or invalid interpreter/script fail before a child is launched.
  await assert.rejects(
    service(mockChild(), { pythonExecutable: path.join(tempDirectory, "missing-python") })("hello"),
    { code: "PYTHON_EXECUTABLE_MISSING" },
  );
  await assert.rejects(
    service(mockChild(), { synthesisScript: path.join(tempDirectory, "missing-tts.py") })("hello"),
    { code: "TTS_SCRIPT_MISSING" },
  );

  // Missing package and remote HTTP 403/network failures produce safe, actionable codes.
  await assert.rejects(
    service(mockChild({ code: 2, stderr: "EDGE_TTS_DEPENDENCY_MISSING" }))(sensitiveText),
    { code: "EDGE_TTS_DEPENDENCY_MISSING" },
  );
  await assert.rejects(
    service(mockChild({ code: 1, stderr: "EDGE_TTS_HTTP_403" }))(sensitiveText),
    error => error.code === "EDGE_TTS_HTTP_403" && /7\.3\.0 or newer/.test(error.message),
  );
  await assert.rejects(
    service(mockChild({ code: 1, stderr: "EDGE_TTS_NETWORK_FAILED" }))("hello"),
    { code: "EDGE_TTS_NETWORK_FAILED" },
  );

  // Missing, empty, and malformed output are rejected and removed.
  for (const result of [
    { writeFile: false },
    { audio: Buffer.alloc(0) },
    { audio: Buffer.from("not an mp3") },
  ]) {
    await assert.rejects(service(mockChild(result))("hello"), { code: "TTS_INVALID_AUDIO" });
  }

  await assert.rejects(
    service(mockChild({ spawnError: "ENOENT" }))("hello"),
    { code: "TTS_SPAWN_FAILED" },
  );

  let timeoutChild;
  const timedGenerator = service((...args) => {
    timeoutChild = mockChild({ hang: true })(...args);
    return timeoutChild;
  }, { timeoutMs: 5 });
  await assert.rejects(timedGenerator("hello"), { code: "TTS_TIMEOUT" });
  assert.equal(timeoutChild.killed, true);

  let abortChild;
  const abortController = new AbortController();
  const abortGenerator = service((...args) => {
    abortChild = mockChild({ hang: true })(...args);
    return abortChild;
  });
  const pending = abortGenerator("hello", { signal: abortController.signal });
  abortController.abort();
  await assert.rejects(pending, { code: "TTS_CANCELLED" });
  assert.equal(abortChild.killed, true);
  assert.ok(!logOutput.join("\n").includes(sensitiveText));

} finally {
  console.error = originalConsoleError;
  console.log = originalConsoleLog;
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}

console.log("TTS service tests passed.");
