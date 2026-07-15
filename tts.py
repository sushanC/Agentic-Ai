import asyncio
import edge_tts
import sys
import argparse

def parse_args():
    parser = argparse.ArgumentParser(description="samGPT TTS Script using Edge-TTS")
    parser.add_argument("--text", type=str, help="Text to speak")
    parser.add_argument("--voice", type=str, default="en-IN-NeerjaNeural", help="Edge-TTS voice key")
    parser.add_argument("--rate", type=str, default="+0%", help="Speech rate adjustment (e.g. +10%% or -10%%)")
    parser.add_argument("--pitch", type=str, default="+0Hz", help="Speech pitch adjustment (e.g. +5Hz or -5Hz)")
    parser.add_argument("--volume", type=str, default="+0%", help="Speech volume adjustment (e.g. +10%% or -10%%)")
    parser.add_argument("--output", type=str, default="speech.mp3", help="Output audio file path")
    return parser.parse_known_args()

async def main():
    args, unknown = parse_args()
    
    # Handle backward compatibility: if no flags are matched but we have arguments,
    # treat the first argument as text.
    text = args.text
    if not text and len(sys.argv) > 1 and not sys.argv[1].startswith("--"):
        text = sys.argv[1]

    if not text:
        print("Error: No text provided to speak.")
        sys.exit(1)

    # Pronunciation fixes (keep existing)
    text = text.replace("Sushan", "Soo-shan")
    text = text.replace("Achar", "Ah-char")

    communicate = edge_tts.Communicate(
        text=text,
        voice=args.voice,
        rate=args.rate,
        pitch=args.pitch,
        volume=args.volume
    )

    await communicate.save(args.output)

if __name__ == "__main__":
    asyncio.run(main())