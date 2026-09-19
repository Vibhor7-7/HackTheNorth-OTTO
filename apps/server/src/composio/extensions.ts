// CMP-6. Toolkit list with connection status for this user, so APP-4 has real
// data. Until the SDK is wired (CMP-8), the demo toolkits are returned as
// `suggested` so the Connections tab is never empty during development.

import type { Extension } from "@otto/shared";
import { env } from "../env";
import { logger } from "../log";

const log = logger("composio");

export const composioConfigured = () => Boolean(env.composioApiKey);

// S0 depends on Gmail NOT being connected (D-16). Pre-connect Google Calendar
// and Shopify only (CMP-2).
const DEMO_TOOLKITS: Extension[] = [
  { id: "googlecalendar", name: "Google Calendar", description: "Events, free/busy, invites.", status: "suggested", tool_count: 0 },
  { id: "gmail", name: "Gmail", description: "Send and read mail.", status: "suggested", tool_count: 0 },
  { id: "shopify", name: "Shopify", description: "Products, prices, orders.", status: "suggested", tool_count: 0 },
];

/**
 * [TODO CMP-6] Replace with a Composio toolkit listing for COMPOSIO_USER_ID,
 * mapping connected accounts to `connected`, known-but-unauthed to `needs_auth`,
 * and the rest to `suggested`. Sort toolkits Otto used recently to the top (APP-4).
 */
export async function listExtensions(): Promise<Extension[]> {
  if (!composioConfigured()) {
    log.warn("COMPOSIO_API_KEY unset, returning demo toolkit list");
  }
  return DEMO_TOOLKITS;
}

/**
 * [TODO CMP-4] Create a Composio Connect Link for this toolkit, redirecting to
 * `${PUBLIC_BASE_URL}/connect/callback?toolkit=<id>`. Verify the SDK method name
 * against docs.composio.dev first (CMP-8).
 */
export async function createConnectLink(toolkitId: string): Promise<string | undefined> {
  if (!composioConfigured()) return undefined;
  log.warn("connect link not implemented yet", { toolkit: toolkitId });
  return undefined;
}

/** [TODO APP-5, P1] Disconnect a toolkit for this user. */
export async function disconnectToolkit(toolkitId: string): Promise<void> {
  log.warn("disconnect not implemented yet", { toolkit: toolkitId });
}
