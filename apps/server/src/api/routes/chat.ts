// Chat tab (6.10). The context agent itself is CHAT-1..CHAT-6; this file is the
// transport: message history, and an SSE-framed stream on POST.

import type { FastifyInstance } from "fastify";
import type { ChatMessage } from "@otto/shared";
import { createChatMessage, listChatMessages } from "../../store";
import { streamChatReply } from "../../chat";
import { logger } from "../../log";

const log = logger("api.chat");

export function chatRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: { limit?: string } }>(
    "/api/chat/messages",
    async (req): Promise<ChatMessage[]> =>
      listChatMessages(req.query.limit ? Number(req.query.limit) : 50),
  );

  // CHAT-1: streams chat.delta events, then chat.done.
  app.post<{ Body: { text?: string } }>("/api/chat", async (req, reply) => {
    const text = req.body?.text?.trim();
    if (!text) return reply.code(400).send({ error: "text is required" });

    createChatMessage({ role: "user", text });

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    try {
      for await (const ev of streamChatReply(text)) {
        reply.raw.write(`event: ${ev.type}\ndata: ${JSON.stringify(ev.data)}\n\n`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error("chat stream failed", { error: message });
      reply.raw.write(`event: chat.error\ndata: ${JSON.stringify({ message })}\n\n`);
    }
    reply.raw.end();
    return reply;
  });
}
