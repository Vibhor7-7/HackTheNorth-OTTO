// GET/PUT /api/settings (7.2, D-33). The only setting is the auto-approve
// override; demo_mode is read-only here because it is an env var (5.2).

import type { FastifyInstance } from "fastify";
import type { Settings } from "@otto/shared";
import { currentSettings, setAutoApprove } from "../../approvals/override";

export function settingsRoutes(app: FastifyInstance): void {
  app.get("/api/settings", async (): Promise<Settings> => currentSettings());

  app.put<{ Body: { auto_approve?: unknown } }>("/api/settings", async (req, reply) => {
    const value = req.body?.auto_approve;
    if (typeof value !== "boolean") {
      return reply.code(400).send({ error: "auto_approve must be true or false" });
    }
    return setAutoApprove(value);
  });
}
