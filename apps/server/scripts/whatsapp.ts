// WhatsApp setup and smoke test, using a Meta token directly instead of the
// OAuth redirect (CMP-2). Useful for proving S2 can actually send before the
// demo depends on it.
//
//   pnpm whatsapp status
//   pnpm whatsapp connect          # needs WABA_ID and META_TOKEN in the env
//   pnpm whatsapp numbers          # discover phone_number_id
//   pnpm whatsapp send <to_number> "message"
//   pnpm whatsapp disconnect       # restores the needs_auth state that S0 needs
//
// Reads WABA_ID (15-16 digit WhatsApp Business Account ID) and META_TOKEN
// (permanent system-user token, starts with EAA) from the environment. Neither is
// stored in the repo; Composio holds the token once connected (CMP-2, NF-5).

import { Composio } from "@composio/core";

const apiKey = process.env.COMPOSIO_API_KEY;
if (!apiKey) throw new Error("COMPOSIO_API_KEY is not set");
const userId = process.env.COMPOSIO_USER_ID ?? "demo-user";

const composio = new Composio({ apiKey });
const items = <T>(r: unknown): T[] =>
  Array.isArray(r) ? (r as T[]) : (((r as { items?: T[] })?.items ?? []) as T[]);

type Row = Record<string, any>;
const slug = (tk: unknown) => (typeof tk === "string" ? tk : (tk as Row)?.slug ?? "").toLowerCase();

const run = (tool: string, args: Record<string, unknown>) =>
  composio.tools.execute(tool, {
    userId,
    arguments: args,
    dangerouslySkipVersionCheck: true,
  } as never) as Promise<Row>;

async function status(): Promise<void> {
  const cfgs = items<Row>(await composio.authConfigs.list({} as never))
    .filter((c) => slug(c.toolkit) === "whatsapp");
  console.log("whatsapp auth configs:");
  for (const c of cfgs) {
    const full = (await composio.authConfigs.get(c.id)) as Row;
    console.log(`  ${full.id}  mode=${full.authScheme ?? "?"}  managed=${full.isComposioManaged}`);
  }

  const accounts = items<Row>(await composio.connectedAccounts.list({ userIds: [userId] } as never))
    .filter((a) => slug(a.toolkit) === "whatsapp");
  console.log(accounts.length ? "connected accounts:" : "connected accounts: NONE (this is the state S0 needs)");
  for (const a of accounts) console.log(`  ${a.id}  status=${a.status}`);
}

async function connect(): Promise<void> {
  const token = process.env.META_TOKEN;
  const waba = process.env.WABA_ID;
  if (!token || !waba) {
    throw new Error(
      "Set WABA_ID and META_TOKEN first:\n" +
        '  WABA_ID=1234567890 META_TOKEN=EAA... pnpm whatsapp connect',
    );
  }
  if (!token.startsWith("EAA")) {
    console.warn("warning: a Meta system-user token normally starts with 'EAA'");
  }

  // A managed OAUTH2 config cannot take a token, so use (or make) an API_KEY one.
  const existing = items<Row>(await composio.authConfigs.list({} as never))
    .filter((c) => slug(c.toolkit) === "whatsapp");
  let cfgId: string | undefined;
  for (const c of existing) {
    const full = (await composio.authConfigs.get(c.id)) as Row;
    if (full.authScheme === "API_KEY") { cfgId = full.id; break; }
  }

  if (!cfgId) {
    const created = (await composio.authConfigs.create("whatsapp", {
      type: "use_custom_auth",
      name: "whatsapp-direct-token",
      authScheme: "API_KEY",
      credentials: { bearer_token: token, generic_id: waba },
    } as never)) as Row;
    cfgId = created.id;
    console.log(`created API_KEY auth config ${cfgId}`);
  } else {
    console.log(`reusing API_KEY auth config ${cfgId}`);
  }

  const req = (await composio.connectedAccounts.initiate(userId, cfgId!, {
    config: {
      authScheme: "API_KEY",
      val: { status: "ACTIVE", bearer_token: token, generic_id: waba },
    },
  } as never)) as Row;

  console.log(`connection ${req.id} status=${req.status}`);
  if (req.redirectUrl) console.log(`(unexpected redirect, open it: ${req.redirectUrl})`);
  await numbers();
}

async function numbers(): Promise<void> {
  const r = await run("WHATSAPP_GET_PHONE_NUMBERS", {});
  if (r.successful === false) {
    console.log(`could not list numbers: ${JSON.stringify(r.error).slice(0, 300)}`);
    return;
  }
  const data = (r.data ?? r) as Row;
  const list = data.data ?? data.phone_numbers ?? [];
  console.log("phone numbers on this WABA:");
  for (const n of list) {
    console.log(`  phone_number_id=${n.id}  ${n.display_phone_number ?? ""}  ${n.verified_name ?? ""}  quality=${n.quality_rating ?? "?"}`);
  }
  if (!list.length) console.log("  (none - check the WABA ID and the token's permissions)");
}

async function send(to: string, text: string): Promise<void> {
  let phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!phoneId) {
    const r = await run("WHATSAPP_GET_PHONE_NUMBERS", {});
    phoneId = ((r.data ?? r) as Row)?.data?.[0]?.id;
    if (!phoneId) throw new Error("no phone_number_id found; run `pnpm whatsapp numbers`");
    console.log(`using phone_number_id=${phoneId}`);
  }

  const r = await run("WHATSAPP_SEND_MESSAGE", {
    phone_number_id: phoneId,
    to_number: to.replace(/^\+/, ""),   // international, no leading +
    text,
  });

  if (r.successful === false) {
    console.log(`send failed: ${JSON.stringify(r.error).slice(0, 500)}`);
    console.log(
      "\nIf this says the recipient is not in the allowed list, add the number as a test\n" +
      "recipient in the Meta dashboard. If it mentions a 24-hour window or a template,\n" +
      "message the business number from that phone first, then retry within 24 hours.",
    );
    return;
  }
  console.log(`sent: ${JSON.stringify(r.data ?? r).slice(0, 300)}`);
}

async function disconnect(): Promise<void> {
  const accounts = items<Row>(await composio.connectedAccounts.list({ userIds: [userId] } as never))
    .filter((a) => slug(a.toolkit) === "whatsapp");
  for (const a of accounts) {
    await composio.connectedAccounts.delete(a.id);
    console.log(`deleted ${a.id} [${a.status}]`);
  }
  console.log(accounts.length ? "whatsapp is unconnected again, so S0 works" : "nothing to disconnect");
}

const [cmd, ...rest] = process.argv.slice(2);
const main = async () => {
  switch (cmd) {
    case "status": return status();
    case "connect": return connect();
    case "numbers": return numbers();
    case "send": {
      if (rest.length < 2) throw new Error('usage: pnpm whatsapp send <to_number> "message"');
      return send(rest[0]!, rest.slice(1).join(" "));
    }
    case "disconnect": return disconnect();
    default:
      console.log("usage: pnpm whatsapp status | connect | numbers | send <to> <text> | disconnect");
  }
};
main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
