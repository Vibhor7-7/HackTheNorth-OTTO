// GET /api/events (Section 7.2). One-way feed, simpler than WS. Payload is the
// full object, already redacted by the bus (DATA-3).

import type { FastifyReply, FastifyRequest } from "fastify";
import { subscribe } from "../bus";
import { logger } from "../log";

const log = logger("sse");

const HEARTBEAT_MS = 15000;

export function openEventStream(req: FastifyRequest, reply: FastifyReply): void {
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  reply.raw.write(`: connected\n\n`);

  const unsubscribe = subscribe((ev) => {
    reply.raw.write(`event: ${ev.type}\ndata: ${JSON.stringify(ev.data)}\n\n`);
  });

  // Venue Wi-Fi and cloudflared both drop idle connections.
  const beat = setInterval(() => reply.raw.write(`: ping\n\n`), HEARTBEAT_MS);

  const close = () => {
    clearInterval(beat);
    unsubscribe();
  };
  req.raw.on("close", close);
  req.raw.on("error", close);
  log.info("client subscribed");
}
