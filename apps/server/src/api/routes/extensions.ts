// Connections tab (APP-4, APP-5) backed by CMP-6, plus the device status the
// Settings section shows.

import type { FastifyInstance } from "fastify";
import type { Extension } from "@otto/shared";
import { deviceStatus } from "../../gateway/device";
import { listExtensions, publishExtensionStatus } from "../../composio/extensions";
import { createConnectLink, disconnectToolkit } from "../../composio/connect";

export function extensionRoutes(app: FastifyInstance): void {
  app.get("/api/extensions", async (): Promise<Extension[]> => listExtensions());

  app.post<{ Params: { id: string } }>("/api/extensions/:id/connect", async (req, reply) => {
    const result = await createConnectLink(req.params.id);
    if (result.outcome === "ok") return { link: result.link };

    // Named failures, because "connect failed" is not debuggable on stage.
    const status = result.outcome === "error" ? 502 : 503;
    const error =
      result.outcome === "key_lacks_write"
        ? "the Composio API key needs connected_accounts write access (CMP-2)"
        : result.outcome === "no_auth_config"
          ? `no Composio auth config for ${result.toolkit}; create one in the dashboard`
          : result.message;
    return reply.code(status).send({ error });
  });

  app.post<{ Params: { id: string } }>("/api/extensions/:id/disconnect", async (req, reply) => {
    try {
      const removed = await disconnectToolkit(req.params.id);
      await publishExtensionStatus(req.params.id);
      return { removed };
    } catch (err) {
      return reply.code(502).send({
        error: err instanceof Error ? err.message : "disconnect failed",
      });
    }
  });

  app.get("/api/device", async () => deviceStatus());
}
