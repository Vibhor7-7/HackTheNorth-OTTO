// AG-12: run_task is the single entry point for creating a Task, whatever the
// caller - the Realtime function tool (VG-6), an approved ActionItem (ACT-3),
// or the Chat tab (CHAT-4). No other code path creates a Task.
//
// The loop itself (AG-2, AG-7, AG-9) and the Composio wiring (CMP-*) are the
// Task Agent owner's work. What is real here and must not change: the signature,
// the immediate return so the voice layer can say "on it" (AG-1), the step log
// (AG-4), and the guarantee that every task reaches exactly one of succeeded /
// failed / cancelled with a spoken summary (AG-11).

import type { TaskSource, TaskStatus } from "@otto/shared";
import type { RunTaskResult } from "@otto/shared";
import {
  addStep, createTask, getTask, latestTask, updateTask, findByTaskId, updateActionItem,
} from "../store";
import { speak } from "./notify";
import { logger } from "../log";

const log = logger("agent");

export interface RunTaskInput {
  goal: string;
  context?: string;
  source: TaskSource;
}

/** AG-1: returns immediately; the loop runs asynchronously. */
export function runTask({ goal, context, source }: RunTaskInput): RunTaskResult {
  const task = createTask(goal, source);
  const tlog = log.child({ task_id: task.id });
  tlog.info("task created", { source, goal });

  addStep({
    task_id: task.id,
    kind: "plan",
    summary: context ? `${goal} (context: ${context})` : goal,
  });

  void drive(task.id, goal).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    tlog.error("loop threw", { error: message });
    fail(task.id, message);
  });

  return { task_id: task.id, status: "started" };
}

// [TODO AG-2, AG-7, AG-9] Replace with the Responses API tool loop:
//   1. Composio tool search on the goal (CMP-1), write a `plan` step naming the
//      toolkits chosen and the top three not chosen.
//   2. Loop: model selects a tool -> approvals/gate.ts (AP-1) -> execute (CMP-3)
//      -> observe. Max 15 calls, 3 minutes.
//   3. On needs-auth, raise a ConnectionRequest (CMP-4) instead of failing.
//   4. Finish with spoken_summary under 25 words and detail_md (AG-5).
// Until then a task fails loudly rather than silently pretending to work, which
// keeps NF-2 honest during gateway development.
async function drive(taskId: string, goal: string): Promise<void> {
  addStep({
    task_id: taskId,
    kind: "error",
    summary: "Task agent loop not implemented yet (AG-2). Gateway wiring only.",
  });
  fail(taskId, "the task agent isn't wired up yet");
  log.child({ task_id: taskId }).warn("stub loop", { goal });
}

function fail(taskId: string, reason: string): void {
  // AG-11: failed always carries a one-line error and a spoken summary, so the
  // device never goes silent (NF-2).
  const spoken = `I couldn't finish that because ${reason}.`;
  updateTask(taskId, { status: "failed", error: reason, spoken_summary: spoken });
  speak({ text: spoken, reason: "error", task_id: taskId });
}

/** AG-6: a running task's question is answered by the next voice turn. */
export function answerQuestion(taskId: string, answer: string): { ok: true } {
  const task = getTask(taskId);
  if (!task) return { ok: true };
  addStep({ task_id: taskId, kind: "question", summary: `User answered: ${answer}` });
  log.child({ task_id: taskId }).info("answer received", { answer });
  // [TODO AG-6] resume the suspended loop with this answer.
  return { ok: true };
}

export function taskStatus(taskId?: string): { status: TaskStatus | "unknown"; spoken_summary?: string } {
  const task = taskId ? getTask(taskId) : latestTask();
  if (!task) return { status: "unknown" };
  return { status: task.status, spoken_summary: task.spoken_summary };
}

export function cancelTask(taskId?: string): { ok: true } {
  const task = taskId ? getTask(taskId) : latestTask();
  if (!task || isTerminal(task.status)) return { ok: true };
  addStep({ task_id: task.id, kind: "final", summary: "Cancelled by the user." });
  updateTask(task.id, { status: "cancelled", spoken_summary: "Cancelled." });
  return { ok: true };
}

export const isTerminal = (s: TaskStatus): boolean =>
  s === "succeeded" || s === "failed" || s === "cancelled";

/** ACT-3: when an action item's task succeeds the item becomes `done`. */
export function syncActionItemForTask(taskId: string): void {
  const item = findByTaskId(taskId);
  const task = getTask(taskId);
  if (item && task?.status === "succeeded" && item.status === "approved") {
    updateActionItem(item.id, { status: "done" });
  }
}
