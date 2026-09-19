// Section 7.2: every /api request carries Authorization: Bearer <APP_API_KEY>.
// Webhooks and the Composio callback are exempt (they authenticate differently).

import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../env";

const EXEMPT = ["/webhooks/", "/connect/callback", "/health"];

export function requireAppKey(req: FastifyRequest, reply: FastifyReply, done: () => void): void {
  if (EXEMPT.some((p) => req.url.startsWith(p))) return done();
  if (!req.url.startsWith("/api/")) return done();

  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (token !== env.appApiKey) {
    reply.code(401).send({ error: "unauthorized" });
    return;
  }
  done();
}
