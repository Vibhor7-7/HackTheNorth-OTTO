// Where a Connect Link should send the browser back to (CMP-4, APP-7).
//
// PUBLIC_BASE_URL is the answer when it is set. When it is not - a laptop on the
// venue Wi-Fi with no tunnel - the default is http://localhost:3000, and a phone
// that finishes OAuth gets redirected to *itself*, sees "cannot connect", and
// /connect/callback never fires. The app, however, has already told us how it
// reaches this server: the Host header on every authorised /api request. That
// origin is reachable from the phone by construction, so it is the fallback.

import type { FastifyRequest } from "fastify";
import { env } from "../env";

let lastAppOrigin: string | undefined;

export function rememberAppOrigin(req: FastifyRequest): void {
  const host = req.headers.host;
  if (!host) return;
  // Behind cloudflared the tunnel speaks https to the phone and http to us.
  const forwarded = req.headers["x-forwarded-proto"];
  const proto = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim()
    || req.protocol;
  lastAppOrigin = `${proto}://${host}`;
}

const LOOPBACK = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

/**
 * The origin Composio should redirect to after a Connect Link completes. A
 * loopback PUBLIC_BASE_URL is treated the same as an unset one: it is only ever
 * right for a browser on this laptop, and the redirect happens on the phone.
 */
export function callbackBaseUrl(): string {
  const configured = env.publicBaseUrl;
  if (env.publicBaseUrlSet && !LOOPBACK.test(configured)) return configured;
  if (lastAppOrigin && !LOOPBACK.test(lastAppOrigin)) return lastAppOrigin;
  return lastAppOrigin ?? configured;
}
