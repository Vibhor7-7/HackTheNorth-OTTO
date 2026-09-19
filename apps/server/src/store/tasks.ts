import type { Task, TaskStatus, TaskSource } from "@otto/shared";
import { db, j, parseJson } from "./db";
import { newId, nowIso } from "../ids";
import { publish } from "../bus";

type Row = Record<string, any>;

const toTask = (r: Row): Task => ({
  id: r.id,
  goal: r.goal,
  status: r.status as TaskStatus,
  source: r.source as TaskSource,
  spoken_summary: r.spoken_summary ?? undefined,
  detail_md: r.detail_md ?? undefined,
  error: r.error ?? undefined,
  toolkits_used: parseJson<string[]>(r.toolkits_used, []),
  created_at: r.created_at,
  updated_at: r.updated_at,
});

export function createTask(goal: string, source: TaskSource): Task {
  const now = nowIso();
  const task: Task = {
    id: newId("task"), goal, status: "running", source,
    toolkits_used: [], created_at: now, updated_at: now,
  };
  db.prepare(
    `INSERT INTO tasks (id, goal, status, source, toolkits_used, created_at, updated_at)
     VALUES (@id, @goal, @status, @source, @toolkits_used, @created_at, @updated_at)`,
  ).run({ ...task, toolkits_used: j(task.toolkits_used) });
  publish({ type: "task.created", data: task });
  return task;
}

export function getTask(id: string): Task | undefined {
  const r = db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as Row | undefined;
  return r ? toTask(r) : undefined;
}

export function updateTask(
  id: string,
  patch: Partial<Pick<Task, "status" | "spoken_summary" | "detail_md" | "error" | "toolkits_used">>,
): Task | undefined {
  const current = getTask(id);
  if (!current) return undefined;
  const next: Task = { ...current, ...patch, updated_at: nowIso() };
  db.prepare(
    `UPDATE tasks SET status=@status, spoken_summary=@spoken_summary, detail_md=@detail_md,
            error=@error, toolkits_used=@toolkits_used, updated_at=@updated_at
     WHERE id=@id`,
  ).run({
    id,
    status: next.status,
    spoken_summary: next.spoken_summary ?? null,
    detail_md: next.detail_md ?? null,
    error: next.error ?? null,
    toolkits_used: j(next.toolkits_used),
    updated_at: next.updated_at,
  });
  publish({ type: "task.updated", data: next });
  return next;
}

export function listTasks(opts: { limit?: number; before?: string; status?: TaskStatus } = {}): Task[] {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 200);
  const where: string[] = [];
  const params: Row = { limit };
  if (opts.before) { where.push(`created_at < @before`); params.before = opts.before; }
  if (opts.status) { where.push(`status = @status`); params.status = opts.status; }
  const sql = `SELECT * FROM tasks ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
               ORDER BY created_at DESC LIMIT @limit`;
  return (db.prepare(sql).all(params) as Row[]).map(toTask);
}

export function latestTask(): Task | undefined {
  const r = db.prepare(`SELECT * FROM tasks ORDER BY created_at DESC LIMIT 1`).get() as Row | undefined;
  return r ? toTask(r) : undefined;
}
