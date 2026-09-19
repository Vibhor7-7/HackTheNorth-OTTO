// AP-6: the app can approve or deny. This is the primary confirmation surface
// when SMS is not configured, and the fallback when delivery fails on stage
// (D-22).

import type { FastifyInstance } from "fastify";
import { decideApproval, expireStaleApprovals, getApproval, listApprovals } from "../../store";
import { settleDecision } from "../../approvals/pending";
import { logger } from "../../log";

const log = logger("api.approvals");

export function approvalRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: { status?: "pending" | "approved" | "denied" | "expired" } }>(
    "/api/approvals",
    async (req) => {
      expireStaleApprovals();
      return listApprovals(req.query.status);
    },
  );

  app.post<{ Params: { id: string }; Body: { decision: "approve" | "deny" } }>(
    "/api/approvals/:id/decision",
    async (req, reply) => {
      const { decision } = req.body ?? {};
      if (decision !== "approve" && decision !== "deny") {
        return reply.code(400).send({ error: "decision must be 'approve' or 'deny'" });
      }

      const existing = getApproval(req.params.id);
      if (!existing) return reply.code(404).send({ error: "approval not found" });
      if (existing.status !== "pending") {
        return reply.code(409).send({ error: `already ${existing.status}`, approval: existing });
      }

      const status = decision === "approve" ? "approved" : "denied";
      const approval = decideApproval(req.params.id, status, "app");
      log.info("decision", { task_id: existing.task_id, decision });

      // AP-4: release the suspended task. If nothing was waiting - the server
      // restarted while this sat pending - say so rather than pretend it ran.
      const resumed = settleDecision(req.params.id, status);
      return { ...approval, resumed };
    },
  );
}
