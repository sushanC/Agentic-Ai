import { exec } from "child_process";

/**
 * AudioDeviceManager.js
 *
 * Discovers and parses physical ALSA audio input and output devices.
 * Avoids browser-hashed device IDs by exposing direct system identifiers.
 */

function parseAlsaDevices(text) {
  const lines = text.split("\n");
  const devices = [];
  let currentKey = null;

  for (let line of lines) {
    line = line.trimEnd();
    if (!line) continue;

    if (line.startsWith("    ")) {
      if (currentKey) {
        const description = line.trim();
        if (
          currentKey !== "null" &&
          !currentKey.startsWith("sysdefault") &&
          !currentKey.startsWith("dmix") &&
          !currentKey.startsWith("dsnoop")
        ) {
          devices.push({ id: currentKey, name: description });
        }
        currentKey = null;
      }
    } else {
      currentKey = line.trim();
    }
  }

  if (!devices.some(d => d.id === "default")) {
    devices.unshift({ id: "default", name: "System Default Device" });
  }

  return devices;
}

export function getAudioDevices() {
  return new Promise((resolve) => {
    exec("arecord -L", (err1, stdout1) => {
      const inputs = parseAlsaDevices(stdout1 || "");
      
      exec("aplay -L", (err2, stdout2) => {
        const outputs = parseAlsaDevices(stdout2 || "");
        
        resolve({ inputs, outputs });
      });
    });
  });
}
