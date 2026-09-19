// AP-4. Approvals are resolved by suspending the agent loop, not by replaying it.
//
// Why: AP-5 requires the approved action to run with *exactly* the arguments shown
// to the user. The TaskStep stores them redacted (DATA-3), so re-executing from
// the log could send something subtly different from what was approved. Keeping
// the loop suspended keeps the real arguments in the closure that created them, so
// "exactly the arguments shown" is true by construction rather than by a
// re-serialisation that has to be trusted.
//
// The cost is that a suspended loop lives in memory: restart the server with an
// approval outstanding and that task stays at awaiting_approval forever. Acceptable
// because approvals expire in five minutes (AP-4) and a stuck task is visible in
// the app rather than silent.

import { logger } from "../log";

const log = logger("approvals.pending");

export type Decision = "approved" | "denied" | "expired";

interface Waiter {
  task_id: string;
  settle: (decision: Decision) => void;
}

const waiters = new Map<string, Waiter>();

/** Resolves when the approval is decided, or immediately if it already was. */
export function waitForDecision(approvalId: string, taskId: string): Promise<Decision> {
  return new Promise<Decision>((resolve) => {
    waiters.set(approvalId, {
      task_id: taskId,
      settle: (decision) => {
        waiters.delete(approvalId);
        resolve(decision);
      },
    });
  });
}

/**
 * Called by whatever decided: the app route (AP-6) or the expiry sweeper (AP-4).
 * Returns false when nothing was waiting, which is the normal case after a restart
 * and worth logging rather than hiding.
 */
export function settleDecision(approvalId: string, decision: Decision): boolean {
  const waiter = waiters.get(approvalId);
  if (!waiter) {
    log.warn("decision with no suspended task", { approval: approvalId, decision });
    return false;
  }
  log.info("resuming task", { task_id: waiter.task_id, approval: approvalId, decision });
  waiter.settle(decision);
  return true;
}

export const pendingCount = () => waiters.size;
