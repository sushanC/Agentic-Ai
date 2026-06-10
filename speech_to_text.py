from faster_whisper import WhisperModel
import sys

audio_file = sys.argv[1]

model = WhisperModel(
    "base",
    device="cpu"
)

segments, _ = model.transcribe(
    audio_file,
    language="en"
)

text = ""

for segment in segments:
    text += segment.text + " "

print(text.strip())