import assert from "node:assert/strict";
import test from "node:test";
import { Pcm16Resampler } from "./resample";

function pcm(samples: number[]): Buffer {
  const result = Buffer.alloc(samples.length * 2);
  samples.forEach((sample, index) => result.writeInt16LE(sample, index * 2));
  return result;
}

test("resamples streaming PCM across chunk boundaries", () => {
  const up = new Pcm16Resampler(16000, 24000);
  const upsampled = Buffer.concat([up.process(pcm([0, 1000])), up.process(pcm([2000, 3000]))]);
  assert.equal(upsampled.byteLength / 2, 5);

  const down = new Pcm16Resampler(24000, 16000);
  const restored = down.process(upsampled);
  assert.equal(restored.byteLength / 2, 3);
  assert.deepEqual([restored.readInt16LE(0), restored.readInt16LE(2), restored.readInt16LE(4)], [0, 1000, 2000]);
});
