// CMP-5 / AP-2 / Section 7.6. Tier is derived from the Composio tool slug by
// rule, with an argument-level override that can raise but never lower.
// Unknown tools default to R2.

import type { RiskTier } from "@otto/shared";
import { env } from "../env";
import { logger } from "../log";

const log = logger("tiers");

// Explicit overrides for the demo toolkits (Section 7.6). These raise or pin a
// tier; the rules below cannot lower them.
export const TIER_OVERRIDES: Record<string, RiskTier> = {
  GOOGLECALENDAR_CREATE_EVENT: "R1",
  GOOGLECALENDAR_UPDATE_EVENT: "R1",
  GOOGLECALENDAR_FIND_FREE_SLOTS: "R0",
  GOOGLECALENDAR_EVENTS_LIST: "R0",
  GMAIL_SEND_EMAIL: "R2",

  // GitHub (D-28). Reads and private-ish writes are R1; anything that speaks in
  // the user's name publicly, or moves the default branch, holds for approval.
  GITHUB_CREATE_AN_ISSUE: "R1",
  GITHUB_UPDATE_AN_ISSUE: "R1",
  GITHUB_ADD_ASSIGNEES_TO_AN_ISSUE: "R1",
  // Opening a pull request proposes a change; it does not apply one. Closing it
  // undoes it completely, so it runs without an approval like any other
  // reversible write. Merging it is the irreversible half, and that stays R2.
  GITHUB_CREATE_A_PULL_REQUEST: "R1",
  // A comment is posted publicly as the user and cannot be un-said, which is
  // "sends on the user's behalf" and "public change" in 7.6's terms.
  GITHUB_CREATE_AN_ISSUE_COMMENT: "R2",
  // MERGE matches none of the 7.6 slug patterns, so it would land on R2 only via
  // the unknown-tool default. Pinned explicitly so it cannot drift to R1 if the
  // patterns ever change.
  GITHUB_MERGE_A_PULL_REQUEST: "R2",

  // LinkedIn. Every post, share and comment is a public utterance in the user's
  // name - the GitHub comment reasoning above, on a bigger stage. CREATE would
  // otherwise land them on R1 and they would run without asking.
  LINKEDIN_CREATE_LINKED_IN_POST: "R2",
  LINKEDIN_CREATE_ARTICLE_OR_URL_SHARE: "R2",
  LINKEDIN_CREATE_VIDEO_POST: "R2",
  LINKEDIN_CREATE_COMMENT_ON_POST: "R2",
  // Reads whose slugs match no R0 verb and would fall to the unknown default.
  LINKEDIN_WHO_AM_I: "R0",
  LINKEDIN_GET_POST_CONTENT: "R0",

  // Claude Code (D-36) edits files and runs commands on the user's laptop. RUN
  // matches no pattern, so this would reach R2 by default; pinned so it cannot
  // drift, because the approval card carrying the exact prompt is the safeguard.
  CLAUDECODE_RUN: "R2",

  // D-37. Reading the public web changes nothing and sends nothing, so all three
  // are R0 and run without an approval. Pinned rather than left to the patterns:
  // COMPOSIO_SEARCH_WEB would reach R0 only through the SEARCH in its toolkit
  // prefix, which is a coincidence of naming, not a rule.
  COMPOSIO_SEARCH_WEB: "R0",
  COMPOSIO_SEARCH_NEWS: "R0",
  COMPOSIO_SEARCH_FETCH_URL_CONTENT: "R0",
};

const R2_SLUG = /(SEND|DELETE|REMOVE|PUBLISH|PAY|ORDER|CHECKOUT|POST_|TWEET|PURCHASE|TRANSFER)/;
const R0_SLUG = /(GET|LIST|SEARCH|FETCH|FIND|READ|LOOKUP|CHECK)/;
const R1_SLUG = /(CREATE|UPDATE|ADD|SET|DRAFT|EDIT|INSERT)/;

const R2_ARGS = ["amount", "price", "total", "cost", "recipient", "to", "publish", "public"];

const RANK: Record<RiskTier, number> = { R0: 0, R1: 1, R2: 2 };
const higher = (a: RiskTier, b: RiskTier): RiskTier => (RANK[a] >= RANK[b] ? a : b);

/** AP-2: the argument override raises the tier; it never lowers it. */
export function classify(slug: string, args?: unknown): RiskTier {
  const upper = slug.toUpperCase();

  // Development-only escape hatch (5.2). Wins outright, including over the
  // argument rule, because its entire purpose is to let someone bypass an
  // approval they would otherwise have to tap every iteration. Logged every time
  // so it is never quietly in effect.
  const forced = env.devTierOverrides[upper];
  if (forced) {
    log.warn("tier forced by DEV_TIER_OVERRIDES", { slug: upper, tier: forced });
    return forced;
  }

  let tier: RiskTier;
  const override = TIER_OVERRIDES[upper];
  if (override) tier = override;
  else if (R2_SLUG.test(upper)) tier = "R2";
  else if (R0_SLUG.test(upper)) tier = "R0";
  else if (R1_SLUG.test(upper)) tier = "R1";
  else tier = "R2";                                  // unknown defaults to highest

  if (hasRiskyArg(args)) tier = higher(tier, "R2");
  return tier;
}

function hasRiskyArg(args: unknown): boolean {
  if (!args || typeof args !== "object") return false;
  const keys = Object.keys(args as Record<string, unknown>).map((k) => k.toLowerCase());
  return R2_ARGS.some((risky) => keys.includes(risky));
}

/**
 * Toolkit slugs that themselves contain an underscore, so the first-underscore
 * rule below would truncate them. Without this, every COMPOSIO_SEARCH_* step is
 * logged against a toolkit called "composio" that does not exist, and the
 * connection lookup in the gate asks about the wrong thing (D-37).
 */
const COMPOUND_TOOLKITS = ["composio_search"];

/** Composio slugs are TOOLKIT_VERB_NOUN; the toolkit is the part before the first underscore. */
export const toolkitOf = (slug: string): string => {
  const lower = slug.toLowerCase();
  const compound = COMPOUND_TOOLKITS.find((tk) => lower.startsWith(`${tk}_`));
  return compound ?? lower.split("_", 1)[0]!;
};
