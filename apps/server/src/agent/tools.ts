// Tool schemas for the agent loop. Composio's OpenAI provider emits Chat
// Completions shape ({ type, function: { name, parameters } }); the Responses
// API wants it flat ({ type, name, parameters }). CMP-1 says not to hand-write
// schema translation, and we do not - this only reshapes the envelope.

import { composio, log } from "../composio/client";
import { userId } from "../composio/client";
import { CLAUDE_CODE_SLUG, CLAUDE_CODE_TOOL } from "../local/claudeCode";

export interface ResponsesTool {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  strict: false;
}

/** The loop ends by calling this, so the summary is structured rather than parsed out of prose (AG-5). */
export const FINISH_TOOL: ResponsesTool = {
  type: "function",
  name: "finish",
  description:
    "Call this when the task is done, or when you cannot continue. Always call it last.",
  parameters: {
    type: "object",
    properties: {
      spoken_summary: {
        type: "string",
        description:
          "Under 25 words, for a speaker. State what actually happened, including the day and time if you scheduled something.",
      },
      detail_md: { type: "string", description: "Markdown detail for the app." },
      succeeded: { type: "boolean", description: "true if the goal was achieved." },
    },
    required: ["spoken_summary", "succeeded"],
  },
  strict: false,
};

/** AG-6: the loop asks rather than guessing on an ambiguous R1 or R2 (AG-9). */
export const ASK_TOOL: ResponsesTool = {
  type: "function",
  name: "ask_user",
  description:
    "Ask the user one short question when something is genuinely ambiguous - which of two contacts, " +
    "which date, a missing email. Do not guess on anything that writes or sends.",
  parameters: {
    type: "object",
    properties: { question: { type: "string", description: "One short spoken question." } },
    required: ["question"],
  },
  strict: false,
};

export async function toolSchemas(slugs: string[]): Promise<ResponsesTool[]> {
  // D-36: the one tool Composio does not know about carries its own schema.
  const local: ResponsesTool[] = slugs.includes(CLAUDE_CODE_SLUG) ? [CLAUDE_CODE_TOOL] : [];
  const remote = slugs.filter((s) => s !== CLAUDE_CODE_SLUG);
  return [...local, ...(await composioSchemas(remote))];
}

async function composioSchemas(slugs: string[]): Promise<ResponsesTool[]> {
  if (slugs.length === 0) return [];
  try {
    const raw = await composio().tools.get(userId(), { tools: slugs } as never);
    const list = (Array.isArray(raw) ? raw : (raw as { items?: unknown[] }).items ?? []) as {
      type?: string;
      function?: { name?: string; description?: string; parameters?: Record<string, unknown> };
      name?: string;
      description?: string;
      parameters?: Record<string, unknown>;
    }[];

    return list
      .map((t): ResponsesTool | undefined => {
        const fn = t.function ?? t;
        if (!fn.name) return undefined;
        return {
          type: "function",
          name: fn.name,
          description: (fn.description ?? "").slice(0, 900),
          parameters: (fn.parameters as Record<string, unknown>) ?? { type: "object", properties: {} },
          strict: false,
        };
      })
      .filter((t): t is ResponsesTool => Boolean(t));
  } catch (err) {
    log.warn("tool schema fetch failed", {
      error: err instanceof Error ? err.message : String(err),
      slugs: slugs.length,
    });
    return [];
  }
}
