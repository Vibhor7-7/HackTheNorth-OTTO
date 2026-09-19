// CMP-9. Exactly two Composio tools are visible to the voice agent: Google
// Calendar free/busy and list-events for a date. Both R0. Nothing else goes in
// this file without a Decision.
//
// Cut rule (Section 9): if either call's p95 exceeds 2 s on the stage network,
// or it freezes one turn in rehearsal, empty this map. Calendar questions then
// fall back to run_task with no other change anywhere.

import type { RiskTier } from "@otto/shared";

export interface FastLaneTool {
  /** Realtime function-tool name (Section 7.4). */
  name: string;
  /** Composio tool slug executed through approvals/gate.ts. */
  slug: string;
  toolkit: string;
  risk: RiskTier;
}

export const FAST_LANE: Record<string, FastLaneTool> = {
  calendar_free_busy: {
    name: "calendar_free_busy",
    slug: "GOOGLECALENDAR_FIND_FREE_SLOTS",
    toolkit: "googlecalendar",
    risk: "R0",
  },
  calendar_list_events: {
    name: "calendar_list_events",
    slug: "GOOGLECALENDAR_EVENTS_LIST",
    toolkit: "googlecalendar",
    risk: "R0",
  },
};

// CMP-8: verify both slugs against docs.composio.dev before wiring execute.ts.
// Until CMP-1/CMP-3 land, the gateway sees an unavailable lane and escalates
// every calendar question to run_task, which is the documented fallback.
export const fastLaneAvailable = () => false;
