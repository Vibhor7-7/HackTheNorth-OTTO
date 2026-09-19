// One in-process fan-out for the SSE feed (Section 7.2). Anything that writes
// to the store publishes here; GET /api/events subscribes.
import { EventEmitter } from "node:events";
import type { ServerEvent } from "@otto/shared";
import { redact } from "./store/redact";

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

export function publish(ev: ServerEvent): void {
  // DATA-3 belt and braces: payloads are already redacted on the way into the
  // store, but nothing leaves this process un-redacted.
  emitter.emit("event", { type: ev.type, data: redact(ev.data) } as ServerEvent);
}

export function subscribe(fn: (ev: ServerEvent) => void): () => void {
  emitter.on("event", fn);
  return () => emitter.off("event", fn);
}
