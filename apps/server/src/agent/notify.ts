// VG-7 seam. The task layer needs to make the device speak, but the gateway
// owns the Realtime session. Registering a speaker here keeps the dependency
// one-way: gateway -> agent, never agent -> gateway.

import { getTask } from "../store";

export type SpeakReason = "task_done" | "needs_input" | "needs_approval" | "needs_connection" | "error";

export interface SpeakRequest {
  text: string;
  reason: SpeakReason;
  task_id?: string;
}

type Speaker = (req: SpeakRequest) => void;

let speaker: Speaker | undefined;

export function registerSpeaker(fn: Speaker): void {
  speaker = fn;
}

/**
 * D-31: only a task the user started by voice is allowed to speak.
 *
 * VG-7 predates the Chat tab. Once CHAT-4 let a task start from text, every
 * chat-started task also notified the earpiece - and because queued speech only
 * drains on the next voice turn, an answer typed on Saturday night could be
 * spoken unprompted on Sunday morning, out of context. Answer where you were
 * asked: chat and action items resolve in the app, over SSE.
 *
 * Filtered here rather than at the five call sites, so a new one cannot forget
 * it. A request with no task_id still speaks: that is Otto talking on its own
 * behalf (ACT-5), not the result of something the user started elsewhere.
 */
function startedByVoice(taskId: string | undefined): boolean {
  if (!taskId) return true;
  return getTask(taskId)?.source === "voice";
}

// If no device is attached the text is simply dropped; the app still shows
// everything over SSE.
export function speak(req: SpeakRequest): void {
  if (!startedByVoice(req.task_id)) return;
  speaker?.(req);
}
