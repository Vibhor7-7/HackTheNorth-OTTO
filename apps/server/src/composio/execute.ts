// CMP-3. **Only `approvals/gate.ts` may import this file** (AG-3, D-11). If you
// are reading this because you want to call a tool from the agent loop: you
// cannot, and that is the point.

import { activeToolkitSlugs, composio as composioClient, log, userId as composioUser } from "./client";
import { CLAUDE_CODE_SLUG, CLAUDE_CODE_TOOLKIT, claudeCodeEnabled, runClaudeCode } from "../local/claudeCode";
/** CMP-3: 30 s timeout, one retry, structured errors. */
const TIMEOUT_MS = 30_000;

export type ExecuteResult =
  | { outcome: "ok"; data: unknown }
  /** CMP-4: the toolkit has no connected account for this user yet. */
  | { outcome: "needs_connection"; toolkit: string }
  | { outcome: "error"; message: string };

// Composio's failure text for an unconnected toolkit is just "Error executing
// the tool <SLUG>", so the message cannot be trusted to tell us why. These
// patterns are a fast path only; the authoritative answer is whether a connected
// account exists (isToolkitConnected), which is checked on every failure.
const NEEDS_AUTH =
  /(no connected account|not connected|connection not found|invalid_grant|unauthorized|401|expired)/i;

export async function executeTool(slug: string, args: unknown, toolkit: string): Promise<ExecuteResult> {
  // D-36: the one tool that runs on this laptop rather than through Composio.
  // Same gate, same step log, same tiers; only the executor differs.
  if (slug === CLAUDE_CODE_SLUG) {
    if (!claudeCodeEnabled()) return { outcome: "needs_connection", toolkit: CLAUDE_CODE_TOOLKIT };
    const r = await runClaudeCode(args);
    return r.ok
      ? { outcome: "ok", data: r }
      : { outcome: "error", message: r.summary };
  }

  let last = "";

  // One retry: Composio occasionally 5xxs on a cold toolkit, and the venue
  // network drops requests.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await withTimeout(
        composioClient().tools.execute(slug, {
          userId: composioUser(),
          arguments: (args ?? {}) as Record<string, unknown>,
          // The API refuses a manual execution without a toolkit version. We do
          // not pin per-toolkit versions, so skip the check explicitly rather
          // than have every call fail on it.
          dangerouslySkipVersionCheck: true,
        } as never),
        TIMEOUT_MS,
      );

      const r = result as { successful?: boolean; data?: unknown; error?: unknown };

      // Composio reports tool-level failure in the body, not by throwing.
      if (r.successful === false) {
        const message = describe(r.error);
        if (NEEDS_AUTH.test(message)) return { outcome: "needs_connection", toolkit };
        last = message;
        log.warn("tool reported failure", { slug, attempt, error: message });
        continue;
      }

      return { outcome: "ok", data: r.data ?? r };
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
      if (NEEDS_AUTH.test(last)) return { outcome: "needs_connection", toolkit };
      log.warn("execute threw", { slug, attempt, error: last });
    }
  }

  // The call failed and the message did not say why. A missing connection is the
  // most common cause and the one we must not report as a failure, because CMP-4
  // turns it into a Connect Link instead of losing the task (S0).
  if (!(await isToolkitConnected(toolkit))) {
    log.info("failure explained by a missing connection", { slug, toolkit });
    return { outcome: "needs_connection", toolkit };
  }

  return { outcome: "error", message: last || "execution failed" };
}

/**
 * CMP-4 support: is this toolkit connected for our user? Checked before blaming
 * a failure on the tool, because an unconnected toolkit's error text varies.
 */
let connectedCache: { at: number; slugs: Set<string> } | undefined;
const CONNECTED_TTL_MS = 5000;

export async function isToolkitConnected(toolkit: string): Promise<boolean> {
  if (toolkit.toLowerCase() === CLAUDE_CODE_TOOLKIT) return claudeCodeEnabled();
  // Cached briefly: this runs on every failed call, and the Composio key rate
  // limits hard enough to start returning 401 under load.
  if (connectedCache && Date.now() - connectedCache.at < CONNECTED_TTL_MS) {
    return connectedCache.slugs.has(toolkit.toLowerCase());
  }
  try {
    const slugs = await activeToolkitSlugs();
    connectedCache = { at: Date.now(), slugs };
    return slugs.has(toolkit.toLowerCase());
  } catch (err) {
    log.warn("connected account lookup failed", {
      toolkit,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

function describe(error: unknown): string {
  if (!error) return "unknown error";
  if (typeof error === "string") return error;
  const e = error as { message?: string };
  return e.message ?? JSON.stringify(error).slice(0, 300);
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
