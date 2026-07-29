import sys
import json
import os
import time
import math
from faster_whisper import WhisperModel

HALLUCINATION_PATTERNS = {
    "thank you", "thank you.", "thanks", "thanks for watching", 
    "thanks for watching!", "subtitles by", "bye bye", "bye bye.", 
    "bye", "you", "mbc", "amara.org", "subscribe", "subtitles by.", 
    "thank you very much.", "see you next time.", "goodbye."
}

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

            lang_param = None if language == "auto" or not language else language

            start_time = time.perf_counter()

            beam_size = data.get("beam_size", 5)

            segments, info = model.transcribe(
                audio_file,
                language=lang_param,
                beam_size=beam_size,
                vad_filter=True,
                vad_parameters=dict(min_silence_duration_ms=400),
                condition_on_previous_text=False,
                initial_prompt="Hello, hi, open notes, what is the weather." if lang_param == "en" else None
            )
            
            text = ""
            total_logprob = 0.0
            segment_count = 0
            
            for segment in segments:
                text += segment.text + " "
                total_logprob += segment.avg_logprob
                segment_count += 1
            
            avg_logprob = total_logprob / segment_count if segment_count > 0 else -10.0
            confidence = math.exp(avg_logprob) if segment_count > 0 else 0.0
            processing_duration = time.perf_counter() - start_time
            
            cleaned_text = text.strip()
            lower_text = cleaned_text.lower()

            # Filter out silence hallucinations if confidence is low or text matches artifact patterns
            if lower_text in HALLUCINATION_PATTERNS and (confidence < 0.65 or (info and info.language_probability < 0.6)):
                cleaned_text = ""

            result = {
                "text": cleaned_text,
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
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=400),
            condition_on_previous_text=False
        )
        text = ""
        for segment in segments:
            text += segment.text + " "
        print(text.strip())
    else:
        main()