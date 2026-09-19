// CMP-6. Toolkit list with connection status for this user, so APP-4 has real
// data. Reads only; the connect link itself is CMP-4 in connect.ts.

import type { Extension } from "@otto/shared";
import { activeToolkitSlugs, composio, composioConfigured, items, log } from "./client";
import { CURATED_TOOLS } from "./toolkits";
import { publish } from "../bus";
import { catalog } from "./catalog";
import { enabledToolkitSlugs } from "../store";
import type { CatalogEntry } from "@otto/shared";
import { CLAUDE_CODE_TOOLKIT, claudeCodeStatus } from "../local/claudeCode";

/** Shown when Composio is unconfigured so the Connections tab is never empty. */
const PLACEHOLDERS: Extension[] = Object.keys(CURATED_TOOLS).map((slug) => ({
  id: slug,
  name: slug,
  description: "Composio is not configured (COMPOSIO_API_KEY).",
  status: "suggested",
  tool_count: CURATED_TOOLS[slug]!.length,
}));

/** D-36: Claude Code as a card. Connected, off, or missing on the server - it always shows. */
function claudeCodeExtension(): Extension {
  const st = claudeCodeStatus();
  return {
    id: CLAUDE_CODE_TOOLKIT,
    name: "Claude Code",
    description: st.enabled
      ? `Connected. Otto can ask Claude Code (${st.version}) to work in ${st.dir}. Every run needs your approval.`
      : st.available
        ? `Found Claude Code ${st.version} on the server. Connect to let Otto hand it engineering work in ${st.dir}.`
        : st.version === null
          ? `The claude command was not found on the server. Install Claude Code there to use this.`
          : `CLAUDE_CODE_DIR does not exist on the server: ${st.dir}.`,
    status: st.enabled ? "connected" : st.available ? "needs_auth" : "suggested",
    tool_count: 1,
  };
}

export async function listExtensions(): Promise<Extension[]> {
  if (!composioConfigured()) return [claudeCodeExtension(), ...PLACEHOLDERS];

  try {
    const [configs, connected, entries] = await Promise.all([
      composio().authConfigs.list({} as never),
      activeToolkitSlugs(),
      catalog().catch(() => [] as CatalogEntry[]),
    ]);
    const meta = new Map(entries.map((e) => [e.slug, e]));
    const name = (slug: string) => meta.get(slug)?.name ?? pretty(slug);
    const logo = (slug: string) => meta.get(slug)?.logo_url;
    const tools = (slug: string) => CURATED_TOOLS[slug]?.length ?? meta.get(slug)?.tool_count ?? 0;

    // A toolkit can have more than one auth config - a managed OAuth one and a
    // direct-token one, say - but the Connections tab shows one card per toolkit,
    // so collapse them and let a connection win over a bare config.
    const byToolkit = new Map<string, Extension>();
    for (const c of items<{ id?: string; toolkit?: { slug?: string } | string; name?: string }>(configs)) {
      const slug = slugOf(c.toolkit) || (c.name ?? "").toLowerCase();
      if (!slug || byToolkit.has(slug)) continue;
      byToolkit.set(slug, {
        id: slug,
        name: name(slug),
        description: connected.has(slug)
          ? "Connected. Otto can use this."
          : "Set up but not connected yet. Otto will ask when it needs this.",
        status: connected.has(slug) ? "connected" : "needs_auth",
        tool_count: tools(slug),
        logo_url: logo(slug),
      });
    }

    byToolkit.set(CLAUDE_CODE_TOOLKIT, claudeCodeExtension());

    // D-34: toolkits that need no account, added from the catalogue.
    for (const slug of enabledToolkitSlugs()) {
      if (byToolkit.has(slug)) continue;
      byToolkit.set(slug, {
        id: slug,
        name: name(slug),
        description: "Needs no account. Otto can use this.",
        status: "connected",
        tool_count: tools(slug),
        logo_url: logo(slug),
      });
    }

    // Curated toolkits with no auth config at all are still worth surfacing.
    for (const slug of Object.keys(CURATED_TOOLS)) {
      if (byToolkit.has(slug)) continue;
      byToolkit.set(slug, {
        id: slug,
        name: name(slug),
        description: "Not set up yet. Connect it and Otto can use it.",
        status: "suggested",
        tool_count: CURATED_TOOLS[slug]!.length,
        logo_url: logo(slug),
      });
    }

    // Connected first, then anything waiting on the user, then suggestions.
    const rank = { connected: 0, needs_auth: 1, suggested: 2 } as const;
    const out = [...byToolkit.values()].sort(
      (a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name),
    );

    return out;
  } catch (err) {
    log.warn("extension listing failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return PLACEHOLDERS;
  }
}

/**
 * Announce a toolkit's current status. Called whenever a connection completes or is
 * removed, because otherwise the Connections tab and the "Needs you" card show a
 * stale status until the next manual refresh - and the moment a Connect Link
 * resolves itself is the closing beat of S0 (APP-7).
 */
export async function publishExtensionStatus(toolkit: string): Promise<void> {
  const slug = toolkit.toLowerCase();
  try {
    const all = await listExtensions();
    const one = all.find((e) => e.id === slug);
    if (one) publish({ type: "extension.updated", data: one });
    else log.warn("no extension to announce", { toolkit: slug });
  } catch (err) {
    log.warn("could not announce extension status", {
      toolkit: slug,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

const slugOf = (tk: { slug?: string } | string | undefined): string =>
  (typeof tk === "string" ? tk : tk?.slug ?? "").toLowerCase();

const NAMES: Record<string, string> = {
  googlecalendar: "Google Calendar",
  gmail: "Gmail",
  github: "GitHub",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
};
const pretty = (slug: string) => NAMES[slug] ?? slug.replace(/^\w/, (c) => c.toUpperCase());
