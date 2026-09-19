// VG-4. Realtime produces audio far faster than real time and the device ring
// buffer is about 2 s (FW-5). Queue the PCM server side and release it no more
// than LEAD_MS ahead of real-time playback, so an overrun cannot happen and a
// barge-in has almost nothing to throw away.

/** Device-bound PCM s16le mono 16 kHz: 2 bytes per sample. */
const BYTES_PER_MS = 32;

/** One downstream frame: 100 ms, small enough to refill the device smoothly. */
const FRAME_BYTES = 3200;

/** Keep enough audio ahead of the playhead to ride out network/model jitter. */
const LEAD_MS = 2000;

export class Pacer {
  private queue: Buffer[] = [];
  private queued = 0;
  /** Wall-clock time at which everything already sent will have finished playing. */
  private playheadAt = 0;
  private timer: NodeJS.Timeout | undefined;
  private ended = false;
  private stopped = false;

  constructor(
    private readonly send: (frame: Buffer) => void,
    /** Called once the queue has drained and push() has been closed. */
    private readonly onDrained: () => void,
  ) {}

  push(pcm: Buffer): void {
    if (this.stopped || pcm.byteLength === 0) return;
    this.queue.push(pcm);
    this.queued += pcm.byteLength;
    this.pump();
  }

  /** No more audio is coming; drain what is queued, then report done. */
  end(): void {
    if (this.stopped) return;
    this.ended = true;
    this.pump();
  }

  /** VG-5 barge-in: drop everything still queued and stop. */
  flush(): void {
    this.stopped = true;
    this.queue = [];
    this.queued = 0;
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
  }

  /** Milliseconds of audio still waiting to go out. */
  get pendingMs(): number {
    return Math.round(this.queued / BYTES_PER_MS);
  }

  private pump(): void {
    if (this.stopped) return;
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }

    const now = Date.now();
    if (this.playheadAt < now) this.playheadAt = now;

    while (this.queued > 0 && this.playheadAt - now <= LEAD_MS) {
      const frame = this.take();
      if (!frame) break;
      this.send(frame);
      this.playheadAt += frame.byteLength / BYTES_PER_MS;
    }

    if (this.queued === 0) {
      if (this.ended) { this.stopped = true; this.onDrained(); }
      return;
    }

    // Wake up when the device is back down to LEAD_MS of buffered audio.
    const wait = Math.max(this.playheadAt - Date.now() - LEAD_MS, 5);
    this.timer = setTimeout(() => { this.timer = undefined; this.pump(); }, wait);
  }

  /**
   * Pull one frame out of the queue. Emits a short final frame when the stream
   * has ended so the tail is not held back waiting for a full frame.
   */
  private take(): Buffer | undefined {
    if (this.queued === 0) return undefined;
    if (this.queued < FRAME_BYTES && !this.ended) return undefined;

    const want = Math.min(FRAME_BYTES, this.queued);
    const parts: Buffer[] = [];
    let got = 0;
    while (got < want) {
      const head = this.queue[0]!;
      const need = want - got;
      if (head.byteLength <= need) {
        parts.push(head);
        got += head.byteLength;
        this.queue.shift();
      } else {
        parts.push(head.subarray(0, need));
        this.queue[0] = head.subarray(need);
        got += need;
      }
    }
    this.queued -= got;
    return parts.length === 1 ? parts[0]! : Buffer.concat(parts, got);
  }
}
