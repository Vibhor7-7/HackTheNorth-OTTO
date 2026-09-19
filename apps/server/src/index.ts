// Otto server. One process: REST + SSE for the app (7.2) and the device
// WebSocket gateway (7.1) on the same port, so one public URL covers both
// wss:// and https:// (Section 2).

import { buildApp } from "./api/server";
import { attachDeviceGateway } from "./gateway/device";
import { expireStaleApprovals } from "./store";
import { settleDecision } from "./approvals/pending";
import { env } from "./env";
import { logger } from "./log";

const log = logger("server");

const app = buildApp();

// Attached before listen so the first device upgrade cannot race the handler.
attachDeviceGateway(app.server);
await app.listen({ port: env.port, host: "0.0.0.0" });

// AP-4: approvals expire after 5 minutes and expiry counts as denied. Swept on
// a timer as well as on read, so a task waiting on one does not hang forever.
const sweeper = setInterval(() => {
  for (const a of expireStaleApprovals()) {
    log.info("approval expired", { task_id: a.task_id });
    // AP-4: expiry counts as denied, and the waiting task has to hear about it.
    settleDecision(a.id, "expired");
  }
}, 15000);

log.info("listening", {
  port: env.port,
  base_url: env.publicBaseUrl,
  demo_mode: env.demoMode,
  confirmations: "app only (D-24)",
  realtime_model: env.realtimeModel,
});

// NF-7: never leave a Realtime session open.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    log.info("shutting down", { signal });
    clearInterval(sweeper);
    void app.close().then(() => process.exit(0));
  });
}
