// Section 7.3 data model. Binding contract: a change here means stop, propose,
// update Section 7 and the Changelog in the same commit (Section 0, rule 2).

export type TaskStatus =
  | "running" | "needs_input" | "awaiting_approval" | "awaiting_connection"
  | "succeeded" | "failed" | "cancelled";

export type TaskSource = "voice" | "action_item" | "chat";

export type RiskTier = "R0" | "R1" | "R2";

export interface Task {
  id: string; goal: string; status: TaskStatus; source: TaskSource;
  spoken_summary?: string; detail_md?: string; error?: string;
  toolkits_used: string[];                 // e.g. ["googlecalendar", "gmail"]
  created_at: string; updated_at: string;
}

export type TaskStepKind =
  | "plan" | "tool_call" | "tool_result" | "approval_wait"
  | "connection_wait" | "question" | "final" | "error";

export interface TaskStep {
  id: string; task_id: string; seq: number;
  kind: TaskStepKind;
  toolkit?: string; tool_slug?: string; risk?: RiskTier;
  summary: string;
  args_redacted?: unknown; result_redacted?: unknown;
  duration_ms?: number; created_at: string;
}

export interface Approval {
  id: string; task_id: string; step_id: string; code: string;
  summary: string; facts: Record<string, string>;
  args_hash: string;
  status: "pending" | "approved" | "denied" | "expired";
  channel?: "sms" | "app"; expires_at: string; decided_at?: string;
}

export interface ConnectionRequest {
  id: string; task_id: string; step_id: string;
  toolkit: string;                          // e.g. "gmail"
  link: string;                             // Composio Connect Link
  status: "pending" | "completed" | "expired";
  created_at: string; completed_at?: string;
}

export interface Extension {                // a Composio toolkit as seen by this user
  id: string; name: string; description: string;
  status: "connected" | "needs_auth" | "suggested";
  tool_count: number;
}

export interface Turn {
  id: string; user_text: string; assistant_text: string;
  task_ids: string[]; action_item_ids: string[]; latency_ms?: number;
  started_at: string; ended_at: string;
}

export interface ActionItem {               // 6.9
  id: string; turn_id: string;
  title: string; suggested_goal: string; toolkit_hint?: string; confidence: number;
  snippet: string;                          // the words that produced it, for the card
  status: "open" | "approved" | "dismissed" | "done";
  task_id?: string; created_at: string; decided_at?: string;
}

export interface Memory {                   // DATA-4
  id: string; text: string;
  source: "user" | "task_summary";
  task_id?: string; created_at: string;
}

export interface ChatCitation { kind: "turn" | "task"; id: string }

export interface ChatMessage {              // 6.10
  id: string; role: "user" | "assistant"; text: string;
  citations?: ChatCitation[];
  created_at: string;
}

export interface HomePayload {              // GET /api/home
  approvals: Approval[]; connections: ConnectionRequest[];
  action_items: ActionItem[]; recent_tasks: Task[];
}

// DATA-4 profile document. Baked into Realtime session instructions (VG-10),
// the task agent prompt (AG-8) and the chat agent prompt (CHAT-1).
export interface Profile {
  name: string;
  timezone: string;
  role?: string;
  contacts: { name: string; email?: string; note?: string }[];
  preferences?: string;
}

export type DeviceState = "idle" | "listening" | "thinking" | "speaking" | "error";

export interface DeviceStatus {
  connected: boolean;
  state: DeviceState;
  last_seen?: string;
  battery?: number;
  fw?: string;
}
