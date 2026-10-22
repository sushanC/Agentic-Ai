# samGPT Voice Architecture

Audit date: 2026-10-22. This document describes the inspected working trees in `Agentic-Ai`, `AgenticAI_Frontend`, and `AgenticAI_Electron`. All facts below refer to current source unless marked **Proposed**. The repositories contain pre-existing uncommitted changes; this audit preserved them.

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

- **Microphone:** Node `node-record-lpcm16` starts Linux `arecord`; configured non-default microphone selection is passed as the recorder device. Audio remains in a temporary WAV before local Whisper inference. VAD is amplitude threshold and silence based; it is not a neural endpoint detector.
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

TTS classifies missing Python/script/dependency, Edge HTTP/network/timeout, malformed MP3, and process errors with stable codes. Playback distinguishes missing player, spawn failure, timeout, nonzero exit and audio-device-like stderr. STT emits start/ready/capture/transcription errors and safe character counts, but microphone and recorder failures are not yet normalized consistently. The UI previously showed the generic greeting error even when TTS had identified an actionable code. The current audit fix preserves a validated error code through the state event and adds code-specific UI guidance. Raw exception messages and transcript/response text are not included in the voice state error field.

Developer telemetry includes stage durations, character counts and state events. Avoid adding logs of prompt, transcript, response, API key, or raw subprocess stderr. STT writes a temporary WAV in the system temp directory and removes it on completion/cancel paths; permissions should be explicitly constrained to the current user as a follow-up. TTS uses a random temporary filename, validates MP3 framing and removes it after playback or failure.

## Privacy and security boundaries

- Microphone capture begins only after an explicit Start command and greeting playback completion. Continuous mode is a stored setting and loops after each response; its UI must keep the listening state and Stop control visible.
- Raw mic audio is processed by local recorder/Whisper code in the current implementation; the recognized transcript is added to chat history and may be passed to memory extraction and the configured model/tool provider.
- Edge TTS is remote. The greeting and AI response text are sent to Edge TTS; this is a separate disclosure boundary from local Whisper.
- Electron main process starts the backend with inherited environment and backend repository working directory. TTS uses that repository's virtualenv by default; Whisper also hardcodes that virtualenv path. Shell testing and Electron therefore resolve the same Python path unless a future launch wrapper changes cwd or environment.
- `AgenticAI_Electron/electron/main/windows/windowManager.js` currently sets `sandbox: false` on its BrowserWindow definitions. This is an existing security concern and conflicts with the desired sandbox posture; this audit did not alter the Electron security model. Restore sandboxing only with preload compatibility fixes and explicit security review.
- Audio device selection and process arguments are passed to fixed executable paths. Do not expose arbitrary executable or shell command strings through renderer IPC.

## Current validation and limitations

Verified on 2026-10-22 in this environment:

- Backend interpreter: Python 3.12.3 at `Agentic-Ai/venv/bin/python`; `edge-tts` is 7.3.1.
- Real Edge TTS synthesis using the backend's `tts.py` completed with exit code 0 and produced a 15,696-byte MP3. This verifies the current handshake and file generation, not playback.
- `/usr/bin/ffplay` and `/usr/bin/ffprobe` exist. No ALSA cards are visible (`arecord -l` and `aplay -l` report no soundcards); `/dev/snd` is absent. Audible playback and microphone capture cannot be verified here.
- A direct `ffplay -nodisp -autoexit -loglevel error` run on the generated MP3 exited with code 0 in this device-less environment. This is an observed example of why exit code 0 alone must not be reported as successful audible playback.
- `faster-whisper` 1.2.1 is installed in the backend venv and is the implementation imported by `speech_to_text.py`. The `small` CPU/int8 model startup and actual transcription were not run during this audit.
- Focused backend voice lifecycle and TTS tests pass. These tests mock child processes and audio output; they do not verify physical devices.
- Frontend production build passes, with a bundle-size warning. Frontend lint currently fails with 63 errors and 2 warnings across the tree, including pre-existing screens/hooks; voice-specific lint status is not isolated yet.
- The full backend `npm test` run is blocked in this sandbox by tests that bind `127.0.0.1` (`listen EPERM`). Focused voice tests pass. Re-run the full suite in a local environment that permits loopback sockets.

No verified latency or resource baseline is available yet. Existing metrics collect recording, AI, TTS, playback startup and playback durations, but current test values use fakes and are not target-device measurements. Add model-load, STT inference, audio-device initialization and monotonic stage timestamps before setting performance budgets.

## Limitations and technical debt

1. No physical audio device was available for this audit; playback process completion is not proof of audible sound.
2. `speech_to_text.py` dependency/model health and actual microphone permission remain unverified; Whisper is not installed as `openai-whisper` in the inspected venv.
3. The `VoiceManager` path has stronger lifecycle handling than the legacy `/voice` HTTP service, which directly calls `askAI`/`speak`; clarify or retire the legacy path before expanding it.
4. State changes carry an error code but IPC commands do not acknowledge success or failure directly.
5. Continuous mode retries listening after no speech, while conversation timeout is reset on capture start; validate interaction semantics with target users and devices.
6. `VoiceQueue` infers audio device failures from a bounded stderr text pattern and only recognizes common fixed `ffplay` locations unless configured.
7. The Electron window currently disables Chromium sandboxing and needs a dedicated security fix.
8. Microphone device enumeration, permissions and capture are Linux/ALSA oriented; PipeWire/PulseAudio device identities need explicit validation.

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

Run from the backend repository:

```bash
./venv/bin/python --version
./venv/bin/python -m pip show edge-tts
./venv/bin/python tts.py --text 'SamGPT voice check.' --voice en-IN-NeerjaNeural --rate=+0% --pitch=+0Hz --volume=+0% --output /tmp/samgpt-voice-check.mp3
ffprobe -v error -show_entries format=format_name -of default=noprint_wrappers=1 /tmp/samgpt-voice-check.mp3
node tests/voice/voice-lifecycle.test.js
node tests/voice/tts-service.test.js
```

Then start the Electron app in the target desktop session, press Start, confirm the greeting is heard, confirm the visible state changes to Listening only after it finishes, speak one phrase, and verify the displayed transcription and response. Repeat Stop while greeting, listening, thinking and speaking. Record OS, input/output device names, Python path/version and observed result without recording transcripts or private response text in diagnostic logs.
