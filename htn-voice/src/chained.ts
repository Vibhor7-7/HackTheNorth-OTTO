// Chained pipeline: whisper-1 -> gpt-4o-mini (streaming) -> tts-1 (pcm).
// LLM tokens are flushed to TTS at sentence boundaries so audio starts on
// the first complete sentence, not the full reply.

import { startTimer } from './timing';
import type { TurnInput, TurnResult } from './pipeline';

const API = 'https://api.openai.com/v1';

const SYSTEM_PROMPT =
  'You are a voice assistant on a small wearable device. Reply in one or two short sentences, ' +
  'conversational and natural, like speech. Never use lists, bullet points, markdown, or headings.';

function headers() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
  return { Authorization: `Bearer ${apiKey}` };
}

// Whisper needs a container. Wrap raw s16le PCM in a 44-byte WAV header.
export function pcmToWav(pcm: Uint8Array, sampleRate = 24000, channels = 1, bits = 16): Uint8Array {
  const blockAlign = (channels * bits) / 8;
  const buf = Buffer.alloc(44 + pcm.byteLength);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + pcm.byteLength, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);            // fmt chunk size
  buf.writeUInt16LE(1, 20);             // PCM
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * blockAlign, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(bits, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(pcm.byteLength, 40);
  buf.set(pcm, 44);
  return buf;
}

export async function transcribe(pcm: Uint8Array): Promise<string> {
  const form = new FormData();
  form.append('file', new Blob([pcmToWav(pcm) as Uint8Array<ArrayBuffer>], { type: 'audio/wav' }), 'turn.wav');
  form.append('model', 'whisper-1');
  const res = await fetch(`${API}/audio/transcriptions`, { method: 'POST', headers: headers(), body: form });
  if (!res.ok) throw new Error(`whisper ${res.status}: ${await res.text()}`);
  return ((await res.json()) as { text: string }).text;
}

export async function* llmStream(userText: string): AsyncGenerator<string> {
  const res = await fetch(`${API}/chat/completions`, {
    method: 'POST',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      stream: true,
      max_tokens: 80,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userText },
      ],
    }),
  });
  if (!res.ok || !res.body) throw new Error(`chat ${res.status}: ${await res.text()}`);

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') return;
      const token = JSON.parse(data).choices?.[0]?.delta?.content;
      if (token) yield token;
    }
  }
}

// Returns a stream of raw 24 kHz s16le mono PCM. No conversion needed.
export async function tts(text: string): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(`${API}/audio/speech`, {
    method: 'POST',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'tts-1', voice: 'alloy', input: text, response_format: 'pcm' }),
  });
  if (!res.ok || !res.body) throw new Error(`tts ${res.status}: ${await res.text()}`);
  return res.body;
}

// Split accumulated text at the first sentence boundary, if any.
const BOUNDARY = /[.!?…]+["')\]]?\s/;
function takeSentence(buf: string): [string, string] | null {
  const m = BOUNDARY.exec(buf);
  if (!m) return null;
  const end = m.index + m[0].length;
  return [buf.slice(0, end).trim(), buf.slice(end)];
}

export async function chainedTurn({ deviceId, pcm }: TurnInput): Promise<TurnResult> {
  const { mark, marks } = startTimer();
  const log = (msg: string) => console.log(`[chained ${deviceId}] ${msg}`);

  const text = await transcribe(pcm);
  mark('transcribe');
  log(`user: ${text}`);

  let resolveFirst!: () => void;
  let rejectFirst!: (e: Error) => void;
  const first = new Promise<void>((res, rej) => { resolveFirst = res; rejectFirst = rej; });
  let gotFirst = false;

  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let cancelled = false;
  const audio = new ReadableStream<Uint8Array>({
    start(c) { controller = c; },
    cancel() { cancelled = true; },
  });

  // TTS requests start as soon as each sentence completes, but their audio is
  // piped in order, so sentence N+1 synthesises while sentence N plays.
  const queue: Promise<ReadableStream<Uint8Array>>[] = [];
  let producerDone = false;
  let wake = () => {};
  const push = (s: string) => { if (s) { queue.push(tts(s)); wake(); } };

  const consumer = (async () => {
    let i = 0;
    while (!cancelled) {
      if (i < queue.length) {
        const reader = (await queue[i++]).getReader();
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (cancelled) { reader.cancel(); return; }
          if (!gotFirst) { gotFirst = true; mark('tts_first_byte'); mark('first_audio_byte'); resolveFirst(); }
          controller.enqueue(value);
        }
      } else if (producerDone) {
        return;
      } else {
        await new Promise<void>((r) => { wake = r; });
      }
    }
  })();

  (async () => {
    try {
      let buf = '';
      let full = '';
      for await (const tok of llmStream(text)) {
        if (!full) mark('llm_first_token');
        buf += tok;
        full += tok;
        let cut: [string, string] | null;
        while ((cut = takeSentence(buf))) { push(cut[0]); buf = cut[1]; }
      }
      push(buf.trim());
      log(`assistant: ${full.trim()}`);
      if (queue.length === 0) throw new Error('empty reply');
      producerDone = true;
      wake();
      await consumer;
      mark('total');
      controller.close();
    } catch (err: any) {
      log(`error: ${err.message}`);
      producerDone = true;
      wake();
      if (!gotFirst) rejectFirst(err);
      else try { controller.error(err); } catch {}
    }
  })();

  await first;
  return { audio, marks };
}
