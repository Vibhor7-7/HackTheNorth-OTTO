import type { ChatMessage, ChatCitation } from "@otto/shared";
import { db, j, parseJson } from "./db";
import { newId, nowIso } from "../ids";

type Row = Record<string, any>;

const toMessage = (r: Row): ChatMessage => ({
  id: r.id, role: r.role, text: r.text,
  citations: parseJson<ChatCitation[] | undefined>(r.citations, undefined),
  created_at: r.created_at,
});

// DATA-7 / CHAT-3: one thread, no thread management.
export function createChatMessage(input: {
  role: ChatMessage["role"]; text: string; citations?: ChatCitation[];
}): ChatMessage {
  const m: ChatMessage = { id: newId("msg"), ...input, created_at: nowIso() };
  db.prepare(`INSERT INTO chat_messages (id, role, text, citations, created_at)
              VALUES (@id, @role, @text, @citations, @created_at)`)
    .run({ ...m, citations: m.citations ? j(m.citations) : null });
  return m;
}

// Oldest-first, which is what both the app thread and the model context want.
export function listChatMessages(limit = 50): ChatMessage[] {
  const n = Math.min(Math.max(limit, 1), 200);
  const rows = db.prepare(
    `SELECT * FROM (SELECT * FROM chat_messages ORDER BY created_at DESC LIMIT ?)
     ORDER BY created_at ASC`,
  ).all(n) as Row[];
  return rows.map(toMessage);
}
