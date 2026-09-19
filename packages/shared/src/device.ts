// Section 7.1 device <-> server WebSocket protocol.
//
// URL: wss://<host>/device?token=<DEVICE_TOKEN>
// Binary frames = raw audio, PCM s16le mono 24 kHz.
//   upstream   valid only between ptt_start and ptt_end
//   downstream valid only between speak_start and speak_end
// Text frames = JSON control messages (canonical) or legacy keywords (VG-14).

import type { DeviceState } from "./types";

export const DEVICE_SAMPLE_RATE = 24000;

export type DeviceToServer =
  | { type: "hello"; fw?: string; sample_rate?: number; battery?: number }
  | { type: "ptt_start" }
  | { type: "ptt_end" }        // the cut signal: commit and respond
  | { type: "ptt_cancel" }
  | { type: "ping" };

export type ServerToDevice =
  | { type: "ready" }
  | { type: "state"; value: DeviceState }
  | { type: "speak_start"; id: string }
  | { type: "speak_end"; id: string; reason: "done" | "interrupted" | "error" }
  | { type: "transcript"; role: "user" | "assistant"; text: string }
  | { type: "error"; code: string; message: string }
  | { type: "pong" };

// VG-14 legacy alias tables. Firmware that already speaks the keyword protocol
// stays untouched (FW-10, D-15); the server absorbs the difference.
export const LEGACY_INBOUND: Record<string, DeviceToServer["type"]> = {
  START: "ptt_start",
  STOP: "ptt_end",
  CANCEL: "ptt_cancel",
  PING: "ping",
};
