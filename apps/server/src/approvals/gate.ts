// AP-1. The only file in the server that is allowed to import
// composio/execute.ts. Every tool call the LLM selects passes through here
// before it runs, which is what makes SMS approval impossible to bypass
// (AG-3, D-11).
//
// R0 read-only          -> run
// R1 reversible write   -> run, log, mention in the spoken summary
// R2 money / orders / sends on the user's behalf / destructive or public
//                       -> hold for approval (AP-3), resume on YES (AP-4)

import type { RiskTier } from "@otto/shared";
import { addStep } from "../store";
import { classify, toolkitOf } from "./tiers";
import { logger } from "../log";

const log = logger("gate");

export interface GateRequest {
  task_id: string;
  slug: string;
  args: unknown;
  /** VG-16: fast-lane calls carry a hard timeout and are logged as such. */
  timeout_ms?: number;
  fast_lane?: boolean;
}

export type GateResult =
  | { outcome: "ok"; risk: RiskTier; result: unknown; duration_ms: number }
  | { outcome: "held"; risk: RiskTier; approval_id: string }
  | { outcome: "needs_connection"; risk: RiskTier; toolkit: string }
  | { outcome: "error"; risk: RiskTier; message: string };

export async function gate(req: GateRequest): Promise<GateResult> {
  const risk = classify(req.slug, req.args);
  const toolkit = toolkitOf(req.slug);

  addStep({
    task_id: req.task_id,
    kind: "tool_call",
    toolkit,
    tool_slug: req.slug,
    risk,
    summary: `${risk} ${req.slug}${req.fast_lane ? " (fast lane)" : ""}`,
    args: req.args,
  });

  if (risk === "R2") {
    // [TODO AP-3, AP-4] Create the Approval with a 4-digit code, send the SMS or
    // fall back to the Home tab (AP-6, D-22), set the task to awaiting_approval,
    // and resume on YES with exactly the arguments that were shown (AP-5).
    log.warn("R2 hold not implemented yet", { task_id: req.task_id, slug: req.slug });
    return { outcome: "error", risk, message: "approval flow not wired up yet (AP-3)" };
  }

  // [TODO CMP-3] Replace with executeTool(slug, args): 30 s timeout, one retry,
  // structured errors. On a needs-authentication result return
  // { outcome: "needs_connection" } so the caller raises a ConnectionRequest
  // (CMP-4) instead of failing the task.
  log.warn("execute not implemented yet", { task_id: req.task_id, slug: req.slug, risk });
  return { outcome: "error", risk, message: "composio execution not wired up yet (CMP-3)" };
}
