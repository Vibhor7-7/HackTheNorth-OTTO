// CMP-1 / AG-7 (D-26). Discovery has to be reliable before it is impressive:
// S1 fails on stage if the agent is handed the wrong tools.
//
// What was measured against the live catalogue (CMP-8):
//   - `tools.getRawComposioTools({ search })` is AND-keyword matching over tool
//     text, not semantic. "free busy calendar" returns exactly the right tools;
//     "free slot week" returns nothing, because "week" matches no tool. A user's
//     sentence therefore cannot be passed through, and keyword extraction is not
//     reliable either - one unmatched word zeroes the result.
//   - When a search happens to resolve to a single toolkit, the SDK sends
//     `scopes: null` and the API rejects it. So a search can throw, not just
//     come back empty.
//   - `toolkits.get({ search })` ignores `search` entirely: the same six
//     toolkits come back for "calendar", "whatsapp messaging" and no search.
//   - A bare `limit` on a toolkit's tools truncates alphabetically, so asking
//     for 5 Google Calendar tools yields five *_ACL_* tools.
//
// So: the candidate toolkits are the ones this user actually has set up, keyword
// search is a best-effort bonus that can widen the set, and the tools within a
// toolkit come from a curated subset (toolkits.ts). The dynamic part that is
// real - and that the AG-7 plan step should claim - is which toolkits get chosen
// and the fact that an unconnected one triggers a live Connect Link.

import { activeToolkitSlugs, composio, items, log } from "./client";
import { CURATED_TOOLS, rankUncuratedTools } from "./toolkits";
import { enabledToolkitSlugs } from "../store";
import { catalog } from "./catalog";
import { CLAUDE_CODE_SLUG, CLAUDE_CODE_TOOLKIT, claudeCodeEnabled } from "../local/claudeCode";

export interface DiscoveredToolkit {
  slug: string;
  name: string;
  connected: boolean;
  /** Tool slugs to load into the agent loop. */
  tools: string[];
}

export interface Discovery {
  chosen: DiscoveredToolkit[];
  /** Candidates not chosen, for the AG-7 plan step. */
  alsoConsidered: string[];
  reason: string;
}

/** CMP-7: cache per goal string for the process lifetime. */
const cache = new Map<string, Discovery>();

export async function discover(goal: string, max = 2): Promise<Discovery> {
  const cached = cache.get(goal);
  if (cached) return cached;

  const available = await availableToolkits();
  const hinted = await searchHint(goal);

  // D-35: an app the goal names by name is a candidate even with nothing set up.
  // The gate creates the auth config and raises the Connect Link when a tool of
  // it is first called, so "save this to Notion" works from zero.
  const named = await catalogMatches(goal, new Set(available.map((t) => t.slug)));
  for (const c of named) available.push({ slug: c.slug, name: c.name, connected: false });

  // Score each available toolkit against the goal. A search hit is strong
  // evidence; a curated keyword match is the reliable fallback.
  const scored = available
    .map((tk) => ({ ...tk, score: scoreToolkit(tk.slug, goal, hinted) + (named.some((c) => c.slug === tk.slug) ? 6 : 0) }))
    .filter((tk) => tk.score > 0)
    .sort((a, b) => b.score - a.score || Number(b.connected) - Number(a.connected));

  const chosen: DiscoveredToolkit[] = [];
  for (const tk of scored) {
    if (chosen.length >= max) break;
    const tools = await toolsFor(tk.slug, goal);
    if (tools.length) chosen.push({ slug: tk.slug, name: tk.name, connected: tk.connected, tools });
  }

  const discovery: Discovery = {
    chosen,
    alsoConsidered: available
      .filter((t) => !chosen.some((c) => c.slug === t.slug))
      .slice(0, 3)
      .map((t) => t.slug),
    reason: chosen.length
      ? `Chose ${chosen.map((c) => c.name).join(" and ")} for this goal.`
      : "No available toolkit matched the goal.",
  };

  cache.set(goal, discovery);
  log.info("discovery", {
    goal,
    chosen: chosen.map((c) => `${c.slug}(${c.tools.length}${c.connected ? "" : ",unconnected"})`).join(","),
    also: discovery.alsoConsidered.join(","),
  });
  return discovery;
}

/**
 * Toolkits this user has set up, with whether an account is actually connected.
 * An auth config with no connected account is exactly the S0 state (D-16) and
 * must still be offered, so the agent hits needs-auth and raises a Connect Link.
 */
async function availableToolkits(): Promise<{ slug: string; name: string; connected: boolean }[]> {
  try {
    const [configs, connected] = await Promise.all([
      composio().authConfigs.list({} as never),
      activeToolkitSlugs(),
    ]);
    // One entry per toolkit: a toolkit can carry several auth configs, and
    // listing it twice would double it in the AG-7 plan step.
    const bySlug = new Map<string, { slug: string; name: string; connected: boolean }>();
    for (const c of items<{ toolkit?: { slug?: string } | string; name?: string }>(configs)) {
      const slug = slugOf(c.toolkit) || (c.name ?? "").toLowerCase();
      if (!slug || bySlug.has(slug)) continue;
      bySlug.set(slug, { slug, name: slug, connected: connected.has(slug) });
    }
    // D-34: no-auth toolkits have no auth config; they are enabled in the store.
    for (const slug of enabledToolkitSlugs()) {
      if (slug === CLAUDE_CODE_TOOLKIT) continue;             // D-36: added below on its own terms
      if (!bySlug.has(slug)) bySlug.set(slug, { slug, name: slug, connected: true });
    }
    if (claudeCodeEnabled()) bySlug.set(CLAUDE_CODE_TOOLKIT, { slug: CLAUDE_CODE_TOOLKIT, name: "Claude Code", connected: true });
    const out = [...bySlug.values()];
    return out.length ? out : fallback();
  } catch (err) {
    log.warn("toolkit availability lookup failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return fallback();
  }
}

const fallback = () => [
  ...Object.keys(CURATED_TOOLS).map((slug) => ({ slug, name: slug, connected: false })),
  ...(claudeCodeEnabled() ? [{ slug: CLAUDE_CODE_TOOLKIT, name: "Claude Code", connected: true }] : []),
];

/**
 * Best-effort keyword search, purely to widen the candidate set. Returns the
 * toolkits behind whatever tools matched. Never throws: a zero result and an
 * SDK error are both just "no hint".
 */
async function searchHint(goal: string): Promise<Set<string>> {
  const query = keywordQuery(goal);
  if (!query) return new Set();
  try {
    const raw = await composio().tools.getRawComposioTools({ search: query, limit: 10 } as never);
    const hits = items<{ slug?: string }>(raw)
      .map((t) => (t.slug ?? "").split("_", 1)[0]!.toLowerCase())
      .filter(Boolean);
    if (hits.length) log.info("search hint", { query, toolkits: [...new Set(hits)].join(",") });
    return new Set(hits);
  } catch {
    return new Set();
  }
}

/** Domain nouns that actually appear in tool text; anything else zeroes an AND search. */
const SEARCH_TERMS = [
  "calendar", "event", "busy", "free", "message", "email", "send", "contact",
  "attendee", "meeting", "schedule", "invite", "chat", "reminder", "task", "file",
  "issue", "repository", "pull", "notification", "draft",
];
const keywordQuery = (goal: string): string => {
  const words = new Set(goal.toLowerCase().match(/[a-z]{3,}/g) ?? []);
  return SEARCH_TERMS.filter((t) => words.has(t)).slice(0, 3).join(" ");
};

/**
 * Catalogue toolkits whose name or slug appears in the goal, and which the app can
 * actually connect (managed OAuth or no auth). At most three; the catalogue is
 * ordered by usage so the popular one wins a tie.
 */
async function catalogMatches(goal: string, skip: Set<string>): Promise<{ slug: string; name: string }[]> {
  const words = new Set(goal.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
  if (!words.size) return [];
  try {
    const all = await catalog();
    return all
      .filter((e) => !skip.has(e.slug) && (e.auth === "managed" || e.auth === "none"))
      .filter((e) => {
        const tokens = new Set([e.slug, ...e.name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3)]);
        return [...tokens].some((t) => words.has(t));
      })
      .slice(0, 3)
      .map((e) => ({ slug: e.slug, name: e.name }));
  } catch {
    return [];
  }
}

/** Words in the goal that point at a toolkit we know about. */
const TOOLKIT_HINTS: Record<string, string[]> = {
  googlecalendar: ["calendar", "meeting", "schedule", "invite", "free", "busy", "event", "appointment"],
  gmail: ["email", "mail", "inbox", "gmail", "send", "invite", "reply", "forward", "address"],
  github: ["github", "issue", "issues", "repo", "repository", "pull", "pr", "commit", "branch", "notification"],
  linkedin: ["linkedin", "post", "share", "article", "network", "followers", "connections", "profile"],
  claudecode: ["claude", "code", "codebase", "repo", "bug", "fix", "test", "tests", "refactor", "implement", "function", "file", "typescript", "compile", "lint", "build"],
  // whatsapp is deliberately absent: the toolkit was dropped, so nothing should
  // steer a task towards it even if an auth config lingers in the account.
};

function scoreToolkit(slug: string, goal: string, hinted: Set<string>): number {
  const words = new Set(goal.toLowerCase().match(/[a-z]{3,}/g) ?? []);
  let score = 0;
  if (hinted.has(slug)) score += 10;
  for (const hint of TOOLKIT_HINTS[slug] ?? []) if (words.has(hint)) score += 3;
  // A curated toolkit is one the demo needs; never let it score zero outright.
  if (score === 0 && slug in CURATED_TOOLS) score = 1;
  return score;
}

async function toolsFor(toolkit: string, goal: string): Promise<string[]> {
  if (toolkit === CLAUDE_CODE_TOOLKIT) return [CLAUDE_CODE_SLUG];
  const curated = CURATED_TOOLS[toolkit];
  if (curated) return curated;
  try {
    // Never pass a small `limit` here: Composio truncates alphabetically (D-26).
    const raw = await composio().tools.getRawComposioTools({ toolkits: [toolkit], limit: 200 } as never);
    const slugs = items<{ slug?: string }>(raw).map((t) => t.slug ?? "").filter(Boolean);
    return rankUncuratedTools(slugs, goal);
  } catch (err) {
    log.warn("tool list failed", { toolkit, error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

const slugOf = (tk: { slug?: string } | string | undefined): string =>
  (typeof tk === "string" ? tk : tk?.slug ?? "").toLowerCase();
