// Section 7.1 plus VG-14. The device may speak canonical JSON control frames or
// the legacy keyword protocol. Mode is detected from the first text frame and
// every reply goes back in the same dialect, so working firmware is never
// rewritten to change message format (FW-10, D-15).

import { LEGACY_INBOUND, type DeviceToServer, type ServerToDevice } from "@otto/shared";

export type Dialect = "json" | "legacy";

export function parseDeviceFrame(raw: string): { msg: DeviceToServer; dialect: Dialect } | undefined {
  const text = raw.trim();
  if (text === "") return undefined;

  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text) as DeviceToServer;
      if (parsed && typeof parsed.type === "string") return { msg: parsed, dialect: "json" };
    } catch { /* fall through to legacy */ }
    return undefined;
  }

  // Legacy keywords. `AUDIO_START:16000` style suffixes are ignored upstream.
  const keyword = text.split(":", 1)[0]!.toUpperCase();
  const type = LEGACY_INBOUND[keyword];
  if (type) return { msg: { type } as DeviceToServer, dialect: "legacy" };

  // Some firmware announces itself with a bare HELLO.
  if (keyword === "HELLO") return { msg: { type: "hello" }, dialect: "legacy" };
  return undefined;
}

/**
 * Render a server message in the device's dialect. Returns undefined when the
 * legacy protocol has no equivalent, in which case the frame is simply not sent.
 */
export function encodeServerFrame(msg: ServerToDevice, dialect: Dialect): string | undefined {
  if (dialect === "json") return JSON.stringify(msg);

  switch (msg.type) {
    case "speak_start":
      return "AUDIO_START:16000";
    case "speak_end":
      return "AUDIO_END";
    case "state":
      return msg.value === "thinking" ? "THINKING" : undefined;
    case "transcript":
      return msg.role === "user" ? `TRANSCRIPT:${msg.text}` : `ANSWER:${msg.text}`;
    case "pong":
      return "PONG";
    case "error":
      return `ERROR:${msg.code}`;
    case "ready":
      return "READY";
    default:
      return undefined;
  }
}
