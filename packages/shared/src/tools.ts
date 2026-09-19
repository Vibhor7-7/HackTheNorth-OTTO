// Section 7.4 function tools on the Realtime session. Eight tools total (D-27).
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

export interface AnswerQuestionArgs { task_id: string; answer: string }
export interface GetTaskStatusArgs { task_id?: string }
export interface GetTaskStatusResult { status: string; spoken_summary?: string }
export interface CancelTaskArgs { task_id?: string }

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

export interface GithubMyIssuesArgs { state?: "open" | "closed" }
export interface GithubNotificationsArgs { unread_only?: boolean }

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
    description: "Give a running task the answer to a question it asked the user.",
    parameters: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "The task that asked the question." },
        answer: { type: "string", description: "The user's answer, verbatim." },
      },
      required: ["task_id", "answer"],
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

/**
 * GitHub, read-only (D-27). Both take no required arguments, which is what makes
 * them safe on the voice path: the model cannot be expected to know a repo name,
 * and asking for one would break the single-call rule.
 */
export const GITHUB_FAST_LANE_TOOLS: RealtimeFunctionTool[] = [
  {
    type: "function",
    name: "github_my_issues",
    description:
      "List GitHub issues assigned to the user. Read-only. Answer directly from the result, " +
      "naming at most three and saying how many there are in total.",
    parameters: {
      type: "object",
      properties: {
        state: { type: "string", description: '"open" (default) or "closed".' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "github_notifications",
    description:
      "List the user's unread GitHub notifications. Read-only. Answer directly, summarising " +
      "rather than reading every one aloud.",
    parameters: {
      type: "object",
      properties: {
        unread_only: { type: "string", description: '"true" (default) or "false".' },
      },
      required: [],
      additionalProperties: false,
    },
  },
];

export const ALL_FAST_LANE_TOOLS = [...FAST_LANE_TOOLS, ...GITHUB_FAST_LANE_TOOLS];
export const FAST_LANE_TOOL_NAMES = new Set(ALL_FAST_LANE_TOOLS.map((t) => t.name));
export const FAST_LANE_TIMEOUT_MS = 2500;
