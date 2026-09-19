import Database from "better-sqlite3";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { env } from "../env";
import { SCHEMA } from "./schema";
import { logger } from "../log";

const log = logger("store");

const path = resolve(process.cwd(), env.databasePath);
mkdirSync(dirname(path), { recursive: true });

export const db = new Database(path);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(SCHEMA);

log.info("opened", { path });

// Helpers for the JSON-shaped columns in Section 7.3.
export const j = (v: unknown) => JSON.stringify(v ?? null);

export function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || raw === "" || raw === "null") return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}
