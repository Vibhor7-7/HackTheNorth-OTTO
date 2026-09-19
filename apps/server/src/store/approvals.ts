import { createHash } from "node:crypto";
import type { Approval } from "@otto/shared";
import { db, j, parseJson } from "./db";
import { approvalCode, newId, nowIso } from "../ids";
import { publish } from "../bus";

type Row = Record<string, any>;

// AP-4: approvals expire after 5 minutes and expiry counts as denied.
export const APPROVAL_TTL_MS = 5 * 60 * 1000;

const toApproval = (r: Row): Approval => ({
  id: r.id, task_id: r.task_id, step_id: r.step_id, code: r.code,
  summary: r.summary,
  facts: parseJson<Record<string, string>>(r.facts, {}),
  args_hash: r.args_hash,
  status: r.status,
  channel: r.channel ?? undefined,
  expires_at: r.expires_at,
  decided_at: r.decided_at ?? undefined,
});

// AP-5: an approved action executes exactly once with exactly the arguments
// shown to the user. Changed arguments produce a different hash and so need a
// fresh approval.
export const argsHash = (args: unknown) =>
  createHash("sha256").update(JSON.stringify(args ?? null)).digest("hex").slice(0, 32);

export function createApproval(input: {
  task_id: string; step_id: string; summary: string;
  facts: Record<string, string>; args_hash: string;
  channel?: "sms" | "app";
}): Approval {
  const approval: Approval = {
    id: newId("apr"),
    task_id: input.task_id,
    step_id: input.step_id,
    code: approvalCode(),
    summary: input.summary,
    facts: input.facts,
    args_hash: input.args_hash,
    status: "pending",
    channel: input.channel,
    expires_at: new Date(Date.now() + APPROVAL_TTL_MS).toISOString(),
  };
  db.prepare(
    `INSERT INTO approvals (id, task_id, step_id, code, summary, facts, args_hash,
                            status, channel, expires_at, created_at)
     VALUES (@id, @task_id, @step_id, @code, @summary, @facts, @args_hash,
             @status, @channel, @expires_at, @created_at)`,
  ).run({
    ...approval,
    facts: j(approval.facts),
    channel: approval.channel ?? null,
    created_at: nowIso(),
  });
  publish({ type: "approval.created", data: approval });
  return approval;
}

export function getApproval(id: string): Approval | undefined {
  const r = db.prepare(`SELECT * FROM approvals WHERE id = ?`).get(id) as Row | undefined;
  return r ? toApproval(r) : undefined;
}

// AP-4: inbound SMS matches on the 4-digit code, pending only.
export function findPendingByCode(code: string): Approval | undefined {
  const r = db.prepare(
    `SELECT * FROM approvals WHERE code = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1`,
  ).get(code) as Row | undefined;
  return r ? toApproval(r) : undefined;
}

export function decideApproval(
  id: string,
  status: "approved" | "denied" | "expired",
  channel?: "sms" | "app",
): Approval | undefined {
  const current = getApproval(id);
  if (!current || current.status !== "pending") return current;
  const next: Approval = { ...current, status, channel: channel ?? current.channel, decided_at: nowIso() };
  db.prepare(`UPDATE approvals SET status=@status, channel=@channel, decided_at=@decided_at WHERE id=@id`)
    .run({ id, status, channel: next.channel ?? null, decided_at: next.decided_at });
  publish({ type: "approval.updated", data: next });
  return next;
}

export function listApprovals(status?: Approval["status"]): Approval[] {
  const sql = status
    ? `SELECT * FROM approvals WHERE status = ? ORDER BY created_at DESC LIMIT 50`
    : `SELECT * FROM approvals ORDER BY created_at DESC LIMIT 50`;
  const rows = (status ? db.prepare(sql).all(status) : db.prepare(sql).all()) as Row[];
  return rows.map(toApproval);
}

// Sweep expired pendings. Called on a timer and before any read of the pending
// list so the app never shows an approval the server would refuse.
export function expireStaleApprovals(): Approval[] {
  const now = nowIso();
  const stale = (db.prepare(`SELECT * FROM approvals WHERE status='pending' AND expires_at < ?`)
    .all(now) as Row[]).map(toApproval);
  return stale.map((a) => decideApproval(a.id, "expired")!).filter(Boolean);
}
