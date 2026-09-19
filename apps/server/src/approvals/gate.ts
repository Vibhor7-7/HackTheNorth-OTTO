// AP-1. The only file in the server that is allowed to import
// composio/execute.ts. Every tool call the LLM selects passes through here
// before it runs, which is what makes approval impossible to bypass
// (AG-3, D-11).
//
// R0 read-only          -> run
// R1 reversible write   -> run, log, mention in the spoken summary
// R2 money / orders / sends on the user's behalf / destructive or public
//                       -> hold for approval (AP-3), resume once approved (AP-4)

import type { RiskTier } from "@otto/shared";
import { addStep, argsHash, createApproval, createConnectionRequest, updateTask } from "../store";
import { classify, toolkitOf } from "./tiers";
import { executeTool } from "../composio/execute";
import { createConnectLink } from "../composio/connect";
import { speak } from "../agent/notify";
import { logger } from "../log";

const log = logger("gate");

export interface GateRequest {
  task_id: string;
  slug: string;
  args: unknown;
  /** One-line, plain language, for the approval card (AP-3). */
  intent?: string;
  /** VG-16: fast-lane calls are logged as such. */
  fast_lane?: boolean;
}

export type GateResult =
  | { outcome: "ok"; risk: RiskTier; result: unknown; duration_ms: number }
  | { outcome: "held"; risk: RiskTier; approval_id: string }
  | { outcome: "needs_connection"; risk: RiskTier; toolkit: string; connection_id?: string }
  | { outcome: "error"; risk: RiskTier; message: string };

export async function gate(req: GateRequest): Promise<GateResult> {
  const risk = classify(req.slug, req.args);
  const toolkit = toolkitOf(req.slug);

  const step = addStep({
    task_id: req.task_id,
    kind: "tool_call",
    toolkit,
    tool_slug: req.slug,
    risk,
    summary: `${risk} ${req.slug}${req.fast_lane ? " (fast lane)" : ""}`,
    args: req.args,
  });

  // AP-3: R2 never executes here. It stops, and the app asks.
  if (risk === "R2") {
    const approval = createApproval({
      task_id: req.task_id,
      step_id: step.id,
      summary: req.intent ?? `Run ${req.slug}`,
      facts: factsFrom(req.args),
      // AP-5: approval is bound to these exact arguments.
      args_hash: argsHash(req.args),
      channel: "app",
    });
    addStep({
      task_id: req.task_id,
      kind: "approval_wait",
      toolkit,
      tool_slug: req.slug,
      risk,
      summary: `Waiting for you to approve: ${approval.summary}`,
    });
    updateTask(req.task_id, { status: "awaiting_approval" });
    // D-24: the app is the only confirmation surface, so say so.
    speak({ text: "I've put that in the app to confirm.", reason: "needs_approval", task_id: req.task_id });
    log.info("held for approval", { task_id: req.task_id, slug: req.slug, approval: approval.id });
    return { outcome: "held", risk, approval_id: approval.id };
  }

  return runNow(req, risk, toolkit, step.id);
}

/**
 * AP-5: called by the approval resume path once the user has approved. The
 * caller is responsible for checking `args_hash` still matches - changed
 * arguments need a new approval, not this.
 */
export async function executeApproved(req: GateRequest, stepId: string): Promise<GateResult> {
  return runNow(req, classify(req.slug, req.args), toolkitOf(req.slug), stepId);
}

async function runNow(
  req: GateRequest,
  risk: RiskTier,
  toolkit: string,
  stepId: string,
): Promise<GateResult> {
  const started = Date.now();
  const result = await executeTool(req.slug, req.args, toolkit);
  const duration_ms = Date.now() - started;

  if (result.outcome === "ok") {
    addStep({
      task_id: req.task_id,
      kind: "tool_result",
      toolkit,
      tool_slug: req.slug,
      risk,
      summary: `${req.slug} succeeded`,
      result: result.data,
      duration_ms,
    });
    log.info("executed", { task_id: req.task_id, slug: req.slug, risk, duration_ms, fast_lane: req.fast_lane });
    return { outcome: "ok", risk, result: result.data, duration_ms };
  }

  // CMP-4: a missing connection is not a failure. Raise a ConnectionRequest and
  // let the task wait for the user to connect. This is S0.
  if (result.outcome === "needs_connection") {
    const link = await createConnectLink(toolkit);
    if (link.outcome !== "ok") {
      const message =
        link.outcome === "key_lacks_write"
          ? `${toolkit} is not connected, and the Composio API key cannot create a connect link`
          : link.outcome === "no_auth_config"
            ? `${toolkit} has no auth config in Composio`
            : link.message;
      addStep({ task_id: req.task_id, kind: "error", toolkit, tool_slug: req.slug, risk, summary: message, duration_ms });
      return { outcome: "error", risk, message };
    }

    const cr = createConnectionRequest({
      task_id: req.task_id,
      step_id: stepId,
      toolkit,
      link: link.link,
    });
    addStep({
      task_id: req.task_id,
      kind: "connection_wait",
      toolkit,
      tool_slug: req.slug,
      risk,
      summary: `Otto needs access to ${toolkit}. Tap to connect.`,
      duration_ms,
    });
    updateTask(req.task_id, { status: "awaiting_connection" });
    speak({
      text: `I need access to ${toolkit}. There's a link in the app.`,
      reason: "needs_connection",
      task_id: req.task_id,
    });
    log.info("awaiting connection", { task_id: req.task_id, toolkit, connection: cr.id });
    return { outcome: "needs_connection", risk, toolkit, connection_id: cr.id };
  }

  addStep({
    task_id: req.task_id,
    kind: "error",
    toolkit,
    tool_slug: req.slug,
    risk,
    summary: `${req.slug} failed: ${result.message}`,
    duration_ms,
  });
  return { outcome: "error", risk, message: result.message };
}

/**
 * AP-3: the key facts shown on the approval card. Scalars only - the card has to
 * be readable at a glance, and DATA-3 redaction happens in addStep for the log.
 */
function factsFrom(args: unknown): Record<string, string> {
  if (!args || typeof args !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(args as Record<string, unknown>)) {
    if (v === null || v === undefined || typeof v === "object") continue;
    out[k] = String(v).slice(0, 200);
  }
  return out;
}
