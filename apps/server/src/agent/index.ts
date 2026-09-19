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
import { settleAnswer, taskAwaitingAnswer } from "../approvals/pending";
import { runLoop } from "./loop";
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

  void drive(task.id, context ? `${goal}\n\nContext: ${context}` : goal).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    tlog.error("loop threw", { error: message });
    fail(task.id, message);
  });

  return { task_id: task.id, status: "started" };
}

async function drive(taskId: string, goal: string): Promise<void> {
  const outcome = await runLoop(taskId, goal);
  log.child({ task_id: taskId }).info("loop finished", { status: outcome.status });
  if (outcome.status === "succeeded") syncActionItemForTask(taskId);
}

function fail(taskId: string, reason: string): void {
  // AG-11: failed always carries a one-line error and a spoken summary, so the
  // device never goes silent (NF-2).
  const spoken = `I couldn't finish that because ${reason}.`;
  updateTask(taskId, { status: "failed", error: reason, spoken_summary: spoken });
  speak({ text: spoken, reason: "error", task_id: taskId });
}

/**
 * VG-16. The fast lane needs a Task to hang its step log off (AG-4), but it must
 * NOT start the agent loop: the gateway is about to execute the call itself,
 * through the same gate. Calling runTask() here would run the whole loop a second
 * time on a goal like `calendar_free_busy {"start":...}`.
 *
 * Task creation still lives in this module, so AG-12 holds: nothing outside
 * agent/ invents a Task.
 */
export function startFastLaneTask(toolName: string, args: unknown): string {
  const task = createTask(`Answer a calendar question (${toolName})`, "voice");
  addStep({
    task_id: task.id,
    kind: "plan",
    summary: `Fast lane: ${toolName} answered inside the voice turn (VG-16).`,
    args,
  });
  return task.id;
}

/** AG-6: a running task's question is answered by the next voice turn. */
/**
 * AG-6. Resumes a task that asked a question. `task_id` may be omitted by the voice
 * model - people answer the question they were just asked, not one identified by
 * id - in which case the single task waiting on an answer is used.
 */
export function answerQuestion(taskId: string | undefined, answer: string): { ok: boolean } {
  const target = taskId && getTask(taskId) ? taskId : taskAwaitingAnswer();
  if (!target) {
    log.warn("answer with no question outstanding", { answer });
    return { ok: false };
  }
  const ok = settleAnswer(target, answer);
  log.child({ task_id: target }).info("answer received", { answer, resumed: ok });
  return { ok };
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
