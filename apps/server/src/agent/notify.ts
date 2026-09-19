// VG-7 seam. The task layer needs to make the device speak, but the gateway
// owns the Realtime session. Registering a speaker here keeps the dependency
// one-way: gateway -> agent, never agent -> gateway.

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

// If no device is attached the text is simply dropped; the app still shows
// everything over SSE.
export function speak(req: SpeakRequest): void {
  speaker?.(req);
}
