import { Elysia } from 'elysia';
import { realtimeTurn } from './realtime';
import { chainedTurn } from './chained';
import { logTimings, timingHeaders } from './timing';
import type { TurnInput, TurnResult } from './pipeline';

const MODE = (process.env.MODE ?? 'realtime') as 'realtime' | 'chained';
const PORT = Number(process.env.PORT ?? 3000);

const pipelines: Record<string, (t: TurnInput) => Promise<TurnResult>> = {
  realtime: realtimeTurn,
  chained: chainedTurn,
};
const runTurn = pipelines[MODE];
if (!runTurn) throw new Error(`MODE must be 'realtime' or 'chained', got '${MODE}'`);

const app = new Elysia()
  .get('/', () => Bun.file('public/index.html'))
  .get('/v1/health', () => ({ ok: true, mode: MODE, uptime_s: Math.round(process.uptime()) }))
  .post(
    '/v1/turn',
    async ({ body, request, set }) => {
      const deviceId = request.headers.get('x-device-id') ?? 'unknown';
      const pcm = new Uint8Array(body as ArrayBuffer);

      if (pcm.byteLength < 2400) {
        set.status = 400;
        return { error: 'body too short: expected raw pcm s16le 24kHz mono' };
      }

      console.log(`[turn] device=${deviceId} in=${pcm.byteLength}B (${(pcm.byteLength / 48000).toFixed(2)}s)`);

      // Headers are sent once the first audio chunk exists, so the timing
      // headers carry real values. `total` is logged when the stream ends.
      let result: TurnResult;
      try {
        result = await runTurn({ deviceId, pcm });
      } catch (err: any) {
        console.error(`[turn] device=${deviceId} failed: ${err.message}`);
        set.status = 502;
        return { error: err.message };
      }

      const tap = new TransformStream<Uint8Array, Uint8Array>({
        flush() { logTimings(deviceId, MODE, result.marks); },
      });

      return new Response(result.audio.pipeThrough(tap), {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Cache-Control': 'no-store',
          'Access-Control-Expose-Headers': '*',
          ...timingHeaders(result.marks),
        },
      });
    },
    { parse: 'arrayBuffer' },
  )
  .listen(PORT);

console.log(`voice gateway listening on http://localhost:${app.server?.port} (mode=${MODE})`);
