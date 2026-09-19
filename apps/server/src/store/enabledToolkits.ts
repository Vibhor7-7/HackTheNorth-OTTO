// D-34: toolkits that need no account. Composio refuses an auth config for them
// ("does not require authentication"), and everything else in this server keys
// "available" off auth configs, so the user's choice to add one has to live
// here. Nothing secret is stored: a slug and a timestamp.

import { db } from "./db";
import { nowIso } from "../ids";

export function enableToolkit(slug: string): void {
  db.prepare(
    `INSERT OR IGNORE INTO enabled_toolkits (slug, enabled_at) VALUES (?, ?)`,
  ).run(slug.toLowerCase(), nowIso());
}

export function disableToolkit(slug: string): boolean {
  return db.prepare(`DELETE FROM enabled_toolkits WHERE slug = ?`).run(slug.toLowerCase()).changes > 0;
}

export function enabledToolkitSlugs(): Set<string> {
  const rows = db.prepare(`SELECT slug FROM enabled_toolkits`).all() as { slug: string }[];
  return new Set(rows.map((r) => r.slug));
}
