import type { Timings } from './timing';

// What both pipelines return: a stream of raw PCM chunks (24 kHz, s16le, mono)
// and the timing marks collected so far. The HTTP layer awaits `firstChunk`
// before sending headers so the header timings are real.
export interface TurnResult {
  audio: ReadableStream<Uint8Array>;
  marks: Timings;
}

export interface TurnInput {
  deviceId: string;
  pcm: Uint8Array;
}
