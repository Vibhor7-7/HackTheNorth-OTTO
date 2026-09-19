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

/**
 * D-36: toolkits that are part of Otto rather than something the user adds. They
 * need no account and no catalogue trip, so they are unioned in here rather than
 * seeded as rows - a row could be deleted, and Otto would be back to telling the
 * user it cannot look anything up. `disableToolkit` is therefore a no-op for
 * these, which is the intent.
 */
export const ALWAYS_ON_TOOLKITS = ["composio_search"] as const;

export function enabledToolkitSlugs(): Set<string> {
  const rows = db.prepare(`SELECT slug FROM enabled_toolkits`).all() as { slug: string }[];
  return new Set([...rows.map((r) => r.slug), ...ALWAYS_ON_TOOLKITS]);
}
