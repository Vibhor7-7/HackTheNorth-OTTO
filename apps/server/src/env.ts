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

export const env = {
  port: num("PORT", 3000),
  publicBaseUrl: opt("PUBLIC_BASE_URL", "http://localhost:3000").replace(/\/$/, ""),
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

  // D-22: when SMS_PROVIDER is unset, the Home tab is the confirmation surface
  // and Otto says "check the app to confirm" instead of "I've texted you".
  smsProvider: opt("SMS_PROVIDER") as "twilio" | "linq" | "",
  smsFrom: opt("SMS_FROM"),
  smsUserPhone: opt("SMS_USER_PHONE"),
  twilioAccountSid: opt("TWILIO_ACCOUNT_SID"),
  twilioAuthToken: opt("TWILIO_AUTH_TOKEN"),

  demoMode: opt("DEMO_MODE", "false") === "true",
  realtimeIdleTimeoutMs: num("REALTIME_IDLE_TIMEOUT_MS", 60000),

  databasePath: opt("DATABASE_PATH", "./data/otto.sqlite"),
} as const;

export const smsEnabled = Boolean(env.smsProvider && env.smsUserPhone && env.smsFrom);
