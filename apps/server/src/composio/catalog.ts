// D-34: the Composio toolkit catalogue, so the app can browse and add toolkits
// without a dashboard visit.
//
// Verified against @composio/core 0.18.1 on 2026-09-19: `toolkits.get` returns a
// bare array, ignores `search`, caps `limit` at 1000 and pages with `cursor` as
// a page number ("2"). The whole catalogue is ~1,550 toolkits and takes well
// under a second to read, so it is fetched once, kept in memory for an hour, and
// searched here. Nothing on the voice path touches this.

import type { CatalogEntry } from "@otto/shared";
import { composio, composioConfigured, items, log } from "./client";

interface RawToolkit {
  slug?: string;
  name?: string;
  meta?: {
    logo?: string;
    description?: string;
    toolsCount?: number;
    categories?: { slug?: string; name?: string }[];
  };
  authSchemes?: string[];
  composioManagedAuthSchemes?: string[];
  noAuth?: boolean;
}

const TTL_MS = 60 * 60 * 1000;
const PAGE = 1000;

let entries: CatalogEntry[] = [];
let fetchedAt = 0;
let inflight: Promise<CatalogEntry[]> | undefined;

function toEntry(t: RawToolkit): CatalogEntry | undefined {
  const slug = (t.slug ?? "").toLowerCase();
  if (!slug) return undefined;
  const managed = (t.composioManagedAuthSchemes ?? []).some((s) => /OAUTH/i.test(s));
  return {
    slug,
    name: t.name ?? slug,
    description: t.meta?.description ?? "",
    logo_url: t.meta?.logo,
    tool_count: t.meta?.toolsCount ?? 0,
    categories: (t.meta?.categories ?? []).map((c) => c.name ?? c.slug ?? "").filter(Boolean),
    // What the app can do about it (7.3): "managed" connects from the phone,
    // "none" needs no account, "custom" needs credentials only the dashboard takes.
    auth: t.noAuth ? "none" : managed ? "managed" : "custom",
  };
}

async function load(): Promise<CatalogEntry[]> {
  const out: CatalogEntry[] = [];
  for (let page = 1; page <= 10; page++) {
    const raw = items<RawToolkit>(
      await composio().toolkits.get({ sortBy: "usage", limit: PAGE, cursor: String(page) } as never),
    );
    for (const t of raw) { const e = toEntry(t); if (e) out.push(e); }
    if (raw.length < PAGE) break;
  }
  return out;
}

/** The catalogue, refreshed at most hourly. Never throws once it has loaded once. */
export async function catalog(): Promise<CatalogEntry[]> {
  if (!composioConfigured()) return [];
  if (entries.length && Date.now() - fetchedAt < TTL_MS) return entries;
  if (inflight) return inflight;
  inflight = load()
    .then((list) => {
      entries = list;
      fetchedAt = Date.now();
      log.info("catalog loaded", { toolkits: list.length });
      return list;
    })
    .catch((err) => {
      log.warn("catalog load failed", { error: err instanceof Error ? err.message : String(err) });
      if (entries.length) return entries;
      throw err;
    })
    .finally(() => { inflight = undefined; });
  return inflight;
}

/** Name, slug and category match, most used first (the catalogue is already sorted by usage). */
export async function searchCatalog(q: string, limit = 30): Promise<CatalogEntry[]> {
  const all = await catalog();
  const needle = q.trim().toLowerCase();
  if (!needle) return all.slice(0, limit);
  const words = needle.split(/\s+/).filter(Boolean);
  return all
    .filter((e) => {
      const hay = `${e.slug} ${e.name} ${e.categories.join(" ")}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .slice(0, limit);
}

export async function catalogEntry(slug: string): Promise<CatalogEntry | undefined> {
  const s = slug.toLowerCase();
  return (await catalog()).find((e) => e.slug === s);
}
