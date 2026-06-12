from faster_whisper import WhisperModel
import sys

audio_file = sys.argv[1]

model = WhisperModel(
    "small",
    device="cpu",
    compute_type="int8"
)

segments, info = model.transcribe(
    audio_file,
    language="en",
    beam_size=5,
    vad_filter=True
)

text = ""

for segment in segments:
    text += segment.text + " "

print(text.strip())