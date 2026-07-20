import sys
import json
import os
import time
import math
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

            # If language is "auto", set to None to let Whisper auto-detect
            lang_param = None if language == "auto" or not language else language

            start_time = time.perf_counter()

            beam_size = data.get("beam_size", 1)

            segments, info = model.transcribe(
                audio_file,
                language=lang_param,
                beam_size=beam_size,
                vad_filter=True
            )
            
            text = ""
            total_logprob = 0
            segment_count = 0
            
            # segments is a generator; iterating over it actually performs the transcription
            for segment in segments:
                text += segment.text + " "
                total_logprob += segment.avg_logprob
                segment_count += 1
            
            avg_logprob = total_logprob / segment_count if segment_count > 0 else 0
            confidence = math.exp(avg_logprob) if segment_count > 0 else 1.0
            processing_duration = time.perf_counter() - start_time
            
            result = {
                "text": text.strip(),
                "detected_language": info.language if info else None,
                "language_probability": info.language_probability if info else 1.0,
                "confidence": confidence,
                "duration": info.duration if info else 0.0,
                "processing_duration": processing_duration
            }
            print(json.dumps(result), flush=True)
        except Exception as e:
            # Output error as JSON, preventing daemon crash
            print(json.dumps({"error": str(e), "text": ""}), flush=True)

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