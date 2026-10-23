import recorder from "node-record-lpcm16";
import fs from "fs";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";
import { finished } from "stream/promises";
import { performance } from "perf_hooks";
import { VOICE_CONFIG, resolveSTTOptions } from "./voiceConfig.js";
import { VadDetector, PcmFrameDecoder } from "./VadDetector.js";
import { AudioCaptureSession, buildPcmWav, pcmRms } from "./AudioCaptureSession.js";
import { whisperDaemonManager } from "./WhisperDaemon.js";

export async function finishRecordingStream(stream, finalChunk) {
  const completion = finished(stream);
  if (finalChunk === undefined) stream.end();
  else stream.end(finalChunk);
  await completion;
}

export async function writePrivateWav(filePath, wavBuffer, fileSystem = fs) {
  const stream = fileSystem.createWriteStream(filePath, { flags: "wx", mode: 0o600 });
  await finishRecordingStream(stream, wavBuffer);
}

export function classifyCapturedAudio(fileSize, minimumBytes, rms, minimumRms) {
  if (fileSize <= minimumBytes) return "AUDIO_TOO_SHORT";
  if (rms < minimumRms) return "NO_SPEECH_DETECTED";
  return null;
}

export function initSTT() {
  return whisperDaemonManager.init();
}

export function shutdownSTT() {
  whisperDaemonManager.shutdown();
}

function safeCode(value, fallback) {
  return typeof value === "string" && /^[A-Z0-9_-]{1,64}$/.test(value) ? value : fallback;
}

export function createSTTService({
  recorderApi = recorder,
  initialize = initSTT,
  transcribe = (file, options) => whisperDaemonManager.transcribe(file, options),
  createVad = options => new VadDetector(options),
  createDecoder = options => new PcmFrameDecoder(options),
  tempDirectory = os.tmpdir(),
  fileSystem = fs,
  platform = os.platform,
  clock = performance,
} = {}) {
  let activeCapture = false;

  return async function listen(options = {}) {
    if (options.signal?.aborted) return { text: "", aborted: true };
    const settings = resolveSTTOptions(options);
    const ready = await initialize();
    if (!ready) {
      throw Object.assign(new Error("Speech recognition is unavailable."), { code: "WHISPER_MODEL_UNAVAILABLE" });
    }
    if (activeCapture) return { text: "", error: "CAPTURE_ALREADY_ACTIVE", code: "CAPTURE_ALREADY_ACTIVE" };
    activeCapture = true;

    try {
      let vad = null;
      let decoder;
      let fallbackReason = null;
      try {
        vad = createVad(settings);
        decoder = vad.decoder;
        if (!decoder) throw Object.assign(new Error("VAD decoder is unavailable."), { code: "VAD_DECODER_UNAVAILABLE" });
      } catch (error) {
        fallbackReason = safeCode(error?.code, "VAD_INITIALIZATION_FAILED");
        console.warn("[STT VAD] Using bounded fixed-duration capture", { code: fallbackReason });
        try {
          decoder = createDecoder(settings);
        } catch {
          throw Object.assign(new Error("Audio decoder is unavailable."), { code: "AUDIO_CAPTURE_FAILED" });
        }
      }

      const session = new AudioCaptureSession({ vad, decoder, options: settings, fallbackReason });
      const tempFile = path.join(tempDirectory, `samgpt-audio-${randomUUID()}.wav`);
      const recOptions = {
        recorder: platform() === "linux" ? "arecord" : "sox",
        sampleRate: settings.sampleRate,
        channels: settings.channels,
        audioType: settings.audioType,
        verbose: false,
      };
      if (options.device && options.device !== "default") recOptions.device = options.device;

      return await new Promise(resolve => {
        let recording;
        try {
          recording = recorderApi.record(recOptions);
        } catch {
          resolve({ text: "", error: "MICROPHONE_FAILED", code: "MICROPHONE_FAILED" });
          return;
        }

        const stream = recording.stream();
        let finishedCapture = false;
        let timeout = null;
        let abortHandler = null;
        let captureStartNotified = false;
        const captureStartedAt = clock.now();

        const finalize = async (captureError = null) => {
          if (finishedCapture) return;
          finishedCapture = true;
          if (timeout) clearTimeout(timeout);
          if (options.signal && abortHandler) options.signal.removeEventListener("abort", abortHandler);
          try {
            if (recording.process) recording.process.kill("SIGINT");
            else recording.stop();
          } catch {}

          if (options.signal?.aborted) {
            session.cancel();
            resolve({ text: "", aborted: true });
            return;
          }
          if (captureError) {
            session.cancel();
            resolve({ text: "", error: "AUDIO_CAPTURE_FAILED", code: "AUDIO_CAPTURE_FAILED" });
            return;
          }

          try {
            session.flush();
            if (session.cancelled || options.signal?.aborted) {
              session.cancel();
              resolve({ text: "", aborted: true });
              return;
            }
            const pcm = session.getPcm();
            const wav = pcm.length ? buildPcmWav(pcm, settings) : Buffer.alloc(0);
            const audioError = classifyCapturedAudio(
              wav.length,
              settings.minValidAudioBytes,
              pcmRms(pcm),
              settings.minimumSpeechRms,
            );
            if (!session.fallback && !session.started) {
              const code = session.hadShortSpeechCandidate ? "AUDIO_TOO_SHORT" : "NO_SPEECH_DETECTED";
              resolve({ text: "", error: code, code, metrics: session.getMetrics() });
              return;
            }
            if (audioError) {
              resolve({ text: "", error: audioError, code: audioError, metrics: session.getMetrics() });
              return;
            }

            await writePrivateWav(tempFile, wav, fileSystem);
            if (options.signal?.aborted) {
              await fileSystem.promises.unlink(tempFile).catch(() => {});
              resolve({ text: "", aborted: true });
              return;
            }

            const transcriptionStartedAt = clock.now();
            let result;
            try {
              result = await transcribe(tempFile, { language: settings.language, beamSize: settings.beamSize });
            } finally {
              await fileSystem.promises.unlink(tempFile).catch(() => {});
            }
            const metrics = {
              ...session.getMetrics(),
              captureWallMs: Number((clock.now() - captureStartedAt).toFixed(2)),
              transcriptionMs: Number((clock.now() - transcriptionStartedAt).toFixed(2)),
            };
            console.log("[STT] Capture complete", metrics);
            if (options.signal?.aborted) {
              resolve({ text: "", aborted: true });
              return;
            }
            if (result?.error) {
              const code = safeCode(result.code, "TRANSCRIPTION_FAILED");
              resolve({ text: "", error: code, code, metrics });
            } else if (!result?.text?.trim()) {
              resolve({ ...result, text: "", error: "TRANSCRIPTION_EMPTY", code: "TRANSCRIPTION_EMPTY", metrics });
            } else {
              resolve({ ...result, metrics });
            }
          } catch (error) {
            await fileSystem.promises.unlink(tempFile).catch(() => {});
            const code = ["INVALID_AUDIO", "INVALID_AUDIO_WAV", "INVALID_AUDIO_FORMAT"].includes(error?.code)
              ? "AUDIO_CAPTURE_FAILED"
              : safeCode(error?.code, "AUDIO_CAPTURE_FAILED");
            resolve({ text: "", error: code, code, metrics: session.getMetrics() });
          }
        };

        stream.on("data", chunk => {
          if (finishedCapture) return;
          if (!captureStartNotified && chunk?.length) {
            captureStartNotified = true;
            options.onCaptureStarted?.();
          }
          try {
            const progress = session.processChunk(chunk);
            if (progress.done) finalize();
          } catch (error) {
            console.warn("[STT] Audio frame processing stopped", { code: safeCode(error?.code, "INVALID_AUDIO") });
            finalize(error);
          }
        });
        stream.once("end", () => finalize());
        stream.once("error", error => finalize(error));

        const maxWallMs = settings.maxRecordingTime * 1000;
        const deadlineMs = session.fallback
          ? Math.min(settings.vadFallbackCaptureMs, maxWallMs)
          : maxWallMs;
        timeout = setTimeout(() => finalize(), deadlineMs);
        abortHandler = () => finalize();
        options.signal?.addEventListener("abort", abortHandler, { once: true });
        if (options.signal?.aborted) abortHandler();
      });
    } finally {
      activeCapture = false;
    }
  };
}

export const listen = createSTTService();
