# Working in this repo

**Read `MainPRD.md` first.** It is the single source of truth: every requirement
has a stable ID (`VG-4`, `AG-7`, `CMP-9`) and Section 7 is a binding contract.

## The rules that matter

1. Reference requirement IDs in commit messages: `VG-4: pace downstream audio`.
2. Section 7 contracts are binding. Changing one means: stop, propose, update
   Section 7 and the Changelog in the same commit.
3. Ambiguous or conflicting requirement: ask, do not guess. Section 13 lists the
   open decisions.
4. Do not build anything in Non-goals (1.4). Do not add features not in the spec.
5. Simplest thing that satisfies the requirement. Hard freeze Saturday 23:59.
6. No hardcoded secrets. Everything from env (5.2).
7. **Verify third-party API shapes against current docs before coding them.**
   Realtime event names, Composio SDK method names and Expo APIs all changed in
   the last year. Do not code from memory.

## Commands

```sh
pnpm install
pnpm dev             # server on :3000 (REST + SSE + device WS on one port)
pnpm dev:mobile      # Expo app (apps/mobile uses npm, not pnpm - see pnpm-workspace.yaml)
pnpm fake-device     # DEV-1: laptop mic speaks the device protocol (needs ffmpeg)
pnpm typecheck       # every package
pnpm whatsapp        # WhatsApp setup + smoke test (status|connect|numbers|send|disconnect)
```

`apps/server/.env` comes from `apps/server/.env.example` (Section 5.2).

**Talking to Otto without hardware.** Open `http://localhost:3000/test?token=$DEVICE_TOKEN`
and hold the button (or the space bar). It speaks the Section 7.1 protocol from the
browser: mic in as PCM s16le 24 kHz, paced audio back, transcripts and latency in
the log. No install needed. `pnpm fake-device` does the same from the terminal but
needs `ffmpeg` and `ffplay` on PATH.

## Layout

```
apps/server/src/
  gateway/    device WS + Realtime relay            VG-*
  agent/      task agent loop                       AG-*
  composio/   discovery, connect, execute wrappers  CMP-*
  approvals/  risk gate + SMS state machine         AP-*
  extract/    action item extraction worker         ACT-*
  chat/       context agent for the Chat tab        CHAT-*
  api/        REST + SSE (7.2)
  store/      schema + queries                      DATA-*
packages/shared/   TS types for Section 7, imported by server and mobile
tools/fake-device/ DEV-1
htn-voice/         Friday spike, reference only - not wired into the build
```

## Invariants you must not break

- **`approvals/gate.ts` is the only file that may import `composio/execute.ts`**
  (AG-3, D-11). Every tool call goes through the gate before it runs.
- **`runTask()` in `agent/` is the only way a Task is created** (AG-12), whether
  the caller is the voice tool, an approved action item or the Chat tab.
- **No retrieval on the voice path** (VG-10). Profile and notes are read once, at
  Realtime session start, and baked into the instructions.
- **Every Realtime session closes.** Idle timeout plus close on every error path
  (VG-13, NF-7). An orphaned session streaming silence bills continuously.
- **Secrets never reach a TaskStep or an SSE payload** (DATA-3). `store/steps.ts`
  redacts on the way in so no caller can forget.
- **Only an `ACTIVE` Composio account counts as connected.** `INITIALIZING` means
  someone abandoned a connect flow; treating it as connected makes the agent call
  tools that cannot work and silently skips S0's Connect Link beat.
- **There is no SMS channel** (D-24). The app is the only confirmation surface, so
  never add a second one without a Decision.
- **Composio silently ignores parameters it does not recognise.** It does not error;
  it answers a different question. Every tool's argument names come from its own
  schema (`getRawComposioToolBySlug`), never from the name we gave the voice model -
  that is what `mapArgs` in `composio/fastlane.ts` exists for.
- **An R2 approval suspends the agent loop in place** (AP-4, D-30). Never rebuild a
  held call from its TaskStep: those arguments are redacted, and AP-5 promises the
  user that exactly what they saw is what runs.
- **Raw audio is never stored** (DATA-1). Transcripts only.

## Unfinished seams

Grep for `[TODO` - each one names the requirement IDs that finish it:
`AP-4` (resuming a task once its approval is decided - the gate holds the call and
its `args_hash`, nothing releases it yet), `AG-6` (resuming a `needs_input` task
from the next voice turn), `ACT-1` (extraction), `CHAT-1` (the context agent).
Composio (CMP-1, CMP-3, CMP-4, CMP-6) and the agent loop (AG-2, AG-5, AG-7, AG-9)
are wired and verified end to end from voice.
