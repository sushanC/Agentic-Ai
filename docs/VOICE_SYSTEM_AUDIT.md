# SamGPT Voice System Audit

Audit date: 2026-10-18. This audit covers the backend repository, the adjacent React renderer (`AgenticAI_Frontend`), and the Electron shell (`AgenticAI_Electron`). It describes the local Linux desktop topology; it does not enable network access.

## Architecture and real request path

The visible Jarvis screen is implemented in the separate React repository at `AgenticAI_Frontend/src/components/VoiceExperience.jsx`. Its click handler calls `desktopAPI.startListening()`. The Electron preload maps that to `desktop:start-listening`; `electron/main/ipc/desktopEvents.js` sends `START_LISTENING` over the child-process IPC channel to the backend process spawned by `AgenticAI_Electron/main.js`. The backend routes that message to `voiceManager.startVoiceMode()`.

The authoritative local voice pipeline is:

1. `VoiceManager` loads saved settings and reserves one session generation.
2. It synthesizes the configured `voiceGreeting` with `tts.py` and the configured Edge TTS voice. Generated MP3 audio is played by `VoiceQueue` through `ffplay`.
3. Only after the greeting playback process exits successfully does it start microphone capture through `node-record-lpcm16` / `arecord` at 16 kHz, mono WAV. The first captured audio chunk changes the state to `listening`.
4. `VadDetector` stops capture on silence, no-speech timeout, or maximum recording duration. The temporary WAV is submitted to `speech_to_text.py`, which loads `faster-whisper`'s `small` model on CPU with int8 compute.
5. The transcript is submitted to the existing `routeRequest(text, "voice", { signal })` runtime. That path uses the shared agent runtime, context assembly, provider routing, fallback, and cancellation signal. Existing chat history, memory extraction, summary, and message statistics are updated by the voice manager.
6. The sanitized response is split into sentence chunks; all chunks are synthesized before an atomic queue batch is played. Queue drain returns to listening only in configured continuous mode; otherwise the session returns to idle.
7. Voice state messages go from the backend process to Electron main, then through the preload subscription to React. The UI uses the same backend state, not a parallel inferred state.

The React orb and waveform are canvas/CSS state animations. They currently do not receive actual microphone or playback amplitude data, so they are intentionally treated as decorative state visualization, not audio-reactive telemetry.

## Other paths and their status

| Path | Status |
| --- | --- |
| Electron `START_LISTENING` | Primary UI path; now starts the greeting-first session. |
| Electron `START_VOICE_MODE` / toggle | Same manager session and greeting path; duplicate starts share one in-flight start. |
| `/voice` HTTP POST | Legacy one-shot server-microphone endpoint. It remains for compatibility, uses the older `askAI` helper, and does not run the Jarvis renderer lifecycle. It previously passed the STT result object instead of its `.text` value; that shape defect is fixed. |
| `VoiceButton.jsx` | Older sidebar component, separate from the current Home overlay. It now uses the same Electron start/stop IPC session commands and does not log transcript or response content. |
| `VoiceQueue` | Real `ffplay` child-process playback; now batches sentence files before playback to prevent a transient empty queue between synthesis chunks. |
| Browser renderer outside Electron | No browser microphone/STT implementation exists. The Jarvis controls report that capture is desktop-only instead of invoking missing no-op bridge methods. |
| True spoken wake-word detection | Not implemented. Session startup is explicit click/desktop command only; no idle background microphone is started. |

## Confirmed defects and repairs

| Confirmed defect | Evidence and symptom | Repair |
| --- | --- | --- |
| No wake-up greeting | Previous manager started `listen()` immediately. The UI's main button also sent `START_LISTENING`, which previously called the listener directly. | Click-start now enters `starting`, generates and plays the configurable greeting, then opens capture. Greeting failure reaches an error state; it is not silently skipped. |
| Duplicate startup race | `startVoiceMode()` awaited settings before setting `isActive`; fast repeated clicks could pass the guard and start overlapping sessions. | A synchronous in-flight `startPromise`, active session generation, and `AbortController` serialize startup and invalidate stale work. |
| Stop did not stop capture / stale results could continue | The former `cancelListening()` only changed state; `sttService.listen()` had no cancellation contract. | STT accepts an `AbortSignal`, kills the recorder, removes the temporary audio, and returns an aborted result. Manager generation checks also suppress late transcription/model/TTS completion. The signal is passed into the existing request runtime. |
| UI could say listening before capture | Manager transitioned to listening before the Whisper daemon and recorder returned audio. | The UI remains `starting` until the recorder stream emits its first chunk. |
| No real microphone mute control | Existing renderer “Mute” called `stopSpeaking()` and resume, affecting output rather than input. | Added an Electron IPC microphone mute command that replaces captured PCM chunks with silence before temporary-file storage and VAD/Whisper processing. |
| Queue could appear empty between sentences | TTS generation enqueued each sentence separately while `VoiceQueue` started playback immediately. A short sentence could finish before the next was synthesized, triggering idle/relisten early. | Manager synthesizes all chunks and enqueues an atomic batch. Queue drain has explicit completed/cancelled results. |
| Queue cancellation could let old process events affect new playback | Child `close` handlers referenced mutable `currentFile` / `currentProcess`, so a late close could clear state belonging to a newly started player. | Each handler captures its own player and file; stale child events clean only their file and cannot change current queue state. Non-zero playback exits raise an error. |
| State machine was incomplete and permissive | Original machine had `idle/listening/processing/speaking/error`, allowed any transition to idle/error, and could not represent startup, greeting, transcription, interruption, or stopping. | The state machine now has explicit allowed transitions and rejects invalid transitions. |
| Whisper daemon startup could hang forever | Startup waited for `READY`; child close before `READY` reset fields without resolving the promise. Stdout parsing assumed one whole JSON response per data chunk. | Startup now times out/rejects on process exit, response parsing is line-buffered, and transcription has a bounded timeout and single-flight guard. |
| Private content appeared in diagnostics | Voice events included recognized text, AI prompts/replies, and TTS text; manager logged entire STT results and a response excerpt; TTS logged the full argument array including text. | Diagnostics contain event type, error code, character counts, and latency only. Renderer IPC still receives the content needed to show the conversation. |
| Legacy `/voice` passed the STT object to the AI helper | `listen()` returns `{ text, ... }`, but the old service treated that object as the prompt. | The legacy route extracts and trims `.text`, avoids model calls for empty speech, and preserves its response shape. |
| Renderer controls did not match backend states | Status display knew only idle/listening/processing/speaking/error; stop actions were limited to selected states; command-palette voice actions were only partially handled. | Status labels cover all lifecycle states, stop/interrupt is available across active phases, and command actions start/stop the session. Repeat-last-response now uses a real Electron-to-manager action. |

## Existing working behavior retained

- Linux capture used `arecord`, `node-record-lpcm16`, VAD silence/no-speech/max-duration bounds, and a persistent Faster Whisper Python daemon.
- Speech used Edge TTS via `tts.py`, with configurable voice, rate, pitch, and volume; audio playback used `ffplay` and `VoiceQueue`.
- The high-level `VoiceManager` already routed text through `routeRequest(..., "voice")`, maintained chat history, memory extraction, summary, and message counts, and supported continuous conversation mode.
- Electron already had a context-isolated `contextBridge` with unsubscribe-returning voice subscriptions and a child-process IPC channel. These contracts remain in use.
- No new runtime dependency or identity/network exposure was introduced by this voice work.

## Platform and dependency findings

The runtime is specifically Linux-oriented: microphone enumeration uses `arecord -L`, output enumeration uses `aplay -L`, the recorder selects `arecord`, and the playback queue selects `ffplay`. The Python scripts are resolved relative to the backend repository at `venv/bin/python`; `speech_to_text.py` imports `faster_whisper`, and `tts.py` imports `edge_tts`. On the audited machine, `venv/bin/python`, `ffplay`, `arecord`, and `aplay` were present, and both Python imports succeeded. This verifies executable/dependency presence only, not that an audio device can capture or produce audible sound.

There is no browser-native `SpeechRecognition` path and no renderer-side microphone stream. The actual device permission is controlled by the Linux audio stack/user session; no browser permission prompt is shown. The app's device selector uses ALSA identifiers from the backend. Edge TTS requires network access to Microsoft's speech service. There is no silent provider fallback.

## Regression risks and unverified areas

- A missing ALSA device or denied OS-level device access can still fail at recorder startup; the UI now displays a targeted recovery message, but actual permission revocation and hot-unplug behavior need a hardware acceptance pass.
- TTS depends on Edge TTS network availability; playback depends on `ffplay` and a working Linux output device.
- The new state and queue tests use injected fakes. They prove sequencing and stale-result suppression, not audible playback or microphone quality.
- The legacy HTTP `/voice` path remains separate from the Electron session and does not include the greeting/state-machine controls. It is retained for compatibility and should not be presented as the primary client flow.
- The orb and waveform do not visualize real amplitude. The current visual motion is state-driven only.

## Files inspected

Backend: `features/voice/*`, `features/settings/settingsStorage.js`, `server.js`, `services/toolRouter.js`, `core/routing/ToolRouter.js`, `core/agent/AgentRuntime.js`, `speech_to_text.py`, and `tts.py`.

Renderer: `src/components/VoiceExperience.jsx`, `src/components/VoiceExperience.css`, `src/components/voice/*`, `src/components/pages/SettingsPage.jsx`, and `src/desktop/useDesktopBridge.js` in `AgenticAI_Frontend`.

Electron: `main.js`, `preload.js`, and `electron/main/ipc/desktopEvents.js` in `AgenticAI_Electron`.
