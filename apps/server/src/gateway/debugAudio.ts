import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function encodeMonoPcm16Wav(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.byteLength, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.byteLength, 40);
  return Buffer.concat([header, pcm]);
}

export function writeDebugAudio(
  databaseFile: string,
  turnId: string,
  name: "mic-input" | "speaker-output",
  pcm: Buffer,
): string {
  const databasePath = resolve(process.cwd(), databaseFile);
  const outputDir = join(dirname(databasePath), "audio-debug");
  const outputPath = join(outputDir, `${turnId}-${name}.wav`);
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputPath, encodeMonoPcm16Wav(pcm, 16000));
  return outputPath;
}
