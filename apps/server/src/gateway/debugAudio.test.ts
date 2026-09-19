import assert from "node:assert/strict";
import test from "node:test";
import { encodeMonoPcm16Wav } from "./debugAudio";

test("wraps mono PCM16 in a valid WAV header", () => {
  const pcm = Buffer.from([0x34, 0x12, 0xcc, 0xed]);
  const wav = encodeMonoPcm16Wav(pcm, 16000);

  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.readUInt32LE(4), 40);
  assert.equal(wav.toString("ascii", 8, 12), "WAVE");
  assert.equal(wav.readUInt16LE(20), 1);
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt32LE(24), 16000);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.readUInt32LE(40), pcm.byteLength);
  assert.deepEqual(wav.subarray(44), pcm);
});
