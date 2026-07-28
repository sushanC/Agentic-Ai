import { exec } from "child_process";
import path from "path";
import os from "os";
import fs from "fs";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scriptPath = path.resolve(__dirname, "..", "..", "tts.py");
const pythonPath = path.resolve(__dirname, "..", "..", "venv", "bin", "python");

/**
 * Generate text-to-speech audio using edge-tts.
 */
export function generateTTS(text, options = {}) {
  return new Promise((resolve, reject) => {
    const {
      voiceSelection = "en-IN-NeerjaNeural",
      speechSpeed = "+0%",
      speechPitch = "+0Hz",
      speechVolume = "+0%"
    } = options;

    const tempFile = path.join(os.tmpdir(), `samgpt-tts-${randomUUID()}.mp3`);
    
    const escapedText = text.replace(/"/g, '\\"');

    const cmd = `"${pythonPath}" "${scriptPath}" --text "${escapedText}" --voice "${voiceSelection}" --rate "${speechSpeed}" --pitch "${speechPitch}" --volume "${speechVolume}" --output "${tempFile}"`;
    
    console.log(`[TTS] Generating audio via edge-tts...`);

    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        console.error("[TTS] Edge-TTS generation failed:", err, stderr);
        reject(err);
        return;
      }
      
      if (!fs.existsSync(tempFile)) {
        reject(new Error("TTS output file was not created."));
        return;
      }

      console.log(`[TTS] Audio successfully generated at: ${tempFile}`);
      resolve(tempFile);
    });
  });
}

/**
 * Backward-compatible speak function.
 */
export function speak(text) {
  return new Promise((resolve, reject) => {
    generateTTS(text)
      .then((tempFile) => {
        const playCmd = `ffplay -nodisp -autoexit "${tempFile}"`;
        exec(playCmd, (err) => {
          fs.unlink(tempFile, () => {});
          
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      })
      .catch(reject);
  });
}
