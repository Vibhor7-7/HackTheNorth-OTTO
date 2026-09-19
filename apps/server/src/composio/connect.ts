// CMP-4. Connect Link creation.
//
// Requires an API key with `connected_accounts` **write** access. A read-only key
// returns 403 APIKey_InsufficientPermissions and S0 cannot run at all, so this
// surfaces that as a distinct, named failure rather than a generic error.

import { composio, composioConfigured, items, log, userId } from "./client";
import { env } from "../env";

export type ConnectLinkResult =
  | { outcome: "ok"; link: string; requestId: string }
  | { outcome: "no_auth_config"; toolkit: string }
  | { outcome: "key_lacks_write" }
  | { outcome: "error"; message: string };

export async function createConnectLink(toolkit: string): Promise<ConnectLinkResult> {
  if (!composioConfigured()) return { outcome: "error", message: "COMPOSIO_API_KEY is not set" };

  const slug = toolkit.toLowerCase();
  try {
    const configs = items<{ id?: string; toolkit?: { slug?: string } | string; name?: string }>(
      await composio().authConfigs.list({} as never),
    );
    const cfg = configs.find((c) => {
      const s = typeof c.toolkit === "string" ? c.toolkit : c.toolkit?.slug;
      return (s ?? c.name ?? "").toLowerCase() === slug;
    });
    if (!cfg?.id) return { outcome: "no_auth_config", toolkit: slug };

    // `.link`, not `.initiate`: initiate returns 400 for Composio-managed OAuth
    // auth configs ("no longer supported ... use connected_accounts/link"), which
    // is what every toolkit set up from the dashboard is (CMP-8).
    const req = (await composio().connectedAccounts.link(userId(), cfg.id, {
      // The browser may land anywhere (Section 15); the callback resolves the
      // ConnectionRequest whichever way it returns.
      callbackUrl: `${env.publicBaseUrl}/connect/callback?toolkit=${encodeURIComponent(slug)}`,
    } as never)) as { id?: string; redirectUrl?: string };

    if (!req.redirectUrl) return { outcome: "error", message: "Composio returned no redirect URL" };
    log.info("connect link created", { toolkit: slug, request: req.id });
    return { outcome: "ok", link: req.redirectUrl, requestId: req.id ?? "" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/InsufficientPermissions|connected_accounts/.test(message)) {
      log.error("API key cannot create connections; S0 is impossible until it can", { toolkit: slug });
      return { outcome: "key_lacks_write" };
    }
    return { outcome: "error", message };
  }
}

/**
 * APP-5. Removes this user's connected accounts for a toolkit, which is what makes
 * the Disconnect button true rather than decorative. Also how S0 is reset between
 * rehearsals: disconnect Gmail and the live Connect Link beat works again (D-16).
 */
export async function disconnectToolkit(toolkit: string): Promise<number> {
  if (!composioConfigured()) return 0;
  const slug = toolkit.toLowerCase();
  try {
    const accounts = items<{ id?: string; toolkit?: { slug?: string } | string; status?: string }>(
      await composio().connectedAccounts.list({ userId: userId() } as never),
    ).filter((a) => {
      const s = typeof a.toolkit === "string" ? a.toolkit : a.toolkit?.slug;
      return (s ?? "").toLowerCase() === slug;
    });

    for (const account of accounts) {
      if (!account.id) continue;
      await composio().connectedAccounts.delete(account.id);
      log.info("disconnected", { toolkit: slug, account: account.id, was: account.status });
    }
    return accounts.length;
  } catch (err) {
    log.error("disconnect failed", {
      toolkit: slug,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
