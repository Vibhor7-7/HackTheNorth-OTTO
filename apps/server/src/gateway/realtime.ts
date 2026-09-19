// VG-2, VG-3, VG-13. The gateway owns the OpenAI Realtime WebSocket. The device
// never talks to OpenAI and never holds a key (D-8).
//
// Event names are the GA shapes pinned in Section 7.5 and confirmed against the
// working Friday spike. Verify against current docs before changing them
// (Section 0, rule 7).

import { WebSocket } from "ws";
import { env } from "../env";
import { logger } from "../log";
import { CONTROL_TOOLS, FAST_LANE_TOOLS, type RealtimeFunctionTool } from "@otto/shared";
import { fastLaneAvailable } from "../composio/fastlane";

const log = logger("realtime");

export interface RealtimeHandlers {
  onResponseCreated(responseId: string): void;
  onAudioDelta(pcm: Buffer, responseId: string): void;
  onAudioDone(responseId: string): void;
  onUserTranscript(text: string): void;
  onAssistantTranscript(text: string, responseId: string): void;
  onFunctionCall(call: { name: string; callId: string; args: unknown }): void;
  onResponseDone(responseId: string, status: string): void;
  onError(message: string): void;
  onClose(): void;
}

export class RealtimeSession {
  private ws: WebSocket | undefined;
  private closed = false;
  private idleTimer: NodeJS.Timeout | undefined;
  /** Set once session.update is acknowledged by the first inbound event. */
  private ready = false;
  private queued: string[] = [];

  constructor(
    private readonly instructions: string,
    private readonly h: RealtimeHandlers,
  ) {}

  async open(): Promise<void> {
    const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(env.realtimeModel)}`;
    const ws = new WebSocket(url, { headers: { Authorization: `Bearer ${env.openaiApiKey}` } });
    this.ws = ws;

    await new Promise<void>((resolve, reject) => {
      const onOpen = () => { ws.off("error", onError); resolve(); };
      const onError = (err: Error) => { ws.off("open", onOpen); reject(err); };
      ws.once("open", onOpen);
      ws.once("error", onError);
    });

    ws.on("message", (data) => this.handle(String(data)));
    ws.on("error", (err: Error) => this.h.onError(err.message));
    ws.on("close", () => {
      this.closed = true;
      this.clearIdle();
      this.h.onClose();
    });

    // Section 7.5 session configuration. Sent straight down the socket rather
    // than through send(), because anything the gateway queued while the socket
    // was opening must land *after* the session is configured, not before.
    ws.send(JSON.stringify({
      type: "session.update",
      session: {
        type: "realtime",
        model: env.realtimeModel,
        output_modalities: ["audio"],
        audio: {
          input: {
            format: { type: "audio/pcm", rate: 24000 },
            transcription: { model: env.transcribeModel },   // VG-8
            turn_detection: null,                            // D-7: the button is the VAD
          },
          output: {
            format: { type: "audio/pcm", rate: 24000 },
            voice: env.realtimeVoice,
          },
        },
        instructions: this.instructions,
        tools: this.tools(),
        tool_choice: "auto",
      },
    }));

    this.ready = true;
    for (const frame of this.queued) this.ws?.send(frame);
    this.queued = [];
    this.touch();
    log.info("session open", { model: env.realtimeModel, tools: this.tools().length });
  }

  /** VG-6 / VG-16. Six tools total, or four while the fast lane is cut (CMP-9). */
  private tools(): RealtimeFunctionTool[] {
    return fastLaneAvailable() ? [...CONTROL_TOOLS, ...FAST_LANE_TOOLS] : [...CONTROL_TOOLS];
  }

  get isOpen(): boolean {
    return !this.closed && this.ws?.readyState === WebSocket.OPEN;
  }

  // ---- outbound (Section 7.5) ---------------------------------------------

  clearInput(): void { this.send({ type: "input_audio_buffer.clear" }); }

  appendAudio(pcm: Buffer): void {
    this.send({ type: "input_audio_buffer.append", audio: pcm.toString("base64") });
  }

  commitInput(): void { this.send({ type: "input_audio_buffer.commit" }); }

  createResponse(): void { this.send({ type: "response.create" }); }

  cancelResponse(): void { this.send({ type: "response.cancel" }); }

  /** VG-6: hand a tool result back, then let the model speak. */
  sendFunctionOutput(callId: string, output: unknown): void {
    this.send({
      type: "conversation.item.create",
      item: { type: "function_call_output", call_id: callId, output: JSON.stringify(output) },
    });
  }

  /** VG-7: server-initiated speech. */
  sendAssistantText(text: string): void {
    this.send({
      type: "conversation.item.create",
      item: { type: "message", role: "user", content: [{ type: "input_text", text }] },
    });
  }

  /** VG-11 (P2): keep model context aligned with what the user actually heard. */
  truncate(itemId: string, audioEndMs: number): void {
    this.send({ type: "conversation.item.truncate", item_id: itemId, content_index: 0, audio_end_ms: audioEndMs });
  }

  private send(ev: Record<string, unknown>): void {
    if (this.closed) return;
    const frame = JSON.stringify(ev);
    if (!this.ready) { this.queued.push(frame); return; }
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(frame);
    this.touch();
  }

  // ---- inbound ------------------------------------------------------------

  private handle(raw: string): void {
    this.touch();
    let ev: any;
    try { ev = JSON.parse(raw); } catch { return; }

    // REALTIME_DEBUG=true traces every inbound event type. Event names changed
    // between beta and GA (Section 0, rule 7); this is how you check them.
    if (process.env.REALTIME_DEBUG === "true") log.info("<-", { event: ev.type });

    switch (ev.type) {
      case "response.output_audio.delta":
        this.h.onAudioDelta(Buffer.from(ev.delta, "base64"), ev.response_id ?? "");
        break;
      case "response.output_audio.done":
        this.h.onAudioDone(ev.response_id ?? "");
        break;
      case "response.created":
        this.h.onResponseCreated(ev.response?.id ?? "");
        break;
      case "response.output_audio_transcript.done":
        this.h.onAssistantTranscript(ev.transcript ?? "", ev.response_id ?? "");
        break;
      case "conversation.item.input_audio_transcription.completed":
        this.h.onUserTranscript(ev.transcript ?? "");
        break;
      case "response.function_call_arguments.done": {
        let args: unknown = {};
        try { args = ev.arguments ? JSON.parse(ev.arguments) : {}; } catch { args = {}; }
        this.h.onFunctionCall({ name: ev.name, callId: ev.call_id, args });
        break;
      }
      case "response.done":
        this.h.onResponseDone(ev.response?.id ?? "", ev.response?.status ?? "completed");
        if (ev.response?.status === "failed") {
          this.h.onError(JSON.stringify(ev.response.status_details ?? ev.response));
        }
        break;
      case "error":
        this.h.onError(ev.error?.message ?? JSON.stringify(ev.error));
        break;
      default:
        break;
    }
  }

  // ---- VG-13 session cleanup ---------------------------------------------
  //
  // An orphaned session streaming silence bills continuously (Section 2). The
  // idle timer closes it; VG-9 reopens on the next ptt_start.

  private touch(): void {
    this.clearIdle();
    if (this.closed) return;
    this.idleTimer = setTimeout(() => {
      log.info("idle timeout, closing session", { ms: env.realtimeIdleTimeoutMs });
      this.close("idle");
    }, env.realtimeIdleTimeoutMs);
  }

  private clearIdle(): void {
    if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = undefined; }
  }

  close(why: string): void {
    if (this.closed) return;
    this.closed = true;
    this.clearIdle();
    log.info("closing session", { why });
    try { this.ws?.close(); } catch { /* already gone */ }
  }
}
