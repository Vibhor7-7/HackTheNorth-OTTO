import type { Turn } from "@otto/shared";
import { db, j, parseJson } from "./db";
import { newId, nowIso } from "../ids";

type Row = Record<string, any>;

const toTurn = (r: Row): Turn => ({
  id: r.id,
  user_text: r.user_text,
  assistant_text: r.assistant_text,
  task_ids: parseJson<string[]>(r.task_ids, []),
  action_item_ids: parseJson<string[]>(r.action_item_ids, []),
  latency_ms: r.latency_ms ?? undefined,
  started_at: r.started_at,
  ended_at: r.ended_at,
});

// DATA-1: every voice turn persists both transcripts. Raw audio is not stored.
export function createTurn(input: {
  /** The gateway allocates the id at ptt_start so its logs join this row. */
  id?: string;
  started_at: string; ended_at?: string;
  user_text?: string; assistant_text?: string;
  task_ids?: string[]; latency_ms?: number;
}): Turn {
  const turn: Turn = {
    id: input.id ?? newId("turn"),
    user_text: input.user_text ?? "",
    assistant_text: input.assistant_text ?? "",
    task_ids: input.task_ids ?? [],
    action_item_ids: [],
    latency_ms: input.latency_ms,
    started_at: input.started_at,
    ended_at: input.ended_at ?? nowIso(),
  };
  db.prepare(
    `INSERT INTO turns (id, user_text, assistant_text, task_ids, action_item_ids,
                        latency_ms, started_at, ended_at)
     VALUES (@id, @user_text, @assistant_text, @task_ids, @action_item_ids,
             @latency_ms, @started_at, @ended_at)`,
  ).run({
    ...turn,
    task_ids: j(turn.task_ids),
    action_item_ids: j(turn.action_item_ids),
    latency_ms: turn.latency_ms ?? null,
  });
  return turn;
}

export function getTurn(id: string): Turn | undefined {
  const r = db.prepare(`SELECT * FROM turns WHERE id = ?`).get(id) as Row | undefined;
  return r ? toTurn(r) : undefined;
}

export function updateTurn(
  id: string,
  patch: Partial<Pick<Turn, "user_text" | "assistant_text" | "task_ids" | "action_item_ids" | "latency_ms" | "ended_at">>,
): Turn | undefined {
  const current = getTurn(id);
  if (!current) return undefined;
  const next: Turn = { ...current, ...patch };
  db.prepare(
    `UPDATE turns SET user_text=@user_text, assistant_text=@assistant_text,
            task_ids=@task_ids, action_item_ids=@action_item_ids,
            latency_ms=@latency_ms, ended_at=@ended_at
     WHERE id=@id`,
  ).run({
    id,
    user_text: next.user_text,
    assistant_text: next.assistant_text,
    task_ids: j(next.task_ids),
    action_item_ids: j(next.action_item_ids),
    latency_ms: next.latency_ms ?? null,
    ended_at: next.ended_at,
  });
  return next;
}

// APP-6: reverse-chronological, word for word, never summarised. `q` is P1.
export function listTurns(opts: { limit?: number; before?: string; q?: string } = {}): Turn[] {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const where: string[] = [];
  const params: Row = { limit };
  if (opts.before) { where.push(`started_at < @before`); params.before = opts.before; }
  if (opts.q) {
    where.push(`(user_text LIKE @q OR assistant_text LIKE @q)`);
    params.q = `%${opts.q}%`;
  }
  const sql = `SELECT * FROM turns ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
               ORDER BY started_at DESC LIMIT @limit`;
  return (db.prepare(sql).all(params) as Row[]).map(toTurn);
}

// VG-9: re-seed a reconnected Realtime session with a two-line summary of the
// last three turns.
export function recentTurnsForReseed(n = 3): Turn[] {
  return listTurns({ limit: n });
}
