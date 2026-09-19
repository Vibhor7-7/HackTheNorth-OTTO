// AG-2. The task agent loop: plan, select a tool, call it through the gate,
// observe, repeat. Max 15 tool calls and 3 minutes (AG-2).
//
// The agent module has no import of composio/execute (AG-3). The only way a tool
// runs from here is approvals/gate.ts.

import OpenAI from "openai";
import { env } from "../env";
import { logger } from "../log";
import { addStep, getProfile, recallMemories, updateTask, createMemory } from "../store";
import { gate } from "../approvals/gate";
import { discover } from "../composio/discover";
import { ASK_TOOL, FINISH_TOOL, toolSchemas, type ResponsesTool } from "./tools";
import { systemPrompt } from "./prompt";
import { speak } from "./notify";

const log = logger("agent.loop");

const MAX_TOOL_CALLS = 15;
const MAX_WALL_MS = 3 * 60 * 1000;

const openai = new OpenAI({ apiKey: env.openaiApiKey });

/** Responses API conversation items we append to as the loop runs. */
type Item = Record<string, unknown>;

export interface LoopOutcome {
  status: "succeeded" | "failed" | "needs_input" | "awaiting_approval" | "awaiting_connection";
  spoken_summary: string;
  detail_md?: string;
}

export async function runLoop(taskId: string, goal: string, context?: string): Promise<LoopOutcome> {
  const tlog = log.child({ task_id: taskId });
  const started = Date.now();

  // AG-7: discovery first, and its choice is a visible step.
  const discovery = await discover(goal);
  const toolkits = discovery.chosen.map((c) => c.slug);
  addStep({
    task_id: taskId,
    kind: "plan",
    summary: discovery.chosen.length
      ? `Chose ${discovery.chosen.map((c) => c.name).join(" and ")} from Composio's catalog. ` +
        `${discovery.reason}${discovery.alsoConsidered.length ? ` Also considered: ${discovery.alsoConsidered.join(", ")}.` : ""}`
      : "No toolkit matched this goal.",
    result: { chosen: toolkits, also_considered: discovery.alsoConsidered },
  });
  if (toolkits.length) updateTask(taskId, { toolkits_used: toolkits });

  const slugs = discovery.chosen.flatMap((c) => c.tools);

  // AG-8: memory on the agent path only.
  const profile = getProfile();

  // AG-9 is about not guessing on a write - not about asking for things the task
  // does not need. A small model offered ask_user will use it, so the tool is
  // only present when the goal involves reaching a person, or when a name in the
  // goal matches more than one known contact (the S1 two-Sams beat).
  const canAsk = needsClarification(goal, profile.contacts.map((c) => c.name));
  const tools: ResponsesTool[] = [
    ...(await toolSchemas(slugs)),
    FINISH_TOOL,
    ...(canAsk ? [ASK_TOOL] : []),
  ];
  tlog.info("tools loaded", { count: tools.length, can_ask: canAsk });
  const memories = recallMemories(goal, 3).map((m) => m.text);
  const today = new Date().toLocaleDateString("en-CA", {
    weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: profile.timezone,
  });

  const input: Item[] = [
    { role: "system", content: systemPrompt(profile, memories, today, canAsk) },
    { role: "user", content: context ? `${goal}\n\nContext: ${context}` : goal },
  ];

  let calls = 0;

  while (true) {
    if (calls >= MAX_TOOL_CALLS) {
      return fail(taskId, `I ran out of steps on that after ${calls} tool calls.`);
    }
    if (Date.now() - started > MAX_WALL_MS) {
      return fail(taskId, "that took too long, so I stopped.");
    }

    const response = await openai.responses.create({
      model: env.agentModel,
      input: input as never,
      tools: tools as never,
      tool_choice: "auto",
      parallel_tool_calls: false,
    });

    const output = (response.output ?? []) as unknown as { type?: string; [k: string]: unknown }[];
    const functionCalls = output.filter((o) => o.type === "function_call");

    // No tool call: the model answered in prose. Treat that as the final word.
    if (functionCalls.length === 0) {
      const text = (response.output_text ?? "").trim();
      tlog.info("loop ended without finish", { chars: text.length });
      return succeed(taskId, text || "Done.", text);
    }

    for (const call of functionCalls) {
      const name = String(call.name ?? "");
      const callId = String(call.call_id ?? call.id ?? "");
      let args: unknown = {};
      try { args = call.arguments ? JSON.parse(String(call.arguments)) : {}; } catch { args = {}; }

      input.push(call as Item);

      if (name === "finish") {
        const a = args as { spoken_summary?: string; detail_md?: string; succeeded?: boolean };
        const spoken = (a.spoken_summary ?? "Done.").trim();
        return a.succeeded === false
          ? fail(taskId, spoken, a.detail_md)
          : succeed(taskId, spoken, a.detail_md);
      }

      if (name === "ask_user") {
        const question = String((args as { question?: string }).question ?? "Could you clarify that?");
        addStep({ task_id: taskId, kind: "question", summary: question });
        updateTask(taskId, { status: "needs_input", spoken_summary: question });
        speak({ text: question, reason: "needs_input", task_id: taskId });
        tlog.info("asked the user", { question });
        return { status: "needs_input", spoken_summary: question };
      }

      calls++;

      // AG-3: the only path to execution.
      const result = await gate({
        task_id: taskId,
        slug: name,
        args,
        intent: `${goal} - ${name}`,
      });

      if (result.outcome === "held") {
        return { status: "awaiting_approval", spoken_summary: "I've put that in the app to confirm." };
      }
      if (result.outcome === "needs_connection") {
        return {
          status: "awaiting_connection",
          spoken_summary: `I need access to ${result.toolkit}. There's a link in the app.`,
        };
      }

      // Both success and failure go back to the model, so it can recover or explain.
      input.push({
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify(
          result.outcome === "ok"
            ? trim(result.result)
            : { error: result.message },
        ).slice(0, 6000),
      });
    }
  }
}

function succeed(taskId: string, spoken: string, detail?: string): LoopOutcome {
  updateTask(taskId, { status: "succeeded", spoken_summary: spoken, detail_md: detail });
  addStep({ task_id: taskId, kind: "final", summary: spoken });
  // DATA-4: one line of memory per completed task.
  createMemory({ text: spoken, source: "task_summary", task_id: taskId });
  speak({ text: spoken, reason: "task_done", task_id: taskId });
  return { status: "succeeded", spoken_summary: spoken, detail_md: detail };
}

function fail(taskId: string, spoken: string, detail?: string): LoopOutcome {
  // AG-11: failed always carries a spoken summary, so the device never goes silent.
  updateTask(taskId, { status: "failed", error: spoken, spoken_summary: spoken, detail_md: detail });
  addStep({ task_id: taskId, kind: "error", summary: spoken });
  speak({ text: spoken, reason: "error", task_id: taskId });
  return { status: "failed", spoken_summary: spoken, detail_md: detail };
}

/** Reaching a person is what makes an unresolved name worth a question. */
const REACHES_A_PERSON = /\b(invite|invitation|email|e-?mail|message|msg|text|notify|dm|whatsapp|send|tell|forward|reply)\b/i;

function needsClarification(goal: string, contactNames: string[]): boolean {
  if (REACHES_A_PERSON.test(goal)) return true;
  // Two contacts sharing a first name that the goal uses is genuinely ambiguous
  // even for a private calendar entry.
  const words = new Set(goal.toLowerCase().match(/[a-z]{3,}/g) ?? []);
  const firstNames = contactNames.map((n) => n.split(/\s+/)[0]!.toLowerCase());
  return firstNames.some(
    (name) => words.has(name) && firstNames.filter((n) => n === name).length > 1,
  );
}

/** Tool results can be enormous (a calendar list is 50 KB); the model needs the shape, not all of it. */
function trim(value: unknown): unknown {
  const json = JSON.stringify(value);
  if (json && json.length <= 6000) return value;
  return { truncated: true, preview: json?.slice(0, 6000) };
}
