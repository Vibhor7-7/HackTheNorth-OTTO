// D-32: what Otto can and cannot do right now, for the voice model's
// `list_capabilities` tool (7.4).
//
// The answer is served from a cache, never fetched on the voice path (VG-10):
// the toolkit list is read from Composio when a Realtime session opens and again
// whenever a toolkit's status changes (extension.updated on the bus), so the
// tool itself is synchronous and costs nothing in the turn. The capability
// phrases are derived mechanically from the curated tool slugs (toolkits.ts), so
// the list can only ever claim what the agent actually has loaded.

import type { ListCapabilitiesResult } from "@otto/shared";
import { activeToolkitSlugs, composioConfigured, log } from "./client";
import { CURATED_TOOLS } from "./toolkits";
import { fastLaneAvailable } from "./fastlane";
import { subscribe } from "../bus";

let connected = new Set<string>();
let refreshedAt = 0;
let inflight: Promise<void> | undefined;

/** Re-read which toolkits are connected. Never throws; a failure keeps the last answer. */
export function refreshCapabilities(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    if (!composioConfigured()) { connected = new Set(); return; }
    try {
      connected = await activeToolkitSlugs();
      refreshedAt = Date.now();
    } catch (err) {
      log.warn("capability refresh failed; keeping the last answer", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  })().finally(() => { inflight = undefined; });
  return inflight;
}

// A connect or disconnect changes the answer; the bus already carries that.
subscribe((ev) => {
  if (ev.type === "extension.updated") void refreshCapabilities();
});

/** The tool's answer. Synchronous: it reads the cache and nothing else. */
export function capabilitySummary(): ListCapabilitiesResult {
  const known = Object.keys(CURATED_TOOLS);
  const can = known
    .filter((slug) => connected.has(slug))
    .map((slug) => ({ toolkit: slug, actions: phrases(slug) }));
  const needs_connection = known.filter((slug) => !connected.has(slug));

  return {
    connected: can,
    needs_connection,
    answers_directly: fastLaneAvailable() && connected.has("googlecalendar")
      ? ["whether the user is free in a time range", "what is on the user's calendar on a day"]
      : [],
    cannot: [
      "anything in an app that is not connected; offer to connect it from the app",
      "sending, posting, deleting or paying without the user approving it in the app first",
      "acting without a connected account; Otto never asks for passwords",
    ],
    stale: refreshedAt === 0,
  };
}

/** "GITHUB_CREATE_AN_ISSUE_COMMENT" -> "create an issue comment". */
function phrases(toolkit: string): string[] {
  const prefix = `${toolkit.toUpperCase()}_`;
  return (CURATED_TOOLS[toolkit] ?? []).map((slug) =>
    slug.startsWith(prefix) ? slug.slice(prefix.length).toLowerCase().replace(/_/g, " ") : slug.toLowerCase(),
  );
}
