import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { VadDetector } from "../../features/voice/VadDetector.js";
import { classifyCapturedAudio, finishRecordingStream } from "../../features/voice/sttService.js";

const wavHeader = Buffer.alloc(44);
wavHeader.write("RIFF", 0, "ascii");
wavHeader.writeUInt32LE(36 + 320, 4);
wavHeader.write("WAVE", 8, "ascii");
wavHeader.write("fmt ", 12, "ascii");
wavHeader.writeUInt32LE(16, 16);
wavHeader.writeUInt16LE(1, 20);
wavHeader.writeUInt16LE(1, 22);
wavHeader.writeUInt32LE(16000, 24);
wavHeader.writeUInt32LE(32000, 28);
wavHeader.writeUInt16LE(2, 32);
wavHeader.writeUInt16LE(16, 34);
wavHeader.write("data", 36, "ascii");
wavHeader.writeUInt32LE(320, 40);

// Header bytes split across arbitrary recorder chunks must not be treated as PCM.
{
  const vad = new VadDetector({ noiseTolerance: 300, noSpeechTimeout: 0.02 });
  const first = vad.processChunk(wavHeader.subarray(0, 19));
  const second = vad.processChunk(wavHeader.subarray(19));
  assert.equal(first.isHeader, true);
  assert.equal(second.isHeader, true);
  assert.equal(vad.voiceActive, false);
  assert.equal(vad.totalDuration, 0);

  const silence = Buffer.alloc(640);
  const silent = vad.processChunk(silence);
  assert.equal(silent.isSpeech, false);
  assert.equal(silent.noSpeechTimeout, true);
}

// Speech after a complete WAV header is measured as audio and activates VAD.
{
  const vad = new VadDetector({ noiseTolerance: 300 });
  vad.processChunk(wavHeader);
  const pcm = Buffer.alloc(320);
  for (let offset = 0; offset < pcm.length; offset += 2) pcm.writeInt16LE(1200, offset);
  const result = vad.processChunk(pcm);
  assert.equal(result.speechDetected, true);
  assert.equal(result.voiceActive, true);
  assert.equal(result.rms, 1200);
  assert.equal(result.totalDuration, 0.01);
}

assert.equal(classifyCapturedAudio(0, 4044, false), "AUDIO_TOO_SHORT");
assert.equal(classifyCapturedAudio(4044, 4044, false), "AUDIO_TOO_SHORT");
assert.equal(classifyCapturedAudio(5000, 4044, false), "NO_SPEECH_DETECTED");
assert.equal(classifyCapturedAudio(5000, 4044, true), null);
console.log("STT audio format tests passed.");

// Transcription must wait for the file stream's final flush callback.
{
  let flushed = false;
  const stream = new Writable({
    write(_chunk, _encoding, callback) { callback(); },
    final(callback) { setTimeout(() => { flushed = true; callback(); }, 15); },
  });
  stream.write(Buffer.from("audio"));
  await finishRecordingStream(stream);
  assert.equal(flushed, true);
}

console.log("STT file flush test passed.");
