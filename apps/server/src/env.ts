// Section 5.2. Everything from env; nothing hardcoded (NF-5).

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name} (see apps/server/.env.example, Section 5.2)`);
  return v;
}
function opt(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}
function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`env ${name} must be a number, got ${v}`);
  return n;
}

/**
 * DEV_TIER_OVERRIDES forces risk tiers during development, e.g.
 * "GMAIL_SEND_EMAIL:R1,GITHUB_MERGE_A_PULL_REQUEST:R1", so an R2 action can be
 * iterated on without tapping approve every time.
 *
 * It exists so that lowering a tier is a visible, revertible switch rather than an
 * edit to tiers.ts that someone forgets before the demo. It must be empty for any
 * rehearsal or demo run: the approval moment is the product (AP-1, D-3).
 */
function parseTierOverrides(raw: string): Record<string, "R0" | "R1" | "R2"> {
  const out: Record<string, "R0" | "R1" | "R2"> = {};
  for (const entry of raw.split(",").map((e) => e.trim()).filter(Boolean)) {
    const [slug, tier] = entry.split(":").map((x) => x.trim());
    if (!slug || (tier !== "R0" && tier !== "R1" && tier !== "R2")) {
      throw new Error(`DEV_TIER_OVERRIDES entry must look like SLUG:R1, got "${entry}"`);
    }
    out[slug.toUpperCase()] = tier;
  }
  return out;
}

export const env = {
  port: num("PORT", 3000),
  publicBaseUrl: opt("PUBLIC_BASE_URL", "http://localhost:3000").trim().replace(/\/$/, ""),
  /** Unset means "derive it from how the app reaches us" (api/origin.ts). */
  publicBaseUrlSet: Boolean(process.env.PUBLIC_BASE_URL?.trim()),
  deviceToken: req("DEVICE_TOKEN"),
  appApiKey: req("APP_API_KEY"),

  openaiApiKey: req("OPENAI_API_KEY"),
  realtimeModel: opt("REALTIME_MODEL", "gpt-realtime"),
  realtimeVoice: opt("REALTIME_VOICE", "marin"),
  transcribeModel: opt("TRANSCRIBE_MODEL", "gpt-4o-transcribe"),
  agentModel: opt("AGENT_MODEL", "gpt-4.1-mini"),
  extractModel: opt("EXTRACT_MODEL", "gpt-4.1-nano"),
  chatModel: opt("CHAT_MODEL", "gpt-4.1-mini"),

  composioApiKey: opt("COMPOSIO_API_KEY"),
  composioUserId: opt("COMPOSIO_USER_ID", "demo-user"),

  demoMode: opt("DEMO_MODE", "false") === "true",
  audioDebug: opt("AUDIO_DEBUG", "false") === "true",
  voiceFreshContext: opt("VOICE_FRESH_CONTEXT", "false") === "true",
  realtimeIdleTimeoutMs: num("REALTIME_IDLE_TIMEOUT_MS", 60000),

  databasePath: opt("DATABASE_PATH", "./data/otto.sqlite"),

  devTierOverrides: parseTierOverrides(opt("DEV_TIER_OVERRIDES")),
} as const;
