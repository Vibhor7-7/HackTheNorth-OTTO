// Realtime pipeline: one OpenAI Realtime websocket per turn, wrapped behind
// a plain HTTP POST. Server VAD is off because the device has a button.

import { startTimer } from './timing';
import type { TurnInput, TurnResult } from './pipeline';

const MODEL = process.env.REALTIME_MODEL ?? 'gpt-realtime';
const URL = `wss://api.openai.com/v1/realtime?model=${MODEL}`;
const VOICE = process.env.REALTIME_VOICE ?? 'marin';

const INSTRUCTIONS =
  'You are a voice assistant on a small wearable device. Reply in one or two short sentences, ' +
  'conversational and natural. Never use lists, markdown, or headings.';

export async function realtimeTurn({ deviceId, pcm }: TurnInput): Promise<TurnResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  const { mark, marks } = startTimer();
  const log = (msg: string) => console.log(`[realtime ${deviceId}] ${msg}`);

  const ws = new WebSocket(URL, {
    headers: { Authorization: `Bearer ${apiKey}` },
  } as any);

  let closed = false;
  const close = (why: string) => {
    if (closed) return;
    closed = true;
    log(`closing session (${why})`);
    try { ws.close(); } catch {}
  };

  const send = (ev: Record<string, unknown>) => ws.send(JSON.stringify(ev));

  // The HTTP layer waits on this before sending headers.
  let resolveFirst!: () => void;
  let rejectFirst!: (e: Error) => void;
  const first = new Promise<void>((res, rej) => { resolveFirst = res; rejectFirst = rej; });
  let gotFirst = false;

  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const audio = new ReadableStream<Uint8Array>({
    start(c) { controller = c; },
    cancel() { close('client cancelled'); },
  });

  const fail = (err: Error) => {
    log(`error: ${err.message}`);
    if (!gotFirst) rejectFirst(err);
    else try { controller.error(err); } catch {}
    close('error');
  };

  ws.onopen = () => {
    mark('ws_open');
    send({
      type: 'session.update',
      session: {
        type: 'realtime',
        instructions: INSTRUCTIONS,
        output_modalities: ['audio'],
        audio: {
          input: {
            format: { type: 'audio/pcm', rate: 24000 },
            turn_detection: null,
            transcription: { model: 'gpt-4o-mini-transcribe' },
          },
          output: {
            format: { type: 'audio/pcm', rate: 24000 },
            voice: VOICE,
          },
        },
      },
    });
    send({ type: 'input_audio_buffer.append', audio: Buffer.from(pcm).toString('base64') });
    send({ type: 'input_audio_buffer.commit' });
    send({ type: 'response.create' });
    mark('request_sent');
  };

  ws.onmessage = (m) => {
    let ev: any;
    try { ev = JSON.parse(String(m.data)); } catch { return; }

    switch (ev.type) {
      case 'response.output_audio.delta': {
        const bytes = Buffer.from(ev.delta, 'base64');
        if (!gotFirst) {
          gotFirst = true;
          mark('first_audio_byte');
          resolveFirst();
        }
        controller.enqueue(new Uint8Array(bytes));
        break;
      }
      case 'conversation.item.input_audio_transcription.completed':
        log(`user: ${ev.transcript}`);
        break;
      case 'response.output_audio_transcript.done':
        log(`assistant: ${ev.transcript}`);
        break;
      case 'response.done': {
        mark('total');
        if (ev.response?.status === 'failed') {
          fail(new Error(JSON.stringify(ev.response.status_details ?? ev.response)));
          break;
        }
        if (!gotFirst) { fail(new Error('response finished with no audio')); break; }
        try { controller.close(); } catch {}
        close('done');
        break;
      }
      case 'error':
        fail(new Error(ev.error?.message ?? JSON.stringify(ev.error)));
        break;
    }
  };

  ws.onerror = () => fail(new Error('websocket error'));
  ws.onclose = () => {
    if (closed) return;
    closed = true;
    if (!gotFirst) rejectFirst(new Error('websocket closed before audio'));
    else try { controller.close(); } catch {}
  };

  await first;
  return { audio, marks };
}
