// D-36 / AG-13: Claude Code as a tool of the task agent.
//
// `claude -p` runs a full headless Claude Code session in one directory and
// returns a JSON result. Verified against Claude Code 2.1.278 on 2026-09-19:
// stdout is one JSON object { type: "result", subtype, is_error, num_turns,
// duration_ms, total_cost_usd, result, permission_denials, session_id }, and a
// warning line may precede it, so the object is located rather than assumed.
//
// It edits files and runs commands, so the gate pins it R2 (tiers.ts): the exact
// prompt is on the approval card and nothing runs until the user says so, unless
// the override is on. The working directory is fixed from env; the agent cannot
// choose it, which is what keeps this bounded to one repository.

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { env } from "../env";
import { logger } from "../log";
import { enabledToolkitSlugs } from "../store";

const log = logger("claude-code");

export const CLAUDE_CODE_TOOLKIT = "claudecode";
export const CLAUDE_CODE_SLUG = "CLAUDECODE_RUN";

/** The `claude` binary answers `--version`; checked once per process. */
let binaryVersion: string | null | undefined;
export function claudeCodeVersion(): string | null {
  if (binaryVersion !== undefined) return binaryVersion;
  try {
    const r = spawnSync(env.claudeCodeBin, ["--version"], { encoding: "utf8", timeout: 10_000 });
    binaryVersion = r.status === 0 ? (r.stdout || "").trim().split("\n")[0] || "unknown" : null;
  } catch {
    binaryVersion = null;
  }
  return binaryVersion;
}

/** Usable at all: binary found and directory present. */
export const claudeCodeAvailable = (): boolean =>
  claudeCodeVersion() !== null && existsSync(env.claudeCodeDir);

/** Switched on from the Apps tab (D-36); stored with the no-auth toolkits. */
export const claudeCodeEnabled = (): boolean =>
  claudeCodeAvailable() && enabledToolkitSlugs().has(CLAUDE_CODE_TOOLKIT);

export interface ClaudeCodeStatus {
  enabled: boolean; available: boolean; version: string | null; dir: string;
}
export const claudeCodeStatus = (): ClaudeCodeStatus => ({
  enabled: claudeCodeEnabled(),
  available: claudeCodeAvailable(),
  version: claudeCodeVersion(),
  dir: env.claudeCodeDir,
});

/** The tool as the task agent sees it (Responses API function shape). */
export const CLAUDE_CODE_TOOL = {
  type: "function" as const,
  name: CLAUDE_CODE_SLUG,
  description:
    "Ask Claude Code to do engineering work in the project repository on the user's laptop: fix a " +
    "bug, add a test, refactor, explain code, run the test suite. Give it a complete, specific " +
    "prompt as you would a capable engineer. It returns a summary of what it did. Slow (up to a " +
    "couple of minutes); call it once with everything you need rather than in pieces.",
  parameters: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "The full instruction for Claude Code, including any file names or symptoms the user mentioned.",
      },
    },
    required: ["prompt"],
  },
  strict: false as const,
};

export interface ClaudeCodeResult {
  ok: boolean;
  summary: string;
  num_turns?: number;
  duration_ms?: number;
  cost_usd?: number;
  denied?: string[];
}

export async function runClaudeCode(args: unknown): Promise<ClaudeCodeResult> {
  const prompt = String((args as { prompt?: unknown })?.prompt ?? "").trim();
  if (!prompt) return { ok: false, summary: "no prompt was given" };
  if (!claudeCodeAvailable()) {
    return { ok: false, summary: `Claude Code is not available on the server (binary: ${env.claudeCodeBin}, dir: ${env.claudeCodeDir})` };
  }
  if (!claudeCodeEnabled()) return { ok: false, summary: "Claude Code is switched off; connect it in the Apps tab" };

  const argv = [
    "-p", prompt,
    "--output-format", "json",
    "--max-turns", String(env.claudeCodeMaxTurns),
    "--permission-mode", "acceptEdits",
    ...(env.claudeCodeAllowedTools.length ? ["--allowedTools", ...env.claudeCodeAllowedTools] : []),
  ];

  // A child must not inherit a parent Claude Code session's markers, or it
  // refuses to run as a nested session and hangs.
  const childEnv: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k === "CLAUDECODE" || k.startsWith("CLAUDE_CODE_") || k === "CLAUDE_PID") continue;
    childEnv[k] = v;
  }

  log.info("starting", { dir: env.claudeCodeDir, max_turns: env.claudeCodeMaxTurns, prompt_chars: prompt.length });
  const started = Date.now();

  return new Promise<ClaudeCodeResult>((resolve) => {
    const child = spawn(env.claudeCodeBin, argv, {
      cwd: env.claudeCodeDir,
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d: Buffer) => { out += d.toString(); });
    child.stderr.on("data", (d: Buffer) => { err += d.toString(); });

    const timer = setTimeout(() => {
      log.warn("timed out; killing", { ms: env.claudeCodeTimeoutMs });
      child.kill("SIGTERM");
    }, env.claudeCodeTimeoutMs);

    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, summary: `could not start ${env.claudeCodeBin}: ${e.message}` });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const duration_ms = Date.now() - started;
      const parsed = lastJsonObject(out);
      if (!parsed) {
        const why = err.trim().split("\n").filter((l) => !l.startsWith("⚠")).slice(-2).join(" ") || `exit ${code}`;
        log.warn("no result object", { code, duration_ms, stderr: why.slice(0, 200) });
        resolve({ ok: false, summary: `Claude Code did not return a result (${why.slice(0, 200)})`, duration_ms });
        return;
      }
      const denied = (parsed.permission_denials ?? []).map((d) => d.tool_name ?? "tool").filter(Boolean);
      const ok = parsed.is_error !== true && code === 0;
      log.info("finished", {
        ok, code, num_turns: parsed.num_turns, duration_ms, cost_usd: parsed.total_cost_usd, denied: denied.length,
      });
      resolve({
        ok,
        summary: String(parsed.result ?? "").trim() || (ok ? "done" : "Claude Code reported an error"),
        num_turns: parsed.num_turns,
        duration_ms,
        cost_usd: parsed.total_cost_usd,
        denied: denied.length ? denied : undefined,
      });
    });
  });
}

interface ResultObject {
  type?: string;
  is_error?: boolean;
  num_turns?: number;
  total_cost_usd?: number;
  result?: string;
  permission_denials?: { tool_name?: string }[];
}

/** The last JSON object on stdout; warnings and progress lines may precede it. */
function lastJsonObject(text: string): ResultObject | undefined {
  const start = text.indexOf("{");
  if (start === -1) return undefined;
  for (let i = start; i !== -1; i = text.indexOf("{", i + 1)) {
    try {
      const obj = JSON.parse(text.slice(i)) as ResultObject;
      if (obj && obj.type === "result") return obj;
    } catch { /* not the outermost object yet */ }
  }
  return undefined;
}
