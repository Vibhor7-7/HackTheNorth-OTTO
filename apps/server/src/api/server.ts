import Fastify from "fastify";
import cors from "@fastify/cors";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { env } from "../env";
import { requireAppKey } from "./auth";
import { openEventStream } from "./sse";
import { homeRoutes } from "./routes/home";
import { taskRoutes } from "./routes/tasks";
import { approvalRoutes } from "./routes/approvals";
import { connectionRoutes } from "./routes/connections";
import { actionItemRoutes } from "./routes/actionItems";
import { contextRoutes } from "./routes/context";
import { extensionRoutes } from "./routes/extensions";
import { chatRoutes } from "./routes/chat";
import { connectCallbackRoutes } from "./routes/connectCallback";

export function buildApp() {
  // Fastify's own logger is off: NF-4 wants one structured line per event from
  // ../log, not two logging systems.
  const app = Fastify({ logger: false, bodyLimit: 2 * 1024 * 1024 });

  app.register(cors, { origin: true });
  app.addHook("onRequest", requireAppKey);

  app.get("/health", async () => ({
    ok: true,
    uptime_s: Math.round(process.uptime()),
    demo_mode: env.demoMode,
  }));

  homeRoutes(app);
  taskRoutes(app);
  approvalRoutes(app);
  connectionRoutes(app);
  actionItemRoutes(app);
  contextRoutes(app);
  extensionRoutes(app);
  chatRoutes(app);
  connectCallbackRoutes(app);

  app.get("/api/events", (req, reply) => openEventStream(req, reply));

  // DEV-1 companion: a browser mic client that speaks the device protocol (7.1),
  // for when there is no hardware and no ffmpeg. It asks for DEVICE_TOKEN rather
  // than having it baked in, because this route is unauthenticated and the server
  // may be exposed through a tunnel.
  app.get("/test", async (_req, reply) => {
    const html = readFileSync(resolve(import.meta.dirname, "../../public/test.html"), "utf8");
    return reply.type("text/html").send(html);
  });

  return app;
}
