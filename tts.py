import asyncio
import edge_tts
import sys
import argparse
import sys


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
    print("ARGV:", repr(sys.argv), file=sys.stderr)

    args, unknown = parse_args()
    
    # Handle backward compatibility: if no flags are matched but we have arguments,
    # treat the first argument as text.
    text = args.text
    if not text and len(sys.argv) > 1 and not sys.argv[1].startswith("--"):
        text = sys.argv[1]

    if not text:
        print("Error: No text provided to speak.")
        sys.exit(1)

    # Pronunciation dictionary — fixes common Edge-TTS mispronunciations
    # Applied after sanitization, before synthesis.
    pronunciation_fixes = [
        # Proper names
        ("Sushan", "Soo-shan"),
        ("Achar", "Ah-char"),
        # Technical terms that TTS often mispronounces as single words
        ("GitHub", "Git Hub"),
        ("GitLab", "Git Lab"),
        ("DevOps", "Dev Ops"),
        ("PostgreSQL", "Postgres Q L"),
        ("MongoDB", "Mongo D B"),
        ("ChatGPT", "Chat G P T"),
        ("OpenAI", "Open A I"),
        ("samGPT", "Sam G P T"),
        # Units that should be spelled out when standalone
        ("px", "pixels"),
        ("ms", "milliseconds"),
        # Avoid reading symbols as punctuation
        ("->", "arrow"),
        ("=>", "arrow"),
        ("!=", "not equal to"),
        (">=", "greater than or equal to"),
        ("<=", "less than or equal to"),
        ("==", "equal to"),
    ]
    for original, spoken in pronunciation_fixes:
        text = text.replace(original, spoken)

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