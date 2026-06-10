import asyncio
import edge_tts
import sys

text = sys.argv[1]

# pronunciation fixes
text = text.replace(
    "Sushan",
    "Soo-shan"
)

text = text.replace(
    "Achar",
    "Ah-char"
)

async def main():

    communicate = edge_tts.Communicate(
        text,
        "en-IN-NeerjaNeural"
    )

    await communicate.save(
        "speech.mp3"
    )

asyncio.run(main())