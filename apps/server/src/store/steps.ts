import type { TaskStep, TaskStepKind, RiskTier } from "@otto/shared";
import { db, j, parseJson } from "./db";
import { newId, nowIso } from "../ids";
import { publish } from "../bus";
import { redact } from "./redact";

type Row = Record<string, any>;

const toStep = (r: Row): TaskStep => ({
  id: r.id, task_id: r.task_id, seq: r.seq, kind: r.kind as TaskStepKind,
  toolkit: r.toolkit ?? undefined,
  tool_slug: r.tool_slug ?? undefined,
  risk: (r.risk ?? undefined) as RiskTier | undefined,
  summary: r.summary,
  args_redacted: parseJson<unknown>(r.args_redacted, undefined),
  result_redacted: parseJson<unknown>(r.result_redacted, undefined),
  duration_ms: r.duration_ms ?? undefined,
  created_at: r.created_at,
});

export interface NewStep {
  task_id: string;
  kind: TaskStepKind;
  summary: string;
  toolkit?: string;
  tool_slug?: string;
  risk?: RiskTier;
  args?: unknown;
  result?: unknown;
  duration_ms?: number;
}

// AG-4: every step is persisted and emitted on SSE. DATA-3 redaction happens
// here so no caller can forget it.
export function addStep(s: NewStep): TaskStep {
  const seq =
    (db.prepare(`SELECT COALESCE(MAX(seq), 0) AS n FROM task_steps WHERE task_id = ?`)
      .get(s.task_id) as Row).n + 1;

  const step: TaskStep = {
    id: newId("step"), task_id: s.task_id, seq, kind: s.kind,
    toolkit: s.toolkit, tool_slug: s.tool_slug, risk: s.risk,
    summary: s.summary,
    args_redacted: s.args === undefined ? undefined : redact(s.args),
    result_redacted: s.result === undefined ? undefined : redact(s.result),
    duration_ms: s.duration_ms,
    created_at: nowIso(),
  };

  db.prepare(
    `INSERT INTO task_steps (id, task_id, seq, kind, toolkit, tool_slug, risk, summary,
                             args_redacted, result_redacted, duration_ms, created_at)
     VALUES (@id, @task_id, @seq, @kind, @toolkit, @tool_slug, @risk, @summary,
             @args_redacted, @result_redacted, @duration_ms, @created_at)`,
  ).run({
    ...step,
    toolkit: step.toolkit ?? null,
    tool_slug: step.tool_slug ?? null,
    risk: step.risk ?? null,
    args_redacted: step.args_redacted === undefined ? null : j(step.args_redacted),
    result_redacted: step.result_redacted === undefined ? null : j(step.result_redacted),
    duration_ms: step.duration_ms ?? null,
  });

  publish({ type: "step.created", data: step });
  return step;
}

export function listSteps(taskId: string): TaskStep[] {
  return (db.prepare(`SELECT * FROM task_steps WHERE task_id = ? ORDER BY seq ASC`)
    .all(taskId) as Row[]).map(toStep);
}
