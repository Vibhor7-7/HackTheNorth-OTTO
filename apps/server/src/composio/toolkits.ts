// CMP-1's curated tool subsets (D-26).
//
// Why this file exists: tool-level semantic search is not usable. Measured
// against the live catalogue, `search` with a full goal sentence returns zero
// results, a short phrase returns unranked alphabetical matches, and `limit`
// truncates a toolkit's tools alphabetically - asking for 5 Google Calendar
// tools yields five *_ACL_* tools and nothing that can schedule anything.
//
// So the toolkit choice is dynamic (toolkits.getToolkits({search}), which does
// rank sensibly) and the tool choice within a known toolkit is curated. For a
// toolkit we have no curation for, DEFAULT_VERBS filters its full list, which
// still beats alphabetical truncation.

/** Tools loaded into the agent loop for a toolkit we know the demo needs. */
export const CURATED_TOOLS: Record<string, string[]> = {
  googlecalendar: [
    "GOOGLECALENDAR_GET_CURRENT_DATE_TIME",   // anchors "next week" to a real date
    "GOOGLECALENDAR_FIND_FREE_SLOTS",
    "GOOGLECALENDAR_EVENTS_LIST",
    "GOOGLECALENDAR_FIND_EVENT",
    "GOOGLECALENDAR_CREATE_EVENT",
    "GOOGLECALENDAR_UPDATE_EVENT",
    "GOOGLECALENDAR_DELETE_EVENT",
  ],
  whatsapp: [
    "WHATSAPP_SEND_MESSAGE",
    "WHATSAPP_GET_MESSAGE_HISTORY",
    "WHATSAPP_GET_PHONE_NUMBERS",
  ],
};

/**
 * Verbs worth loading from an uncurated toolkit, roughly ranked by how often an
 * agent needs them. Deliberately excludes the administrative surface (ACL,
 * SETTINGS, WATCH, CHANNELS, BATCH) that dominates most toolkits alphabetically.
 */
const DEFAULT_VERBS = [
  "SEND", "CREATE", "GET", "LIST", "FIND", "SEARCH", "UPDATE", "ADD", "READ",
];
const ADMIN_NOISE = /(_ACL_|_SETTINGS_|_WATCH$|_CHANNELS_|_BATCH_|_SYNC_|_IMPORT$|_INSTANCES$)/;

/** Pick a useful subset of an uncurated toolkit's tools. */
export function rankUncuratedTools(slugs: string[], goal: string, max = 10): string[] {
  const words = new Set(goal.toUpperCase().match(/[A-Z]{4,}/g) ?? []);

  const scored = slugs
    .filter((slug) => !ADMIN_NOISE.test(slug))
    .map((slug) => {
      const verbIndex = DEFAULT_VERBS.findIndex((v) => slug.includes(v));
      // A slug whose noun appears in the goal ranks above one that only shares a verb.
      const goalHit = [...words].some((w) => slug.includes(w)) ? 1 : 0;
      return { slug, score: (verbIndex === -1 ? 99 : verbIndex) - goalHit * 50 };
    })
    .sort((a, b) => a.score - b.score || a.slug.localeCompare(b.slug));

  return scored.slice(0, max).map((s) => s.slug);
}
