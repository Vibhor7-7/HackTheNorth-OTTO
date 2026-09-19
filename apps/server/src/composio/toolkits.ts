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
  // D-36. The web, as a toolkit. No auth: Composio hosts the search, so this one
  // is available from a cold start and can never be in the S0 "needs connecting"
  // state. Three tools and no more - the toolkit also carries Amazon, Walmart,
  // flights and hotels, none of which a spoken question needs.
  composio_search: [
    "COMPOSIO_SEARCH_WEB",               // Exa-backed; returns { answer, citations }
    "COMPOSIO_SEARCH_NEWS",              // recency-filtered, for "what happened with"
    "COMPOSIO_SEARCH_FETCH_URL_CONTENT", // read one page the search turned up
  ],
  googlecalendar: [
    "GOOGLECALENDAR_GET_CURRENT_DATE_TIME",   // anchors "next week" to a real date
    "GOOGLECALENDAR_FIND_FREE_SLOTS",
    "GOOGLECALENDAR_EVENTS_LIST",
    "GOOGLECALENDAR_FIND_EVENT",
    "GOOGLECALENDAR_CREATE_EVENT",
    "GOOGLECALENDAR_UPDATE_EVENT",
    "GOOGLECALENDAR_DELETE_EVENT",
  ],
  gmail: [
    "GMAIL_SEND_EMAIL",          // R2: held for approval (S0's second beat)
    "GMAIL_CREATE_EMAIL_DRAFT",  // R1
    "GMAIL_FETCH_EMAILS",
    "GMAIL_SEARCH_PEOPLE",       // resolves a name to an address (AG-9)
    "GMAIL_GET_PROFILE",
  ],
  // GitHub on the agent path (D-28), where multi-step work is possible. Most
  // GitHub tools need owner/repo, which is exactly why they cannot live on the
  // fast lane: the agent has to resolve "the Otto repo" to a full name first, and
  // LIST_REPOSITORIES is what lets it.
  github: [
    // orientation - who am I, and what repos exist
    "GITHUB_GET_THE_AUTHENTICATED_USER",
    "GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER",
    // reading
    "GITHUB_LIST_ISSUES_ASSIGNED_TO_THE_AUTHENTICATED_USER",
    "GITHUB_LIST_NOTIFICATIONS_FOR_THE_AUTHENTICATED_USER",
    "GITHUB_LIST_REPOSITORY_ISSUES",
    "GITHUB_GET_AN_ISSUE",
    "GITHUB_LIST_PULL_REQUESTS",
    "GITHUB_SEARCH_ISSUES_AND_PULL_REQUESTS",
    // CREATE_A_PULL_REQUEST needs head and base branch names, so the agent has to
    // be able to look them up rather than invent them.
    "GITHUB_LIST_BRANCHES",
    // writing
    "GITHUB_CREATE_AN_ISSUE",            // R1
    "GITHUB_UPDATE_AN_ISSUE",            // R1 - also how an issue gets closed
    "GITHUB_ADD_ASSIGNEES_TO_AN_ISSUE",  // R1
    "GITHUB_CREATE_A_PULL_REQUEST",      // R1 - proposes a change, merges nothing
    "GITHUB_CREATE_AN_ISSUE_COMMENT",    // R2 - a public utterance in your name
    "GITHUB_MERGE_A_PULL_REQUEST",       // R2 - changes the default branch
  ],
  // LinkedIn: read the profile, post. The upload and ads surface is left out;
  // nothing in a spoken request needs a presigned image URL.
  linkedin: [
    "LINKEDIN_GET_MY_INFO",
    "LINKEDIN_GET_COMPANY_INFO",
    "LINKEDIN_GET_POST_CONTENT",
    "LINKEDIN_LIST_REACTIONS",
    "LINKEDIN_CREATE_LINKED_IN_POST",        // R2 - public, in the user's name
    "LINKEDIN_CREATE_ARTICLE_OR_URL_SHARE",  // R2
    "LINKEDIN_CREATE_COMMENT_ON_POST",       // R2
    "LINKEDIN_DELETE_LINKED_IN_POST",        // R2
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
