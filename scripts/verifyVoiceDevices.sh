#!/usr/bin/env bash
set -uo pipefail

BACKEND_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/samgpt-voice-check.XXXXXX")"
chmod 700 "$WORK_DIR"
trap 'rm -rf -- "$WORK_DIR"' EXIT

PYTHON="$BACKEND_ROOT/venv/bin/python"
TTS_AUDIO="$WORK_DIR/greeting.mp3"
MIC_AUDIO="$WORK_DIR/microphone.wav"

if [[ ! -x "$PYTHON" ]]; then
  echo "VOICE_CHECK_ERROR code=PYTHON_EXECUTABLE_MISSING path=$PYTHON"
  exit 2
fi

echo "== Runtime versions =="
"$PYTHON" --version
"$PYTHON" -m pip show edge-tts faster-whisper | awk '/^(Name|Version):/ {print}'
ffplay -version 2>/dev/null | head -n 1

echo "== Edge TTS synthesis =="
"$PYTHON" - "$BACKEND_ROOT/tts.py" "$TTS_AUDIO" <<'PY'
import subprocess, sys, time
script, output = sys.argv[1:]
start = time.perf_counter()
try:
    result = subprocess.run([
        sys.executable, script, "--text", "SamGPT voice verification.",
        "--voice", "en-IN-NeerjaNeural", "--rate=+0%", "--pitch=+0Hz",
        "--volume=+0%", "--output", output,
    ], capture_output=True, text=True, timeout=120)
except subprocess.TimeoutExpired:
    print("VOICE_CHECK_ERROR code=TTS_TIMEOUT")
    raise SystemExit(3)
elapsed = (time.perf_counter() - start) * 1000
if result.returncode:
    diagnostic = result.stderr.strip().splitlines()
    code = diagnostic[-1].strip()[:80] if diagnostic else "EDGE_TTS_GENERATION_FAILED"
    print(f"VOICE_CHECK_ERROR code={code}")
    raise SystemExit(3)
import os
print(f"tts_generation_ms={elapsed:.1f} audio_bytes={os.path.getsize(output)}")
PY
if [[ $? -ne 0 ]]; then exit 3; fi

echo "== Audio file validation =="
ffprobe -v error -show_entries format=format_name,duration -of default=noprint_wrappers=1 "$TTS_AUDIO" || exit 4

echo "== Speaker playback process =="
echo "Listen for the phrase 'SamGPT voice verification.'"
echo "MANUAL_CHECK: record whether the phrase was physically audible; ffplay exit 0 alone is not proof."
"$PYTHON" - "$TTS_AUDIO" <<'PY'
import subprocess, sys, time
start = time.perf_counter()
try:
    result = subprocess.run(["ffplay", "-nodisp", "-autoexit", "-loglevel", "error", sys.argv[1]], capture_output=True, timeout=15)
    status = result.returncode
except subprocess.TimeoutExpired:
    status = 124
print(f"playback_process_ms={(time.perf_counter()-start)*1000:.1f} ffplay_exit={status} (exit 0 confirms process completion only; record whether audio was heard)")
raise SystemExit(0 if status == 0 else 1)
PY
PLAY_STATUS=$?
if [[ "$PLAY_STATUS" -ne 0 ]]; then echo "VOICE_CHECK_ERROR code=AUDIO_PLAYBACK_FAILED"; fi

echo "== Microphone devices =="
if command -v wpctl >/dev/null 2>&1; then wpctl status; fi
arecord -l 2>&1 || true
arecord -L 2>&1 | head -n 30 || true
MIC_DEVICE="${SAMGPT_ALSA_INPUT:-default}"
echo "Choose the phrase you will speak during the next five seconds:"
echo "  1) SamGPT, open notes."
echo "  2) Please turn on the lights."
echo "  3) What is the weather today?"
read -r -p 'Phrase number [1-3]: ' PHRASE_CHOICE
case "$PHRASE_CHOICE" in
  1) EXPECTED_PHRASE='SamGPT, open notes.' ;;
  2) EXPECTED_PHRASE='Please turn on the lights.' ;;
  3) EXPECTED_PHRASE='What is the weather today?' ;;
  *) echo 'VOICE_CHECK_ERROR code=INVALID_TEST_PHRASE'; exit 2 ;;
esac
echo "Speak the selected phrase during the next five seconds (recording is deleted automatically)."
"$PYTHON" - "$MIC_DEVICE" "$MIC_AUDIO" <<'PY'
import subprocess, sys, time
device, output = sys.argv[1:]
start = time.perf_counter()
try:
    result = subprocess.run(["arecord", "-D", device, "-f", "S16_LE", "-r", "16000", "-c", "1", "-d", "5", output], capture_output=True, timeout=10)
except subprocess.TimeoutExpired:
    print("VOICE_CHECK_ERROR code=MICROPHONE_CAPTURE_TIMEOUT")
    raise SystemExit(1)
print(f"microphone_capture_total_ms={(time.perf_counter()-start)*1000:.1f} arecord_exit={result.returncode}")
raise SystemExit(result.returncode)
PY
MIC_STATUS=$?
if [[ "$MIC_STATUS" -ne 0 ]]; then
  echo "VOICE_CHECK_ERROR code=MICROPHONE_UNAVAILABLE device=$MIC_DEVICE"
  echo 'Check arecord -l, Linux audio permissions, and the selected ALSA/PipeWire device.'
  exit 5
fi

"$PYTHON" - "$MIC_AUDIO" <<'PY'
import math, struct, sys, wave
with wave.open(sys.argv[1], "rb") as source:
    data = source.readframes(source.getnframes())
if not data:
    print("VOICE_CHECK_ERROR code=MICROPHONE_EMPTY_AUDIO")
    raise SystemExit(1)
values = [sample[0] for sample in struct.iter_unpack("<h", data[:len(data) - len(data) % 2])]
rms = math.sqrt(sum(value * value for value in values) / max(1, len(values)))
print(f"microphone_rms={rms:.1f}")
if rms < 30:
    print("VOICE_CHECK_ERROR code=MICROPHONE_SILENT")
    raise SystemExit(1)
PY
if [[ $? -ne 0 ]]; then exit 5; fi

echo "== Faster Whisper load and transcription =="
"$PYTHON" - "$MIC_AUDIO" "$EXPECTED_PHRASE" "${SAMGPT_VOICE_DIAGNOSTICS:-0}" <<'PY'
import re
import sys, time
try:
    from faster_whisper import WhisperModel
except Exception:
    print("VOICE_CHECK_ERROR code=WHISPER_DEPENDENCY_MISSING")
    raise SystemExit(1)
audio, expected, diagnostics = sys.argv[1:]
try:
    start = time.perf_counter()
    model = WhisperModel("small", device="cpu", compute_type="int8")
    loaded = time.perf_counter()
    segments, info = model.transcribe(
        audio, language="en", beam_size=5, vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 400},
        condition_on_previous_text=False,
    )
    text = " ".join(segment.text for segment in segments).strip()
    finished = time.perf_counter()
except Exception:
    print("VOICE_CHECK_ERROR code=WHISPER_INFERENCE_FAILED")
    raise SystemExit(1)
def words(value):
    return re.findall(r"[a-z0-9]+", value.casefold())

def word_error_rate(reference, hypothesis):
    ref, hyp = words(reference), words(hypothesis)
    row = list(range(len(hyp) + 1))
    for i, token in enumerate(ref, 1):
        current = [i]
        for j, other in enumerate(hyp, 1):
            current.append(min(current[-1] + 1, row[j] + 1, row[j - 1] + (token != other)))
        row = current
    return row[-1] / max(1, len(ref))

wer = word_error_rate(expected, text)
print(f"whisper_model_load_s={loaded-start:.2f} transcription_s={finished-loaded:.2f} transcript_characters={len(text)} language_probability={getattr(info, 'language_probability', 0):.3f} wer_percent={wer*100:.1f}")
if not text:
    print("VOICE_CHECK_ERROR code=TRANSCRIPTION_EMPTY")
    raise SystemExit(6)
print("transcription=nonempty (content suppressed; this is a phrase-level spot check, not a benchmark)")
if diagnostics == "1":
    print("LOCAL_OPT_IN_TRANSCRIPT=" + text)
PY
STT_STATUS=$?
if [[ "$STT_STATUS" -ne 0 ]]; then exit "$STT_STATUS"; fi

echo "== Cleanup =="
echo "Temporary MP3 and microphone WAV are removed when this script exits."
if [[ "$PLAY_STATUS" -ne 0 ]]; then exit 7; fi
