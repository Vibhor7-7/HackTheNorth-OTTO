import type { ActionItem } from "@otto/shared";
import { db } from "./db";
import { newId, nowIso } from "../ids";
import { publish } from "../bus";

type Row = Record<string, any>;

const toItem = (r: Row): ActionItem => ({
  id: r.id, turn_id: r.turn_id, title: r.title,
  suggested_goal: r.suggested_goal,
  toolkit_hint: r.toolkit_hint ?? undefined,
  confidence: r.confidence, snippet: r.snippet, status: r.status,
  task_id: r.task_id ?? undefined,
  created_at: r.created_at,
  decided_at: r.decided_at ?? undefined,
});

// DATA-6 / ACT-2.
export function createActionItem(input: {
  turn_id: string; title: string; suggested_goal: string;
  toolkit_hint?: string; confidence: number; snippet: string;
}): ActionItem {
  const item: ActionItem = { id: newId("ai"), ...input, status: "open", created_at: nowIso() };
  db.prepare(
    `INSERT INTO action_items (id, turn_id, title, suggested_goal, toolkit_hint,
                               confidence, snippet, status, created_at)
     VALUES (@id, @turn_id, @title, @suggested_goal, @toolkit_hint,
             @confidence, @snippet, @status, @created_at)`,
  ).run({ ...item, toolkit_hint: item.toolkit_hint ?? null });
  publish({ type: "action_item.created", data: item });
  return item;
}

export function getActionItem(id: string): ActionItem | undefined {
  const r = db.prepare(`SELECT * FROM action_items WHERE id = ?`).get(id) as Row | undefined;
  return r ? toItem(r) : undefined;
}

// ACT-3: approve stores the task_id and flips to `done` when that task succeeds.
export function updateActionItem(
  id: string,
  patch: Partial<Pick<ActionItem, "status" | "task_id">>,
): ActionItem | undefined {
  const current = getActionItem(id);
  if (!current) return undefined;
  const decided = patch.status && patch.status !== "open" ? nowIso() : current.decided_at;
  const next: ActionItem = { ...current, ...patch, decided_at: decided };
  db.prepare(`UPDATE action_items SET status=@status, task_id=@task_id, decided_at=@decided_at WHERE id=@id`)
    .run({ id, status: next.status, task_id: next.task_id ?? null, decided_at: next.decided_at ?? null });
  publish({ type: "action_item.updated", data: next });
  return next;
}

export function listActionItems(status?: ActionItem["status"]): ActionItem[] {
  const sql = status
    ? `SELECT * FROM action_items WHERE status = ? ORDER BY created_at DESC LIMIT 50`
    : `SELECT * FROM action_items ORDER BY created_at DESC LIMIT 50`;
  const rows = (status ? db.prepare(sql).all(status) : db.prepare(sql).all()) as Row[];
  return rows.map(toItem);
}

export function findByTaskId(taskId: string): ActionItem | undefined {
  const r = db.prepare(`SELECT * FROM action_items WHERE task_id = ? LIMIT 1`).get(taskId) as Row | undefined;
  return r ? toItem(r) : undefined;
}

// ACT-2: a dismissed item is never re-extracted for that turn.
export function itemsForTurn(turnId: string): ActionItem[] {
  return (db.prepare(`SELECT * FROM action_items WHERE turn_id = ?`).all(turnId) as Row[]).map(toItem);
}
