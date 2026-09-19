// ACT-3 / APP-3. Approve creates a normal Task through run_task, so the risk
// gate and the step log apply unchanged (AG-12, D-20).

import type { FastifyInstance } from "fastify";
import { getActionItem, listActionItems, updateActionItem } from "../../store";
import { runTask } from "../../agent";
import { logger } from "../../log";

const log = logger("api.action-items");

export function actionItemRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: { status?: "open" | "approved" | "dismissed" | "done" } }>(
    "/api/action-items",
    async (req) => listActionItems(req.query.status),
  );

  app.post<{ Params: { id: string } }>("/api/action-items/:id/approve", async (req, reply) => {
    const item = getActionItem(req.params.id);
    if (!item) return reply.code(404).send({ error: "action item not found" });
    if (item.status !== "open") {
      return reply.code(409).send({ error: `already ${item.status}`, task_id: item.task_id });
    }

    const { task_id } = runTask({ goal: item.suggested_goal, source: "action_item" });
    updateActionItem(item.id, { status: "approved", task_id });
    log.info("action item approved", { task_id, title: item.title });

    return { task_id };
  });

  app.post<{ Params: { id: string } }>("/api/action-items/:id/dismiss", async (req, reply) => {
    const item = getActionItem(req.params.id);
    if (!item) return reply.code(404).send({ error: "action item not found" });
    // ACT-3: a dismissed item is never re-extracted for that turn.
    updateActionItem(item.id, { status: "dismissed" });
    return {};
  });
}
