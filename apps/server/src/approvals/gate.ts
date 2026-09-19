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
import { addStep, argsHash, createApproval, createConnectionRequest, decideApproval, updateTask } from "../store";
import { classify, toolkitOf } from "./tiers";
import { waitForDecision, type Decision } from "./pending";
import { executeTool, isToolkitConnected } from "../composio/execute";
import { createConnectLink } from "../composio/connect";
import { isAutoApprove } from "./override";
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
  /** AP-4: the user said no, or let it expire. Not an error - a decision. */
  | { outcome: "denied"; risk: RiskTier; reason: "denied" | "expired" }
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

  // A missing connection outranks an approval. Asking someone to approve an action
  // that cannot possibly run wastes the one moment of trust the demo has, and it
  // puts S0's beats in the wrong order: connect first, then approve the send.
  if (risk === "R2" && !(await isToolkitConnected(toolkit))) {
    log.info("R2 needs a connection before it can be approved", { task_id: req.task_id, toolkit });
    return raiseConnection(req, risk, toolkit, step.id, 0);
  }

  // AP-3: R2 does not execute here. It stops, the app asks, and this call suspends
  // until the answer comes back (AP-4).
  if (risk === "R2") {
    const hash = argsHash(req.args);
    const approval = createApproval({
      task_id: req.task_id,
      step_id: step.id,
      summary: req.intent ?? `Run ${req.slug}`,
      facts: factsFrom(req.args),
      // AP-5: the approval is bound to these exact arguments.
      args_hash: hash,
      channel: "app",
    });
    // D-33: with the override on, the record exists but nobody is asked. The
    // step says so in the same words the app shows, so the log never implies a
    // human approved this.
    const decision: Decision = isAutoApprove() ? "approved" : await (async () => {
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
      return waitForDecision(approval.id, req.task_id);
    })();

    if (isAutoApprove() && decision === "approved") {
      decideApproval(approval.id, "approved", "app");
      addStep({
        task_id: req.task_id,
        kind: "approval_wait",
        toolkit,
        tool_slug: req.slug,
        risk,
        summary: `Auto-approved because the override is on: ${approval.summary}`,
      });
      log.warn("AUTO-APPROVED by override (D-33)", { task_id: req.task_id, slug: req.slug, approval: approval.id });
    }

    if (decision !== "approved") {
      addStep({
        task_id: req.task_id,
        kind: "final",
        toolkit,
        tool_slug: req.slug,
        risk,
        summary: decision === "expired"
          ? "Expired without an answer, so nothing was done."
          : "You declined, so nothing was done.",
      });
      return { outcome: "denied", risk, reason: decision };
    }

    // AP-5, stated as an assertion rather than a comment: the arguments about to
    // run are the ones that were hashed into the approval. They cannot differ -
    // they are the same closure - but if that ever stops being true, refuse.
    if (argsHash(req.args) !== hash) {
      log.error("arguments changed after approval; refusing", { task_id: req.task_id, slug: req.slug });
      return { outcome: "error", risk, message: "the arguments changed after you approved them" };
    }

    updateTask(req.task_id, { status: "running" });
    return runNow(req, risk, toolkit, step.id);
  }

  return runNow(req, risk, toolkit, step.id);
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
    return raiseConnection(req, risk, toolkit, stepId, duration_ms);
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

async function raiseConnection(
  req: GateRequest,
  risk: RiskTier,
  toolkit: string,
  stepId: string,
  duration_ms: number,
): Promise<GateResult> {
  {
    const link = await createConnectLink(toolkit);
    if (link.outcome !== "ok") {
      const message =
        link.outcome === "key_lacks_write"
          ? `${toolkit} is not connected, and the Composio API key cannot create a connect link`
          : link.outcome === "no_auth_config"
            ? `${toolkit} has no auth config in Composio`
            : link.outcome === "already_connected"
              ? `${toolkit} is connected but the account list said otherwise; try again`
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
