// CMP-5 / AP-2 / Section 7.6. Tier is derived from the Composio tool slug by
// rule, with an argument-level override that can raise but never lower.
// Unknown tools default to R2.

import type { RiskTier } from "@otto/shared";

// Explicit overrides for the demo toolkits (Section 7.6). These raise or pin a
// tier; the rules below cannot lower them.
export const TIER_OVERRIDES: Record<string, RiskTier> = {
  GOOGLECALENDAR_CREATE_EVENT: "R1",
  GOOGLECALENDAR_UPDATE_EVENT: "R1",
  GOOGLECALENDAR_FIND_FREE_SLOTS: "R0",
  GOOGLECALENDAR_EVENTS_LIST: "R0",
  GMAIL_SEND_EMAIL: "R2",
  SHOPIFY_UPDATE_PRODUCT: "R2",
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

/** Composio slugs are TOOLKIT_VERB_NOUN; the toolkit is the part before the first underscore. */
export const toolkitOf = (slug: string): string => slug.split("_", 1)[0]!.toLowerCase();
