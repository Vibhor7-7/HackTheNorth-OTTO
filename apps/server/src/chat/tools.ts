// CHAT-2. Read tools over the store, exposed to the context agent as functions.
// Every one is a SQLite query. CHAT-6: nothing here touches Composio.

import {
  getProfile, getTask, listActionItems, listMemories, listTasks, listSteps, listTurns,
} from "../store";
import { runTask } from "../agent";

export interface ChatTool {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  strict: false;
}

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object", properties, required, additionalProperties: false,
});

export const CHAT_TOOLS: ChatTool[] = [
  {
    type: "function", name: "search_turns", strict: false,
    description: "Search what the user and Otto said. Omit query to get the most recent turns.",
    parameters: obj({
      query: { type: "string", description: "Keyword to match in either side of the conversation." },
      limit: { type: "integer", description: "Default 10, max 50." },
    }),
  },
  {
    type: "function", name: "list_tasks", strict: false,
    description: "Tasks Otto has run, newest first.",
    parameters: obj({
      status: { type: "string", description: "running, needs_input, awaiting_approval, awaiting_connection, succeeded, failed, cancelled" },
      limit: { type: "integer", description: "Default 10." },
    }),
  },
  {
    type: "function", name: "get_task", strict: false,
    description: "One task with its full step log.",
    parameters: obj({ id: { type: "string", description: "Task id." } }, ["id"]),
  },
  {
    type: "function", name: "list_action_items", strict: false,
    description: "Things Otto noticed the user said they would do.",
    parameters: obj({ status: { type: "string", description: "open, approved, dismissed, done" } }),
  },
  {
    type: "function", name: "list_memories", strict: false,
    description: "Notes the user gave Otto, and one-line summaries of completed tasks.",
    parameters: obj({ source: { type: "string", description: "user or task_summary" } }),
  },
  {
    type: "function", name: "get_profile", strict: false,
    description: "The user's name, timezone, contacts and preferences.",
    parameters: obj({}),
  },
  {
    // CHAT-4: the only write, and it goes through AG-12 like every other caller.
    type: "function", name: "run_task", strict: false,
    description:
      "Start a real task. Use this only when the user asks for something to be done, " +
      "not to answer a question about the past.",
    parameters: obj({ goal: { type: "string", description: "One clear sentence." } }, ["goal"]),
  },
];

export interface ToolOutcome {
  result: unknown;
  /** CHAT-5: ids worth citing, collected as the agent reads. */
  citations: { kind: "turn" | "task"; id: string }[];
}

export function runChatTool(name: string, args: Record<string, unknown>): ToolOutcome {
  const cap = (n: unknown, def: number, max: number) =>
    Math.min(Math.max(Number(n) || def, 1), max);

  switch (name) {
    case "search_turns": {
      const turns = listTurns({ q: args.query ? String(args.query) : undefined, limit: cap(args.limit, 10, 50) });
      return {
        result: turns.map((t) => ({
          id: t.id, user: t.user_text, otto: t.assistant_text,
          at: t.started_at, task_ids: t.task_ids,
        })),
        citations: turns.map((t) => ({ kind: "turn" as const, id: t.id })),
      };
    }
    case "list_tasks": {
      const tasks = listTasks({ status: args.status as never, limit: cap(args.limit, 10, 50) });
      return {
        result: tasks.map((t) => ({
          id: t.id, goal: t.goal, status: t.status, source: t.source,
          summary: t.spoken_summary, error: t.error, at: t.created_at,
        })),
        citations: tasks.map((t) => ({ kind: "task" as const, id: t.id })),
      };
    }
    case "get_task": {
      const id = String(args.id ?? "");
      const task = getTask(id);
      if (!task) return { result: { error: "no such task" }, citations: [] };
      return {
        result: {
          ...task,
          steps: listSteps(id).map((s) => ({
            seq: s.seq, kind: s.kind, risk: s.risk, tool: s.tool_slug, summary: s.summary,
          })),
        },
        citations: [{ kind: "task", id }],
      };
    }
    case "list_action_items": {
      const items = listActionItems(args.status as never);
      // CHAT-5: an item's value to the user is "when did I say that", so cite the
      // turn it came from, and the task if one was started.
      return {
        result: items.map((i) => ({
          id: i.id, title: i.title, goal: i.suggested_goal, status: i.status,
          confidence: i.confidence, said: i.snippet, turn_id: i.turn_id, task_id: i.task_id,
        })),
        citations: [
          ...items.map((i) => ({ kind: "turn" as const, id: i.turn_id })),
          ...items.filter((i) => i.task_id).map((i) => ({ kind: "task" as const, id: i.task_id! })),
        ],
      };
    }
    case "list_memories":
      return { result: listMemories(args.source as never).map((m) => ({ text: m.text, source: m.source, at: m.created_at })), citations: [] };
    case "get_profile":
      return { result: getProfile(), citations: [] };
    case "run_task": {
      const goal = String(args.goal ?? "").trim();
      if (!goal) return { result: { error: "goal is required" }, citations: [] };
      const started = runTask({ goal, source: "chat" });
      return { result: started, citations: [{ kind: "task", id: started.task_id }] };
    }
    default:
      return { result: { error: `unknown tool ${name}` }, citations: [] };
  }
}
