import { spawn } from "child_process";
import path from "path";
import os from "os";
import fs from "fs";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import { VOICE_CONFIG } from "./voiceConfig.js";
import { resolveFfplayPath } from "./VoiceQueue.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "..", "..");
const scriptPath = path.join(backendRoot, "tts.py");
const configuredPythonPath = process.env.SAMGPT_PYTHON_PATH;
const pythonPath = configuredPythonPath
  ? path.resolve(path.isAbsolute(configuredPythonPath) ? configuredPythonPath : path.join(backendRoot, configuredPythonPath))
  : path.join(backendRoot, "venv", "bin", "python");

function createTtsError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function classifyGenerationFailure(stderr, exitCode) {
  const output = String(stderr || "");
  const httpMatch = output.match(/EDGE_TTS_HTTP_(\d{3})/);
  if (httpMatch) {
    const status = httpMatch[1];
    const error = status === "403"
      ? createTtsError("EDGE_TTS_HTTP_403", "Edge TTS rejected the synthesis handshake (HTTP 403). Use edge-tts 7.3.0 or newer and check network access.")
      : createTtsError(`EDGE_TTS_HTTP_${status}`, `Edge TTS rejected the synthesis request (HTTP ${status}).`);
    return error;
  }
  if (/EDGE_TTS_DEPENDENCY_MISSING|No module named ['"]edge_tts['"]/.test(output)) {
    return createTtsError("EDGE_TTS_DEPENDENCY_MISSING", "The configured Python environment does not have edge-tts installed.");
  }
  if (/EDGE_TTS_NETWORK_FAILED|ClientConnectorError|ClientConnectionError|TimeoutError/.test(output)) {
    return createTtsError("EDGE_TTS_NETWORK_FAILED", "Edge TTS could not reach its service. Check the network connection and retry.");
  }
  return createTtsError("EDGE_TTS_GENERATION_FAILED", `Edge TTS generation failed (exit code ${exitCode ?? "unknown"}).`);
}

function hasMp3Frame(filePath, fileSystem) {
  let descriptor;
  try {
    const header = Buffer.alloc(4096);
    descriptor = fileSystem.openSync(filePath, "r");
    const count = fileSystem.readSync(descriptor, header, 0, header.length, 0);
    if (count >= 3 && header.toString("ascii", 0, 3) === "ID3") return count > 10;
    for (let index = 0; index < count - 1; index += 1) {
      if (header[index] === 0xff && (header[index + 1] & 0xe0) === 0xe0) return true;
    }
    return false;
  } catch {
    return false;
  } finally {
    if (descriptor !== undefined) {
      try { fileSystem.closeSync(descriptor); } catch {}
    }
  }
}

/**
 * Build a TTS generator with injectable process and filesystem boundaries.
 * Injection keeps failure handling testable without contacting Edge TTS.
 */
export function createTTSService({
  spawnProcess = spawn,
  fileSystem = fs,
  tempDirectory = os.tmpdir(),
  pythonExecutable = pythonPath,
  synthesisScript = scriptPath,
  timeoutMs = 120000,
} = {}) {
  return function generateTTS(text, options = {}) {
    return new Promise((resolve, reject) => {
      const {
        voiceSelection = VOICE_CONFIG.TTS.voiceSelection,
        speechSpeed = VOICE_CONFIG.TTS.speechSpeed,
        speechPitch = VOICE_CONFIG.TTS.speechPitch,
        speechVolume = VOICE_CONFIG.TTS.speechVolume
      } = options;

      if (!fileSystem.existsSync(pythonExecutable)) {
        reject(createTtsError("PYTHON_EXECUTABLE_MISSING", "The configured voice Python executable was not found."));
        return;
      }
      if (!fileSystem.existsSync(synthesisScript)) {
        reject(createTtsError("TTS_SCRIPT_MISSING", "The Edge TTS script was not found in the backend project."));
        return;
      }

      const tempFile = path.join(tempDirectory, `samgpt-tts-${randomUUID()}.mp3`);
      const args = [
        synthesisScript,
        "--text", String(text || "").slice(0, 4000),
        "--voice", voiceSelection,
        `--rate=${speechSpeed}`,
        `--pitch=${speechPitch}`,
        `--volume=${speechVolume}`,
        "--output", tempFile
      ];

      let child;
      let settled = false;
      let timeout = null;
      let stderr = "";
      let onAbort = () => {};
      const signal = options.signal;
      const cleanup = () => fileSystem.unlink(tempFile, () => {});
      const finish = (error, outputPath = null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        signal?.removeEventListener("abort", onAbort);
        if (error) {
          cleanup();
          reject(error);
        } else {
          resolve(outputPath);
        }
      };

      console.log("[TTS] Launching Edge TTS synthesis.");
      try {
        child = spawnProcess(pythonExecutable, args, {
          cwd: backendRoot,
          env: { ...process.env, PYTHONUNBUFFERED: "1" },
          stdio: ["ignore", "ignore", "pipe"]
        });
      } catch (error) {
        finish(createTtsError("TTS_SPAWN_FAILED", `Python TTS process could not start (${error?.code || "PROCESS_ERROR"}).`));
        return;
      }

      timeout = setTimeout(() => {
        child.kill?.("SIGTERM");
        finish(createTtsError("TTS_TIMEOUT", "Edge TTS synthesis timed out."));
      }, timeoutMs);

      onAbort = () => {
        child.kill?.("SIGTERM");
        finish(createTtsError("TTS_CANCELLED", "Edge TTS synthesis was cancelled."));
      };
      if (signal?.aborted) {
        onAbort();
        return;
      }
      signal?.addEventListener("abort", onAbort, { once: true });

      child.stderr?.on("data", chunk => {
        // The Python wrapper emits only classified diagnostics. Bound memory if a
        // dependency unexpectedly writes a large traceback or response body.
        stderr = (stderr + chunk.toString()).slice(-8192);
      });
      child.on("error", error => {
        finish(createTtsError("TTS_SPAWN_FAILED", `Python TTS process could not start (${error?.code || "PROCESS_ERROR"}).`));
      });
      child.on("close", code => {
        if (code !== 0) {
          const error = classifyGenerationFailure(stderr, code);
          console.error("[TTS] Synthesis failed", { code: error.code });
          finish(error);
          return;
        }

        let size = 0;
        try {
          size = fileSystem.statSync(tempFile).size;
        } catch {}
        if (size === 0 || !hasMp3Frame(tempFile, fileSystem)) {
          finish(createTtsError("TTS_INVALID_AUDIO", "Edge TTS output was missing, empty, or not a valid MP3 stream."));
          return;
        }

        console.log("[TTS] Audio generated", { bytes: size, format: "mp3" });
        finish(null, tempFile);
      });
    });
  };
}

export const generateTTS = createTTSService();

/**
 * Generate and immediately play speech, retaining the temporary file until ffplay exits.
 * @param {string} text
 * @param {object} [options]
 * @returns {Promise<void>}
 */
export async function speak(text, options = {}) {
  const tempFile = await generateTTS(text, options);
  const ffplayPath = resolveFfplayPath();
  if (!ffplayPath) {
    fs.unlink(tempFile, () => {});
    throw createTtsError("FFPLAY_NOT_FOUND", "ffplay was not found. Install it or set SAMGPT_FFPLAY_PATH.");
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let timeout = null;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      fs.unlink(tempFile, () => {});
      if (error) reject(error);
      else resolve();
    };
    let player;
    try {
      player = spawn(ffplayPath, ["-nodisp", "-autoexit", "-loglevel", "error", tempFile], {
        stdio: ["ignore", "ignore", "pipe"]
      });
    } catch (error) {
      finish(createTtsError("FFPLAY_SPAWN_FAILED", `ffplay could not start (${error?.code || "PROCESS_ERROR"}).`));
      return;
    }
    timeout = setTimeout(() => {
      player.kill?.("SIGTERM");
      finish(createTtsError("FFPLAY_TIMEOUT", "ffplay did not finish playing the audio before the timeout."));
    }, 45000);
    player.stderr?.on("data", () => {});
    player.on("error", error => finish(createTtsError("FFPLAY_SPAWN_FAILED", `ffplay could not start (${error?.code || "PROCESS_ERROR"}).`)));
    player.on("close", code => code === 0
      ? finish()
      : finish(createTtsError("AUDIO_PLAYBACK_FAILED", `ffplay exited with code ${code ?? "unknown"}.`)));
  });
}
