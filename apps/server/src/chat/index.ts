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
    "",
    "WHAT YOU CAN SEE: only Otto's own record - what the user said (turns), what you did for",
    "them (tasks), open action items, saved memories, and their profile. Look things up before",
    "answering; do not guess about the user's day. Be brief and specific. If you found something,",
    "say so concretely - a date, a time, a task's outcome - rather than summarising vaguely.",
    "",
    "WHAT YOU CANNOT SEE: the user's Google Calendar, Gmail, GitHub, or any other connected",
    "service. You have no tool that reads them (CHAT-6). Never state what is or is not in one.",
    "\"You have no meetings tomorrow\" is a claim about a calendar you cannot read, and saying it",
    "when the calendar is full is the worst thing you can do here.",
    "",
    "SO: if answering needs live data from a connected service, call run_task with the lookup as",
    "the goal, then tell the user you are checking and that the answer will appear on their Home",
    "tab. Do not answer the question yourself in the same breath - you do not have the answer yet.",
    "The same goes for anything the user asks you to DO: call run_task and say you are on it.",
    "One exception worth knowing: \"what did I commit to\" means promises the user made out loud,",
    "which ARE in your record as action items. It does not mean git commits. Answer it from the record.",
    "Never tell the user you are checking, looking into, or fetching something unless you have",
    "actually called run_task in this same reply. Saying it without calling it leaves them",
    "waiting for an answer that is never coming, which is worse than admitting you cannot see it.",
    "",
    "If a lookup returns nothing, say plainly that there is nothing IN OTTO'S RECORD, and never",
    "extend that to mean the user's calendar, inbox or repositories are empty. If you are not sure",
    "which you are talking about, say which one you checked.",
    "",
    `User profile: ${JSON.stringify(profile)}.`,
    notes.length ? `Notes the user gave you: ${notes.join(" | ")}.` : "The user has given you no notes yet.",
  ].join("\n");
}

/**
 * Questions that cannot be answered from Otto's record, because the answer lives
 * in a service only the agent loop can reach (CHAT-6).
 *
 * The prompt alone does not hold here: asked "anything on my calendar today?",
 * the model reads an empty store and answers "no events scheduled" - a confident
 * claim about a calendar it cannot see. So when the question is clearly about a
 * connected service, run_task is forced rather than suggested. Its output then
 * tells the model it has no answer yet, which is what stops the invention.
 */
const LIVE_DATA =
  /\b(calendars?|schedules?|scheduled|meetings?|appointments?|events?|busy|availabilit\w*|inbox|e-?mails?|gmail|unread|github|repos?|repositor\w+|pull requests?|PRs?|issues?)\b|\b(?:am i|are we|any(?:thing)?) free\b|\bfree (?:at|on|today|tomorrow|this)\b/i;

/**
 * Things Otto's own record answers. These win: they are the Chat tab's whole point
 * (APP-12). Deliberately past-tense and Otto-centric - "what did I", not "do I".
 * "Do I have anything tomorrow" is a live question however it is phrased, and an
 * exemption that broad let it be answered from a stale task summary.
 */
const OWN_RECORD = /\b(did i|what did|you do|otto|action item|committed to|commit to|still open|remind(ed)? me|note|memory|memories|task)\b/i;

export function needsLiveLookup(text: string): boolean {
  return LIVE_DATA.test(text) && !OWN_RECORD.test(text);
}

export async function* streamChatReply(userText: string): AsyncGenerator<ChatStreamEvent> {
  const history = listChatMessages(HISTORY);
  // Forced only for the first model call, and only until run_task has run: after
  // that the model needs a free turn to actually reply.
  let forceLookup = needsLiveLookup(userText);

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
      tool_choice: forceLookup ? ({ type: "function", name: "run_task" } as never) : "auto",
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
      if (name === "run_task") forceLookup = false;
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
