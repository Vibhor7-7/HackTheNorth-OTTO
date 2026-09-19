# htn-voice

Voice assistant gateway for an ESP32 wearable. The device POSTs raw PCM, the
server streams raw PCM back. Bun + Elysia, OpenAI Realtime API behind a plain
HTTP contract. A browser test client stands in for the hardware.

## Setup

```sh
bun install
cp .env.example .env   # add your OPENAI_API_KEY
bun run dev            # http://localhost:3000
```

Open http://localhost:3000, press the button, talk, press again.

## Env vars

| Var              | Default        | Notes                                       |
|------------------|----------------|---------------------------------------------|
| `OPENAI_API_KEY` | required       | platform.openai.com key                     |
| `MODE`           | `realtime`     | `realtime` (websocket) or `chained` (whisper -> gpt-4o-mini -> tts-1) |
| `PORT`           | `3000`         |                                             |
| `REALTIME_MODEL` | `gpt-realtime` | realtime mode only                          |
| `REALTIME_VOICE` | `marin`        | realtime mode only                          |

## Contract

```
POST /v1/turn
  Content-Type: application/octet-stream
  X-Device-Id: <string>
  Body: raw PCM, 24000 Hz, 16-bit signed LE, mono. No header, no wrapper.

200 OK, Content-Type: application/octet-stream, chunked
  Body: raw PCM, 24000 Hz, 16-bit signed LE, mono, streamed as produced.
  X-Timing-* headers: ms per stage, measured up to the first audio byte.
```

`GET /v1/health` returns `{ ok, mode, uptime_s }`.

Errors return JSON with a `502` (upstream) or `400` (bad body).

## curl

Record a 24 kHz s16le mono file, send it, play the reply:

```sh
# 4 seconds from the default mic (macOS)
ffmpeg -f avfoundation -i ":0" -t 4 -ar 24000 -ac 1 -f s16le -acodec pcm_s16le question.pcm

curl -sS -X POST http://localhost:3000/v1/turn \
  -H 'Content-Type: application/octet-stream' \
  -H 'X-Device-Id: curl-test' \
  --data-binary @question.pcm \
  -D - -o reply.pcm

ffplay -f s16le -ar 24000 -ch_layout mono reply.pcm
```

Or pipe straight into ffplay so it plays while the response streams:

```sh
curl -sS -X POST http://localhost:3000/v1/turn \
  -H 'Content-Type: application/octet-stream' \
  -H 'X-Device-Id: curl-test' \
  --data-binary @question.pcm \
  | ffplay -f s16le -ar 24000 -ch_layout mono -nodisp -autoexit -
```

## Layout

```
src/index.ts     Elysia server, routes, HTTP streaming
src/realtime.ts  Realtime websocket per turn, no server VAD
src/chained.ts   whisper-1 -> gpt-4o-mini (stream) -> tts-1 pcm, sentence flush
src/timing.ts    per-stage timing marks and headers
public/index.html  browser test client
```

## Notes

- Realtime and tts-1 both emit 24 kHz s16le mono, so no resampling happens.
- Every Realtime session is closed on completion, error, and client disconnect.
- Response headers go out when the first audio chunk is ready, so the
  `X-Timing-*` values are real; `total` is only logged server-side.
- Stage timings per turn are printed to stdout as `[turn] device=... stage=ms`.
