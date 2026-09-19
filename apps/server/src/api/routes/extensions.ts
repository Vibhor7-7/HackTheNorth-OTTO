// Connections tab (APP-4, APP-5) backed by CMP-6, plus the device status the
// Settings section shows.

import type { FastifyInstance } from "fastify";
import type { Extension } from "@otto/shared";
import { deviceStatus } from "../../gateway/device";
import { listExtensions, publishExtensionStatus } from "../../composio/extensions";
import { createConnectLink, disconnectToolkit } from "../../composio/connect";
import { searchCatalog } from "../../composio/catalog";

export function extensionRoutes(app: FastifyInstance): void {
  app.get("/api/extensions", async (): Promise<Extension[]> => listExtensions());

  app.post<{ Params: { id: string } }>("/api/extensions/:id/connect", async (req, reply) => {
    const result = await createConnectLink(req.params.id);
    if (result.outcome === "ok") return { link: result.link };
    if (result.outcome === "no_auth_needed") {
      // D-34: nothing to sign in to; the toolkit is usable now.
      void publishExtensionStatus(result.toolkit);
      return { connected: true };
    }
    if (result.outcome === "already_connected") {
      // The app's list was stale; correct it over SSE and say so plainly.
      void publishExtensionStatus(result.toolkit);
      return reply.code(409).send({ error: `${result.toolkit} is already connected` });
    }

    // Named failures, because "connect failed" is not debuggable on stage.
    const status = result.outcome === "error" ? 502 : 503;
    const error =
      result.outcome === "key_lacks_write"
        ? "the Composio API key needs connected_accounts write access (CMP-2)"
        : result.outcome === "no_auth_config"
          ? `${result.toolkit} needs credentials only the Composio dashboard takes; set it up there once`
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

  // D-34: browse the catalogue. Cached server-side; `q` matches name, slug, category.
  app.get<{ Querystring: { q?: string; limit?: string } }>("/api/catalog", async (req, reply) => {
    try {
      return await searchCatalog(req.query.q ?? "", req.query.limit ? Number(req.query.limit) : 30);
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : "catalog unavailable" });
    }
  });
}
