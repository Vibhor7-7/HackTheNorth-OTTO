import type { Memory, Profile } from "@otto/shared";
import { db } from "./db";
import { newId, nowIso } from "../ids";
import { publish } from "../bus";

type Row = Record<string, any>;

const toMemory = (r: Row): Memory => ({
  id: r.id, text: r.text, source: r.source,
  task_id: r.task_id ?? undefined, created_at: r.created_at,
});

// DATA-4. Written by APP-11 (source "user") and on task completion
// (source "task_summary").
export function createMemory(input: { text: string; source: Memory["source"]; task_id?: string }): Memory {
  const m: Memory = { id: newId("mem"), ...input, created_at: nowIso() };
  db.prepare(`INSERT INTO memories (id, text, source, task_id, created_at)
              VALUES (@id, @text, @source, @task_id, @created_at)`)
    .run({ ...m, task_id: m.task_id ?? null });
  publish({ type: "memory.created", data: m });
  return m;
}

export function listMemories(source?: Memory["source"]): Memory[] {
  const sql = source
    ? `SELECT * FROM memories WHERE source = ? ORDER BY created_at DESC LIMIT 200`
    : `SELECT * FROM memories ORDER BY created_at DESC LIMIT 200`;
  const rows = (source ? db.prepare(sql).all(source) : db.prepare(sql).all()) as Row[];
  return rows.map(toMemory);
}

export function deleteMemory(id: string): boolean {
  return db.prepare(`DELETE FROM memories WHERE id = ?`).run(id).changes > 0;
}

// DATA-4 retrieval: recency plus SQLite LIKE on keywords. Sub-5 ms, and never
// called on the voice path (VG-10) - only by the task agent (AG-8) and chat
// agent (CHAT-1).
export function recallMemories(query: string, limit = 3): Memory[] {
  const words = query.toLowerCase().match(/[a-z0-9]{4,}/g)?.slice(0, 6) ?? [];
  if (words.length === 0) return listMemories().slice(0, limit);
  const clauses = words.map((_, i) => `LOWER(text) LIKE @w${i}`).join(" OR ");
  const params: Row = { limit };
  words.forEach((w, i) => { params[`w${i}`] = `%${w}%`; });
  const rows = db.prepare(
    `SELECT * FROM memories WHERE ${clauses} ORDER BY created_at DESC LIMIT @limit`,
  ).all(params) as Row[];
  return rows.map(toMemory);
}

// ---- profile document (DATA-4) -------------------------------------------

const PROFILE_KEY = "profile";

// S1 depends on two contacts named Sam. That ambiguity is the AG-9 demo beat;
// do not remove the second Sam (Section 8).
export const DEFAULT_PROFILE: Profile = {
  name: "Vibhor",
  timezone: "America/Toronto",
  role: "Student, building Otto at Hack the North",
  contacts: [
    { name: "Sam Chen", email: "sam.chen@example.com", note: "manager" },
    { name: "Sam Patel", email: "sam.patel@example.com", note: "teammate on the hardware" },
    { name: "Alison", email: "alison@example.com", note: "teammate, task agent owner" },
  ],
  preferences: "Prefers morning meetings. Keeps Fridays free of calls.",
  handles: { github: "Vibhor7-7" },
};

export function getProfile(): Profile {
  const r = db.prepare(`SELECT value FROM kv WHERE key = ?`).get(PROFILE_KEY) as Row | undefined;
  if (!r) return DEFAULT_PROFILE;
  try { return JSON.parse(r.value) as Profile; } catch { return DEFAULT_PROFILE; }
}

export function putProfile(p: Profile): Profile {
  db.prepare(`INSERT INTO kv (key, value) VALUES (@key, @value)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .run({ key: PROFILE_KEY, value: JSON.stringify(p) });
  return p;
}
