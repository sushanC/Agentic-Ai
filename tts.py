import asyncio
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
        raise ValueError("No text provided")

    try:
        import edge_tts
    except ModuleNotFoundError as error:
        if error.name == "edge_tts":
            print("EDGE_TTS_DEPENDENCY_MISSING", file=sys.stderr)
            raise SystemExit(2)
        raise

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
    try:
        asyncio.run(main())
    except SystemExit:
        raise
    except Exception as error:
        status = getattr(error, "status", None)
        name = type(error).__name__
        if status:
            print(f"EDGE_TTS_HTTP_{int(status)}", file=sys.stderr)
        elif name in {"ClientConnectorError", "ClientConnectionError", "ServerDisconnectedError", "TimeoutError"}:
            print("EDGE_TTS_NETWORK_FAILED", file=sys.stderr)
        elif isinstance(error, ValueError):
            print("EDGE_TTS_INVALID_INPUT", file=sys.stderr)
        else:
            # Emit only a stable class name. Do not write traceback URLs,
            # request headers, or user-provided text to logs.
            safe_name = "".join(character for character in name if character.isalnum() or character == "_")[:64]
            print(f"EDGE_TTS_FAILED:{safe_name or 'UNKNOWN'}", file=sys.stderr)
        sys.exit(1)
