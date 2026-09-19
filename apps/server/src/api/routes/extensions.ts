// Connections tab (APP-4, APP-5) backed by CMP-6, plus the device status the
// Settings section shows.

import type { FastifyInstance } from "fastify";
import type { Extension } from "@otto/shared";
import { deviceStatus } from "../../gateway/device";
import { listExtensions, createConnectLink, disconnectToolkit } from "../../composio/extensions";

export function extensionRoutes(app: FastifyInstance): void {
  app.get("/api/extensions", async (): Promise<Extension[]> => listExtensions());

  app.post<{ Params: { id: string } }>("/api/extensions/:id/connect", async (req, reply) => {
    const link = await createConnectLink(req.params.id);
    if (!link) return reply.code(503).send({ error: "composio is not configured (COMPOSIO_API_KEY)" });
    return { link };
  });

  app.post<{ Params: { id: string } }>("/api/extensions/:id/disconnect", async (req) => {
    await disconnectToolkit(req.params.id);
    return {};
  });

  app.get("/api/device", async () => deviceStatus());
}
