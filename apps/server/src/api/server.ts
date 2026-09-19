import Fastify from "fastify";
import cors from "@fastify/cors";
import { env, smsEnabled } from "../env";
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
import { webhookRoutes } from "./routes/webhooks";

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
    sms: smsEnabled,
  }));

  homeRoutes(app);
  taskRoutes(app);
  approvalRoutes(app);
  connectionRoutes(app);
  actionItemRoutes(app);
  contextRoutes(app);
  extensionRoutes(app);
  chatRoutes(app);
  webhookRoutes(app);

  app.get("/api/events", (req, reply) => openEventStream(req, reply));

  return app;
}
