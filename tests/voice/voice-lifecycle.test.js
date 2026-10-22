import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { VoiceStateMachine } from "../../features/voice/VoiceStateMachine.js";
import { VoiceQueue } from "../../features/voice/VoiceQueue.js";
import { VoiceManager } from "../../features/voice/voiceManager.js";

const transitions = [];
const machine = new VoiceStateMachine((next) => transitions.push(next));
assert.equal(machine.transitionTo("listening"), false, "idle cannot skip setup and enter listening");
assert.equal(machine.transitionTo("starting"), true);
assert.equal(machine.transitionTo("greeting"), true);
assert.equal(machine.transitionTo("thinking"), false, "greeting cannot jump to model processing");
machine.reset();

// Queue batches are played in order and cancellation resolves outstanding drains as incomplete.
{
  const players = [];
  const queue = new VoiceQueue({
    spawnProcess: () => { const player = new EventEmitter(); player.kill = () => {}; players.push(player); return player; },
    removeFile: (_file, callback) => callback(null),
  });
  const played = [];
  queue.onPlayStart = file => played.push(file);
  queue.onEmpty = () => {};
  const drained = queue.enqueueBatch(["first.mp3", "second.mp3"]);
  players[0].emit("spawn");
  players[0].emit("close", 0);
  players[1].emit("spawn");
  players[1].emit("close", 0);
  assert.deepEqual(played, ["first.mp3", "second.mp3"]);
  assert.deepEqual(await drained, { completed: true });

  const canceled = queue.enqueueBatch(["cancelled.mp3"]);
  queue.cancel();
  players[2].emit("close", null, "SIGKILL");
  assert.deepEqual(await canceled, { completed: false });
}

// Playback startup failures, nonzero exits, and hangs all fail the drain deterministically.
for (const failure of ["spawn", "exit", "timeout", "missing-player"]) {
  const player = new EventEmitter();
  player.stderr = new EventEmitter();
  player.kill = () => { player.killed = true; };
  const errors = [];
  const queue = new VoiceQueue({
    playerPath: failure === "missing-player" ? null : "/usr/bin/ffplay",
    playbackTimeoutMs: 5,
    spawnProcess: () => player,
    removeFile: (_file, callback) => callback(null),
  });
  queue.onError = error => errors.push(error.code);
  queue.onEmpty = () => {};
  const drained = queue.enqueueBatch([`${failure}.mp3`]);
  if (failure === "spawn") player.emit("error", Object.assign(new Error("not logged"), { code: "ENOENT" }));
  if (failure === "exit") player.emit("close", 2);
  if (failure === "timeout") await new Promise(resolve => setTimeout(resolve, 15));
  assert.deepEqual(await drained, { completed: false });
  assert.equal(errors.length, 1);
  if (failure === "timeout") assert.equal(player.killed, true);
  if (failure === "missing-player") assert.equal(errors[0], "FFPLAY_NOT_FOUND");
}

class FakeQueue {
  constructor() { this.files = []; this.cancelCount = 0; }
  enqueueBatch(files) {
    this.files.push(...files);
    this.onPlayStart?.(files[0]);
    this.onEmpty?.();
    return Promise.resolve({ completed: true });
  }
  cancel() { this.cancelCount += 1; }
  discard(file) { this.files = this.files.filter(value => value !== file); }
  setSpeaker() {}
  pause() {}
  resume() {}
}

function makeManager({ listenImpl, routeRequestImpl, generateTTSImpl, queueImpl } = {}) {
  const states = [];
  const effects = [];
  const queue = queueImpl || new FakeQueue();
  const events = {
    emitStateChange: state => states.push(state),
    emitVoiceStarted: () => effects.push("started"),
    emitVoiceStopped: () => effects.push("stopped"),
    emitConversationStarted() {},
    emitConversationEnded() {},
    emitListeningStarted: () => effects.push("capture"),
    emitSpeechRecognized: text => effects.push(`transcript:${text}`),
    emitSpeechRecognitionFailed() {},
    emitAIStarted: () => effects.push("ai"),
    emitAIFinished() {},
    emitTTSStarted: () => effects.push("tts"),
    emitTTSFinished() {},
    emitPlaybackCancelled() {},
    emitFullRequestSummary() {},
    emitGreetingGenerated: () => effects.push("greeting-generated"),
    emitGreetingPlaybackFinished: () => effects.push("greeting-played"),
    emitVoiceError: code => effects.push(`error:${code}`),
  };
  const manager = new VoiceManager({
    queue,
    events,
    loadSettings: async () => ({ conversationMode: false, voiceGreeting: "SamGPT online", microphoneSelection: "default" }),
    generateTTS: generateTTSImpl || (async text => { effects.push(`generated:${text}`); return `audio:${text}`; }),
    listen: listenImpl || (async ({ onCaptureStarted }) => {
      onCaptureStarted();
      return { text: "hello SamGPT" };
    }),
    routeRequest: routeRequestImpl || (async text => { effects.push(`routed:${text}`); return { answer: "Hello there." }; }),
    addMessage: async () => {},
    updateMemory: async () => {},
    updateSummary: async () => {},
    incrementStat: async () => {},
    shouldExtractMemory: () => false,
    responseProcessor: { process: text => text, split: text => [text] },
  });
  return { manager, queue, states, effects };
}

// Failed greeting generation never reaches the microphone, and a later start can recover.
{
  let attempts = 0;
  const { manager, effects } = makeManager({
    generateTTSImpl: async text => {
      attempts += 1;
      if (attempts === 1) {
        const error = new Error("Provider detail must not be relayed.");
        error.code = "EDGE_TTS_HTTP_403";
        throw error;
      }
      effects.push(`generated:${text}`);
      return `audio:${text}`;
    },
  });
  await manager.startVoiceMode();
  assert.equal(manager.stateMachine.state, "error");
  assert.equal(effects.includes("capture"), false);
  assert.ok(effects.includes("error:EDGE_TTS_HTTP_403"));
  assert.ok(!effects.some(value => String(value).includes("Provider detail must not be relayed")));
  await manager.startVoiceMode();
  assert.equal(attempts, 3, "the failed greeting retries, then the successful turn synthesizes its reply");
  assert.ok(effects.indexOf("greeting-played") < effects.indexOf("capture"));
}

// Cancellation during synthesis aborts the process signal and prevents stale playback/capture.
{
  let resolveGeneration;
  let generationSignal;
  const pending = new Promise(resolve => { resolveGeneration = resolve; });
  const { manager, effects, queue } = makeManager({
    generateTTSImpl: (_text, { signal }) => {
      generationSignal = signal;
      return pending;
    },
  });
  const starting = manager.startVoiceMode();
  while (!generationSignal) await new Promise(resolve => setImmediate(resolve));
  manager.stopVoiceMode();
  assert.equal(generationSignal.aborted, true);
  resolveGeneration("late-greeting.mp3");
  await starting;
  assert.equal(effects.includes("capture"), false);
  assert.equal(effects.some(value => String(value).startsWith("error:")), false);
  assert.equal(queue.files.includes("late-greeting.mp3"), false);
}

// Cancellation while audio is playing resolves the greeting drain without opening the mic.
{
  class PendingQueue extends FakeQueue {
    enqueueBatch(files) {
      this.files.push(...files);
      this.onPlayStart?.(files[0]);
      return new Promise(resolve => { this.finish = resolve; });
    }
    cancel() {
      this.cancelCount += 1;
      this.finish?.({ completed: false });
    }
  }
  const queue = new PendingQueue();
  const { manager, effects } = makeManager({ queueImpl: queue });
  const starting = manager.startVoiceMode();
  while (!queue.finish) await new Promise(resolve => setImmediate(resolve));
  manager.stopVoiceMode();
  await starting;
  assert.equal(effects.includes("capture"), false);
}

// Stop during model execution aborts the existing runtime signal and suppresses late speech.
{
  let finishRequest;
  let requestSignal;
  const pendingRequest = new Promise(resolve => { finishRequest = resolve; });
  const { manager, effects } = makeManager({
    routeRequestImpl: async (_text, _context, { signal }) => {
      requestSignal = signal;
      return pendingRequest;
    },
  });
  const starting = manager.startVoiceMode();
  while (!requestSignal) await new Promise(resolve => setImmediate(resolve));
  manager.stopVoiceMode();
  assert.equal(requestSignal.aborted, true);
  finishRequest({ answer: "This late answer must stay silent." });
  await starting;
  assert.equal(effects.some(value => value === "tts"), false);
}

// Duplicate starts share one in-flight promise and the greeting completes before capture.
{
  const { manager, states, effects, queue } = makeManager();
  await Promise.all([manager.startVoiceMode(), manager.startVoiceMode()]);
  assert.equal(effects.filter(value => value === "started").length, 1);
  assert.equal(effects.filter(value => value === "greeting-generated").length, 1);
  assert.equal(effects.filter(value => value === "greeting-played").length, 1);
  assert.ok(effects.indexOf("greeting-played") < effects.indexOf("capture"));
  assert.ok(effects.indexOf("capture") < effects.indexOf("routed:hello SamGPT"));
  assert.ok(effects.includes("transcript:hello SamGPT"), "the displayed transcript is the exact text routed to the AI runtime");
  assert.ok(states.includes("greeting"));
  assert.ok(states.includes("listening"));
  assert.ok(states.includes("transcribing"));
  assert.ok(states.includes("thinking"));
  assert.ok(states.includes("speaking"));
  assert.equal(manager.stateMachine.state, "idle");
  assert.equal(queue.files.length, 2, "the greeting and response were each queued once");
  assert.equal(manager.lastReply, "Hello there.");
}

// Stop aborts capture and stale transcription cannot launch a model request.
{
  let finishListen;
  const pendingListen = new Promise(resolve => { finishListen = resolve; });
  const { manager, effects } = makeManager({
    listenImpl: async ({ signal, onCaptureStarted }) => {
      onCaptureStarted();
      assert.equal(signal.aborted, false);
      return pendingListen;
    },
  });
  const starting = manager.startVoiceMode();
  while (!effects.includes("capture")) await new Promise(resolve => setImmediate(resolve));
  assert.equal(manager.setMicrophoneMuted(true), true);
  assert.equal(manager.microphoneMuted, true);
  manager.stopVoiceMode();
  assert.equal(manager.stateMachine.state, "idle");
  finishListen({ text: "this must not be submitted" });
  await starting;
  assert.equal(effects.some(value => String(value).startsWith("routed:")), false);
}

// Empty transcripts never call the AI pipeline and expose a safe recovery code.
{
  const { manager, effects } = makeManager({ listenImpl: async ({ onCaptureStarted }) => {
    onCaptureStarted();
    return { text: "   ", code: "NO_SPEECH_DETECTED", error: "NO_SPEECH_DETECTED" };
  } });
  await manager.startVoiceMode();
  assert.equal(effects.some(value => String(value).startsWith("routed:")), false);
  assert.ok(effects.includes("error:NO_SPEECH_DETECTED"));
}

// Whisper readiness failures retain a stable actionable code, not the raw exception text.
{
  const privateDetail = "local model path contains sensitive data";
  const { manager, effects } = makeManager({ listenImpl: async () => {
    throw Object.assign(new Error(privateDetail), { code: "WHISPER_MODEL_UNAVAILABLE" });
  } });
  await manager.startVoiceMode();
  assert.ok(effects.includes("error:WHISPER_MODEL_UNAVAILABLE"));
  assert.ok(!effects.some(value => String(value).includes(privateDetail)));
}

console.log("Voice lifecycle tests passed.");
