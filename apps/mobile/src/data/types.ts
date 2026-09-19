// Wire models mirror MainPRD §7.3. Demo-only state lives below the contracts.
export type TaskStatus = 'running' | 'needs_input' | 'awaiting_approval' | 'awaiting_connection' | 'succeeded' | 'failed' | 'cancelled';
export type TaskSource = 'voice' | 'action_item' | 'chat';
export interface Task { id: string; goal: string; status: TaskStatus; source: TaskSource; spoken_summary?: string; detail_md?: string; error?: string; toolkits_used: string[]; created_at: string; updated_at: string }
export interface TaskStep { id: string; task_id: string; seq: number; kind: 'plan' | 'tool_call' | 'tool_result' | 'approval_wait' | 'connection_wait' | 'question' | 'final' | 'error'; toolkit?: string; tool_slug?: string; risk?: 'R0' | 'R1' | 'R2'; summary: string; args_redacted?: unknown; result_redacted?: unknown; duration_ms?: number; created_at: string }
export interface Approval { id: string; task_id: string; step_id: string; code: string; summary: string; facts: Record<string, string>; args_hash: string; status: 'pending' | 'approved' | 'denied' | 'expired'; channel?: 'app'; expires_at: string; decided_at?: string }
export interface ConnectionRequest { id: string; task_id: string; step_id: string; toolkit: string; link: string; status: 'pending' | 'completed' | 'expired'; created_at: string; completed_at?: string }
export interface Extension { id: string; name: string; description: string; status: 'connected' | 'needs_auth' | 'suggested'; tool_count: number; /** HTTPS artwork from trusted toolkit metadata, supplied by the future adapter. */ logoUrl?: string }
export interface Turn { id: string; user_text: string; assistant_text: string; task_ids: string[]; action_item_ids: string[]; latency_ms?: number; started_at: string; ended_at: string }
export interface ActionItem { id: string; turn_id: string; title: string; suggested_goal: string; toolkit_hint?: string; confidence: number; snippet: string; status: 'open' | 'approved' | 'dismissed' | 'done'; task_id?: string; created_at: string; decided_at?: string }
export interface Memory { id: string; text: string; source: 'user' | 'task_summary'; task_id?: string; created_at: string }
export interface ChatMessage { id: string; role: 'user' | 'assistant'; text: string; citations?: { kind: 'turn' | 'task'; id: string }[]; created_at: string }
export interface ChatSession { id: string; title: string; messages: ChatMessage[]; created_at: string; updated_at: string }
export interface HomePayload { approvals: Approval[]; connections: ConnectionRequest[]; action_items: ActionItem[]; recent_tasks: Task[] }
export interface Profile { name: string; timezone: string; role?: string; contacts: { name: string; email?: string; note?: string }[]; preferences?: string; handles?: { github?: string } }
export interface Device { connected: boolean; state: string; last_seen?: string; battery?: number; fw?: string }
type EventMap = { 'task.created': Task; 'task.updated': Task; 'step.created': TaskStep; 'turn.created': Turn; 'turn.updated': Turn; 'approval.created': Approval; 'approval.updated': Approval; 'connection.created': ConnectionRequest; 'connection.updated': ConnectionRequest; 'action_item.created': ActionItem; 'action_item.updated': ActionItem; 'memory.created': Memory; 'device.updated': Device; 'extension.updated': Extension };
export type OttoEvent = { [K in keyof EventMap]: { type: K; data: EventMap[K] } }[keyof EventMap];
export type NetworkState = 'online' | 'offline' | 'reconnecting';
export type DemoScenario = 'default' | 'coffee' | 'food' | 'empty' | 'expired' | 'failure';
export interface DemoState { device: Device; tasks: Task[]; steps: TaskStep[]; approvals: Approval[]; connections: ConnectionRequest[]; actionItems: ActionItem[]; turns: Turn[]; memories: Memory[]; extensions: Extension[]; messages: ChatMessage[]; chatSessions: ChatSession[]; activeChatId: string; network: NetworkState; streaming: boolean; hydrated: boolean;
  /** GET /api/profile (DATA-4); null until the first load. */ profile: Profile | null;
  /** DEMO_MODE on the server (APP-5); always true for the local simulation. */ demoMode: boolean }
export interface OttoDataSource {
  getSnapshot(): DemoState;
  subscribe(listener: () => void): () => void;
  subscribeEvents(listener: (event: OttoEvent) => void): () => void;
  initialize(): Promise<void>;
  getHome(): Promise<HomePayload>;
  /** Re-read what changes on its own: extensions and device, plus Home. */
  refresh(): Promise<void>;
  setProfileName(name: string): Promise<void>;
  approve(id: string): Promise<void>; deny(id: string): Promise<void>;
  connect(toolkitId: string): Promise<void>; disconnect(toolkitId: string): Promise<void>;
  doAction(id: string): Promise<string>; dismissAction(id: string): Promise<void>;
  addMemory(text: string): Promise<void>; deleteMemory(id: string): Promise<void>;
  sendChat(text: string): Promise<void>;
  newChat(): Promise<void>; selectChat(id: string): Promise<void>; clearChat(): Promise<void>; stopChat(): void;
  reset(scenario?: DemoScenario): Promise<void>;
  setNetwork(network: NetworkState): void;
  answerQuestion(taskId: string, answer: string): Promise<void>;
}
