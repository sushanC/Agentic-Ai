# samGPT Voice Architecture

Audit date: 2026-10-22. This document describes the inspected working trees in `Agentic-Ai`, `AgenticAI_Frontend`, and `AgenticAI_Electron`. All facts below refer to current source unless marked **Proposed**. The pre-existing uncommitted changes were preserved. This pass adds STT WAV/VAD handling, safe capture outcomes, focused tests, phrase/WER diagnostics, and actionable renderer errors.

## Verified component inventory

| Layer | File | Responsibility |
| --- | --- | --- |
| Backend orchestration | `features/voice/voiceManager.js` | Owns the voice session, calls settings/STT/AI/TTS, manages cancellation generations and session state. |
| Backend state | `features/voice/VoiceStateMachine.js` | Validates allowed state transitions. Invalid transitions return `false`. |
| Audio output | `features/voice/VoiceQueue.js` | Serializes MP3 playback through `ffplay`; drains promises on completion/cancel and removes temporary files. |
| TTS | `features/voice/ttsService.js`, `tts.py` | Starts the backend virtualenv Python interpreter, calls Edge TTS, validates MP3 framing, and supports timeout/abort. |
| STT capture | `features/voice/sttService.js`, `features/voice/VadDetector.js` | Starts `arecord` on Linux, writes WAV to a temporary file, applies local amplitude/silence VAD, and requests transcription. |
| STT inference | `features/voice/WhisperDaemon.js`, `speech_to_text.py` | Owns a Python subprocess and newline-delimited JSON over stdin/stdout for local Whisper transcription. |
| Events and timings | `features/voice/VoiceEventEmitter.js`, `VoicePerformanceMonitor.js`, `VoicePerformanceMetrics.js` | Sends state over Node IPC and emits aggregate developer telemetry. Transcript and response telemetry records character counts. |
| Voice HTTP route | `features/voice/voiceRoutes.js`, `voiceController.js`, `voiceService.js` | Legacy `/voice` request route; it calls `listen()`, `askAI()`, and `speak()` directly. The Electron voice UI uses the process IPC session manager instead. |
| AI runtime adapter | `services/toolRouter.js`, `core/routing/ToolRouter.js`, `core/agent/AgentRuntime.js` | Adapts voice requests into the existing agent runtime and provider/tool-routing lifecycle. |
| Backend process bridge | `server.js` | Handles voice command messages from Electron and invokes the singleton `voiceManager`. |
| Electron startup | `AgenticAI_Electron/main.js` | Spawns `node server.js` with `cwd` set to the sibling backend repository and forwards backend voice state messages to the main window. |
| Electron IPC | `AgenticAI_Electron/electron/main/ipc/desktopEvents.js`, `AgenticAI_Electron/preload.js` | Maps renderer voice actions to a small set of named IPC channels and exposes matching methods and subscriptions. |
| Renderer experience | `AgenticAI_Frontend/src/components/VoiceExperience.jsx` | Displays lifecycle state, transcripts, controls, device/settings data and error recovery instructions. |
| Renderer controls | `src/components/voice/VoiceControls.jsx`, `VoiceOrb.jsx`, `VoiceWaveform.jsx`, `VoiceStatus.jsx`, `VoiceConversation.jsx`, `VoiceSessionInfo.jsx` | Render the voice controls, state-driven motion, transcript, status and session/device panel. |
| Renderer bridge | `AgenticAI_Frontend/src/desktop/useDesktopBridge.js` | Exposes `window.desktopAPI` to React or a browser no-op shim. |

## Startup through shutdown

1. Electron waits for `app.whenReady()`, starts the backend with `node server.js`, then initializes the desktop bootstrap.
2. Backend startup loads voice settings. This does not itself open the microphone.
3. The renderer's Start control sends `desktop:start-listening`; Electron forwards `START_LISTENING` over the backend child-process IPC channel.
4. `server.js` calls `voiceManager.startVoiceMode()`. A singleton manager and `startPromise` coalesce repeated starts.
5. The manager changes to `starting`, loads settings, creates an `AbortController`, and synthesizes the configured greeting.
6. The greeting MP3 is played through `VoiceQueue`. Only a completed queue drain permits the manager to call `startListening()`.
7. STT initializes the Whisper daemon, starts the recorder, and emits `listening` once audio data arrives. VAD stops recording after speech-end silence, no-speech timeout, or max recording time.
8. The manager sends recognized text through `addMessage`, optional memory extraction, `routeRequest(text, "voice", {signal})`, assistant history/summary/stat updates, and then response synthesis.
9. The queue plays response audio. In continuous mode, queue-empty begins another listen; otherwise the session returns to idle.
10. Stop/cancel increments a generation, aborts cancellable work, cancels playback, clears timers, and returns the manager to idle. Electron `before-quit` kills the backend process. A graceful backend signal path that explicitly shuts down the Whisper daemon is not present in the inspected Electron shutdown code.

## Start-to-response sequence

```mermaid
sequenceDiagram
    actor User
    participant UI as React VoiceExperience
    participant Preload as Electron preload
    participant Main as Electron main / desktopEvents
    participant Backend as server.js + VoiceManager
    participant TTS as Python tts.py / Edge TTS
    participant Queue as VoiceQueue / ffplay
    participant STT as arecord + VAD + WhisperDaemon
    participant Runtime as AgentRuntime / ToolRouter

    User->>UI: Start
    UI->>Preload: startListening()
    Preload->>Main: desktop:start-listening
    Main->>Backend: START_LISTENING
    Backend->>Backend: state = starting; load settings
    Backend->>TTS: synthesize greeting
    TTS-->>Backend: validated MP3 path
    Backend->>Queue: enqueueBatch(greeting)
    Queue->>Queue: spawn ffplay and await close
    Queue-->>Backend: completed drain
    Backend->>STT: start capture
    STT-->>Backend: transcript / recognition error
    Backend->>Runtime: routeRequest(transcript, voice, signal)
    Runtime-->>Backend: answer through established runtime
    Backend->>TTS: synthesize response chunks
    TTS-->>Backend: validated MP3 paths
    Backend->>Queue: enqueueBatch(response)
    Queue-->>UI: state updates relayed over child IPC and preload
    Queue-->>Backend: completed drain
    Backend-->>UI: idle or next continuous listen
```

## State machine and transitions

Current states are `idle`, `starting`, `greeting`, `listening`, `transcribing`, `thinking`, `speaking`, `interrupted`, `error`, and `stopping`. The current allow-list is:

| State | Allowed next states |
| --- | --- |
| idle | starting |
| starting | greeting, listening, error, stopping, interrupted |
| greeting | starting, listening, error, stopping, interrupted |
| listening | transcribing, interrupted, error, stopping |
| transcribing | thinking, starting, listening, idle, interrupted, error, stopping |
| thinking | speaking, starting, listening, idle, interrupted, error, stopping |
| speaking | starting, listening, idle, interrupted, error, stopping |
| interrupted | listening, idle, starting, stopping, error |
| error | idle, starting, stopping |
| stopping | idle |

Invalid transitions are rejected with `false`; the state machine does not throw. State changes are emitted to Electron. A recoverable error state schedules an idle transition after the configured three-second delay. `sessionGeneration` is checked after async boundaries so a late STT, AI or TTS result cannot continue the superseded session. The Edge TTS subprocess receives the session abort signal; the provider runtime receives it as well, though provider cancellation depends on implementation. Whisper transcription currently has no abort signal; stopping resolves/ignores its result but does not guarantee inference stops immediately.

**Ordering invariant:** the current start path waits for greeting synthesis and a successful playback queue drain before entering the STT capture path. The lifecycle test checks this ordering. This verifies program flow with fakes, not audible output.

## STT, runtime, TTS, playback and microphone boundaries

- **Microphone:** Node `node-record-lpcm16` starts Linux `arecord`; configured non-default microphone selection is passed as the recorder device. Audio remains in a mode-0600 temporary WAV before local Whisper inference. VAD is amplitude threshold and silence based; it is not a neural endpoint detector. It now finds the WAV `data` chunk across split recorder buffers before measuring PCM.
- **STT:** `WhisperDaemon` launches `venv/bin/python speech_to_text.py`, communicates with JSON lines, and retains one active request. The daemon has a 120-second startup and transcription timeout. Model choice, loading, and inference are in Python, outside React rendering.
- **AI runtime:** voice is tagged with context `voice` and routed through `AgentRuntime`, which may route to existing model providers and capabilities/tools. Voice stores the user and assistant messages and calls existing memory and summary APIs. It does not directly call a model from React.
- **TTS:** `ttsService.js` launches `venv/bin/python tts.py` unless `SAMGPT_PYTHON_PATH` is configured. It passes text and voice options as process arguments; Edge TTS sends that text to Microsoft's network speech service. The subprocess has a 120-second timeout, bounded stderr capture and a session abort handler.
- **Playback:** `VoiceQueue` resolves `ffplay` from configured `SAMGPT_FFPLAY_PATH` or `/usr/bin` and `/usr/local/bin`, starts one process at a time, and reports completion based on process close. A zero exit code means process completion, not that a person heard audio.
- **Cancellation:** TTS and AI runtime are signaled with `AbortController`; process termination and provider cancellation are best effort. Playback is force-killed on cancel. Whisper may finish after cancellation; generation checks discard late results.

## Electron IPC and ownership

| Action | Renderer API | Electron channel / backend message |
| --- | --- | --- |
| Start | `startListening()` | `desktop:start-listening` → `START_LISTENING` |
| Cancel capture/session | `cancelListening()` | `desktop:cancel-listening` → `CANCEL_LISTENING` |
| Stop response audio | `stopSpeaking()` | `desktop:stop-speaking` → `STOP_SPEAKING` |
| Pause/resume | `pauseSpeaking()` / `resumeSpeaking()` | matching desktop channels → `PAUSE_SPEAKING` / `RESUME_SPEAKING` |
| Repeat | `repeatLastResponse()` | `desktop:repeat-last-response` → `REPEAT_LAST_RESPONSE` |
| Microphone mute | `setMicrophoneMuted(bool)` | `desktop:set-microphone-muted` → `SET_MICROPHONE_MUTED` |
| Settings reload | `voiceSettingsChanged()` | `desktop:voice-settings-change` → `RELOAD_VOICE_SETTINGS` |
| State | `onVoiceStateChange(callback)` | backend `VOICE_STATE_CHANGE` → `desktop:voice-state-change` |

The backend singleton owns the voice session and queue. `startPromise` and `listenPromise` guard duplicate in-process operations; `sessionGeneration` protects against stale async completion. One Whisper daemon and one playback queue are shared. There is no per-window voice session. The renderer uses one-way IPC commands; command failures are surfaced through state changes rather than returned promise results.

## Errors, diagnostics and recovery

TTS classifies missing Python/script/dependency, Edge HTTP/network/timeout, malformed MP3, and process errors with stable codes. Playback distinguishes missing player, spawn failure, timeout, nonzero exit and audio-device-like stderr. STT reports stable outcomes for capture failure, too-short audio, no detected speech, empty transcription, and transcription failure. The renderer displays a validated safe error code and actionable guidance; raw exceptions, transcripts and responses are not copied into error details. Voice IPC state errors do not contain transcript or response content. The transcript and response fields are sent only in their corresponding state events for display in the voice UI.

Developer telemetry includes stage durations, character counts and state events. Avoid adding logs of prompt, transcript, response, API key, or raw subprocess stderr. STT writes a temporary WAV in the system temp directory with mode 0600 and removes it on completion/cancel paths. It waits for the file stream to finish before opening it for transcription; the former fixed 80 ms delay was not a reliable flush guarantee. TTS uses a random temporary filename, validates MP3 framing and removes it after playback or failure.

## Privacy and security boundaries

- Microphone capture begins only after an explicit Start command and greeting playback completion. Continuous mode is a stored setting and loops after each response; its UI must keep the listening state and Stop control visible.
- Raw mic audio is processed by local recorder/Whisper code in the current implementation; the recognized transcript is added to chat history and may be passed to memory extraction and the configured model/tool provider.
- Edge TTS is remote. The greeting and AI response text are sent to Edge TTS; this is a separate disclosure boundary from local Whisper.
- Electron main process starts the backend with inherited environment and backend repository working directory. TTS uses that repository's virtualenv by default; Whisper also hardcodes that virtualenv path. Shell testing and Electron therefore resolve the same Python path unless a future launch wrapper changes cwd or environment.
- `AgenticAI_Electron/electron/main/windows/windowManager.js` currently sets `sandbox: false` on its BrowserWindow definitions. This is an existing security concern and conflicts with the desired sandbox posture; this audit did not alter the Electron security model. Restore sandboxing only with preload compatibility fixes and explicit security review.
- Audio device selection and process arguments are passed to fixed executable paths. Do not expose arbitrary executable or shell command strings through renderer IPC.

## Current validation and limitations

Phase 1 confirmed two capture defects in the implementation: VAD skipped a WAV header only when it arrived as one exact 44-byte first buffer, and transcription waited a fixed 80 ms rather than waiting for file output to flush. VAD now locates the RIFF `data` chunk across split buffers, and Whisper is called only after the write stream finishes. Temporary WAV creation now requests mode 0600. Empty capture outcomes no longer report a synthetic confidence of 1.0, and the lifecycle reports stable, actionable error codes. A synthetic phrase gave the same recognition output with and without the generic initial prompt, so this pass did not change the model, beam, language, compute type or prompt.

Verified on 2026-10-22 in this environment:

- Backend interpreter: Python 3.12.3 at `Agentic-Ai/venv/bin/python`; `edge-tts` 7.3.1 and `faster-whisper` 1.2.1 are installed. `ffplay` is 6.1.1; PipeWire is 1.0.5.
- The reproducible `scripts/verifyVoiceDevices.sh` run generated a valid 19,296-byte MP3, duration 3.216 s. Measured Edge TTS generation was 2.090 s in that run (2.1–2.2 s in repeated runs).
- `ffplay` completed in 3.316 s with exit code 0. A concurrent PipeWire graph inspection saw the active `ffplay` node routed to the default `Boult Audio Airbass` sink at volume 0.37. This verifies an audio stream reached the active output sink, but nobody in this environment confirmed hearing it.
- `arecord -l` reports no ALSA hardware cards, but ALSA `default` routes through PipeWire. PipeWire enumerates a Built-in Audio Analog Stereo source, built-in analog sink, and Boult Audio Airbass sink. A 5-second default capture exited 0 in 5.186 s and had RMS 9495.2. No controlled spoken phrase was supplied during this run, so the capture is not verified as intelligible microphone input or as a permission test.
- `faster-whisper` loaded the cached `small` CPU/int8 model in 2.17 s during the procedure. The default capture transcribed to empty text in 0.09 s. For a known synthetic Edge TTS phrase, transcription took 1.34 s and returned `Samjee PT Voice Verification` instead of the expected `SamGPT voice verification`. Repeating the same sample with and without the current generic initial prompt returned the same text (1.537 s with prompt, 1.365 s without on that comparison); the prompt/model settings were left unchanged. Normalizing words and punctuation gives 2 edits over 3 reference words (66.7% WER) for this synthetic phrase. This is a single synthetic spot check, not a microphone benchmark.
- The diagnostic script now presents three fixed phrases, captures five seconds to a private temporary WAV, applies the current `small` CPU/int8, English, beam-size-5 Faster Whisper settings, and prints WER while suppressing recognized text. `SAMGPT_VOICE_DIAGNOSTICS=1` opts in to printing the transcript locally. The script removes its private temporary directory on exit. No human spoke a controlled phrase during this environment's run, so no real-microphone WER is available.
- The checked-in voice lifecycle tests verify greeting-completion-before-capture, duplicate start coalescing, greeting retry, stop during TTS/playback/capture/AI, and suppression of stale results. New audio tests cover split RIFF headers, PCM VAD and waiting for WAV flush completion. These tests use fakes; they do not prove the physical Electron path.
- Backend `npm test` passes, including the added audio test. Frontend production build passes with the existing >500 kB bundle warning. Targeted ESLint on `VoiceExperience.jsx`, `VoiceControls.jsx`, and `VoiceStatus.jsx` passes. Full frontend lint previously reported 63 errors and 2 warnings in the broader tree.
- **Not verified:** an actual human heard the greeting; a controlled phrase was captured and transcribed; the full Electron Start-to-AI-to-spoken-response loop; target-device AI inference latency. Those require a person speaking/listening in the desktop session and an available AI provider.

Measured process timings use `time.perf_counter()` and describe these individual test runs only. Playback timing is the `ffplay` process lifetime, not perceived audio latency. Microphone capture timing includes the five-second recording, so it does not isolate recorder startup. The available timing observations are greeting generation 2.090 s, greeting playback process 3.316 s, five-second mic capture process 5.186 s, Whisper cold load 2.17 s, and empty-capture Whisper inference 0.09 s. Current response synthesis, actual mic startup, AI inference, and response playback latency were not measured because an attended full Electron turn was not run. There is no verified end-to-end latency or resource baseline yet.

## Limitations and technical debt

1. PipeWire exposes audio nodes and the playback stream reaches an active sink, but human audible playback has not been confirmed.
2. The default capture path produces nonzero audio, but no controlled utterance was supplied; microphone intelligibility, selected-device behavior and actual permission handling remain unverified.
3. The cached Faster Whisper model loads, but the synthetic sample was misrecognized and no target-user speech quality test was performed.
4. The `VoiceManager` path has stronger lifecycle handling than the legacy `/voice` HTTP service, which directly calls `askAI`/`speak`; clarify or retire the legacy path before expanding it.
5. State changes carry an error code but IPC commands do not acknowledge success or failure directly.
6. Continuous mode retries listening after no speech, while conversation timeout is reset on capture start; validate interaction semantics with target users and devices.
7. `VoiceQueue` infers audio device failures from a bounded stderr text pattern and only recognizes common fixed `ffplay` locations unless configured.
8. Electron BrowserWindow definitions currently set `sandbox: false`; this pre-existing security issue was not changed during voice verification.
9. Device enumeration and capture use Linux/ALSA names while PipeWire supplies the active source and sink; validate selected-device identifiers end to end.

## Prioritized upgrade roadmap

### P0 — Complete device verification

- In the target desktop session, confirm selected output device, audible greeting, successful process completion, and that capture starts only afterward.
- Confirm microphone permission, `arecord` device selection, Whisper model initialization and transcription for quiet, short and long speech.
- Record the exact Python executable/version and `edge-tts`/Whisper versions from the running backend. Keep device results separate from mocked tests.

### P1 — Close reliability gaps

- Normalize STT stage failures and pass only stable error codes to UI; expose backend readiness and device availability in the session panel.
- Add IPC acknowledgements or correlated command outcomes so Start errors are not lost between Electron and backend.
- Add shutdown cleanup that aborts capture, cancels playback, and terminates the Whisper daemon on backend exit.
- Restrict temporary WAV/MP3 permissions and verify cleanup after every termination path.
- Expand regression coverage for process timeouts, microphone denial, stale callbacks, continuous mode, app shutdown and IPC propagation.

### P2 — Measure and improve interaction

- Record monotonic timestamps for Start, greeting synthesis/playback, capture, STT, runtime, response TTS and playback; report stage IDs and durations only.
- Measure Whisper model load, first/subsequent inference time and resource use on target hardware before changing model size or VAD.
- Make greeting, selected voice, rate and volume configurable and validate settings against supported Edge TTS options.
- Test and tune barge-in on device; distinguish stopping playback immediately from cancellation of model/provider work.

### P3 — Polish the voice experience

- Keep the existing VoiceExperience layout and design tokens; make orb/waveform state-driven unless real audio levels are measured.
- Improve responsive status, errors, device/session panel and accessibility, including reduced motion and keyboard operation.
- Define push-to-talk, single-turn and continuous modes distinctly. Continuous mode should specify silence timeout, echo handling, interruption, and idle timeout.

### Future, separately approved features

- Wake-word mode should be explicit opt-in, local-first, visible, and reviewed for privacy and resource use. Do not stream background audio to a cloud service for wake-word detection.
- Streaming TTS should follow measured need and first have a cancellation-safe buffering and turn-order design.

## Local verification commands

Run from the backend repository. The script uses a private temporary directory and removes its generated MP3 and recorded WAV on exit. It asks which fixed test phrase you will speak during the five-second capture, compares the transcript with that reference, and prints WER without transcript text. Set `SAMGPT_VOICE_DIAGNOSTICS=1` only when you explicitly want the local transcript printed to the terminal.

```bash
cd "/home/sushan_acharya/Documents/Personal Agent/Agentic-Ai"
./scripts/verifyVoiceDevices.sh
```

If the default input is not the intended microphone, set its ALSA/PipeWire name for the script:

```bash
arecord -L
SAMGPT_ALSA_INPUT='pipewire' ./scripts/verifyVoiceDevices.sh
```

On Zorin OS, first check the active PipeWire devices and the recorder's available inputs; use the selected ALSA/PipeWire name in `SAMGPT_ALSA_INPUT` if `default` is not the microphone you intend to test:

```bash
wpctl status
arecord -l
arecord -L
SAMGPT_ALSA_INPUT='default' ./scripts/verifyVoiceDevices.sh
```

Then verify the full Electron path from the desktop session. Build the renderer before Electron because `windowManager.js` loads the frontend `dist` directory:

```bash
cd "/home/sushan_acharya/Documents/Personal Agent/AgenticAI_Frontend" && npm run build
cd "/home/sushan_acharya/Documents/Personal Agent/AgenticAI_Electron" && npm start
```

In the app, press Start, wait for the greeting to finish, then speak one of the fixed phrases shown by the script. Confirm the visible Listening state begins only after greeting playback completes, the displayed transcript is correct, the existing SamGPT AI runtime returns an answer, and its spoken response reaches the intended output. Repeat Stop during greeting, listening, thinking and speaking, then retry after one recoverable error. Record only stage timings, error codes, WER and whether each stage succeeded; keep transcript and response contents out of diagnostic notes. The current execution environment has no ALSA hardware cards and no attended user to speak or confirm audibility, so this manual Electron verification is still a required target-device step.

## Separate Jarvis-style implementation plan — not implemented

The following work starts only after the physical Start-to-response path above is verified.

1. **Voice activity and endpoint detection:** measure actual input levels and current silence behavior first; tune VAD against quiet, noisy, short and long speech. Add device-specific tests before replacing the amplitude detector.
2. **Barge-in:** define an explicit interrupt event and operation IDs, stop active `ffplay`, cancel TTS/provider work where supported, and ignore late results. Add echo handling so speaker output does not immediately retrigger the microphone. Verify repeated interruptions on target hardware.
3. **Continuous conversation:** make the mode explicit opt-in, then define turn endpoint, post-response listening, silence timeout, output echo suppression, Stop behavior and recovery. Keep a persistent visible listening indicator and Stop control.
4. **Responsive voice visualization:** keep lifecycle state authoritative; use measured input amplitude only when it is actually available, otherwise label the orb/waveform as state-driven. Respect reduced-motion settings and verify layout at desktop and narrow widths.
