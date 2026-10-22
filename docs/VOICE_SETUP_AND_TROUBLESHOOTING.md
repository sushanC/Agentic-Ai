# Voice Setup and Troubleshooting

This guide covers the Linux Electron voice path. Voice capture and playback are owned by the backend process, not browser Web Speech APIs. A click starts one session and plays the greeting before opening the microphone. No wake word or background microphone is enabled.

## Required local components

- Linux audio input and output exposed through ALSA. The backend uses `arecord` and `aplay` for device discovery.
- `arecord` available for input capture. Playback resolves `ffplay` at `/usr/bin/ffplay` or `/usr/local/bin/ffplay`, or from the absolute `SAMGPT_FFPLAY_PATH` setting.
- A Python environment at `<backend-repo>/venv/bin/python` with the packages in `requirements-voice.txt`. Edge TTS 7.3.0 or newer is required for Microsoft's current synthesis handshake. STT loads Faster Whisper's `small` model on CPU/int8; the first model load may need model files in the local cache.
- The backend resolves Python and `tts.py` from its own repository location, independent of Electron's current working directory. `SAMGPT_PYTHON_PATH` may override the interpreter with an absolute path or a path relative to the backend root.
- Network access for Edge TTS synthesis. Assistant audio playback itself runs locally through `ffplay`.
- The React client run inside the SamGPT Electron application. A browser-only renderer has no microphone/STT integration and reports this limitation.

No provider credentials are required for the current Edge TTS implementation. It does not silently fall back to another TTS provider. Missing scripts, binaries, packages, network, device access, or invalid audio are surfaced as errors.

## Voice settings

Settings are stored in the backend's existing settings JSON and editable in the app's Settings page:

| Setting | Purpose | Default |
| --- | --- | --- |
| `voiceGreeting` | Spoken phrase played after explicit start | `SamGPT online. I'm listening. How can I help you?` |
| `voiceSelection` | Edge TTS voice ID | `en-IN-NeerjaNeural` |
| `speechSpeed`, `speechPitch`, `speechVolume` | Synthesis controls supported by Edge TTS | `+0%`, `+0Hz`, `+0%` |
| `language` | Whisper language, or `auto` | `en` |
| `microphoneSelection`, `speakerSelection` | ALSA input/output identifiers | `default` |
| `conversationMode` | Reopen capture after each spoken answer | `false` |
| `silenceTimeout` | End an utterance after speech followed by silence | `1.2` seconds |
| `noSpeechTimeout` | Stop when no speech starts | `5` seconds |
| `maxRecordingTime` | Hard cap for one recording | `15` seconds |

Continuous mode is opt-in. Turning it off returns to idle after one response. The app does not keep recording while idle.
While listening, **Mute mic** replaces incoming samples with silence before they are written to the temporary WAV or passed to VAD/Whisper. Capture remains active and visibly marked until unmuted or stopped.

## Checks

Run these checks in the backend repository, without recording or sending audio:

```sh
command -v arecord
command -v aplay
command -v ffplay
arecord -L
aplay -L
venv/bin/python -m pip install -r requirements-voice.txt
venv/bin/python -c 'import faster_whisper, edge_tts; print("voice Python dependencies available")'
venv/bin/python -c 'import edge_tts; print("edge-tts", edge_tts.__version__)'
```

Select the actual ALSA identifiers shown by `arecord -L` and `aplay -L` in Settings. A listed device proves discovery only; it does not prove capture or audible output.

## Common failures

### Microphone permission or no input device

The desktop app uses Linux `arecord`; it does not show a browser permission dialog. Confirm that the logged-in desktop user can access the selected ALSA input, that the device is not busy in another application, and that the identifier still appears in `arecord -L`. Set the input to `default` to use the system default. Restart the voice session after changing settings. The app reports `MICROPHONE_FAILED` when the recorder cannot capture.

### No speech, silence, or truncated recording

Input must be readable by `arecord` at 16 kHz, mono PCM WAV. Check microphone level and the selected input device. Increase `noiseTolerance` if ambient noise causes false speech, or lower it if normal speech is not detected; keep the maximum recording time finite. Silence/no-speech and hard duration timeouts stop capture automatically. Empty transcripts do not call the model.

### Whisper unavailable or slow to start

Check `<backend-repo>/venv/bin/python` and install `faster-whisper` in that environment if needed. The `small` model runs on CPU/int8 and can take time to load or download its model data on first use. Startup and transcription have bounded timeouts. A timeout can be retried after checking model cache, CPU availability, and network access required for initial model download.

### Greeting or response synthesis fails

Check that `<backend-repo>/venv/bin/python` can import `edge_tts`, that `tts.py` exists, and that the backend can reach Edge TTS. An HTTP 403 handshake from Edge TTS requires `edge-tts` 7.3.0 or newer; install the voice requirements in the backend virtual environment, then restart the backend. The UI shows a recoverable error if audio generation fails. Update the greeting text or voice selection in Settings and retry. No alternate TTS service is silently selected.

### Audio was generated but cannot be heard

Check `ffplay` availability and the selected output identifier from `aplay -L`. Set output to `default` to use the system route. Check system volume/mute and desktop audio routing. Synthesis completion and playback completion are separate lifecycle events; a generated MP3 alone does not mean it was heard. Non-zero `ffplay` exit codes produce an audio playback error. If the binary is installed in a nonstandard location, set `SAMGPT_FFPLAY_PATH` to its absolute path before launching Electron.

To generate and play a non-private test phrase through the current desktop output, run this from the backend repository. `ffplay` returning zero verifies process playback completion; verify that the phrase is actually audible on the target device as well.

```sh
set -e
audio_file="$(mktemp --suffix=.mp3)"
trap 'rm -f "$audio_file"' EXIT
venv/bin/python tts.py --text 'SamGPT online. I am listening.' --voice en-IN-NeerjaNeural --rate=+0% --pitch=+0Hz --volume=+0% --output "$audio_file"
ffprobe -v error -show_entries format=format_name,duration -show_entries stream=codec_name,sample_rate,channels -of default=noprint_wrappers=1 "$audio_file"
ffplay -nodisp -autoexit -loglevel error "$audio_file"
```

### Settings or Electron IPC appears stale

The React app must run in the Electron shell to use the `desktopAPI` voice methods. After changing settings, the renderer notifies the backend to reload them. Restart the desktop app if the process bridge is unavailable; a browser tab cannot substitute for the Electron process IPC path.

## Privacy and diagnostics

Voice diagnostic events contain safe error codes, lifecycle names, durations, and character counts. They do not contain audio bytes, transcript text, assistant response text, access tokens, or provider credentials. The UI does show transcript and response content in the active conversation. Temporary WAV and MP3 files are created in the operating-system temporary directory and are deleted after transcription/playback or cancellation.

## Manual acceptance checklist

1. In Electron, click Start once. Confirm `starting`, audible greeting, then `listening` only after capture starts.
2. Speak one short phrase. Confirm one transcript, a response through SamGPT, and one audible spoken reply.
3. Stop while listening; verify the microphone process ends and no late response appears.
4. Stop during greeting, thinking, and speaking; verify no later stage restarts.
5. With continuous mode off, confirm return to idle. Turn it on explicitly and confirm listening resumes after playback.
6. Pause/resume playback, interrupt it, and repeat the last response. Confirm these controls act on the real audio queue.
7. Revoke/unplug the input or select an unavailable device and confirm the UI gives a recoverable error.
8. Inspect logs and confirm transcript/reply content and audio payloads are absent.

Automated fakes verify lifecycle ordering and cancellation but do not complete this hardware checklist. Do not report microphone capture or audible playback as verified until it is performed on the target desktop.
