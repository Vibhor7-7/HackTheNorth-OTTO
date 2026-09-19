// CMP-4, the second half: a task that raised a Connect Link waits for it here
// and then retries the exact same call once (D-35). Same shape as pending.ts
// for approvals, for the same reason: the real arguments stay in the suspended
// closure, so the retry is the call the user saw, not a re-serialisation.
//
// The cost is the same too: a suspended loop lives in memory, so a restart
// with a connection outstanding leaves that task at awaiting_connection. It
// expires after CONNECTION_TIMEOUT_MS so nothing waits forever.

import { completeConnectionRequest, getConnectionRequest } from "../store";
import { logger } from "../log";

const log = logger("connections.pending");

export type ConnectionOutcome = "completed" | "expired";

/** Long enough to find the right Google account on a phone; short enough to matter. */
export const CONNECTION_TIMEOUT_MS = 10 * 60 * 1000;

interface Waiter {
  task_id: string;
  settle: (outcome: ConnectionOutcome) => void;
  timer: NodeJS.Timeout;
}

const waiters = new Map<string, Waiter>();

/** Resolves when the request completes or expires; immediately if it already did. */
export function waitForConnection(requestId: string, taskId: string): Promise<ConnectionOutcome> {
  const existing = getConnectionRequest(requestId);
  if (existing && existing.status !== "pending") {
    return Promise.resolve(existing.status === "completed" ? "completed" : "expired");
  }
  return new Promise<ConnectionOutcome>((resolve) => {
    const timer = setTimeout(() => {
      log.info("connection request expired", { task_id: taskId, connection: requestId });
      completeConnectionRequest(requestId, "expired");
      settleConnection(requestId, "expired");
    }, CONNECTION_TIMEOUT_MS);
    waiters.set(requestId, {
      task_id: taskId,
      timer,
      settle: (outcome) => {
        clearTimeout(timer);
        waiters.delete(requestId);
        resolve(outcome);
      },
    });
  });
}

/** Called by whichever side learns the link finished: the app, or Composio's redirect. */
export function settleConnection(requestId: string, outcome: ConnectionOutcome): boolean {
  const waiter = waiters.get(requestId);
  if (!waiter) return false;
  log.info("resuming task", { task_id: waiter.task_id, connection: requestId, outcome });
  waiter.settle(outcome);
  return true;
}
