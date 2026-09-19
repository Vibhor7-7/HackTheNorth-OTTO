// SSE events on GET /api/events (Section 7.2). Payload is the full object.
import type {
  Task, TaskStep, Approval, ConnectionRequest, ActionItem, Memory,
  DeviceStatus, Extension, ChatCitation, Turn,
} from "./types";

export type ServerEvent =
  | { type: "task.created";        data: Task }
  | { type: "task.updated";        data: Task }
  | { type: "step.created";        data: TaskStep }
  /**
   * A voice turn was transcribed. `updated` matters as much as `created`: input
   * transcription can land after the response is done, so a turn is often
   * persisted with one side blank and filled in a moment later.
   */
  | { type: "turn.created";        data: Turn }
  | { type: "turn.updated";        data: Turn }
  | { type: "approval.created";    data: Approval }
  | { type: "approval.updated";    data: Approval }
  | { type: "connection.created";  data: ConnectionRequest }
  | { type: "connection.updated";  data: ConnectionRequest }
  | { type: "action_item.created"; data: ActionItem }
  | { type: "action_item.updated"; data: ActionItem }
  | { type: "memory.created";      data: Memory }
  | { type: "device.updated";      data: DeviceStatus }
  | { type: "extension.updated";   data: Extension };

export type ServerEventType = ServerEvent["type"];

// Chat streaming (CHAT-1) rides its own response stream on POST /api/chat,
// not the shared /api/events feed.
export type ChatStreamEvent =
  | { type: "chat.delta"; data: { text: string } }
  | { type: "chat.done";  data: { id: string; text: string; citations?: ChatCitation[] } }
  | { type: "chat.error"; data: { message: string } };
