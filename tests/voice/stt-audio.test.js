import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AudioCaptureSession, buildPcmWav, pcmRms } from "../../features/voice/AudioCaptureSession.js";
import { VadDetector, PcmFrameDecoder } from "../../features/voice/VadDetector.js";
import { resolveSTTOptions, VOICE_CONFIG } from "../../features/voice/voiceConfig.js";
import { createSTTService, writePrivateWav } from "../../features/voice/sttService.js";

const defaults = resolveSTTOptions();
const FRAME_BYTES = defaults.sampleRate * defaults.channels * 2 * defaults.frameDurationMs / 1000;
function makeFrame(level) {
  const frame = Buffer.alloc(FRAME_BYTES);
  for (let offset = 0; offset < frame.length; offset += 2) frame.writeInt16LE(level, offset);
  return frame;
}
function makeWav(levels, options = defaults) {
  return buildPcmWav(Buffer.concat(levels.map(makeFrame)), options);
}
function makeSession(settings = {}) {
  const options = resolveSTTOptions(settings);
  const vad = new VadDetector(options);
  return { options, vad, session: new AudioCaptureSession({ vad, decoder: vad.decoder, options }) };
}

// Arbitrary recorder boundaries, including split headers, decode into exact 20 ms frames.
{
  const decoder = new PcmFrameDecoder(defaults);
  const wav = makeWav([1200, 1200, 1200]);
  const frames = [
    ...decoder.push(wav.subarray(0, 19)),
    ...decoder.push(wav.subarray(19, 71)),
    ...decoder.push(wav.subarray(71)),
    ...decoder.flush(),
  ];
  assert.equal(frames.length, 3);
  assert.ok(frames.every(frame => frame.length === FRAME_BYTES));
  assert.equal(pcmRms(Buffer.concat(frames)), 1200);
  const longDecoder = new PcmFrameDecoder(defaults);
  assert.equal(longDecoder.push(makeWav(Array(50).fill(800))).length, 50, "a normal large WAV data size is not treated as oversized header");
}

// Speech onset is detected on frame energy after the minimum voiced duration; pre-roll retains its beginning.
{
  const { options, vad, session } = makeSession({ silenceTimeout: 0.5, noSpeechTimeout: 1 });
  const audio = makeWav([
    ...Array(10).fill(0), // 200 ms noise calibration
    ...Array(15).fill(1800),
    ...Array(10).fill(0), // 200 ms natural pause, below endpoint duration
    ...Array(10).fill(1800),
    ...Array(25).fill(0), // 500 ms endpoint silence
  ]);
  session.processChunk(audio.subarray(0, 44));
  session.processChunk(audio.subarray(44, 44 + FRAME_BYTES * 10));
  const onset = session.processChunk(audio.subarray(44 + FRAME_BYTES * 10, 44 + FRAME_BYTES * 25));
  assert.equal(onset.speechStarted, true);
  assert.equal(onset.done, false);
  session.processChunk(audio.subarray(44 + FRAME_BYTES * 25, 44 + FRAME_BYTES * 35));
  assert.equal(session.done, false, "a 200 ms pause does not end the utterance");
  session.processChunk(audio.subarray(44 + FRAME_BYTES * 35, 44 + FRAME_BYTES * 45));
  assert.equal(session.done, false);
  const endpoint = session.processChunk(audio.subarray(44 + FRAME_BYTES * 45));
  assert.equal(endpoint.done, true);
  assert.equal(endpoint.reason, "ENDPOINT_SILENCE");
  assert.equal(session.getMetrics().endpointSilenceMs, 500);
  assert.equal(session.getMetrics().speechStartMs, 200);
  assert.equal(session.getMetrics().speechDetectionLatencyMs, 80);
  assert.equal(session.getMetrics().totalCaptureMs, 1400);
  assert.ok(session.getPcm().length > FRAME_BYTES * 50, "pre-roll and speech frames were retained");
  assert.ok(session.speechStartMs === null || session.getMetrics().speechStartMs >= 200);
  assert.ok(options.preRollMs > 0);
  assert.ok(vad.speechDuration >= 0.5);
}

// Silence-only and low-energy samples never activate speech or reach the inference threshold.
{
  let rejected = 0;
  for (const level of [0, 20, 40, 60, 80, 100, 120, 160]) {
    const { options, session } = makeSession({ noSpeechTimeout: 0.5 });
    const result = session.processChunk(makeWav(Array(25).fill(level)));
    assert.equal(result.done, true);
    assert.equal(result.reason, "NO_SPEECH");
    assert.equal(session.getPcm().length, 0);
    const lowEnergy = makeWav([level]);
    assert.ok(pcmRms(lowEnergy.subarray(44)) < options.noiseTolerance);
    rejected += 1;
  }
  assert.equal(rejected, 8, "all eight deterministic silence/low-energy fixtures were rejected before Whisper");
}

// A changing but sub-threshold ambient bed is tracked as noise instead of opening capture.
{
  const { session } = makeSession({ noSpeechTimeout: 0.5 });
  const ambientLevels = Array.from({ length: 25 }, (_, index) => [250, 420, 760, 510, 880][index % 5]);
  const result = session.processChunk(makeWav(ambientLevels));
  assert.equal(result.done, true);
  assert.equal(result.reason, "NO_SPEECH");
  assert.equal(session.started, false, "fluctuating background energy remains below the adaptive speech threshold");
}

// A strong word that starts immediately is recovered from the pre-roll ring after frame-level confirmation.
{
  const { session } = makeSession({ noSpeechTimeout: 0.5 });
  const progress = session.processChunk(makeWav(Array(8).fill(1800)));
  assert.equal(progress.speechStarted, true);
  assert.equal(session.getMetrics().speechDetectionLatencyMs, 80);
  assert.ok(session.getPcm().length >= FRAME_BYTES * 4, "confirmed onset includes its earliest candidate frames");
}

// A short burst below minimumSpeechMs is rejected and classified separately from silence.
{
  const { session } = makeSession({ noSpeechTimeout: 0.5 });
  session.processChunk(makeWav([
    ...Array(10).fill(0),
    ...Array(2).fill(2000),
    ...Array(15).fill(0),
  ]));
  assert.equal(session.done, true);
  assert.equal(session.completionReason, "SHORT_SPEECH");
  assert.equal(session.getPcm().length, 0);
}

// Maximum duration bounds continuous speech even when no endpoint silence arrives.
{
  const { session } = makeSession({ maxRecordingTime: 1, silenceTimeout: 1.2, noSpeechTimeout: 1 });
  session.processChunk(makeWav([
    ...Array(10).fill(0),
    ...Array(60).fill(2000),
  ]));
  assert.equal(session.done, true);
  assert.equal(session.completionReason, "MAX_RECORDING_DURATION");
  assert.ok(session.getMetrics().totalCaptureMs <= 1000);
  assert.ok(session.getPcm().length <= defaults.sampleRate * 2);
}

// Invalid WAV format is rejected; produced WAV headers have consistent PCM format and sizes.
{
  const decoder = new PcmFrameDecoder(defaults);
  const invalid = Buffer.from("RIFF0000NOPE");
  assert.throws(() => decoder.push(invalid), { code: "INVALID_AUDIO_WAV" });
  const wrongRate = buildPcmWav(makeFrame(800), defaults);
  wrongRate.writeUInt32LE(44100, 24);
  assert.throws(() => new PcmFrameDecoder(defaults).push(wrongRate), { code: "INVALID_AUDIO_FORMAT" });
  const pcm = makeFrame(800);
  const wav = buildPcmWav(pcm, defaults);
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.readUInt32LE(24), 16000);
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.readUInt32LE(40), pcm.length);
}

// Private WAV finalization waits for stream completion and creates a user-only file.
{
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "samgpt-phase2-"));
  const file = path.join(directory, "capture.wav");
  try {
    await writePrivateWav(file, buildPcmWav(makeFrame(1200), defaults));
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.equal(fs.readFileSync(file).toString("ascii", 0, 4), "RIFF");
    assert.equal(fs.readFileSync(file).length, 44 + FRAME_BYTES);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

// If VAD initialization fails, the service logs the stable reason and uses bounded fixed capture.
{
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "samgpt-fallback-"));
  const stream = new EventEmitter();
  let transcribed = false;
  const service = createSTTService({
    initialize: async () => true,
    createVad: () => { throw Object.assign(new Error("private init detail"), { code: "VAD_INIT_TEST_FAILURE" }); },
    recorderApi: { record: () => ({ stream: () => stream, stop() {}, process: { kill() {} } }) },
    tempDirectory: directory,
    transcribe: async file => {
      transcribed = true;
      const wav = fs.readFileSync(file);
      assert.equal(wav.toString("ascii", 0, 4), "RIFF");
      assert.equal(fs.statSync(file).mode & 0o777, 0o600);
      return { text: "fallback phrase" };
    },
  });
  try {
    const resultPromise = service({ vadFallbackCaptureMs: 500, maxRecordingTime: 1 });
    await new Promise(resolve => setImmediate(resolve));
    stream.emit("data", makeWav(Array(25).fill(1200)));
    const result = await resultPromise;
    assert.equal(transcribed, true);
    assert.equal(result.text, "fallback phrase");
    assert.equal(result.metrics.fallback, true);
    assert.equal(result.metrics.fallbackReason, "VAD_INIT_TEST_FAILURE");
    assert.equal(fs.readdirSync(directory).length, 0, "temporary recording is removed after transcription");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

// Cancellation while recording discards buffered PCM and never invokes Whisper.
{
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "samgpt-cancel-"));
  const stream = new EventEmitter();
  const controller = new AbortController();
  let transcribed = false;
  const service = createSTTService({
    initialize: async () => true,
    recorderApi: { record: () => ({ stream: () => stream, stop() {}, process: { kill() {} } }) },
    tempDirectory: directory,
    transcribe: async () => { transcribed = true; return { text: "should not arrive" }; },
  });
  try {
    const resultPromise = service({ signal: controller.signal });
    await new Promise(resolve => setImmediate(resolve));
    stream.emit("data", makeWav([...Array(10).fill(0), ...Array(6).fill(1800)]));
    controller.abort();
    const result = await resultPromise;
    assert.equal(result.aborted, true);
    assert.equal(transcribed, false);
    assert.equal(fs.readdirSync(directory).length, 0);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

// A second capture cannot overlap an active recorder; the first remains cancellable.
{
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "samgpt-overlap-"));
  const stream = new EventEmitter();
  const controller = new AbortController();
  const service = createSTTService({
    initialize: async () => true,
    recorderApi: { record: () => ({ stream: () => stream, stop() {}, process: { kill() {} } }) },
    tempDirectory: directory,
    transcribe: async () => ({ text: "unexpected" }),
  });
  try {
    const first = service({ signal: controller.signal });
    await new Promise(resolve => setImmediate(resolve));
    const second = await service();
    assert.equal(second.code, "CAPTURE_ALREADY_ACTIVE");
    controller.abort();
    assert.equal((await first).aborted, true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

// Configuration is clamped and cannot disable capture limits or inject unsupported formats.
{
  const options = resolveSTTOptions({ maxRecordingTime: 1000, preRollMs: -50, minimumSpeechMs: 0, noiseMultiplier: NaN });
  assert.equal(options.maxRecordingTime, 30);
  assert.equal(options.preRollMs, 0);
  assert.equal(options.minimumSpeechMs, 40);
  assert.equal(options.noiseMultiplier, VOICE_CONFIG.STT.noiseMultiplier);
  assert.equal(options.sampleRate, 16000);
  assert.equal(options.channels, 1);
}

console.log("STT endpointing tests passed (deterministic PCM and mocked recorder; no physical mic used).");
