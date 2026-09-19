// APP-15: the Home tab loads from one call so the first paint is fast on venue
// Wi-Fi. Everything after that arrives over SSE.

import type { FastifyInstance } from "fastify";
import type { HomePayload } from "@otto/shared";
import {
  expireStaleApprovals, listApprovals, listConnectionRequests,
  listActionItems, listTasks,
} from "../../store";

export function homeRoutes(app: FastifyInstance): void {
  app.get("/api/home", async (): Promise<HomePayload> => {
    expireStaleApprovals();            // never show an approval the server would refuse
    return {
      approvals: listApprovals("pending"),
      connections: listConnectionRequests("pending"),
      action_items: listActionItems("open"),
      recent_tasks: listTasks({ limit: 20 }),
    };
  });
}
