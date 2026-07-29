import { spawn } from "child_process";
import path from "path";
import os from "os";
import fs from "fs";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import { VOICE_CONFIG } from "./voiceConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const scriptPath = path.resolve(__dirname, "..", "..", "tts.py");
const pythonPath = path.resolve(__dirname, "..", "..", "venv", "bin", "python");

/**
 * Generate TTS audio using Edge-TTS.
 *
 * @param {string} text - Text to synthesize into speech
 * @param {object} [options]
 * @param {string} [options.voiceSelection] - Edge-TTS voice identifier
 * @param {string} [options.speechSpeed] - Rate adjustment string (e.g. "+0%")
 * @param {string} [options.speechPitch] - Pitch adjustment string (e.g. "+0Hz")
 * @param {string} [options.speechVolume] - Volume adjustment string (e.g. "+0%")
 * @returns {Promise<string>} Absolute filepath to the generated MP3 file
 */
export function generateTTS(text, options = {}) {
  return new Promise((resolve, reject) => {
    const {
      voiceSelection = VOICE_CONFIG.TTS.voiceSelection,
      speechSpeed = VOICE_CONFIG.TTS.speechSpeed,
      speechPitch = VOICE_CONFIG.TTS.speechPitch,
      speechVolume = VOICE_CONFIG.TTS.speechVolume
    } = options;

    const tempFile = path.join(
      os.tmpdir(),
      `samgpt-tts-${randomUUID()}.mp3`
    );

    const args = [
      scriptPath,
      "--text",
      text,
      "--voice",
      voiceSelection,
      `--rate=${speechSpeed}`,
      `--pitch=${speechPitch}`,
      `--volume=${speechVolume}`,
      "--output",
      tempFile
    ];

    console.log("[TTS] Launching Edge-TTS...");
    console.log("[TTS] Python:", pythonPath);
    console.log("[TTS] Script:", scriptPath);
    console.log("[TTS] Args:", args);

    const child = spawn(pythonPath, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("error", (err) => {
      reject(err);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        console.error("[TTS] Python exited with code:", code);
        console.error("[TTS] stderr:", stderr);
        console.error("[TTS] stdout:", stdout);

        reject(
          new Error(
            `TTS failed (exit code ${code})\n${stderr || stdout}`
          )
        );
        return;
      }

      if (!fs.existsSync(tempFile)) {
        reject(new Error("TTS output file was not created."));
        return;
      }

      console.log("[TTS] Audio generated:", tempFile);
      resolve(tempFile);
    });
  });
}

/**
 * Generate and immediately play speech.
 *
 * @param {string} text
 * @param {object} [options]
 * @returns {Promise<void>}
 */
export async function speak(text, options = {}) {
  const tempFile = await generateTTS(text, options);

  return new Promise((resolve, reject) => {
    console.log("[TTS] Playing:", tempFile);

    const player = spawn(
      "ffplay",
      [
        "-nodisp",
        "-autoexit",
        "-loglevel",
        "error",
        tempFile
      ],
      {
        stdio: "ignore"
      }
    );

    player.on("error", (err) => {
      fs.unlink(tempFile, () => {});
      reject(err);
    });

    player.on("close", (code) => {
      fs.unlink(tempFile, () => {});

      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffplay exited with code ${code}`));
      }
    });
  });
}