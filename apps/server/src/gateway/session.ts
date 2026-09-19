// The voice turn, end to end. VG-3 (turn flow), VG-5 (barge-in), VG-6 (function
// tool routing), VG-7 (server-initiated speech), VG-8 (transcription), VG-9
// (resilience), VG-15 (per-turn log), VG-16 (fast lane).

import type { DeviceState, ServerToDevice, RunTaskArgs, AnswerQuestionArgs,
  GetTaskStatusArgs, CancelTaskArgs } from "@otto/shared";
import { FAST_LANE_TOOL_NAMES, FAST_LANE_TIMEOUT_MS } from "@otto/shared";
import { RealtimeSession } from "./realtime";
import { Pacer } from "./pacer";
import { buildInstructions } from "./instructions";
import { gate } from "../approvals/gate";
import { FAST_LANE, fastLaneAvailable } from "../composio/fastlane";
import { answerQuestion, cancelTask, runTask, startFastLaneTask, taskStatus } from "../agent";
import { registerSpeaker, type SpeakRequest } from "../agent/notify";
import { createTurn, getProfile, listMemories, recentTurnsForReseed, updateTurn } from "../store";
import { onTurnPersisted } from "../extract";
import { logger } from "../log";
import { newId, nowIso } from "../ids";

const log = logger("gateway");

export interface DeviceTransport {
  sendControl(msg: ServerToDevice): void;
  sendAudio(frame: Buffer): void;
  isAlive(): boolean;
}

interface TurnRecord {
  turn_id: string;
  started_at: string;
  ptt_end_at?: number;
  first_audio_byte_at?: number;
  user_text: string;
  assistant_text: string;
  task_ids: string[];
  tool_calls: string[];
  persisted: boolean;
}

export class DeviceSession {
  private rt: RealtimeSession | undefined;
  private opening: Promise<unknown> | undefined;
  private state: DeviceState = "idle";

  private turn: TurnRecord | undefined;
  private pacer: Pacer | undefined;
  private responseId = "";
  private responseInFlight = false;
  /**
   * A function call was dispatched during the response now finishing, so this
   * turn is not over: the tool output goes back and the model speaks in a second
   * response (VG-6). Persisting at the first response.done would store a turn
   * with no transcripts and no acknowledgement.
   */
  private awaitingToolResponse = false;

  /**
   * VG-5: a cancelled response can still deliver audio deltas that OpenAI had
   * already generated. Playing them would talk over the user who just pressed
   * the button, so the cancelled response's id is suppressed for good.
   */
  private activeRealtimeResponseId = "";
  private suppressedResponses = new Set<string>();

  /** VG-5: fast-lane calls in flight, and the ones a barge-in told us to ignore. */
  private outstandingFastLane = new Set<string>();
  private abandonedCalls = new Set<string>();

  /** VG-7: speech requested while a turn was in flight, spoken once idle. */
  private pendingSpeech: SpeakRequest[] = [];

  private readonly log = log.child({});

  constructor(private readonly device: DeviceTransport) {
    registerSpeaker((req) => this.speak(req));
  }

  // ---- device control frames (VG-3) ---------------------------------------

  /**
   * Synchronous on purpose. Opening a Realtime session takes over a second, and
   * the audio frames and ptt_end behind this message arrive long before that, so
   * nothing here may await. RealtimeSession queues everything the gateway sends
   * until its socket is configured.
   */
  onPttStart(): void {
    // VG-5: a press during a response is a barge-in, and it wins (FW-6).
    if (this.responseInFlight) this.interrupt();

    this.openSession();

    this.turn = {
      turn_id: newId("turn"),
      started_at: nowIso(),
      user_text: "",
      assistant_text: "",
      task_ids: [],
      tool_calls: [],
      persisted: false,
    };
    this.rt?.clearInput();
    this.setState("listening");
  }

  onAudio(pcm: Buffer): void {
    // Upstream audio is only valid between ptt_start and ptt_end (Section 7.1).
    if (this.state !== "listening") return;
    this.rt?.appendAudio(pcm);
  }

  onPttEnd(): void {
    if (this.state !== "listening" || !this.turn) return;
    this.turn.ptt_end_at = Date.now();
    this.rt?.commitInput();
    this.rt?.createResponse();
    this.responseInFlight = true;
    this.setState("thinking");
  }

  onPttCancel(): void {
    // FW-8: a press under 250 ms. Clear the buffer and do not respond.
    this.rt?.clearInput();
    this.turn = undefined;
    this.setState("idle");
  }

  onPing(): void {
    this.device.sendControl({ type: "pong" });
  }

  onHello(info: { fw?: string; battery?: number }): void {
    this.log.info("device hello", { fw: info.fw, battery: info.battery });
    this.device.sendControl({ type: "ready" });
    this.setState("idle");
  }

  /** Device disconnected or was replaced (VG-1). VG-13: close on every path. */
  dispose(why: string): void {
    this.pacer?.flush();
    this.pacer = undefined;
    this.pendingSpeech = [];
    this.rt?.close(why);
    this.rt = undefined;
    this.opening = undefined;
  }

  // ---- Realtime session lifecycle (VG-9, VG-13) ---------------------------

  private openSession(): void {
    if (this.rt || this.opening) return;

    // Profile and notes are read here, at session start, and never again on the
    // voice path (VG-10, Section 3 latency posture).
    const profile = getProfile();
    const notes = listMemories("user").map((m) => m.text);
    const recent = recentTurnsForReseed(3);

    const rt = new RealtimeSession(buildInstructions(profile, notes, recent), {
      onResponseCreated: (id) => this.onResponseCreated(id),
      onAudioDelta: (pcm, id) => this.onAudioDelta(pcm, id),
      onAudioDone: (id) => this.onAudioDone(id),
      onUserTranscript: (text) => this.onUserTranscript(text),
      onAssistantTranscript: (text, id) => this.onAssistantTranscript(text, id),
      onFunctionCall: (call) => void this.onFunctionCall(call),
      onResponseDone: (id, status) => this.onResponseDone(id, status),
      onError: (message) => this.failTurn(message),
      onClose: () => { this.rt = undefined; this.opening = undefined; },
    });

    // Assigned before the handshake finishes on purpose: everything the turn
    // sends from here on is queued inside RealtimeSession and flushed in order
    // once the session is configured. This is what lets ptt_start, the audio
    // frames and ptt_end all land inside a single turn while the socket is
    // still opening (VG-9 reopen after the VG-13 idle timeout does the same).
    this.rt = rt;
    this.opening = rt
      .open()
      .catch((err: unknown) => {
        // VG-13: never leave a half-open session behind.
        if (this.rt === rt) this.rt = undefined;
        rt.close("open failed");
        this.failTurn(err instanceof Error ? err.message : String(err));
      })
      .finally(() => { this.opening = undefined; });
  }

  // ---- downstream audio (VG-4) -------------------------------------------

  /**
   * The response id is captured here rather than on the first audio delta, so a
   * barge-in during `thinking` - before any audio exists - can still suppress
   * everything that response goes on to emit.
   */
  private onResponseCreated(responseId: string): void {
    if (responseId && !this.suppressedResponses.has(responseId)) {
      this.activeRealtimeResponseId = responseId;
    }
  }

  private onAudioDelta(pcm: Buffer, responseId: string): void {
    if (responseId && this.suppressedResponses.has(responseId)) return;
    if (responseId) this.activeRealtimeResponseId = responseId;

    if (!this.pacer) {
      this.responseId = this.responseId || newId("resp");
      if (this.turn) this.turn.first_audio_byte_at = Date.now();
      this.device.sendControl({ type: "speak_start", id: this.responseId });
      this.setState("speaking");
      this.pacer = new Pacer(
        (frame) => this.device.sendAudio(frame),
        () => this.endSpeech("done"),
      );
    }
    this.pacer.push(pcm);
  }

  private onAudioDone(responseId: string): void {
    if (responseId && this.suppressedResponses.has(responseId)) return;
    // Let the pacer drain what is queued; speak_end goes out when it does.
    this.pacer?.end();
  }

  private endSpeech(reason: "done" | "interrupted" | "error"): void {
    if (!this.pacer) return;
    this.pacer = undefined;
    this.device.sendControl({ type: "speak_end", id: this.responseId, reason });
    this.responseId = "";
    this.setState("idle");
    this.drainPendingSpeech();
  }

  /** VG-5. Cancel upstream, drop queued audio, tell the device why. */
  private interrupt(): void {
    this.rt?.cancelResponse();

    if (this.activeRealtimeResponseId) {
      this.suppressedResponses.add(this.activeRealtimeResponseId);
      this.activeRealtimeResponseId = "";
      // One entry per barge-in; a long session does not need a long memory.
      if (this.suppressedResponses.size > 8) {
        this.suppressedResponses = new Set([...this.suppressedResponses].slice(-4));
      }
    }

    if (this.pacer) {
      this.pacer.flush();
      this.pacer = undefined;
      this.device.sendControl({ type: "speak_end", id: this.responseId, reason: "interrupted" });
      this.responseId = "";
    }
    // Any outstanding fast-lane call is abandoned: its result is ignored and no
    // function_call_output is sent.
    for (const id of this.outstandingFastLane) this.abandonedCalls.add(id);
    this.outstandingFastLane.clear();
    this.responseInFlight = false;
    this.persistTurn();
  }

  // ---- transcription (VG-8) ----------------------------------------------

  private onUserTranscript(text: string): void {
    if (this.turn) this.turn.user_text = text;
    else if (this.lastTurnId) updateTurn(this.lastTurnId, { user_text: text });
    this.device.sendControl({ type: "transcript", role: "user", text });
  }

  private onAssistantTranscript(text: string, responseId: string): void {
    // A cancelled response still reports what it had produced. That belongs to
    // the turn the user interrupted, which is already persisted, not to the turn
    // they just started.
    if (responseId && this.suppressedResponses.has(responseId)) return;
    // Only ever written to the open turn. Attributing it to the previous turn
    // would overwrite that turn's reply with a later, unrelated one.
    if (this.turn) this.turn.assistant_text = text;
    this.device.sendControl({ type: "transcript", role: "assistant", text });
  }

  // ---- function tools (VG-6, VG-16) --------------------------------------

  private async onFunctionCall(call: { name: string; callId: string; args: unknown }): Promise<void> {
    this.turn?.tool_calls.push(call.name);
    this.awaitingToolResponse = true;
    this.log.info("function call", { turn_id: this.turn?.turn_id, tool: call.name });

    if (FAST_LANE_TOOL_NAMES.has(call.name)) {
      await this.runFastLane(call);
      return;
    }

    const output = this.runControlTool(call.name, call.args);
    this.respondWithToolOutput(call.callId, output);
  }

  private runControlTool(name: string, rawArgs: unknown): unknown {
    switch (name) {
      case "run_task": {
        const args = rawArgs as RunTaskArgs;
        // AG-12: the single entry point. source "voice" for this caller.
        const result = runTask({ goal: args.goal, context: args.context, source: "voice" });
        this.turn?.task_ids.push(result.task_id);
        return result;
      }
      case "answer_question": {
        const args = rawArgs as AnswerQuestionArgs;
        return answerQuestion(args.task_id, args.answer);
      }
      case "get_task_status": {
        const args = rawArgs as GetTaskStatusArgs;
        return taskStatus(args.task_id);
      }
      case "cancel_task": {
        const args = rawArgs as CancelTaskArgs;
        return cancelTask(args.task_id);
      }
      default:
        return { error: `unknown tool ${name}` };
    }
  }

  /**
   * VG-16. Through the gate (R0, logged), Composio, 2.5 s hard timeout. On
   * timeout or error answer `{ status: "deferred" }` and re-run the same request
   * as a Task so VG-7 speaks the answer when it lands.
   */
  private async runFastLane(call: { name: string; callId: string; args: unknown }): Promise<void> {
    const tool = FAST_LANE[call.name];
    if (!tool || !fastLaneAvailable()) {
      this.deferFastLane(call, "lane disabled (CMP-9)");
      return;
    }

    // A Task to hang the step log off (AG-4), with no agent loop: the gateway
    // executes this call itself, just below, through the same gate.
    const task_id = startFastLaneTask(call.name, call.args);
    this.turn?.task_ids.push(task_id);

    this.outstandingFastLane.add(call.callId);
    const started = Date.now();
    const timeout = new Promise<"timeout">((resolve) =>
      setTimeout(() => resolve("timeout"), FAST_LANE_TIMEOUT_MS));

    const outcome = await Promise.race([
      gate({ task_id, slug: tool.slug, args: call.args, fast_lane: true }),
      timeout,
    ]);

    const duration = Date.now() - started;
    this.outstandingFastLane.delete(call.callId);

    // VG-5: if a barge-in happened while this was outstanding, drop it on the
    // floor. No function_call_output, no response.create.
    if (this.abandonedCalls.delete(call.callId)) {
      this.log.info("fast lane abandoned", { tool: call.name, fast_lane: true, duration_ms: duration });
      return;
    }

    if (outcome === "timeout" || outcome.outcome !== "ok") {
      // A fast-lane tool is R0 by definition (CMP-9), so "held" and
      // "needs_connection" mean the allowlist and the tier map disagree.
      const why =
        outcome === "timeout" ? "timeout"
        : outcome.outcome === "error" ? outcome.message
        : `unexpected gate outcome ${outcome.outcome} for an R0 tool`;
      this.log.warn("fast lane deferred", { tool: call.name, fast_lane: true, duration_ms: duration, why });
      this.respondWithToolOutput(call.callId, { status: "deferred" });
      return;
    }

    this.log.info("fast lane hit", { tool: call.name, fast_lane: true, duration_ms: duration });
    this.respondWithToolOutput(call.callId, outcome.result);
  }

  private deferFastLane(call: { name: string; callId: string; args: unknown }, why: string): void {
    // The model says it will follow up; the same work goes through run_task and
    // VG-7 speaks the answer when it lands.
    const { task_id } = runTask({
      goal: `Answer the user's calendar question: ${call.name} ${JSON.stringify(call.args)}`,
      source: "voice",
    });
    this.turn?.task_ids.push(task_id);
    this.log.info("fast lane deferred", { tool: call.name, fast_lane: true, why });
    this.respondWithToolOutput(call.callId, { status: "deferred" });
  }

  private respondWithToolOutput(callId: string, output: unknown): void {
    if (!this.rt?.isOpen) return;
    this.rt.sendFunctionOutput(callId, output);
    // VG-6: response.create so the model speaks the acknowledgement. Marked in
    // flight so a VG-7 announcement queues behind it instead of racing it -
    // Realtime rejects a second response.create while one is open.
    this.rt.createResponse();
    this.responseInFlight = true;
    if (!this.pacer) this.setState("thinking");
  }

  // ---- response completion, turn persistence -----------------------------

  private onResponseDone(id: string, status: string): void {
    // A cancelled response's completion must not close the turn the barge-in
    // started, or that turn's ptt_end has nothing left to commit to.
    if (id && this.suppressedResponses.has(id)) return;

    if (id && id === this.activeRealtimeResponseId) this.activeRealtimeResponseId = "";
    this.responseInFlight = false;
    if (status === "failed") return;             // onError already ran

    if (this.awaitingToolResponse) {
      // The tool output and its response are still to come; stay in `thinking`
      // and leave the turn open.
      this.awaitingToolResponse = false;
      return;
    }

    // A response that produced no audio still completes the turn.
    if (!this.pacer) this.setState("idle");
    this.persistTurn();
    this.drainPendingSpeech();
  }

  private lastTurnId: string | undefined;

  /** DATA-1 and VG-15. Raw audio is never stored. */
  private persistTurn(): void {
    const t = this.turn;
    if (!t || t.persisted) return;
    t.persisted = true;
    this.turn = undefined;

    const latency =
      t.ptt_end_at && t.first_audio_byte_at ? t.first_audio_byte_at - t.ptt_end_at : undefined;

    const turn = createTurn({
      id: t.turn_id,
      started_at: t.started_at,
      user_text: t.user_text,
      assistant_text: t.assistant_text,
      task_ids: t.task_ids,
      latency_ms: latency,
    });
    this.lastTurnId = turn.id;

    // VG-15 / NF-1. This line is how the demo gets debugged.
    this.log.info("turn", {
      turn_id: turn.id,
      ptt_end_at: t.ptt_end_at,
      first_audio_byte_at: t.first_audio_byte_at,
      latency_ms: latency,
      user_text: t.user_text,
      assistant_text: t.assistant_text,
      tool_calls: t.tool_calls,
    });

    // ACT-1: extraction runs after the turn is persisted, off the voice path,
    // and never blocks the next turn.
    onTurnPersisted(turn);
  }

  // ---- VG-7 server-initiated speech --------------------------------------

  private speak(req: SpeakRequest): void {
    if (this.state !== "idle" || !this.rt?.isOpen || this.responseInFlight) {
      this.pendingSpeech.push(req);
      return;
    }
    // The model is told what to say rather than handed a finished line, so the
    // delivery matches the rest of the conversation (VG-10).
    this.rt.sendAssistantText(
      `[Otto system] Tell the user, in one short spoken sentence: ${req.text}`,
    );
    this.rt.createResponse();
    this.responseInFlight = true;

    // Otto speaking unprompted is still something the Context tab has to show
    // (APP-6), so it gets its own Turn with no user text rather than being
    // folded into whatever the user last said.
    this.turn = {
      turn_id: newId("turn"),
      started_at: nowIso(),
      user_text: "",
      assistant_text: "",
      task_ids: req.task_id ? [req.task_id] : [],
      tool_calls: [],
      persisted: false,
    };
    this.setState("thinking");
  }

  private drainPendingSpeech(): void {
    if (this.pendingSpeech.length === 0) return;
    if (this.state !== "idle" || !this.rt?.isOpen || this.responseInFlight) return;
    const next = this.pendingSpeech.shift();
    if (next) this.speak(next);
  }

  // ---- state and errors --------------------------------------------------

  private setState(value: DeviceState): void {
    if (this.state === value) return;
    this.state = value;
    this.device.sendControl({ type: "state", value });
  }

  get currentState(): DeviceState {
    return this.state;
  }

  /** NF-2: the device never goes silent on failure. */
  private failTurn(message: string): void {
    this.log.error("turn failed", { turn_id: this.turn?.turn_id, error: message });
    this.responseInFlight = false;
    if (this.pacer) {
      this.pacer.flush();
      this.pacer = undefined;
      this.device.sendControl({ type: "speak_end", id: this.responseId, reason: "error" });
      this.responseId = "";
    }
    this.device.sendControl({ type: "error", code: "turn_failed", message });
    this.setState("error");
    this.persistTurn();
    this.setState("idle");
  }
}
