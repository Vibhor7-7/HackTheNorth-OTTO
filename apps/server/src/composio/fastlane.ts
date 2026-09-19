// CMP-9. Exactly two Composio tools are visible to the voice agent: Google
// Calendar free/busy and list-events for a date. Both R0. Nothing else goes in
// this file without a Decision.
//
// Cut rule (Section 9): if either call's p95 exceeds 2 s on the stage network,
// or it freezes one turn in rehearsal, empty this map. Calendar questions then
// fall back to run_task with no other change anywhere.

import type { RiskTier } from "@otto/shared";
import { composioConfigured } from "./client";

export interface FastLaneTool {
  /** Realtime function-tool name (Section 7.4). */
  name: string;
  /** Composio tool slug executed through approvals/gate.ts. */
  slug: string;
  toolkit: string;
  risk: RiskTier;
  /**
   * Translates the Section 7.4 arguments the voice model supplies into the exact
   * parameters the Composio tool accepts.
   *
   * This is not optional sugar. The 7.4 names are chosen for a speaking model
   * ("date", "start", "end"); the tools want `timeMin`/`timeMax`/`timeZone` and
   * `time_min`/`time_max`/`timezone` respectively, and Composio **silently
   * ignores** parameters it does not recognise. Without a mapping,
   * `calendar_list_events` returned the ten oldest events in the calendar and
   * `calendar_free_busy` answered about today whatever it was asked - both
   * confidently, and both wrong.
   */
  mapArgs: (args: Record<string, unknown>, ctx: { timezone: string }) => Record<string, unknown>;
  /** Projects the tool result down to what a spoken answer needs. */
  shape?: (data: unknown) => unknown;
}

/** Midnight-to-midnight in the user's own timezone, as the tools expect. */
function dayBounds(date: string, timezone: string): { start: string; end: string } {
  // A bare YYYY-MM-DD plus the tool's timezone parameter is unambiguous, and
  // avoids guessing the UTC offset for a date that might straddle a DST change.
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const tomorrow = next.toISOString().slice(0, 10);
  void timezone;
  return { start: `${date}T00:00:00`, end: `${tomorrow}T00:00:00` };
}

export const FAST_LANE: Record<string, FastLaneTool> = {
  calendar_free_busy: {
    name: "calendar_free_busy",
    slug: "GOOGLECALENDAR_FIND_FREE_SLOTS",
    toolkit: "googlecalendar",
    risk: "R0",
    mapArgs: (args, { timezone }) => ({
      time_min: String(args.start ?? ""),
      time_max: String(args.end ?? ""),
      timezone,
      items: ["primary"],
    }),
    shape: (d) => {
      // { calendars: { primary: { busy: [...], free: [...] } } }
      const calendars = (d as Record<string, any>)?.calendars ?? {};
      const busy: { start: string; end: string }[] = [];
      for (const cal of Object.values<any>(calendars)) {
        for (const b of cal?.busy ?? []) busy.push({ start: b.start, end: b.end });
      }
      return { busy: busy.slice(0, 10) };
    },
  },
  calendar_list_events: {
    name: "calendar_list_events",
    slug: "GOOGLECALENDAR_EVENTS_LIST",
    toolkit: "googlecalendar",
    risk: "R0",
    mapArgs: (args, { timezone }) => {
      const { start, end } = dayBounds(String(args.date ?? ""), timezone);
      return {
        calendarId: "primary",      // camelCase: `calendar_id` is ignored
        timeMin: start,
        timeMax: end,
        timeZone: timezone,
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 10,
      };
    },
    shape: (d) => ({
      events: list(d, "items").slice(0, 10).map((e) => ({
        title: e.summary,
        start: e.start?.dateTime ?? e.start?.date,
        end: e.end?.dateTime ?? e.end?.date,
        attendees: (e.attendees ?? []).map((a: any) => a.email).slice(0, 5),
      })),
    }),
  },
};

/**
 * Composio wraps a tool's payload differently per toolkit, so pull the first
 * array we recognise rather than assuming one shape.
 */
function list(data: unknown, ...keys: string[]): Record<string, any>[] {
  const d = data as Record<string, any> | undefined;
  if (!d) return [];
  if (Array.isArray(d)) return d as Record<string, any>[];
  for (const k of keys) if (Array.isArray(d[k])) return d[k];
  for (const v of Object.values(d)) if (Array.isArray(v)) return v as Record<string, any>[];
  return [];
}

// Both slugs verified present in the live Google Calendar toolkit (CMP-8).
//
// The lane is only offered when Composio is configured. If it misbehaves on the
// stage network, empty FAST_LANE above and calendar questions fall back to
// run_task with no other change anywhere (Section 9 cut rule).
export const fastLaneAvailable = (): boolean =>
  composioConfigured() && Object.keys(FAST_LANE).length > 0;
