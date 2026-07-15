import sys
import json
import os
from faster_whisper import WhisperModel

def main():
    # Force stdin/stdout to flush immediately
    sys.stdout.reconfigure(line_buffering=True)
    sys.stdin.reconfigure(line_buffering=True)

    # Load the Whisper model ONCE
    model = WhisperModel(
        "small",
        device="cpu",
        compute_type="int8"
    )
    print("READY", flush=True)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            data = json.loads(line)
            audio_file = data.get("audio_file")
            language = data.get("language", "en")

            if not audio_file or not os.path.exists(audio_file):
                print(json.dumps({"error": f"Audio file not found: {audio_file}"}), flush=True)
                continue

            # If language is "auto", set it to None to let Whisper detect it
            lang_param = None if language == "auto" or not language else language

            segments, info = model.transcribe(
                audio_file,
                language=lang_param,
                beam_size=5,
                vad_filter=True
            )
            
            text = ""
            for segment in segments:
                text += segment.text + " "
            
            result = {
                "text": text.strip(),
                "detected_language": info.language if info else None,
                "language_probability": info.language_probability if info else 1.0,
            }
            print(json.dumps(result), flush=True)
        except Exception as e:
            print(json.dumps({"error": str(e)}), flush=True)

if __name__ == "__main__":
    # Maintain backward compatibility if file path is passed as command-line arg
    if len(sys.argv) > 1:
        audio_file = sys.argv[1]
        if not os.path.exists(audio_file):
            print(f"Error: {audio_file} not found")
            sys.exit(1)
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
    else:
        main()