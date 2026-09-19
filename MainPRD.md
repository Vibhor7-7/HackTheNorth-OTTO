# Otto - Product Requirements and Implementation Spec

| | |
|---|---|
| Event | Hack the North 2026 |
| Spec version | 1.6.0 (supersedes 1.5.0) |
| Product name | **Otto.** The device, the agent, and the app are all Otto. Use the name in the system prompt, the app, and the pitch. |
| Status | **Final for build.** Open decisions in Section 13 only. |
| Tracks | OpenAI API Prizes, Composio, Expo (primary). Rox (natural fit, no extra work). Shopify: cut (D-25). Elastic: cut (D-12). |


---

## 0. How to use this document

Single source of truth. Written for teammates and for AI coding assistants (Codex, Claude Code).

**Conventions**

- Every requirement has a stable ID (`FW-3`, `VG-7`, `CMP-2`). IDs are never reused. Removed items are struck through and tagged `[REMOVED]`.
- Priority: `P0` = demo does not work without it. `P1` = demo is great with it. `P2` = stretch. **No P1 in a component until its P0s pass. No P2 until all three demo scenarios pass end to end.**
- Status tags inline: `[TODO]` `[WIP]` `[DONE]` `[CUT]`.
- Values marked `(proposed)` may be changed by the component owner. Update here when you change code.

**Rules for AI assistants working in this repo**

1. Read this file first. Reference requirement IDs in commit messages (`VG-4: pace downstream audio`).
2. Section 7 contracts are binding. A contract change means: stop, propose, update Section 7 and the Changelog in the same commit.
3. Ambiguous or conflicting requirement: ask, do not guess. If a Section 13 item blocks you, say so.
4. Do not build anything in Non-goals (1.4). Do not add features not in this spec.
5. Simplest thing that satisfies the requirement. There is no budget for a second attempt.
6. No hardcoded secrets. Everything from env (5.2).
7. **Verify third-party API shapes against current docs before coding them.** Realtime event names, Composio SDK method names, and Expo APIs all changed in the last year. Docs are linked inline. Do not code from memory.

---

## 1. Overview

### 1.1 One-liner

Otto is a push-to-talk wearable that lets you hand off real tasks by voice, anywhere. Otto finds and connects whatever tools the task needs, does the work, and asks you before anything risky.

### 1.2 Problem

Voice assistants answer questions but cannot get work done across your real tools. Agents can do real work but live in a chat window and need per-tool setup. People think of tasks while walking, cooking, or between meetings, when a laptop is not an option and pulling out a phone means the thought dies.

### 1.3 Solution and what is different

- **Hardware first.** One button, no screen, no wake word. Hold, speak, release. Capture takes four seconds.
- **Acts, not records.** Note-taking wearables produce a document. This one produces a completed task.
- **Do anything anywhere.** No integration setup. The agent searches 1,500+ apps at runtime, and if a tool needs an account it has not connected, it asks you to connect it. One tap, and the task finishes.
- **Safe by default.** Money, orders, sends on your behalf, and public changes wait for your explicit approval (D-24).
- **Not always listening.** You choose when it hears you. This is a product stance, not a limitation, and it is the answer to the privacy question before a judge asks it.

### 1.4 Non-goals (hackathon build)

- Multi-user accounts, sign-up, real auth. One hardcoded user (`demo-user`), one device.
- Always-on listening, wake word, on-device VAD. Push-to-talk only.
- On-device inference of any kind.
- Custom PCB or enclosure beyond what is needed to wear it on stage.
- Android polish. iOS via Expo is the demo target.
- Production security, billing, rate limiting.
- A web app (D-2).
- ~~Elasticsearch or any hosted search dependency~~ (D-12).
- ~~A hand-built MCP registry or live MCP directory crawling~~ (D-10). Composio does this.

### 1.5 Success criteria

1. All three demo scenarios (Section 8) pass end to end from the physical device, twice in a row, on the stage network path (phone hotspot + public server URL).
2. `ptt_end` to first audible response under 1.5 s p50 for conversational turns.
3. A judge with no context understands problem and solution within 30 seconds.
4. A recorded backup video exists for every demo scenario before judging.
5. Codex evidence is captured (Section 11.1) before the Devpost is written.

---

## 2. Constraints

- **Sequence.** Stage 0 in Section 9 (talk to the device, hear it back) gates everything else; if it does not pass, nothing else starts. Feature work stops when the demo locks (Section 9, stage 7); what remains after that is pitch, Devpost and video.
- **Hardware.** ESP32 with 512 KB RAM. Whole utterances cannot be buffered on device. Audio streams both directions.
- **Network.** Venue Wi-Fi is hostile to IoT (captive portals, client isolation). Device joins a phone hotspot. Server is publicly reachable over `wss://` and `https://` (laptop + cloudflared, or Railway/Fly).
- **Team.** 5 people. Section 14.
- **Money.** OpenAI Realtime bills per audio minute. A session left open streaming silence bills continuously. Every session has an idle timeout and closes on every error path (VG-13).

---

## 3. System architecture

```
 ┌──────────────┐  WS: binary PCM + JSON control   ┌───────────────────────────────────────────────┐
 │ ESP32 device │ ───────────────────────────────▶ │ SERVER (Node/TS)                              │
 │  PTT button  │ ◀─────────────────────────────── │                                               │
 │  SPH0645 mic │      paced PCM downstream        │  Voice Gateway ───WS───▶ OpenAI Realtime      │
 │  TLV320 DAC  │                                  │      │  (transcription on)   gpt-realtime      │
 └──────────────┘                                  │      │ run_task()                              │
                                                   │      ▼                                        │
 ┌──────────────┐  REST + SSE                      │  Task Agent (OpenAI Responses API tool loop)  │
 │ Expo app iOS │ ◀──────────────────────────────▶ │      │                                        │
 └──────────────┘                                  │      ▼                                        │
                                                   │  Approval Gate (risk tier R0/R1/R2)           │
                                                   │      ▼                                        │
                                                   │  Composio (discover, connect, execute)        │
                                                   │      │            ──▶ Google Calendar         │
                                                   │      │            ──▶ Gmail, GitHub          │
                                                   │      │            ──▶ 1,500+ others           │
                                                   │  Store (SQLite)                               │
                                                   └───────────────────────────────────────────────┘
```

**Two-layer brain (unchanged, important)**

- **Conversation layer.** OpenAI Realtime, audio to audio, transcription enabled. Handles the spoken turn with low latency. It has the four control tools plus a **fast lane** of exactly two read-only calendar tools (7.4, VG-16). Fast-lane calls are executed by the gateway through the same gate as everything else, with a hard timeout. Anything else goes through `run_task`.
- **Task layer.** A text LLM (OpenAI, Responses API) running a tool loop. Tools come from Composio. Slower, does the real work, runs asynchronously from the voice turn.

**Two background workers and one extra consumer (new in 1.1).**

- **Action Item Extractor** (Section 6.9). After every voice turn is persisted, a cheap OpenAI model scans the transcript for commitments the user made and writes ActionItems. The Home tab shows them; one tap turns an item into a normal Task through the same `run_task` path, so the approval gate still applies. Never on the voice path.
- **Context Agent** (Section 6.10). Backs the Chat tab. An OpenAI Responses call with read-only tools over the store (turns, tasks, memories, profile). It can start a task through `run_task` and nothing else. It never calls Composio.
- Both read the same SQLite file the gateway writes. There is one store.

**Why the voice agent gets a fast lane at all.** "Am I free at 3?" should be answered in the same breath, not handed off with "on it." Realtime function tools are executed by our gateway, so nothing bypasses the gate or the log. The only real constraint is that the voice model cannot speak while a call is outstanding, which is why the fast lane is read-only, single-call, capped at two tools, and hard-timed out at 2.5 s with escalation to `run_task` (VG-16). If the calendar tools are flaky on the venue network, delete them from the allowlist (CMP-9) and the product still works.

**Why the Task Agent sits between the LLM and Composio.** Composio can execute tools directly from an agent loop. We do not let it. Every tool call the LLM selects passes through our Approval Gate (AP-1) before `composio.tools.execute()` runs. This is what makes approval impossible to bypass and gives the app a complete step log. It is also the "decision-making under uncertainty" story for judges.

**Latency posture.** The voice path has exactly one network hop that is not OpenAI: device to server. No memory retrieval, no search, no database query happens between `ptt_end` and `response.create`. User profile context is baked into session instructions at session start (VG-10). This is why Elastic was cut (D-12).

---

## 4. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Firmware | ESP32, Arduino framework | SPH0645LM4H mic on `I2S_NUM_0`, TLV320DAC3100 on `I2S_NUM_1`. Section 6.1. |
| Server | Node 20+, TypeScript, Fastify + `ws` | D-5. Bun is an acceptable drop-in runtime if the VG owner prefers; do not change the framework. |
| Voice | OpenAI Realtime over WebSocket, server side | Model via env, default `gpt-realtime`. Input transcription `gpt-4o-transcribe` (D-13). Docs: developers.openai.com/api/docs/guides/realtime |
| Task agent LLM | OpenAI Responses API, model via env | Default: current small reasoning model (`gpt-4.1-mini` class). Resolves OD-3 (D-14). |
| Tools | **Composio** (`@composio/core` + OpenAI provider) | Discovery, managed auth, execution. Replaces custom MCP registry (D-10). Docs: docs.composio.dev |
| Store | SQLite via better-sqlite3 or Drizzle | Single file, zero setup. Memory retrieval is recency + keyword (DATA-4). |
| Mobile | Expo (React Native, TypeScript), iOS target | Expo Router, Expo UI where it helps the native feel. Docs: docs.expo.dev, `llms.txt` for agents. |
| App live updates | Server-Sent Events | One-way feed, simpler than WS. |
| Hosting | Laptop + cloudflared tunnel (default) or Railway/Fly | Must expose `wss://` and `https://`. |
| Dev tooling | Codex (CLI, app, cloud tasks) as primary coding agent | Section 11.1 for evidence requirements. |

---

## 5. Repository

### 5.1 Layout

```
/
├── SPEC.md                    <- this file
├── AGENTS.md                  <- Codex reads this: "read SPEC.md first" + run commands
├── CLAUDE.md                  <- same content, for Claude Code
├── firmware/                  <- ESP32 Arduino project
├── apps/
│   ├── server/
│   │   └── src/
│   │       ├── gateway/       <- device WS + Realtime relay (VG-*)
│   │       ├── agent/         <- task agent loop (AG-*)
│   │       ├── composio/      <- discovery, connect, execute wrappers (CMP-*)
│   │       ├── approvals/     <- risk gate + approval state machine (AP-*)
│   │       ├── extract/       <- action item extraction worker (ACT-*)
│   │       ├── chat/          <- context agent for the Chat tab (CHAT-*)
│   │       ├── api/           <- REST + SSE (7.2)
│   │       └── store/         <- schema + queries (DATA-*)
│   └── mobile/                <- Expo app (APP-*)
├── packages/
│   └── shared/                <- TS types for Section 7, imported by server and mobile
└── tools/
    └── fake-device/           <- CLI that speaks the device protocol from a laptop mic (DEV-1)
```

### 5.2 Environment variables (server)

```
PORT
PUBLIC_BASE_URL              # https://... for connect-link callbacks
DEVICE_TOKEN                 # shared secret the ESP32 presents
APP_API_KEY                  # shared secret the Expo app presents

OPENAI_API_KEY
REALTIME_MODEL               # default gpt-realtime
REALTIME_VOICE               # e.g. marin
TRANSCRIBE_MODEL             # default gpt-4o-transcribe
AGENT_MODEL                  # Responses API model for the task agent
EXTRACT_MODEL                # cheapest model that returns clean JSON (gpt-4.1-nano class), ACT-1
CHAT_MODEL                   # model for the Chat tab context agent, CHAT-1

COMPOSIO_API_KEY
COMPOSIO_USER_ID             # default demo-user

DEMO_MODE                    # true = enable fallbacks in Section 8
REALTIME_IDLE_TIMEOUT_MS     # default 60000 (VG-13)
```

No per-integration tokens. Composio holds them (CMP-2).

### 5.3 Dev tooling

| ID | Pri | Requirement |
|---|---|---|
| DEV-1 | P0 | `tools/fake-device`: connects to the device WS, streams laptop mic as PCM s16le 24 kHz with `ptt_start` / `ptt_end` on a keypress, plays downstream PCM. Unblocks all server work from hardware and is the stage fallback if the device dies. |
| DEV-2 | P0 | `pnpm dev` starts the server. `pnpm dev:mobile` starts Expo. `pnpm fake-device` starts DEV-1. All three documented in `AGENTS.md` and `CLAUDE.md`. |
| DEV-3 | P1 | `pnpm smoke`: runs S1 against the fake device with a pre-recorded utterance and asserts a calendar event was created. Run before every merge to main. |

---

## 6. Component requirements

### 6.1 Device firmware (FW)

Hardware: ESP32, SPH0645LM4H I2S MEMS mic, TLV320DAC3100 I2S DAC, 8 Ω 2 W speaker, tactile button, 3.7 V 150 mAh LiPo with USB-C charger.

| ID | Pri | Requirement |
|---|---|---|
| FW-1 | P0 | On boot join Wi-Fi (credentials compiled in), open one persistent WebSocket to `wss://<host>/device?token=<DEVICE_TOKEN>` (7.1). Send `hello`. Reconnect with exponential backoff on drop (1 s, 2 s, 4 s, cap 15 s). |
| FW-2 | P0 | Push-to-talk. Button down: send `ptt_start`, then stream mic audio as binary frames while held. Button up: send `ptt_end`. Debounce 30 ms (proposed). |
| FW-3 | P0 | Upstream audio: PCM s16le mono **24 kHz**. SPH0645 delivers 32-bit I2S frames on `I2S_NUM_0`; shift to 16-bit on device (take bits 31..14, or >> 14 then clamp). 24 kHz matches Realtime input so the server never resamples. If 24 kHz is unstable on the mic clock, fall back to 16 kHz and the server resamples; update 7.1 and log a Decision. |
| FW-4 | P0 | Never buffer a whole utterance. Capture task and send task run concurrently (FreeRTOS task + ring buffer, or I2S DMA). Upstream frame: 40 ms = 1920 bytes (proposed). |
| FW-5 | P0 | Downstream: on `WStype_BIN`, write payload to `I2S_NUM_1` (TLV320) as it arrives, via a fixed ring buffer of 96 KB (proposed, about 2 s). Server paces (VG-4). On overflow drop oldest and keep playing. If the TLV320 is configured for stereo frames, duplicate each mono sample into L and R before `i2s_write`. |
| FW-6 | P0 | Barge-in: button press during playback stops playback immediately, flushes the ring buffer, and sends `ptt_start` as usual. |
| FW-7 | P1 | LED states: connecting (slow blink), idle (off), listening (solid), thinking (fast blink), speaking (breathe), error (triple flash). |
| FW-8 | P1 | Presses under 250 ms: send `ptt_cancel`, discard. Hard cap utterances at 60 s, then send `ptt_end`. |
| FW-9 | P2 | Battery level in `hello` and periodic `status`. |
| FW-10 | P0 | Firmware speaks the JSON control protocol in 7.1. If firmware already speaks the legacy keyword protocol (`START`, `STOP`, `AUDIO_START:24000`, `AUDIO_END`), the server accepts those as aliases (VG-14). Do not rewrite firmware that already works just to change control-message format. |

### 6.2 Voice Gateway (VG)

Owner: Vibhor.

| ID | Pri | Requirement |
|---|---|---|
| VG-1 | P0 | Accept device WS, authenticate with `DEVICE_TOKEN`, exactly one active device (new connection replaces old). |
| VG-2 | P0 | Own the OpenAI Realtime WS. Device never talks to OpenAI, never holds a key. Session config per 7.5: `turn_detection: null`, input and output `audio/pcm` 24 kHz, `output_modalities: ["audio"]`, input transcription enabled. |
| VG-3 | P0 | Turn flow. `ptt_start`: send `input_audio_buffer.clear`. Each binary frame: base64 and send `input_audio_buffer.append`. `ptt_end`: send `input_audio_buffer.commit` then `response.create`. `ptt_cancel`: `input_audio_buffer.clear`, no response. |
| VG-4 | P0 | **Pace downstream audio.** Realtime produces audio faster than real time; device buffer is about 2 s. Queue `response.output_audio.delta` server side, decode base64, send to device no more than 500 ms ahead of real-time playback (proposed). Wrap each response in `speak_start` / `speak_end`. |
| VG-5 | P0 | Barge-in: `ptt_start` while a response is in flight sends `response.cancel`, drops queued downstream audio, sends `speak_end` with `reason: "interrupted"`. If a fast-lane function call (VG-16) is outstanding, abandon it: ignore its result when it returns, do not send `function_call_output`. |
| VG-6 | P0 | Register the function tools in 7.4 on the session. On `response.function_call_arguments.done`, route to the Task Agent, return output as a `conversation.item.create` of type `function_call_output`, then `response.create` so the model speaks the acknowledgement. |
| VG-7 | P0 | Server-initiated speech. When a task completes, needs input, needs approval, or needs a connection, and the device is idle: `conversation.item.create` with the text, then `response.create`. If mid-turn, queue until idle. |
| VG-8 | P0 | **Transcription.** `audio.input.transcription` set to `TRANSCRIBE_MODEL`. Persist per turn: user text from `conversation.item.input_audio_transcription.completed`, assistant text from `response.output_audio_transcript.done`. This is what the app shows and what memory is built from (DATA-1). Realtime is the only transcript source (D-13). |
| VG-9 | P1 | Session resilience: reconnect on drop or expiry, re-seed with user profile plus a two-line summary of the last three turns. Do not assume a session outlives a few minutes idle. |
| VG-10 | P0 | Session instructions (7.5): one or two spoken sentences, never lists; confirm what was understood before delegating; never claim an action is done until the Task Agent reports it; when delegating say "on it" and stop. User profile (name, timezone, top contacts) is baked into instructions at session start. **No retrieval on the voice path.** |
| VG-11 | P2 | On interrupt send `conversation.item.truncate` so model context matches what the user heard. |
| ~~VG-12~~ | | ~~Cohere Transcribe as transcript source~~ `[REMOVED]` D-13. |
| VG-13 | P0 | **Session cleanup.** Close the Realtime WS on every error path (`finally`). Idle timeout `REALTIME_IDLE_TIMEOUT_MS` (default 60 s) closes the session; VG-9 reopens on next `ptt_start`. An orphaned session streaming silence bills continuously. |
| VG-14 | P0 | Accept legacy text-frame aliases from the device and treat them as the JSON equivalents: `START` = `ptt_start`, `STOP` = `ptt_end`, `CANCEL` = `ptt_cancel`, `PING` = `ping`. When the device sent legacy frames, reply with legacy frames: `AUDIO_START:24000` = `speak_start`, `AUDIO_END` = `speak_end`, `THINKING` = `state:thinking`, `TRANSCRIPT:<text>` and `ANSWER:<text>` for transcripts. Detect mode from the first text frame. |
| VG-15 | P0 | Per-turn log line: `turn_id`, `ptt_end_at`, `first_audio_byte_at`, `latency_ms`, `user_text`, `assistant_text`, `tool_calls[]`. This is NF-1 and it is how the demo gets debugged. |
| VG-16 | P0 | **Fast lane.** The two calendar tools in 7.4 are registered on the Realtime session as function tools. On `response.function_call_arguments.done` for one of them, the gateway calls `approvals/gate.ts` (R0, passes immediately, step logged) then Composio, with a **2.5 s hard timeout**. On success: send `function_call_output` with the result and `response.create`; the model answers in the same turn. On timeout or error: send `function_call_output` of `{"status":"deferred"}` and `response.create` (the model says it will follow up), and spawn the same call as a Task through `run_task` so VG-7 speaks the answer when it lands. Log `fast_lane: true` and the duration on the step. |
| VG-17 | P1 | Fast-lane session instruction: "For questions about the user's calendar, call the calendar tool and answer directly. For anything else at all, including anything about GitHub, call run_task." Keep it to those two sentences. |

Verify event names against current Realtime docs before coding. Names changed between beta and GA.

### 6.3 Task Agent (AG)

| ID | Pri | Requirement |
|---|---|---|
| AG-1 | P0 | `run_task(goal, context)` creates a Task, returns `{task_id, status:"started"}` immediately so the voice layer says "on it", and runs the loop asynchronously. |
| AG-2 | P0 | Loop on the OpenAI Responses API with function calling: plan, select tools, call through the Approval Gate, observe, repeat until done or blocked. Max 15 tool calls and 3 minutes per task (proposed). |
| AG-3 | P0 | **Every** tool call passes through AP-1 before execution. The agent module has no import of `composio.tools.execute`; only `approvals/gate.ts` does. |
| AG-4 | P0 | Every step (plan, tool_call, tool_result, approval_wait, connection_wait, question, final, error) is a TaskStep (7.3) and is emitted on SSE. |
| AG-5 | P0 | On completion produce `spoken_summary` (under 25 words, for the device) and `detail_md` (markdown, for the app). |
| AG-6 | P0 | Missing information: set status `needs_input`, speak the question via VG-7, resume when the next voice turn answers via `answer_question` (7.4). |
| AG-7 | P0 | **Tool discovery is Composio's.** For each task: call Composio tool search with the goal (CMP-1), load only the returned tools into the loop, and write a `plan` step naming which toolkits were selected and why. This is the "agent finds its own tools" story and it is now P0 because Composio makes it cheap. |
| AG-8 | P1 | Memory: inject user profile and the three most relevant past task summaries (DATA-4) into the agent system prompt. Agent path only, never the voice path. |
| AG-9 | P0 | **Messy data handling.** When tool results conflict or are incomplete (two contacts named Sam, ambiguous timezone, missing email, a transcript that mangled a proper noun), the agent states the ambiguity and either resolves it from profile context or asks (AG-6). It never guesses silently on an R1 or R2 action. Promoted to P0 because it is the S1 demo beat and the Rox rubric. |
| AG-10 | P2 | Detect follow-up action items from a conversation and draft them for approval. |
| AG-12 | P0 | `run_task` is the single entry point for creating a Task, whether the caller is the Realtime function tool (VG-6), an approved ActionItem (ACT-3), or the Chat tab (CHAT-4). All three set `source` on the Task. No other code path creates a Task. |
| AG-11 | P0 | Every task ends in exactly one of `succeeded`, `failed`, `cancelled`. `failed` always carries a one-line `error` and a spoken summary ("I couldn't finish that because..."). The device never goes silent (NF-2). |

### 6.4 Composio integration (CMP)

Replaces the former MCP-1 to MCP-5 (D-10). Composio provides three things and we wrap each in one file.

| ID | Pri | Requirement |
|---|---|---|
| CMP-1 | P0 | **Discovery.** `composio/discover.ts`: given a task goal, select **toolkits** from those the user has set up, then load a curated tool subset for each selected toolkit and return them in OpenAI function-calling shape via Composio's OpenAI provider. Write a `plan` step naming the toolkits chosen and the top three not chosen. Tool-level `search` is a best-effort hint that may widen the candidate set; it must never be the only path, and a bare `limit` must never be passed (D-26). |
| CMP-2 | P0 | **Managed auth.** No per-integration tokens in env. Connected accounts live in Composio, scoped to `COMPOSIO_USER_ID`. Pre-connect **Google Calendar and GitHub** before the demo. Create the **Gmail** auth config but leave it **unconnected** - that absence is S0 (D-16). Creating a Connect Link needs an API key with `connected_accounts` **write** access, and uses `connectedAccounts.link(userId, authConfigId, { callbackUrl })` - `.initiate` returns 400 for Composio-managed OAuth configs, which is what every dashboard-created toolkit is. |
| CMP-3 | P0 | **Execution.** `composio/execute.ts` exposes `executeTool(slug, args)` which calls Composio execution for the user, with 30 s timeout, one retry, and structured errors. **Only `approvals/gate.ts` imports this file.** |
| CMP-4 | P0 | **Connect Link flow.** When execution returns a needs-authentication result, do not fail the task. Create a ConnectionRequest (7.3), set task status `awaiting_connection`, and surface the Connect Link in the app's "Needs you" card (APP-1, APP-7). When the user completes it, retry the exact same tool call once, then continue. This is demo scenario S0. |
| CMP-5 | P0 | **Risk tiering of Composio tools.** Tier is derived from the tool slug by rule (7.6), with an argument-level override that can raise but never lower. Unknown tools default to R2. Replaces MCP-5. |
| CMP-6 | P1 | Extensions screen data: list Composio toolkits with connection status for the user (connected / needs_auth / suggested) so APP-4 has real data. |
| CMP-7 | P1 | Cache discovery results per goal string for the session so repeated demo runs do not pay the search cost twice. |
| CMP-8 | P0 | Verify exact SDK method names for search, connect-link creation, and execution against docs.composio.dev before coding CMP-1, CMP-3, CMP-4. Tool Router is beta; pin the package version and do not rely on undocumented behaviour. |
| CMP-9 | P0 | **Fast-lane allowlist.** `composio/fastlane.ts` exports exactly two Composio tools for the voice agent: Google Calendar free/busy and Google Calendar list events for a date. Both are R0. Each carries `defaultArgs` so the model never supplies pagination, and a `shape` that projects the result down to what a spoken answer needs. Nothing else is added to this file without a Decision (D-28 removed GitHub from it). Measure each against Composio on the demo network; if p95 is over 2 s, remove it from the allowlist and the voice agent falls back to `run_task` for calendar questions with no other change. |

**Why not let Composio's Tool Router meta-tool run the whole loop.** Tool Router's native meta-tool bundles search, auth, and execute into one call. That is elegant and it would bypass AP-1. We use Composio for the three capabilities separately so the approval gate sits between LLM choice and execution. If the SDK does not expose them separately, use Composio's before-execute modifier as the gate point instead. Either way AG-3 holds.

### 6.5 Approvals (AP)

| ID | Pri | Requirement |
|---|---|---|
| AP-1 | P0 | Before every tool call, classify by tier. **R0** read-only: run. **R1** reversible write: run, log, mention in spoken summary. **R2** money, orders, sends on the user's behalf, destructive or public changes: hold for approval. |
| AP-2 | P0 | Tier comes from CMP-5. Argument override raises tier for any call with an amount, price, recipient, or `publish` field. Never lowers. |
| AP-3 | P0 | R2 flow: create Approval (`pending`) with a plain-language summary and key facts (what, to whom, how much). Task status `awaiting_approval`. It appears instantly in the Home tab's "Needs you" card over SSE (APP-1). Device speaks "check the app to confirm." |
| AP-4 | P0 | `POST /api/approvals/:id/decision` sets `approved` or `denied`, and resumes or cancels the task. Expire after 5 minutes as denied, swept on a timer as well as on read so a waiting task never hangs. |
| AP-5 | P0 | An approved action executes exactly once with exactly the arguments shown to the user (`args_hash`). Changed arguments require a new approval. |
| AP-6 | P0 | The app is the **only** confirmation surface (APP-1, Home tab "Needs you"). There is no second channel to fall back to, which makes APP-1 the most important screen in the product: it is the entire trust story on stage (D-24). |
| ~~AP-7~~ | | ~~Verify inbound sender matches `SMS_USER_PHONE`; validate provider webhook signature~~ `[REMOVED]` D-24. |
| AP-8 | P0 | ConnectionRequests (CMP-4) use the same app card as Approvals. One interaction model: the "Needs you" card fills when the agent needs you, for one of two reasons. |

### 6.6 Mobile app (APP)

Expo, iOS target, single user, `APP_API_KEY`. **Four tabs: Home, Context, Connections, Chat.** Task detail is a pushed screen reachable from Home and from Chat citations. The old Activity feed lives on Home.

**Home tab**

| ID | Pri | Requirement |
|---|---|---|
| APP-1 | P0 | **"Needs you" section**, pinned at the top. Pending Approvals (summary, key facts, Approve / Deny with haptic) and pending ConnectionRequests (Open Link). This is the **only** confirmation surface in the product (AP-6, D-24), so it carries the whole safety story: make it the best screen in the app. Arrives over SSE the instant the agent asks. Empty state: "Nothing needs you." |
| APP-3 | P0 | **Action items section.** Each open ActionItem (6.9) as a card: title, the suggested action in plain words ("Schedule via Google Calendar"), a confidence pill, and a one-line snippet of what was said. Two buttons: **Do it** (POST approve, card flips to the new Task with a live status chip) and **Dismiss**. |
| APP-13 | P0 | **Recent activity** below action items: reverse-chronological Task feed with status chip, spoken summary, timestamp. Live over SSE. Tapping opens Task detail (APP-2). |
| APP-14 | P1 | Tab badge = pending approvals + pending connections + open action items. Clears as they are handled. |
| APP-2 | P0 | **Task detail** (pushed screen). Original transcript, each step (tool, toolkit, args summary, result summary, duration), approval and connection state, final detail markdown, and `source` (voice, action item, chat). The discovery `plan` step (AG-7) renders as "Chose Google Calendar and Gmail from 1,500 apps" with the reason. |
| APP-7 | P0 | ConnectionRequests render in "Needs you" (APP-1) as a card with Open Link. Demo beat S0. On return from the link, the card resolves itself via SSE. |

**Context tab** (two sub-tabs)

| ID | Pri | Requirement |
|---|---|---|
| APP-6 | P0 | **Transcript sub-tab.** Every Turn, word for word, exactly as Realtime transcribed it: user text and Otto's reply, reverse-chronological, grouped by day, with chips linking to any Task the turn started. This is the "everything Otto heard" view; do not summarise or clean it. Search by keyword is P1. |
| APP-11 | P0 | **Add context sub-tab.** Free-text notes the user gives Otto ("Sam Chen is my manager", "I prefer morning meetings", "my usual order is..."). List, add, delete. Stored as Memories with `source: "user"` (DATA-4) and injected into the task agent (AG-8), the context agent (CHAT-1), and the Realtime instructions on next session (VG-10). |

**Connections tab**

| ID | Pri | Requirement |
|---|---|---|
| APP-4 | P0 | **Connected tools.** Every Composio toolkit visible to this user (CMP-6): name, icon, status (connected / needs auth / suggested), tool count. **Connect** opens the Connect Link from `POST /api/extensions/:id/connect`. Pull to refresh. Toolkits Otto used recently sort to the top. |
| APP-5 | P1 | **Settings section** at the bottom: device (connected, last seen, state, battery), server URL, `DEMO_MODE` indicator, and a Disconnect action per toolkit. |

**Chat tab**

| ID | Pri | Requirement |
|---|---|---|
| APP-12 | P0 | **Talk to Otto by text.** A single thread with the context agent (6.10). Streaming replies. Three suggested prompts on empty state: "What did I do today?", "What did I commit to this week?", "What's still open?". Citations render as tappable chips that open Task detail or scroll the Transcript sub-tab to that turn (CHAT-5). |
| ~~APP-9~~ | | ~~Text input to start a task from the app~~ `[REMOVED]` superseded by CHAT-4: ask Otto in the Chat tab and it starts the task. |

**Cross-cutting**

| ID | Pri | Requirement |
|---|---|---|
| APP-8 | P2 | Push notifications for approvals, connection requests, and new action items. |
| APP-10 | P0 | **Native feel.** Expo Router with a native tab bar. Expo UI native components for lists, sheets, and segmented controls where they exist. Haptics on Approve / Deny / Do it. No web-styled buttons. The Expo rubric is "beautiful, feels truly native, a joy to use"; this is a P0 for the two frontend owners, not polish. The "Needs you" card is the screen judges will see most; make it the best screen in the app. |
| APP-15 | P0 | The Home tab loads from one call, `GET /api/home`, so the first paint is fast on venue Wi-Fi. Everything after that arrives over SSE. |

### 6.7 Data and memory (DATA)

| ID | Pri | Requirement |
|---|---|---|
| DATA-1 | P0 | Persist every voice turn: user transcript, assistant transcript, timestamps, linked task IDs. Raw audio is not stored. |
| DATA-2 | P0 | Persist Task, TaskStep, Approval, ConnectionRequest, Turn per 7.3. |
| DATA-3 | P0 | Secrets never appear in TaskStep or SSE payloads. Redact argument fields named like `token`, `key`, `password`, `authorization`, `secret`. |
| DATA-4 | P0 | Memory: a profile document (name, timezone, role, frequent contacts, preferences) plus Memories with `source: "user"` (notes from APP-11) or `source: "task_summary"` (one line written when a task completes). Retrieval is recency plus SQLite `LIKE` on keywords. Sub-5 ms. Promoted to P0 because the Context tab writes to it. |
| DATA-6 | P0 | Persist ActionItem (7.3) with a link to the source Turn and, once approved, the Task. |
| DATA-7 | P0 | Persist ChatMessage (7.3). One thread. |
| ~~DATA-5~~ | | ~~Elasticsearch hybrid search over transcripts and tasks~~ `[CUT]` D-12. |

### 6.8 Developer experience and Codex evidence (DEVX)

The OpenAI track asks for Codex as a development teammate and evidence of how it helped. This is a submission requirement, not a nice-to-have.

| ID | Pri | Requirement |
|---|---|---|
| DEVX-1 | P0 | `AGENTS.md` at repo root pointing Codex at this spec, with run commands and the "reference requirement IDs in commits" rule. |
| DEVX-2 | P0 | At least four substantive Codex-authored changes land as separate PRs or clearly attributed commits (`codex:` prefix or PR label). Candidates in 11.1. |
| DEVX-3 | P0 | Before the Devpost is written, collect: screenshots of Codex cloud tasks or CLI sessions, PR links, and a two-line note per use case on what it did and what you would have skipped without it. Store in `docs/codex-evidence.md`. |
| DEVX-4 | P1 | One Codex code review pass on `apps/server/src/gateway` once its P0s pass, with findings logged. |

### 6.9 Action item extraction (ACT)

A cheap OpenAI model reads every transcript and picks out things the user said they would do. The user approves with one tap. Approval creates a normal Task, so nothing here can bypass the gate.

| ID | Pri | Requirement |
|---|---|---|
| ACT-1 | P0 | After each Turn is persisted (DATA-1), run one extraction call asynchronously with `EXTRACT_MODEL`. Input: this turn's user and assistant text plus the previous two turns for context. Output: strict JSON `{ "items": [ { "title", "suggested_goal", "toolkit_hint", "confidence" } ] }`, no prose. Never on the voice path; never blocks the next turn. |
| ACT-2 | P0 | Persist only items with `confidence >= 0.6` (proposed). Skip an item if the same turn already fired `run_task` with a matching goal (the user asked Otto to do it, so it is a Task, not a suggestion). Dedupe against open ActionItems by lowercase token overlap over 0.7. |
| ACT-3 | P0 | Statuses: `open`, `approved`, `dismissed`, `done`. **Approve** creates a Task through `run_task` (AG-12) with `goal = suggested_goal` and `source: "action_item"`, stores `task_id`, sets `approved`; when that task succeeds the item becomes `done`. **Dismiss** sets `dismissed` and the item is never re-extracted for that turn. |
| ACT-4 | P0 | Emit SSE `action_item.created` and `action_item.updated`. |
| ACT-5 | P1 | Otto mentions new items at the next idle moment through VG-7 ("You said you'd set up a meeting at 10. Want me to?"), at most once per 10 minutes, never mid-task. |
| ACT-6 | P1 | The extraction prompt distinguishes commitments the user made ("I'll", "I need to", "remind me", "let's") from things merely discussed. Only commitments become items. A turn that was itself a `run_task` request yields nothing. |
| ACT-7 | P0 | Seed three known-good turns into the demo profile so the Home tab is never empty on stage, and so the extraction demo ("schedule a meeting at 10" -> "Schedule via Google Calendar") is deterministic. |

**Extraction prompt (starting point)**

```
You extract action items from a wearable assistant's transcript.
Return only JSON: {"items":[{"title":"","suggested_goal":"","toolkit_hint":"","confidence":0.0}]}
An action item is something the USER committed to do or asked to have done, not something merely mentioned.
"title" is under 8 words. "suggested_goal" is the instruction you would give an agent to do it.
"toolkit_hint" is the most likely app (googlecalendar, gmail, github, ...) or empty.
"confidence" is 0 to 1. If nothing qualifies return {"items":[]}.
```

### 6.10 Context agent for the Chat tab (CHAT)

A text agent that knows everything Otto heard and did. Read-mostly. Its only write is starting a task, through the same path as everything else.

| ID | Pri | Requirement |
|---|---|---|
| CHAT-1 | P0 | `POST /api/chat` with `{ text }` streams a reply (SSE `chat.delta` events, then `chat.done`) from `CHAT_MODEL` via the Responses API. System prompt: "You are Otto..." plus the profile and all `source: "user"` memories. |
| CHAT-2 | P0 | Read tools exposed as functions: `search_turns(query, from?, to?)`, `list_tasks(status?, limit?)`, `get_task(id)`, `list_action_items(status?)`, `list_memories()`, `get_profile()`. Each is a SQLite query. Max 6 tool calls per message. |
| CHAT-3 | P0 | Persist ChatMessage for both roles (DATA-7). Send the last 20 messages as context. One thread; no thread management. |
| CHAT-4 | P1 | Write tool: `run_task(goal)` through AG-12 with `source: "chat"`. Otto replies "on it" and the Task appears on Home. This replaces APP-9. |
| CHAT-5 | P1 | Replies cite sources as `{kind: "turn"|"task", id}` in the ChatMessage; the app renders them as chips (APP-12). |
| CHAT-6 | P0 | The chat agent has no access to Composio. Its only side effect is `run_task`. AG-3 holds. |
| CHAT-7 | P1 | Streaming first token under 800 ms on the demo network; if the model is slower, show a typing indicator immediately on send. |

**Chat system prompt (starting point)**

```
You are Otto, a wearable assistant. The user is chatting with you by text about their day.
You have tools to look up what the user said (turns), what you did for them (tasks),
open action items, saved memories, and their profile. Look things up before answering;
do not guess about the user's day. Be brief and specific. When you reference something
you found, include its id so the app can link to it. If the user asks you to do
something, call run_task and say you are on it.
User profile: {profile}. Notes the user gave you: {user_memories}.
```

---

## 7. Interface contracts (binding)

Types for everything here live in `packages/shared`.

### 7.1 Device to Server WebSocket

- URL: `wss://<host>/device?token=<DEVICE_TOKEN>`
- **Binary frames** = raw audio, PCM s16le mono 24 kHz. Upstream is mic audio, valid only between `ptt_start` and `ptt_end`. Downstream is speaker audio, valid only between `speak_start` and `speak_end`.
- **Text frames** = JSON control messages (canonical), or legacy keywords (accepted per VG-14).

Device to Server

```jsonc
{ "type": "hello", "fw": "0.1.0", "sample_rate": 24000, "battery": 0.82 }
{ "type": "ptt_start" }
{ "type": "ptt_end" }        // the cut signal: commit and respond
{ "type": "ptt_cancel" }
{ "type": "ping" }
```

Server to Device

```jsonc
{ "type": "ready" }
{ "type": "state", "value": "idle|listening|thinking|speaking|error" }
{ "type": "speak_start", "id": "resp_123" }
{ "type": "speak_end", "id": "resp_123", "reason": "done|interrupted|error" }
{ "type": "transcript", "role": "user|assistant", "text": "..." }   // optional, for a debug display
{ "type": "error", "code": "string", "message": "string" }
{ "type": "pong" }
```

Legacy alias table (VG-14): `START`, `STOP`, `CANCEL`, `PING` inbound; `THINKING`, `TRANSCRIPT:<text>`, `ANSWER:<text>`, `AUDIO_START:24000`, `AUDIO_END` outbound.

Rules: server may send `speak_start` at any time while the device is idle (VG-7). Device treats `ptt_start` as higher priority than anything it is playing (FW-6).

### 7.2 App to Server HTTP

All requests carry `Authorization: Bearer <APP_API_KEY>`.

```
# Home
GET    /api/home                             -> { approvals, connections, action_items, recent_tasks }   (APP-15)

# Tasks
GET    /api/tasks?limit&before               -> Task[]
GET    /api/tasks/:id                        -> Task & { steps, approval?, connection_request? }

# Approvals and connections
GET    /api/approvals?status=pending         -> Approval[]
POST   /api/approvals/:id/decision           -> { decision: "approve"|"deny" }
GET    /api/connections?status=pending       -> ConnectionRequest[]
POST   /api/connections/:id/completed        -> { }                          (app calls after link flow returns)

# Action items (6.9)
GET    /api/action-items?status=open         -> ActionItem[]
POST   /api/action-items/:id/approve         -> { task_id }
POST   /api/action-items/:id/dismiss         -> { }

# Context tab
GET    /api/turns?limit&before&q             -> Turn[]                       (APP-6; q is P1)
GET    /api/memories?source=user             -> Memory[]                     (APP-11)
POST   /api/memories                         -> { text } -> Memory           (APP-11, source forced to "user")
DELETE /api/memories/:id
GET    /api/profile        PUT /api/profile

# Connections tab
GET    /api/extensions                       -> Extension[]                  (CMP-6)
POST   /api/extensions/:id/connect           -> { link }                     (APP-4)
POST   /api/extensions/:id/disconnect        -> { }                          (APP-5, P1)
GET    /api/device                           -> { connected, state, last_seen, battery? }

# Chat tab (6.10)
GET    /api/chat/messages?limit              -> ChatMessage[]
POST   /api/chat                             -> { text }; streams SSE chat.delta ... chat.done

# Streams and webhooks
GET    /api/events                           -> SSE
GET    /connect/callback                     -> Composio redirect target; marks ConnectionRequest done, resumes task
```

SSE events on `/api/events`: `task.created`, `task.updated`, `step.created`, `approval.created`, `approval.updated`, `connection.created`, `connection.updated`, `action_item.created`, `action_item.updated`, `memory.created`, `device.updated`, `extension.updated`. Payload is the full object.

### 7.3 Data model

```ts
type TaskStatus =
  | "running" | "needs_input" | "awaiting_approval" | "awaiting_connection"
  | "succeeded" | "failed" | "cancelled";

type TaskSource = "voice" | "action_item" | "chat";

interface Task {
  id: string; goal: string; status: TaskStatus; source: TaskSource;
  spoken_summary?: string; detail_md?: string; error?: string;
  toolkits_used: string[];                 // e.g. ["googlecalendar", "gmail"]
  created_at: string; updated_at: string;
}

interface TaskStep {
  id: string; task_id: string; seq: number;
  kind: "plan" | "tool_call" | "tool_result" | "approval_wait"
      | "connection_wait" | "question" | "final" | "error";
  toolkit?: string; tool_slug?: string; risk?: "R0" | "R1" | "R2";
  summary: string;
  args_redacted?: unknown; result_redacted?: unknown;
  duration_ms?: number; created_at: string;
}

interface Approval {
  id: string; task_id: string; step_id: string; code: string;
  summary: string; facts: Record<string, string>;
  args_hash: string;
  status: "pending" | "approved" | "denied" | "expired";
  channel?: "app"; expires_at: string; decided_at?: string;
}

interface ConnectionRequest {
  id: string; task_id: string; step_id: string;
  toolkit: string;                          // e.g. "gmail"
  link: string;                             // Composio Connect Link
  status: "pending" | "completed" | "expired";
  created_at: string; completed_at?: string;
}

interface Extension {                       // a Composio toolkit as seen by this user
  id: string; name: string; description: string;
  status: "connected" | "needs_auth" | "suggested";
  tool_count: number;
}

interface Turn {
  id: string; user_text: string; assistant_text: string;
  task_ids: string[]; action_item_ids: string[]; latency_ms?: number;
  started_at: string; ended_at: string;
}

interface ActionItem {                      // 6.9
  id: string; turn_id: string;
  title: string; suggested_goal: string; toolkit_hint?: string; confidence: number;
  snippet: string;                          // the words that produced it, for the card
  status: "open" | "approved" | "dismissed" | "done";
  task_id?: string; created_at: string; decided_at?: string;
}

interface Memory {                          // DATA-4
  id: string; text: string;
  source: "user" | "task_summary";
  task_id?: string; created_at: string;
}

interface ChatMessage {                     // 6.10
  id: string; role: "user" | "assistant"; text: string;
  citations?: { kind: "turn" | "task"; id: string }[];
  created_at: string;
}

interface HomePayload {                     // GET /api/home
  approvals: Approval[]; connections: ConnectionRequest[];
  action_items: ActionItem[]; recent_tasks: Task[];
}
```

### 7.4 Function tools on the Realtime session

Control tools (executed by the gateway):

```jsonc
run_task        { goal: string, context?: string }     -> { task_id, status: "started" }
answer_question { task_id: string, answer: string }    -> { ok: true }
get_task_status { task_id?: string }                   -> { status, spoken_summary? }
cancel_task     { task_id?: string }                   -> { ok: true }
```

Fast-lane tools (VG-16, CMP-9; executed by the gateway through the gate, 2.5 s timeout):

```jsonc
calendar_free_busy   { start: string, end: string }        -> { busy: [{start, end}] } | { status: "deferred" }
calendar_list_events { date: string }                      -> { events: [{title, start, end, attendees}] } | { status: "deferred" }
```

**Six tools total** (D-28). The voice model answers calendar questions itself and
delegates everything else, including all of GitHub. **It never writes.** Fast-lane
results are projected down to the fields a spoken answer needs before they go back
to the model, so it never has 50 KB of JSON in front of it.

### 7.5 Realtime session configuration

Sent as `session.update` immediately after the Realtime WS opens. Verify field names against current docs; this is the GA shape as of the last check.

```jsonc
{
  "type": "session.update",
  "session": {
    "type": "realtime",
    "model": "<REALTIME_MODEL>",
    "output_modalities": ["audio"],
    "audio": {
      "input": {
        "format": { "type": "audio/pcm", "rate": 24000 },
        "transcription": { "model": "<TRANSCRIBE_MODEL>" },
        "turn_detection": null
      },
      "output": {
        "format": { "type": "audio/pcm", "rate": 24000 },
        "voice": "<REALTIME_VOICE>"
      }
    },
    "instructions": "<see below>",
    "tools": [ /* 7.4 as function tools */ ],
    "tool_choice": "auto"
  }
}
```

Instructions template (VG-10):

```
You are Otto, a wearable assistant. The user talks to you through a button on their chest.
Reply in one or two short spoken sentences. Never use lists or markdown.
If the user asks you to do something in the world, call run_task with a clear goal
and say "On it" or similar. Do not describe what you will do. Do not claim anything
is done until you are told it is done.
If something is ambiguous (which Sam, which date), ask one short question.
If the user asks to confirm something, say "check the app to confirm."
User profile: {name}, timezone {tz}. Frequent contacts: {contacts}.
Notes the user gave you: {user_memories}.
```

Events the gateway must handle:

```
outbound: input_audio_buffer.append | .commit | .clear, response.create, response.cancel,
          conversation.item.create (function_call_output, or text for VG-7)
inbound:  response.output_audio.delta, response.output_audio.done,
          response.output_audio_transcript.done,
          conversation.item.input_audio_transcription.completed,
          response.function_call_arguments.done, response.done, error
```

### 7.6 Risk tier rules for Composio tool slugs (CMP-5)

Evaluate in order; first match wins.

```
R2  slug matches /(SEND|DELETE|REMOVE|PUBLISH|PAY|ORDER|CHECKOUT|POST_|TWEET|PURCHASE|TRANSFER)/
R2  args contain any of: amount, price, total, cost, recipient, to, publish, public
R0  slug matches /(GET|LIST|SEARCH|FETCH|FIND|READ|LOOKUP|CHECK)/
R1  slug matches /(CREATE|UPDATE|ADD|SET|DRAFT|EDIT|INSERT)/
R2  otherwise (unknown defaults to highest tier)
```

Overrides live in `approvals/tiers.ts` as an explicit map for the demo toolkits,
e.g. `GOOGLECALENDAR_CREATE_EVENT: R1`, `GMAIL_SEND_EMAIL: R2`.

Two GitHub calls are pinned deliberately (D-28). `GITHUB_CREATE_AN_ISSUE_COMMENT`
is **R2**: a comment is posted publicly in the user's name and cannot be un-said,
which is both "sends on the user's behalf" and "public change" in the rules above.
`GITHUB_MERGE_A_PULL_REQUEST` is **R2** as well - `MERGE` matches none of the slug
patterns, so it would otherwise reach R2 only through the unknown-tool default, and
a pin means it cannot drift to R1 if those patterns change.

---

## 8. Demo scenarios and acceptance criteria

Run from the physical device. `DEMO_MODE=true` enables listed fallbacks. Fallbacks go through the same agent, gate, and log paths so the app tells the true story.

Order on stage: **S0 inside S1**, then S2, then S3 if it works. Total under 2 minutes. Hand the device to a judge for S1.

### S0. Connect a tool live (the "do anything anywhere" beat)

Not a separate scenario. It is the first 20 seconds of S1, and it only works if Gmail is **not** pre-connected.

> Judge presses: "Set up a coffee chat with Sam next week and email him the invite."

- Discovery selects Google Calendar and Gmail (AG-7). Calendar is connected. Gmail is not.
- Agent creates the calendar event (R1), then hits Gmail, gets needs-auth, raises a ConnectionRequest (CMP-4).
- **The app's "Needs you" card fills** with a Connect Link. User taps, signs in, returns. Agent retries the send, which is R2, so an approval card appears. Approve. The email sends.
- Pass: the app shows discovery, the connection wait, the approval wait, and success, in that order.
- What judges see: a system acquiring a capability it did not have thirty seconds ago, then asking permission before using it. That is the whole pitch in one interaction.

### S1. Coffee chat scheduling (Google Calendar) - build first

Optional warm-up (5 s, fast lane): "Am I free Thursday afternoon?" Otto answers in the same turn from the calendar. Then:

> "Find 30 minutes with Sam next week for a coffee chat and send an invite."

- Agent reads free/busy (R0), creates event with attendee (R1), speaks the chosen time.
- **Messy-data beat (AG-9):** two contacts named Sam in the profile. Agent asks by voice which one. This is deliberate. Do not remove the second Sam.
- Pass: event exists on the real calendar with the right attendee and duration; app shows each step; spoken confirmation states day and time.
- Fallback: none. This must work live.

### S2. Send mail on someone's behalf (Gmail)

> "Email Sam the notes from this morning."

- Agent resolves which Sam from the profile (AG-9), drafts the mail, and stops: `GMAIL_SEND_EMAIL` is R2 because it sends on the user's behalf (7.6 classifies it R2 with no override).
- The approval card shows the recipient, the subject and the body. Approve, and it sends with exactly those arguments (AP-5).
- Pass: the mail arrives; the app shows the draft, the approval wait and success; on Deny nothing sends and Otto says so.
- Replaces the Shopify store edit (D-25) and then WhatsApp (D-27). Same R2 beat, and it reuses the toolkit S0 connects live, so S0 and S2 reinforce one interaction.

### S3. Food order - highest risk

> "Order my usual from [restaurant]."

- Agent builds a cart (R0/R1), requests approval with item, total, and address (R2), places the order once approved.
- Pass: the approval card shows correct facts; on Approve the order is placed or reaches the final confirm screen; on Deny nothing happens and the device says so.
- **Known risk:** verify that Composio's catalog has a usable food-delivery toolkit (OD-5) before writing any S3 code. If not: (a) a Composio browser-automation toolkit against a logged-in session, (b) a different food service Composio does support, (c) a mock ordering tool registered as a custom Composio tool that behaves realistically and is labelled as a demo in the app. Do not let S3 consume effort S1 and S2 need.

---

## 9. Build order

Stages are a **dependency order, not a schedule**. A stage is done when its check
passes. Nothing in a later stage starts until every P0 in the earlier ones passes.
If work has to be dropped, drop from the bottom.

| Stage | Done when | Requirements |
|---|---|---|
| **0. Talk to the device** | Hold the button, ask a question, hear the answer from the speaker. **Nothing else starts until this passes.** | DEV-1, VG-1 to VG-5, VG-13, FW-1 to FW-6 |
| **1. Turns persist and delegate** | Transcription is persisted per turn, function tool routing works, and `run_task` returns so Otto says "on it". | VG-6, VG-8, VG-15, AG-1, DATA-1, DATA-2 |
| **2. Composio wired** | Discovery returns Calendar tools and execute creates a real event through the gate. **S1 passes from the fake device.** | CMP-1, CMP-2, CMP-3, CMP-5, CMP-8, AP-1, AP-2, AG-2 to AG-5, AG-7 |
| **3. Approvals and connections** | Approvals end to end in the app. Connect Link end to end. **S0 + S1 pass from the fake device.** Home tab on real data: Needs you, recent activity, Task detail. | AP-3 to AP-6, AP-8, CMP-4, APP-1, APP-2, APP-7, APP-13, APP-15 |
| **4. Real hardware** | **S1 passes from the physical device on the stage network path.** S2 passes from the fake device. Action items extract and are approvable from Home. Context tab (transcript + notes) and Connections tab are done. The fast lane answers "am I free at 3" in one turn. | FW-10, VG-14, NF-6, VG-16, CMP-9, ACT-1 to ACT-4, ACT-7, AG-12, DATA-4, DATA-6, APP-3, APP-6, APP-11, APP-4, CMP-6 |
| **5. Remaining scenarios** | S2 passes from hardware. S3 per OD-5. Messy-data beat verified (AG-9). Chat tab streams with read tools. Native polish pass (APP-10). | AG-6, AG-9, AG-11, CHAT-1 to CHAT-3, CHAT-6, DATA-7, APP-12, APP-10 |
| **6. P1 polish** | Started only once every P0 above passes. Backup videos recorded for S0/S1, S2, S3 and the Home action-item approve. | FW-7, AG-8, ACT-5, ACT-6, CHAT-4, CHAT-5, CHAT-7, APP-5, APP-14, DEVX-4 |
| **7. Locked** | Every demo scenario passes twice in a row from hardware. Codex evidence collected. **Bug fixes only from here; no new features.** | DEVX-3, success criteria 1 |
| **8. Submission** | Pitch, Devpost, video. No code except a demo-breaking bug. | Section 16 |

**Cut rule for the fast lane.** If either calendar tool has a p95 over 2 s on the
stage network, or it has caused one frozen turn in rehearsal, remove it from
CMP-9. Calendar questions then go through `run_task` like everything else. It gets
one attempt at a fix; if that does not work, cut it and move on.

**Cut rule for the app.** If stage 5 is reached and S2 still has not passed from
hardware, the Chat tab (CHAT-*, APP-12) drops to P1 and its effort goes to S2. The
other three tabs stay P0. A demo with three excellent tabs beats four half-done
ones, and the Expo judges will notice the difference.

**Cut rule in general.** Priority beats stage: no P1 in a component until its P0s
pass, and no P2 until all three demo scenarios pass end to end (Section 0).

---

## 10. Non-functional requirements

| ID | Requirement |
|---|---|
| NF-1 | `ptt_end` to first downstream audio byte under 1.5 s p50 on hotspot. Logged per turn (VG-15). |
| NF-2 | The device never goes silent on failure. Any server error during a turn produces a short spoken error, `state: error`, then `idle`. |
| NF-3 | One command starts each component (DEV-2). |
| NF-4 | Structured logs with `turn_id` and `task_id` on every line. A failed demo run is debuggable in under a minute. |
| NF-5 | No secret in firmware other than `DEVICE_TOKEN` and Wi-Fi credentials. No secret in the mobile bundle other than `APP_API_KEY`. All integration tokens live in Composio. |
| NF-6 | A full dry run on the stage network path (hotspot + public URL) passes. No demo counts as ready until it has. |
| NF-7 | Realtime sessions are never left open. Idle timeout and `finally` close on every path (VG-13). Spending cap set on the OpenAI account before the first session opens. |

---

## 11. Tracks: what each requires and how we satisfy it

### 11.1 OpenAI API Prizes

**Rubric:** build something ambitious with the OpenAI API, with Codex as a development teammate, and show how Codex helped you go further.

**API usage (all P0 in this build):**
- Realtime API for the entire voice loop, audio in and audio out (VG-2).
- Realtime input transcription for the transcript feed and memory (VG-8).
- Responses API for the task agent loop with function calling (AG-2).
- Function tools on the Realtime session bridging conversation to action (VG-6, 7.4).

Every model call in the system is OpenAI. Say that in the pitch.

**Codex use cases to execute and document.** Pick at least four, land each as an attributed PR or commit (DEVX-2), and capture evidence (DEVX-3). Codex surfaces available: CLI, desktop app, IDE extension, cloud tasks, code review. Use `AGENTS.md` so Codex reads this spec (DEVX-1).

| # | Use case | Why it is a good Codex task | Component |
|---|---|---|---|
| 1 | Scaffold the monorepo: pnpm workspaces, `packages/shared`, server and mobile skeletons, run scripts | Well-specified, boilerplate-heavy, verifiable by `pnpm dev` | DEV-2 |
| 2 | Generate the shared TS types from Section 7.3 and the SSE event union | Direct transcription of a spec into code | packages/shared |
| 3 | Firmware: SPH0645 32-to-16-bit conversion, dual I2S setup, ring buffer, WS client with backoff | Fiddly, reference-heavy, isolated | FW-3, FW-4, FW-5 |
| 4 | `tools/fake-device` CLI | Self-contained, testable against the server | DEV-1 |
| 5 | Downstream audio pacing (VG-4): a token-bucket that releases PCM at real-time rate | Small, tricky timing code that benefits from a written test | VG-4 |
| 6 | Risk classifier and the approval state machine with expiry, plus unit tests | Rule-based logic with clear cases | AP-1 to AP-5, 7.6 |
| 7 | Expo screens from the contract types: Activity, Task detail, Approvals | UI from a typed API | APP-1 to APP-3 |
| 8 | Code review of the gateway once its P0s pass | Codex review surface | DEVX-4 |
| 9 | Draft the Devpost README from this spec and the step logs | Writing task with full context in repo | Section 16 |

**Evidence to capture:** PR list with the `codex:` label, screenshots of two cloud tasks or CLI sessions, and `docs/codex-evidence.md` with one paragraph per use case: what Codex did, what you changed, what you would have skipped without it. The last question is what the judges are actually asking.

### 11.2 Composio

**Rubric:** most creative, ambitious, genuinely useful agent that can do anything, showing what agents can do with the right tools.

**How we satisfy it:** Composio is the entire action layer (CMP-1 to CMP-8). Discovery across 1,500+ apps per task (AG-7), managed auth via a Connect Link raised by the agent mid-task and answered on the user's phone (CMP-4, S0), execution behind a human approval gate (AP-1). Every other entry will be a chat window. Ours is a button on a chest. Lead with that at their booth.

**Do not pre-connect the S0 toolkit.** The live Connect Link is the demo. A pre-wired integration proves nothing.

### 11.3 Expo

**Rubric:** beautiful, feels truly native, a joy to use. Expo Router, Expo UI, widgets, Live Activities are all fair game.

**How we satisfy it:** APP-10 is P0. Four native tabs (Home, Context, Connections, Chat) on Expo Router, Expo UI components where they exist, haptics on every decision. The "Needs you" card on Home is the screen judges will see most; make it the best screen in the app. The Chat tab's streaming thread is the second. Stretch: a Live Activity showing the current task (APP-8 territory, P2).

Feed `docs.expo.dev/llms.txt` to the coding agent before starting the app.

### 11.4 Rox Best AI Agent (natural fit, no extra work)

**Rubric:** agents operating on messy, unstructured, conflicting, noisy data; data cleaning, multi-source resolution, error handling, decisions under uncertainty.

**How we satisfy it:** Speech is the messiest data there is. AG-9 (two Sams, mangled proper nouns, missing emails) plus the risk-tiered gate (AP-1) plus Connect Link recovery (CMP-4) are all decisions under uncertainty made visible in the app. Demo the ambiguity on purpose; do not hide it.

### 11.6 Elastic: cut

See D-12. The honest reason: it would not make the hack easier and it would not make voice faster. If a judge asks, say the memory layer is SQLite because retrieval on the voice path had to be under 5 ms and Realtime handles transcripts natively.

---

## 12. Decision log

| ID | Decision | Reason |
|---|---|---|
| D-1 | Wearable assistant, "do anything anywhere". Ambitious demo over track fitting. | Last year's winners had standout demos. |
| D-2 | Expo mobile app, no web app. | Seamless next to a wearable; opens the Expo track. |
| D-3 | Money and high-impact actions need explicit confirmation before they run. | Safety, and a visible trust moment on stage. Superseded in channel by D-24. |
| D-4 | Feature work stops when the demo locks (Section 9, stage 7); what remains is pitch, Devpost and video. | Pitch quality decides. |
| D-5 | Server is Node/TypeScript. | One language with the app, shared types. |
| D-6 | Voice is OpenAI Realtime, audio to audio. | Chained transcribe-LLM-TTS would not meet NF-1. |
| D-7 | Push-to-talk only. `turn_detection: null`; `ptt_end` drives commit. | Reliable in a loud venue, fits 512 KB, and "not always listening" is the product stance. |
| D-8 | Device talks only to our server. | Keys off device; no TLS/JSON/base64 work on the ESP32. |
| D-9 | Two-layer brain: Realtime for conversation, Task Agent for actions. | Voice stays fast; approvals cannot be bypassed. |
| **D-10** | **Composio replaces the custom MCP registry (MCP-1 to MCP-5) and live directory discovery (MCP-4).** | Composio provides discovery, managed OAuth, and execution across 1,500+ apps. Our hand-built version would have been the riskiest code in the project and would still have hit the auth wall that Connect Link solves. Zero per-integration tokens in env. |
| **D-11** | **Approval gate sits between LLM tool selection and Composio execution, not inside Composio's meta-tool loop.** | AG-3 must hold. If the SDK cannot separate search/auth/execute, use the before-execute modifier as the gate. |
| **D-12** | **Elastic is cut.** DATA-5 removed. | The user's own criterion: include only if it makes the hack easier and helps voice latency or retrieval. It does neither. Voice latency is Realtime-bound and no retrieval happens on that path (VG-10). Tool discovery is Composio's. Memory at hackathon scale (under 200 turns) is served by SQLite in under 5 ms. Elastic would add a hosted dependency, an ingestion pipeline, and an unfamiliar query language for no user-visible change in the demo. |
| **D-13** | **Realtime input transcription is the only transcript source.** Cohere (VG-12, OD-4) removed. | No Cohere track this year. Realtime transcription is one config line and produces both user and assistant text with zero extra latency. |
| **D-14** | **Task Agent LLM is OpenAI via the Responses API.** Resolves OD-3. | "OpenAI stack for everything possible" is a stated goal and a track requirement. Keep it behind `agent/llm.ts` anyway. |
| **D-15** | **JSON control protocol (7.1) is canonical; legacy keyword frames are accepted as aliases (VG-14).** | Firmware may already speak the keyword form. Do not rewrite firmware that already works. The server absorbs the difference in one function. |
| **D-16** | **S0 (connect a tool live) is folded into S1 as its opening 20 seconds and Gmail is deliberately left unconnected.** | The live Connect Link is the strongest single beat available and the Composio track's whole thesis. Pre-connecting it would remove the demo. |
| **D-17** | AG-7 (agent finds its own tools) and AG-9 (messy data handling) promoted from P1 to P0. | Composio makes AG-7 nearly free. AG-9 is the S1 demo beat and the Rox rubric. |
| **D-18** | **Project is named Otto.** Resolves OD-7. | Used in the Realtime instructions, the chat prompt, the app, and the pitch. One name for device, agent, and app. |
| **D-19** | **App is four tabs: Home, Context, Connections, Chat.** Activity feed folds into Home; Task detail is a pushed screen. | Matches the team's UI plan. Fewer top-level surfaces, each with one job. |
| **D-20** | **Action items are extracted per turn by the cheapest OpenAI model that returns clean JSON, off the voice path, and approved with one tap. Approval creates a normal Task.** | The Home tab needs something to show that the device is paying attention between commands. Routing approval through `run_task` means the risk gate and step log apply unchanged (AG-12). |
| **D-21** | **The Chat tab is a read-mostly context agent. Its only write is `run_task`.** | Talking to Otto about your day is a memory feature, not an action feature. Keeping Composio out of it preserves AG-3 and keeps the chat fast. |
| **D-22** | **The Home tab is the confirmation surface and Otto says so aloud.** | Generalised by D-24: there is now only one channel, so Otto always says "check the app to confirm." |
| **D-23** | **Fast lane: two read-only Google Calendar tools registered directly on the Realtime session, executed by the gateway through the gate, 2.5 s timeout, escalation to `run_task`. Realtime's remote MCP feature stays off. Closes OD-8 with the precise version.** | OD-8 conflated "tools on the voice agent" with "tools the gateway does not execute." Function tools are executed by us, so nothing bypasses the gate. The real limit is that the voice model cannot speak during an outstanding call, so the lane is read-only, capped at two, and timed out. Calendar is the only one the demo needs. If it is flaky, delete it from CMP-9 and nothing else changes. |
| **D-24** | **The SMS layer is cut entirely. Approvals and Connect Links are confirmed in the app only.** AP-7 removed, `POST /webhooks/sms` removed from 7.2, `Approval.channel` narrowed to `"app"`, all `SMS_*` and Twilio env removed, OD-2 closed without an answer. | Provisioning and verifying a number, plus inbound webhook debugging, was more setup than the beat was worth. If Otto ever needs to reach a phone, it does it as a *task* through the WhatsApp toolkit, which is a capability rather than infrastructure. Cost, stated plainly: the "phone buzzes" moment is gone, so APP-1 is now the entire trust surface and is the screen judges will scrutinise. |
| **D-25** | **Shopify is cut. S2 becomes "send a WhatsApp message on the user's behalf".** | Shopify needed a dev store, a product catalogue and a storefront to refresh, all to demonstrate an R2 approval that WhatsApp demonstrates with no extra setup. WhatsApp is already the toolkit S0 connects live, so S0 and S2 now reinforce one interaction instead of spreading across three vendors. The Shopify track is dropped; it was listed as "no extra work", which stopped being true. |
| **D-26** | **Discovery picks among the toolkits the user has set up, and loads a curated tool subset per toolkit. Composio's tool search is a best-effort hint only.** | Measured against the live catalogue: `tools.getRawComposioTools({search})` is AND-keyword matching over tool text, not semantic - "free busy calendar" returns exactly the right tools, "free slot week" returns nothing because "week" matches no tool, and a full goal sentence always returns zero. When a search resolves to one toolkit the SDK sends `scopes: null` and the API rejects it, so a search can throw as well as come back empty. `toolkits.get({search})` ignores `search` entirely - the same six toolkits come back for any term. A bare `limit` truncates a toolkit's tools alphabetically, so asking for five Google Calendar tools yields five `*_ACL_*` tools. What is genuinely dynamic, and all AG-7 should claim, is which toolkit gets chosen and the fact that an unconnected one triggers a live Connect Link. |
| **D-27** | **WhatsApp is cut. Gmail carries S0 and S2 on the agent path; GitHub joins the fast lane, read-only.** 7.4 goes from six tools to eight; CMP-9 from two to four. | WhatsApp is the Meta Business Cloud API: a business account, a registered number, a system-user token, registered test recipients, and a 24-hour window or an approved template before a plain text message will send. That is a lot of setup standing behind one demo beat, and none of it is visible to a judge. Gmail is one OAuth click on the account already in use, sends to anyone, and `GMAIL_SEND_EMAIL` is R2 by rule with no override - so S0's connect beat and S2's approval beat both work with less to go wrong. GitHub on the fast lane adds a second read-only question the voice agent can answer in one breath ("what's assigned to me?"), which shows the fast lane is a general capability rather than a calendar special case. Both GitHub tools take no required arguments, so the voice model cannot get them wrong. |
| **D-28** | **GitHub moves off the fast lane onto the agent path, with thirteen tools instead of two.** 7.4 returns to six tools, CMP-9 to two. | The fast lane's constraints were what limited GitHub: single call, no required arguments, 2.5 s. That only ever allowed the two account-wide list calls, because everything interesting needs `owner` and `repo` - which the voice model cannot know. On the agent path the loop resolves a repo name first (`LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER`) and then acts, so GitHub gains reading issues and pull requests in a named repo, searching, creating and updating issues, assigning people, commenting, and merging. Verified: "how many open issues are assigned to me, and what repos do I have" chained three read calls into one spoken answer, and "merge pull request 1" stopped at an approval card without merging. The cost is that a GitHub question now takes a "on it" plus a follow-up instead of one breath; the calendar keeps the fast lane because that is the question people ask mid-sentence. |

---

## 13. Open decisions

| ID | Question | Recommended default | Blocks |
|---|---|---|---|
| OD-5 | How does S3 execute? | Check Composio's catalog for a food-delivery toolkit first. Then (a) browser toolkit, (b) supported alternative service, (c) mock custom tool labelled as demo. | S3, stage 5 |
| OD-9 | Hosting: laptop + cloudflared, or Railway? | cloudflared. Zero deploy step, and the laptop is on stage anyway. Have the Railway config ready as a fallback if the tunnel is flaky on the venue uplink. | NF-6, stage 4 |
| ~~OD-1 to OD-4, OD-6 to OD-8~~ | | Resolved or removed: D-10, D-14, D-13, Section 11, D-18, D-23, D-24. | |

---

## 14. Ownership

| Area | Owner | Backup |
|---|---|---|
| Firmware + hardware (FW) | Ayaan | Vibhor |
| Voice Gateway (VG) | Vibhor | Ayaan |
| Task Agent + Composio (AG, CMP) | Alison | Vibhor |
| Approvals (AP) | Alison | frontend 2 |
| Action items + Context agent (ACT, CHAT) | Vibhor, after VG P0s pass | Alison |
| Mobile app (APP) | frontend 1, frontend 2 | |
| Demo script, rehearsals, judge check-ins | Alison owns it throughout; everyone once the demo locks | |
| Codex evidence (DEVX) | whoever lands each PR; Alison collates | |

Judge check-ins: OpenAI, Composio and Expo booths early, and once more after stage 3. Ask Composio specifically whether Tool Router exposes search, connect, and execute separately (CMP-8). Record answers under "Judge notes" below this table.

**Judge notes**

- (empty)

---

## 15. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Venue Wi-Fi blocks the ESP32 | High | Phone hotspot for the device, public server URL, NF-6 dry run |
| Hardware fails on stage | Medium | DEV-1 fake device on a laptop, backup videos |
| Choppy or overflowing device playback | Medium | VG-4 pacing, FW-5 ring buffer, tuned in stage 0 |
| TLS on ESP32 eats memory | Medium | Test `wss://` early; tiny JSON; no base64 on device |
| Composio SDK shape differs from memory | High | CMP-8: read docs before coding; pin version; ask at booth |
| Composio has no food-delivery toolkit | High | Resolve OD-5 before any S3 code; mock fallback labelled honestly |
| A fast-lane toolkit is not connected, so every voice question defers | Medium | The lane cannot raise a Connect Link inside a turn, so CMP-2 pre-connects Google Calendar. A missing connection degrades to `run_task` rather than failing (VG-16), but the one-breath answer is lost |
| Composio API key lacks `connected_accounts` write | High | CMP-4 and all of S0 need it. Verified as part of stage 2, not discovered on stage |
| Connect Link redirect does not return to the app cleanly | Medium | The link can complete in Safari; the app polls `/api/connections` and the server resumes on Composio's callback regardless of where the browser lands |
| The app is the only confirmation surface, so a phone or SSE failure blocks every R2 action | Medium | `GET /api/home` re-fetches the pending list on foreground, so a dropped SSE connection self-heals; approvals also expire rather than hanging (AP-4) |
| Realtime session left open, surprise bill | Medium | VG-13, NF-7, spending cap |
| Realtime event names differ from this spec | Medium | Verify against current docs before coding VG; 7.5 is the last-known shape |
| Scope creep late in the build | High | Priority rule in Section 0; D-4; the Section 9 stage order |
| Two Sams beat feels contrived | Low | It is the same ambiguity every real contact list has; say so in one sentence |
| Action item extraction produces junk on stage | Medium | Confidence threshold (ACT-2), commitment-only rule (ACT-6), seeded turns (ACT-7). Rehearse the exact sentence that produces the meeting item. |
| Chat tab is half-built when the demo locks | Medium | Cut rule in Section 9. A hidden tab is better than a broken one. |
| Fast-lane calendar call freezes a voice turn | Medium | 2.5 s timeout with `deferred` escalation (VG-16), barge-in abandons the call (VG-5), cut rule in Section 9. |
| Four tabs dilute the frontend owners | Medium | Home first, then Context, then Connections, then Chat. Each tab ships complete before the next starts. |

---

## 16. Pitch and Devpost

**Demo first, slides after.** 90 to 120 seconds, three beats, then two minutes of explanation.

1. Hand the device to a judge. S1 with S0 inside it: discovery, Connect Link buzz, ambiguity question, approval buzz, done. (60 s)
2. S2 from your own chest: "Tell Sam I'm running ten minutes late." Approve the card, the message lands. (30 s)
3. S3 if it passed twice in rehearsal. Otherwise the S3 backup video. (30 s)

**The one sentence:** "Everyone's building AI that listens. Otto does something about it."

**Home tab beat (add after S1 if time allows, 15 s):** open the app, show an action item Otto picked up from something you said earlier without being asked ("Schedule a meeting at 10, via Google Calendar"), tap Do it, watch the Task appear. This is the "it was paying attention" moment.

**Per-track opener:**
- OpenAI: "Every model call is OpenAI. Realtime for the ear, Responses for the hands, and Codex built about a third of the repo."
- Composio: "It's a button on a chest with 1,500 apps behind it, and when it needs one it hasn't connected yet, it asks you mid-task and keeps going."
- Expo: "The phone is where the agent asks permission. That screen had to feel native, because you're tapping it mid-conversation."
- Rox: "Speech is the messiest data in any company. Ours knows when it misheard you."
- Finalists: "We were annoyed that thoughts die in hallways. So we made a button."

**Devpost checklist:**
- [ ] Otto: one-liner, 3 screenshots (Home with an action item, the Needs you card, device on a person)
- [ ] 60 to 90 s video: the three beats, no slides, captions for what the approval card says
- [ ] Architecture diagram from Section 3
- [ ] "How we built it": two-layer brain, why approvals sit before Composio, why push-to-talk
- [ ] Codex section from `docs/codex-evidence.md` with PR links (DEVX-3)
- [ ] Tracks entered: OpenAI, Composio, Expo, Rox, Finalists
- [ ] Honest "what's mocked" line if S3 uses the mock tool

**Answer prepared for "why no SMS?":** "Approving something is a decision, and decisions belong on a screen where you can see exactly what you're agreeing to. The card shows the recipient and the literal text before it sends."

**Answer prepared for the privacy question:** "Otto only hears you when you press the button. Every word it heard is in the Context tab, and you can delete any of it. And it asks before it acts."

---

## 17. Changelog

- **1.6.0**: GitHub moves from the fast lane to the agent path and grows from two
  tools to thirteen (D-28). **Section 7 changed:** 7.4 returns to six function
  tools and CMP-9 to two, both GitHub entries removed; VG-17's instruction now
  sends everything about GitHub through `run_task`. 7.6 gains an explicit note for
  the two pinned GitHub tiers: `GITHUB_CREATE_AN_ISSUE_COMMENT` and
  `GITHUB_MERGE_A_PULL_REQUEST` are both R2. The S1 warm-up line goes back to
  being a calendar question.
- **1.5.0**: WhatsApp cut; Gmail carries S0 and S2, GitHub joins the fast lane
  read-only (D-27). **Section 7 changed:** 7.4 now lists eight function tools,
  adding `github_my_issues` and `github_notifications`, and records that fast-lane
  results are projected down before they reach the model. CMP-9 goes from two
  tools to four and gains `defaultArgs` and `shape` per tool. CMP-2 now says to
  pre-connect Google Calendar **and GitHub**, because the fast lane has no time to
  raise a Connect Link, and to leave Gmail unconnected for S0. VG-17's instruction
  covers both toolkits. S0 and S2 rewritten around Gmail; the S1 warm-up line can
  now be a GitHub question.
- **1.4.0**: SMS cut entirely (D-24). The app is the only confirmation surface:
  AP-3 and AP-4 rewritten around `POST /api/approvals/:id/decision`, AP-6
  promoted to sole channel, AP-7 removed, APP-1 restated as the whole trust
  story. **Section 7 changed:** `POST /webhooks/sms` removed from 7.2 and
  `Approval.channel` narrowed to `"app"`. All `SMS_*` and Twilio variables
  removed from 5.2; OD-2 closed without an answer. Shopify cut and S2 replaced
  by a WhatsApp send on the user's behalf (D-25); Shopify track dropped and
  Section 11.5 removed. S0 now connects WhatsApp rather than Gmail. CMP-1
  rewritten: discovery selects toolkits and loads a curated tool subset, because
  tool-level semantic search does not work in the live catalogue (D-26). CMP-2
  notes that a Connect Link needs an API key with `connected_accounts` write
  access. New risks for WhatsApp template sending, the read-only key, and the app
  being a single point of failure for approvals.
- **1.3.0**: All project scheduling removed; the spec is task-based. Section 9 is
  now a dependency order of nine stages with a "done when" check each, replacing
  the clock-slot table. Cut rules restated against stages rather than times.
  Section 13's "Decide by" column became "Blocks". Decision log and changelog
  dates dropped; the header no longer carries an event date, a current date or a
  freeze time. Technical timings are untouched and remain binding: NF-1's 1.5 s
  p50, the 2.5 s fast-lane timeout, Composio's 30 s execute timeout, the 5 minute
  approval expiry, `REALTIME_IDLE_TIMEOUT_MS`, and the demo's own pacing in
  Sections 8 and 16.
- **1.2.0**: Fast lane added: two read-only Google Calendar tools on the Realtime session, gateway-executed through the gate with 2.5 s timeout and escalation to `run_task` (VG-16, VG-17, CMP-9, 7.4, D-23). OD-8 closed with the precise version: remote MCP off, gateway-executed function tools on. VG-5 extended to abandon outstanding fast-lane calls on barge-in. Cut rule for the fast lane in Section 9. Optional S1 warm-up line.
- **1.1.0**: Named Otto (D-18). App restructured into four tabs, Home / Context / Connections / Chat (D-19, APP-* rewritten, APP-11 to APP-15 added, APP-9 removed). Action item extraction worker (6.9, ACT-1 to ACT-7, D-20). Context agent for the Chat tab (6.10, CHAT-1 to CHAT-7, D-21). `run_task` as the single Task entry point with `source` (AG-12). Home as the confirmation surface when SMS is off (D-22, AP-6, VG-10). New endpoints for home, turns, action items, memories, extension connect, chat (7.2). ActionItem, Memory, ChatMessage, HomePayload, TaskSource added (7.3). DATA-4 to P0, DATA-6 and DATA-7 added. Build order and cut rule updated. Ownership, risks, and pitch updated.
- **1.0.0**: Final build spec. Composio replaces the MCP layer (D-10, D-11, CMP-*). Elastic cut (D-12). Cohere removed (D-13). Task agent on OpenAI Responses (D-14). Legacy device protocol accepted as aliases (D-15, VG-14, FW-10). S0 live-connect beat added (D-16, CMP-4, AP-8, APP-7). AG-7 and AG-9 promoted to P0 (D-17). Realtime session config and transcription pinned in 7.5. Risk rules for Composio slugs in 7.6. Codex evidence requirements added (DEVX-*). Build order rewritten by stage. Session cleanup and cost controls added (VG-13, NF-7). Tracks section added (11).
- **0.1.0**: Initial spec.