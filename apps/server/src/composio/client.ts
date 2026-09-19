// One Composio client. Verified against @composio/core 0.18.1 (CMP-8); the
// version is pinned because Tool Router and the session API are beta and the
// docs describe two different surfaces.
//
// We use the classic surface (tools.get / tools.execute / connectedAccounts)
// rather than sessions or toolRouter, because those bundle auth and execution
// into one call and would put the work on the far side of our approval gate
// (AG-3, D-11).

import { Composio } from "@composio/core";
import { env } from "../env";
import { logger } from "../log";

export const log = logger("composio");

export const composioConfigured = (): boolean => Boolean(env.composioApiKey);

let client: Composio | undefined;

export function composio(): Composio {
  if (!composioConfigured()) {
    throw new Error("COMPOSIO_API_KEY is not set (Section 5.2)");
  }
  client ??= new Composio({ apiKey: env.composioApiKey });
  return client;
}

export const userId = () => env.composioUserId;

/** Composio paginates some reads and returns bare arrays on others. */
export function items<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const maybe = (result as { items?: unknown })?.items;
  return Array.isArray(maybe) ? (maybe as T[]) : [];
}

/**
 * A connected account is usable only when it is ACTIVE. An account that is
 * INITIALIZING or INITIATED is a connect flow someone started and did not
 * finish, and treating it as connected is worse than treating it as missing: the
 * agent would call a tool that cannot work, and S0's Connect Link beat would be
 * skipped because the toolkit looked ready (D-16).
 */
export const ACTIVE = "ACTIVE";

export interface ConnectedAccountRow {
  id?: string;
  toolkit?: { slug?: string } | string;
  status?: string;
}

/**
 * Every connected account matching a filter, across pages. The list is paginated
 * (10 per page by default) and every abandoned Connect Link leaves an EXPIRED
 * row behind, so after a day of rehearsals the ACTIVE account that matters is on
 * page two and a single-page read calls a connected toolkit "needs auth". That
 * is exactly how S0's Connect button ends up offered for a toolkit Composio then
 * refuses to connect twice.
 */
export async function listConnectedAccounts(filter: {
  userIds?: string[]; authConfigIds?: string[]; statuses?: string[];
}): Promise<ConnectedAccountRow[]> {
  const out: ConnectedAccountRow[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 50; page++) {
    const res = (await composio().connectedAccounts.list({
      ...filter, limit: 100, ...(cursor ? { cursor } : {}),
    } as never)) as { items?: ConnectedAccountRow[]; nextCursor?: string | null };
    out.push(...items<ConnectedAccountRow>(res));
    if (!res.nextCursor) break;
    cursor = res.nextCursor;
  }
  return out;
}

/** Slugs of the toolkits this user has a usable connection for. */
export async function activeToolkitSlugs(): Promise<Set<string>> {
  const rows = await listConnectedAccounts({ userIds: [userId()], statuses: [ACTIVE] });
  return new Set(
    rows
      .filter((a) => a.status === ACTIVE)
      .map((a) => (typeof a.toolkit === "string" ? a.toolkit : a.toolkit?.slug ?? "").toLowerCase())
      .filter(Boolean),
  );
}

/** Composio slugs are TOOLKIT_VERB_NOUN. */
export const toolkitSlugOf = (slug: string): string => slug.split("_", 1)[0]!.toLowerCase();
