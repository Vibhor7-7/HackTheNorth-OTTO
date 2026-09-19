// CMP-6. Toolkit list with connection status for this user, so APP-4 has real
// data. Reads only; the connect link itself is CMP-4 in connect.ts.

import type { Extension } from "@otto/shared";
import { activeToolkitSlugs, composio, composioConfigured, items, log } from "./client";
import { CURATED_TOOLS } from "./toolkits";

/** Shown when Composio is unconfigured so the Connections tab is never empty. */
const PLACEHOLDERS: Extension[] = Object.keys(CURATED_TOOLS).map((slug) => ({
  id: slug,
  name: slug,
  description: "Composio is not configured (COMPOSIO_API_KEY).",
  status: "suggested",
  tool_count: CURATED_TOOLS[slug]!.length,
}));

export async function listExtensions(): Promise<Extension[]> {
  if (!composioConfigured()) return PLACEHOLDERS;

  try {
    const [configs, connected] = await Promise.all([
      composio().authConfigs.list({} as never),
      activeToolkitSlugs(),
    ]);

    // An auth config exists for every toolkit someone set up in the dashboard.
    // With an account it is connected; without one it needs auth - which is
    // exactly the state S0 depends on (D-16).
    const out = items<{ id?: string; toolkit?: { slug?: string } | string; name?: string }>(configs)
      .map((c): Extension => {
        const slug = slugOf(c.toolkit) || (c.name ?? "").toLowerCase();
        return {
          id: slug,
          name: pretty(slug),
          description: connected.has(slug)
            ? "Connected. Otto can use this."
            : "Set up but not connected yet. Otto will ask when it needs this.",
          status: connected.has(slug) ? "connected" : "needs_auth",
          tool_count: CURATED_TOOLS[slug]?.length ?? 0,
        };
      })
      .filter((e) => e.id);

    // Curated toolkits with no auth config at all are still worth surfacing.
    for (const slug of Object.keys(CURATED_TOOLS)) {
      if (out.some((e) => e.id === slug)) continue;
      out.push({
        id: slug,
        name: pretty(slug),
        description: "No auth config yet. Create one in the Composio dashboard.",
        status: "suggested",
        tool_count: CURATED_TOOLS[slug]!.length,
      });
    }

    return out;
  } catch (err) {
    log.warn("extension listing failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return PLACEHOLDERS;
  }
}

const slugOf = (tk: { slug?: string } | string | undefined): string =>
  (typeof tk === "string" ? tk : tk?.slug ?? "").toLowerCase();

const NAMES: Record<string, string> = {
  googlecalendar: "Google Calendar",
  whatsapp: "WhatsApp",
  gmail: "Gmail",
};
const pretty = (slug: string) => NAMES[slug] ?? slug.replace(/^\w/, (c) => c.toUpperCase());
