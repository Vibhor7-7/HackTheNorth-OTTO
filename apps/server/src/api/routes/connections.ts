// CMP-4 / APP-7. The Connect Link may complete in Safari and land anywhere
// (Section 15), so both the app and Composio's redirect can resolve a request.

import type { FastifyInstance } from "fastify";
import {
  completeConnectionRequest, getConnectionRequest, listConnectionRequests,
} from "../../store";
import { logger } from "../../log";

const log = logger("api.connections");

export function connectionRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: { status?: "pending" | "completed" | "expired" } }>(
    "/api/connections",
    async (req) => listConnectionRequests(req.query.status),
  );

  app.post<{ Params: { id: string } }>("/api/connections/:id/completed", async (req, reply) => {
    const existing = getConnectionRequest(req.params.id);
    if (!existing) return reply.code(404).send({ error: "connection request not found" });

    const done = completeConnectionRequest(req.params.id);
    log.info("connection completed from app", { task_id: existing.task_id, toolkit: existing.toolkit });

    // [TODO CMP-4] Retry the exact same tool call once, then continue the task.
    return done ?? existing;
  });
}
