// Context tab: the Transcript sub-tab (APP-6) and the Add context sub-tab
// (APP-11), plus the profile document (DATA-4).

import type { FastifyInstance } from "fastify";
import type { Memory, Profile, Turn } from "@otto/shared";
import {
  createMemory, deleteMemory, getProfile, listMemories, listTurns, putProfile,
} from "../../store";

export function contextRoutes(app: FastifyInstance): void {
  // APP-6: word for word, reverse-chronological, never summarised. `q` is P1.
  app.get<{ Querystring: { limit?: string; before?: string; q?: string } }>(
    "/api/turns",
    async (req): Promise<Turn[]> =>
      listTurns({
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        before: req.query.before,
        q: req.query.q,
      }),
  );

  app.get<{ Querystring: { source?: Memory["source"] } }>(
    "/api/memories",
    async (req): Promise<Memory[]> => listMemories(req.query.source),
  );

  // APP-11: source is forced to "user". Task summaries are written by the agent.
  app.post<{ Body: { text?: string } }>("/api/memories", async (req, reply) => {
    const text = req.body?.text?.trim();
    if (!text) return reply.code(400).send({ error: "text is required" });
    return createMemory({ text, source: "user" });
  });

  app.delete<{ Params: { id: string } }>("/api/memories/:id", async (req, reply) => {
    if (!deleteMemory(req.params.id)) return reply.code(404).send({ error: "memory not found" });
    return {};
  });

  app.get("/api/profile", async (): Promise<Profile> => getProfile());

  app.put<{ Body: Partial<Profile> }>("/api/profile", async (req): Promise<Profile> => {
    const merged: Profile = { ...getProfile(), ...(req.body ?? {}) };
    return putProfile(merged);
  });
}
