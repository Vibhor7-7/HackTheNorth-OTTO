// CMP-4. Connect Link creation.
//
// Requires an API key with `connected_accounts` **write** access. A read-only key
// returns 403 APIKey_InsufficientPermissions and S0 cannot run at all, so this
// surfaces that as a distinct, named failure rather than a generic error.

import { ACTIVE, composio, composioConfigured, items, listConnectedAccounts, log, userId } from "./client";
import { callbackBaseUrl } from "../api/origin";

export type ConnectLinkResult =
  | { outcome: "ok"; link: string; requestId: string }
  /** The user already has an ACTIVE account here; there is nothing to connect. */
  | { outcome: "already_connected"; toolkit: string }
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

    // The SDK refuses to create a second link while an ACTIVE account exists on
    // this auth config ("Multiple connected accounts found ... allowMultiple").
    // That is the right refusal - one user, one account per toolkit (D-16) - but
    // it means the caller's picture was stale, so answer with the truth instead
    // of the SDK's error. Anything that is not ACTIVE is a flow someone started
    // and abandoned; it is deleted first so it can never be mistaken for a
    // connection, and so the dashboard does not fill with INITIALIZING rows.
    const existing = await listConnectedAccounts({ userIds: [userId()], authConfigIds: [cfg.id] });
    if (existing.some((a) => a.status === ACTIVE)) {
      log.info("already connected; no link needed", { toolkit: slug });
      return { outcome: "already_connected", toolkit: slug };
    }
    for (const stale of existing) {
      if (!stale.id) continue;
      await composio().connectedAccounts.delete(stale.id);
      log.info("removed abandoned connect flow", { toolkit: slug, account: stale.id, was: stale.status });
    }

    // `.link`, not `.initiate`: initiate returns 400 for Composio-managed OAuth
    // auth configs ("no longer supported ... use connected_accounts/link"), which
    // is what every toolkit set up from the dashboard is (CMP-8).
    // The browser may land anywhere (Section 15); the callback resolves the
    // ConnectionRequest whichever way it returns.
    const callbackUrl = `${callbackBaseUrl()}/connect/callback?toolkit=${encodeURIComponent(slug)}`;
    const req = (await composio().connectedAccounts.link(userId(), cfg.id, {
      callbackUrl,
    } as never)) as { id?: string; redirectUrl?: string };

    if (!req.redirectUrl) return { outcome: "error", message: "Composio returned no redirect URL" };
    log.info("connect link created", { toolkit: slug, request: req.id, callback: callbackUrl });
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
    const accounts = (await listConnectedAccounts({ userIds: [userId()] })).filter((a) => {
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
