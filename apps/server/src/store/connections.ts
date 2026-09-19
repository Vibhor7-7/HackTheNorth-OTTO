import type { ConnectionRequest } from "@otto/shared";
import { db } from "./db";
import { newId, nowIso } from "../ids";
import { publish } from "../bus";

type Row = Record<string, any>;

const toConnection = (r: Row): ConnectionRequest => ({
  id: r.id, task_id: r.task_id, step_id: r.step_id,
  toolkit: r.toolkit, link: r.link, status: r.status,
  created_at: r.created_at,
  completed_at: r.completed_at ?? undefined,
});

// CMP-4 / AP-8: same SMS channel and same app card as an Approval.
export function createConnectionRequest(input: {
  task_id: string; step_id: string; toolkit: string; link: string;
}): ConnectionRequest {
  const cr: ConnectionRequest = {
    id: newId("conn"), ...input, status: "pending", created_at: nowIso(),
  };
  db.prepare(
    `INSERT INTO connection_requests (id, task_id, step_id, toolkit, link, status, created_at)
     VALUES (@id, @task_id, @step_id, @toolkit, @link, @status, @created_at)`,
  ).run(cr);
  publish({ type: "connection.created", data: cr });
  return cr;
}

export function getConnectionRequest(id: string): ConnectionRequest | undefined {
  const r = db.prepare(`SELECT * FROM connection_requests WHERE id = ?`).get(id) as Row | undefined;
  return r ? toConnection(r) : undefined;
}

export function completeConnectionRequest(
  id: string,
  status: "completed" | "expired" = "completed",
): ConnectionRequest | undefined {
  const current = getConnectionRequest(id);
  if (!current || current.status !== "pending") return current;
  const next: ConnectionRequest = { ...current, status, completed_at: nowIso() };
  db.prepare(`UPDATE connection_requests SET status=@status, completed_at=@completed_at WHERE id=@id`)
    .run({ id, status, completed_at: next.completed_at });
  publish({ type: "connection.updated", data: next });
  return next;
}

export function listConnectionRequests(status?: ConnectionRequest["status"]): ConnectionRequest[] {
  const sql = status
    ? `SELECT * FROM connection_requests WHERE status = ? ORDER BY created_at DESC LIMIT 50`
    : `SELECT * FROM connection_requests ORDER BY created_at DESC LIMIT 50`;
  const rows = (status ? db.prepare(sql).all(status) : db.prepare(sql).all()) as Row[];
  return rows.map(toConnection);
}

// The Composio redirect lands on /connect/callback with the request id, but the
// browser may end up anywhere (Section 15). Finding the newest pending request
// for a toolkit lets the callback resolve without a perfect round trip.
export function findPendingByToolkit(toolkit: string): ConnectionRequest | undefined {
  const r = db.prepare(
    `SELECT * FROM connection_requests WHERE toolkit = ? AND status = 'pending'
     ORDER BY created_at DESC LIMIT 1`,
  ).get(toolkit) as Row | undefined;
  return r ? toConnection(r) : undefined;
}
