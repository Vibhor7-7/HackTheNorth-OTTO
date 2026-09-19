// CHAT-1 to CHAT-6. A read-mostly context agent over the store. Its only write is
// run_task, through AG-12 like every other caller, and it never touches Composio
// (CHAT-6, D-21).

import OpenAI from "openai";
import type { ChatCitation, ChatStreamEvent } from "@otto/shared";
import { env } from "../env";
import { logger } from "../log";
import { createChatMessage, getProfile, listChatMessages, listMemories } from "../store";
import { CHAT_TOOLS, runChatTool } from "./tools";

const log = logger("chat");
const openai = new OpenAI({ apiKey: env.openaiApiKey });

/** CHAT-2: max 6 tool calls per message. */
const MAX_TOOL_CALLS = 6;
/** CHAT-3: the last 20 messages as context. */
const HISTORY = 20;

function systemPrompt(): string {
  const profile = getProfile();
  const notes = listMemories("user").map((m) => m.text);
  return [
    "You are Otto, a wearable assistant. The user is chatting with you by text about their day.",
    "You have tools to look up what the user said (turns), what you did for them (tasks),",
    "open action items, saved memories, and their profile. Look things up before answering;",
    "do not guess about the user's day. Be brief and specific. If you found something, say so",
    "concretely - a date, a time, a task's outcome - rather than summarising vaguely.",
    "If the user asks you to DO something, call run_task and say you are on it.",
    "If a lookup returns nothing, say plainly that there is nothing recorded rather than inventing it.",
    "",
    `User profile: ${JSON.stringify(profile)}.`,
    notes.length ? `Notes the user gave you: ${notes.join(" | ")}.` : "The user has given you no notes yet.",
  ].join("\n");
}

export async function* streamChatReply(userText: string): AsyncGenerator<ChatStreamEvent> {
  const history = listChatMessages(HISTORY);

  const input: Record<string, unknown>[] = [
    { role: "system", content: systemPrompt() },
    // The user's message is already persisted by the route, so history includes it.
    ...history.map((m) => ({ role: m.role, content: m.text })),
  ];

  const citations: ChatCitation[] = [];
  let calls = 0;

  for (;;) {
    const response = await openai.responses.create({
      model: env.chatModel,
      input: input as never,
      tools: CHAT_TOOLS as never,
      tool_choice: "auto",
      parallel_tool_calls: false,
    });

    const output = (response.output ?? []) as unknown as { type?: string; [k: string]: unknown }[];
    const toolCalls = output.filter((o) => o.type === "function_call");

    if (toolCalls.length === 0) {
      const text = (response.output_text ?? "").trim() || "I don't have anything on that.";
      // CHAT-5: only cite what the answer could plausibly have used.
      const cited = dedupe(citations).slice(0, 6);
      // Streamed in chunks: the transport is SSE either way, and a single delta
      // would defeat the typing indicator the app shows (CHAT-7).
      for (const chunk of chunks(text)) yield { type: "chat.delta", data: { text: chunk } };
      const saved = createChatMessage({ role: "assistant", text, citations: cited.length ? cited : undefined });
      log.info("replied", { chars: text.length, tool_calls: calls, citations: cited.length });
      yield { type: "chat.done", data: { id: saved.id, text: saved.text, citations: saved.citations } };
      return;
    }

    for (const call of toolCalls) {
      const name = String(call.name ?? "");
      let args: Record<string, unknown> = {};
      try { args = call.arguments ? JSON.parse(String(call.arguments)) : {}; } catch { args = {}; }

      input.push(call as Record<string, unknown>);

      if (calls >= MAX_TOOL_CALLS) {
        log.warn("tool budget spent", { tool: name });
        input.push({
          type: "function_call_output",
          call_id: String(call.call_id ?? call.id ?? ""),
          output: JSON.stringify({ error: "no more lookups available; answer with what you have" }),
        });
        continue;
      }

      calls++;
      const { result, citations: found } = runChatTool(name, args);
      citations.push(...found);
      log.info("lookup", { tool: name, args: Object.keys(args).join(",") });

      input.push({
        type: "function_call_output",
        call_id: String(call.call_id ?? call.id ?? ""),
        output: JSON.stringify(result).slice(0, 6000),
      });
    }
  }
}

const dedupe = (list: ChatCitation[]): ChatCitation[] => {
  const seen = new Set<string>();
  return list.filter((c) => {
    const key = `${c.kind}:${c.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/** Word-ish chunks, so the app renders a reply arriving rather than appearing. */
function* chunks(text: string): Generator<string> {
  const parts = text.match(/\S+\s*/g) ?? [text];
  let buffer = "";
  for (const part of parts) {
    buffer += part;
    if (buffer.length >= 12) { yield buffer; buffer = ""; }
  }
  if (buffer) yield buffer;
}
