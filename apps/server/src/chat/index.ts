// CHAT-1..CHAT-6. A read-mostly context agent over the store. It never touches
// Composio; its only side effect is run_task (D-21, CHAT-6).

import type { ChatStreamEvent } from "@otto/shared";
import { createChatMessage } from "../store";
import { logger } from "../log";

const log = logger("chat");

/**
 * [TODO CHAT-1..CHAT-5] Replace with a CHAT_MODEL call on the Responses API:
 *   - system prompt = the template in 6.10 with the profile and all
 *     source:"user" memories interpolated
 *   - read tools: search_turns, list_tasks, get_task, list_action_items,
 *     list_memories, get_profile (each a SQLite query), max 6 calls per message
 *   - write tool: run_task through AG-12 with source "chat" (CHAT-4)
 *   - last 20 messages as context (CHAT-3)
 *   - citations as { kind, id } on the persisted ChatMessage (CHAT-5)
 */
export async function* streamChatReply(userText: string): AsyncGenerator<ChatStreamEvent> {
  log.warn("chat agent not implemented yet", { chars: userText.length });

  const text = "I can't answer that yet - my context agent isn't wired up.";
  yield { type: "chat.delta", data: { text } };

  const saved = createChatMessage({ role: "assistant", text });
  yield { type: "chat.done", data: { id: saved.id, text: saved.text, citations: saved.citations } };
}
