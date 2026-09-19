// POST /webhooks/sms (AP-4) and GET /connect/callback (CMP-4). Neither carries
// the app bearer token.

import type { FastifyInstance } from "fastify";
import { env, smsEnabled } from "../../env";
import {
  completeConnectionRequest, decideApproval, findPendingByCode,
  findPendingByToolkit, getConnectionRequest,
} from "../../store";
import { logger } from "../../log";

const log = logger("webhooks");

// AP-3 wording: "Reply YES 4821 to approve or NO 4821 to cancel".
const DECISION = /\b(YES|NO)\b[^0-9]*(\d{4})/i;

export function webhookRoutes(app: FastifyInstance): void {
  app.post<{ Body: Record<string, string> }>("/webhooks/sms", async (req, reply) => {
    // [TODO AP-7] Validate the provider webhook signature before trusting this.
    const body = req.body ?? {};
    const from = body.From ?? body.from ?? "";
    const text = body.Body ?? body.body ?? body.text ?? "";

    // AP-7: only the configured phone can decide.
    if (smsEnabled && env.smsUserPhone && from && from !== env.smsUserPhone) {
      log.warn("ignoring SMS from unknown sender");
      return reply.code(204).send();
    }

    const match = DECISION.exec(text);
    if (!match) {
      log.warn("SMS did not match a decision", { text });
      return reply.code(204).send();
    }

    const [, verb, code] = match as unknown as [string, string, string];
    const approval = findPendingByCode(code);
    if (!approval) {
      log.warn("no pending approval for code", { code });
      return reply.code(204).send();
    }

    const decision = verb.toUpperCase() === "YES" ? "approved" : "denied";
    decideApproval(approval.id, decision, "sms");
    log.info("decision from SMS", { task_id: approval.task_id, decision });

    // [TODO AP-4] Resume or cancel the held task.
    return reply.code(204).send();
  });

  // Composio redirects here when the user finishes a Connect Link.
  app.get<{ Querystring: { request_id?: string; toolkit?: string; status?: string } }>(
    "/connect/callback",
    async (req, reply) => {
      const { request_id, toolkit } = req.query;
      const cr =
        (request_id ? getConnectionRequest(request_id) : undefined) ??
        (toolkit ? findPendingByToolkit(toolkit) : undefined);

      if (cr) {
        completeConnectionRequest(cr.id);
        log.info("connection completed via callback", { task_id: cr.task_id, toolkit: cr.toolkit });
        // [TODO CMP-4] Retry the exact same tool call once, then continue.
      } else {
        log.warn("callback matched no pending connection request", { request_id, toolkit });
      }

      // The browser may be Safari rather than the app, so return something human.
      reply.type("text/html").send(
        `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
         <title>Otto</title>
         <body style="font-family:-apple-system,system-ui;display:grid;place-items:center;
                      height:100vh;margin:0;text-align:center;padding:24px">
           <div><h1 style="font-size:22px">Connected${cr ? ` to ${cr.toolkit}` : ""}</h1>
           <p style="color:#666">You can close this and go back to Otto.</p></div>
         </body>`,
      );
      return reply;
    },
  );
}
