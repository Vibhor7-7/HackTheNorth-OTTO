// GET /connect/callback (CMP-4). Composio redirects here when the user finishes
// a Connect Link. No bearer token: the browser arriving here is not the app.
//
// The SMS webhook that used to live alongside this route is gone (D-24). The
// app is the only confirmation surface.

import type { FastifyInstance } from "fastify";
import {
  completeConnectionRequest, findPendingByToolkit, getConnectionRequest,
} from "../../store";
import { publishExtensionStatus } from "../../composio/extensions";
import { settleConnection } from "../../approvals/pendingConnections";
import { logger } from "../../log";

const log = logger("connect");

export function connectCallbackRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: { request_id?: string; toolkit?: string; status?: string } }>(
    "/connect/callback",
    async (req, reply) => {
      const { request_id, toolkit } = req.query;

      // The link can complete in Safari and land anywhere (Section 15), so fall
      // back to the newest pending request for the toolkit.
      const cr =
        (request_id ? getConnectionRequest(request_id) : undefined) ??
        (toolkit ? findPendingByToolkit(toolkit) : undefined);

      if (cr) {
        completeConnectionRequest(cr.id);
        log.info("connection completed via callback", { task_id: cr.task_id, toolkit: cr.toolkit });
        // The toolkit is connected now; say so, so the card resolves itself (APP-7).
        void publishExtensionStatus(cr.toolkit);
        // CMP-4: the suspended task retries its call now.
        settleConnection(cr.id, "completed");
      } else {
        log.warn("callback matched no pending connection request", { request_id, toolkit });
      }

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
