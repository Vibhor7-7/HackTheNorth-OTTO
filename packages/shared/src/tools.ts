// Section 7.4 function tools on the Realtime session. Seven tools total (D-28, D-32).
// All are executed by the gateway, never by the model and never by Composio
// directly, so nothing bypasses the approval gate (AG-3, D-11, D-23).

export interface RealtimeFunctionTool {
  type: "function";
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required: string[];
    additionalProperties: false;
  };
}

// ---- control tools -------------------------------------------------------

export interface RunTaskArgs { goal: string; context?: string }
export interface RunTaskResult { task_id: string; status: "started" }

export interface AnswerQuestionArgs { task_id?: string; answer: string }
export interface GetTaskStatusArgs { task_id?: string }
export interface GetTaskStatusResult { status: string; spoken_summary?: string }
export interface CancelTaskArgs { task_id?: string }

/** D-32: what Otto can do right now. Served from a cache, never fetched in the turn. */
export interface ListCapabilitiesResult {
  connected: { toolkit: string; actions: string[] }[];
  needs_connection: string[];
  answers_directly: string[];
  cannot: string[];
  /** True until the first Composio read has completed for this process. */
  stale: boolean;
}

// ---- fast-lane tools (VG-16, CMP-9) -------------------------------------

export interface CalendarFreeBusyArgs { start: string; end: string }
export interface CalendarListEventsArgs { date: string }

export type Deferred = { status: "deferred" };

export type CalendarFreeBusyResult =
  | { busy: { start: string; end: string }[] }
  | Deferred;

export type CalendarListEventsResult =
  | { events: { title: string; start: string; end: string; attendees?: string[] }[] }
  | Deferred;

export const CONTROL_TOOLS: RealtimeFunctionTool[] = [
  {
    type: "function",
    name: "run_task",
    description:
      "Hand a real-world task to the task agent. Use this for anything that changes the world " +
      "or needs an app other than the user's calendar. Returns immediately; say \"on it\" and stop.",
    parameters: {
      type: "object",
      properties: {
        goal: { type: "string", description: "One clear sentence describing what to accomplish." },
        context: { type: "string", description: "Anything the agent needs that the goal does not say." },
      },
      required: ["goal"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "answer_question",
    description:
      "Give a running task the answer to a question it asked. Omit task_id to answer " +
      "the question that was just asked, which is almost always what you want.",
    parameters: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "Only if answering an older question." },
        answer: { type: "string", description: "The user's answer, verbatim." },
      },
      required: ["answer"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_task_status",
    description: "Check on a task. Omit task_id for the most recent task.",
    parameters: {
      type: "object",
      properties: { task_id: { type: "string", description: "Task to check." } },
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "cancel_task",
    description: "Cancel a task. Omit task_id for the most recent task.",
    parameters: {
      type: "object",
      properties: { task_id: { type: "string", description: "Task to cancel." } },
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "list_capabilities",
    description:
      "What Otto can do right now: which apps are connected and what each can do, which apps " +
      "still need connecting, and what Otto cannot do. Call it when the user asks what you can " +
      "do, or before saying you cannot do something. Summarise in one or two spoken sentences.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
];

// VG-16: registered on the session but executed by the gateway through the gate
// with a 2.5 s hard timeout. If Composio p95 exceeds 2 s on the demo network,
// drop these from composio/fastlane.ts and the product still works (CMP-9).
export const FAST_LANE_TOOLS: RealtimeFunctionTool[] = [
  {
    type: "function",
    name: "calendar_free_busy",
    description: "Check whether the user is free in a time range. Read-only. Answer directly from the result.",
    parameters: {
      type: "object",
      properties: {
        start: { type: "string", description: "ISO 8601 start of the range." },
        end: { type: "string", description: "ISO 8601 end of the range." },
      },
      required: ["start", "end"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "calendar_list_events",
    description: "List the user's calendar events for one day. Read-only. Answer directly from the result.",
    parameters: {
      type: "object",
      properties: { date: { type: "string", description: "Date as YYYY-MM-DD." } },
      required: ["date"],
      additionalProperties: false,
    },
  },
];

export const FAST_LANE_TOOL_NAMES = new Set(FAST_LANE_TOOLS.map((t) => t.name));
export const FAST_LANE_TIMEOUT_MS = 2500;
