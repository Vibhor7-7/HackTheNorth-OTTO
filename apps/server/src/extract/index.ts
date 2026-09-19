// ACT-1 to ACT-6. After every Turn is persisted, one cheap model call looks for
// things the user committed to. Never on the voice path; never blocks the next turn.

import OpenAI from "openai";
import type { Turn } from "@otto/shared";
import { env } from "../env";
import { logger } from "../log";
import { createActionItem, listActionItems, listTurns, getTask, updateTurn } from "../store";

const log = logger("extract");
const openai = new OpenAI({ apiKey: env.openaiApiKey });

/** ACT-2 (proposed): below this, an item is noise on the Home tab. */
const MIN_CONFIDENCE = 0.6;
/** ACT-2: two items this similar are the same item. */
const DUPLICATE_OVERLAP = 0.7;

const PROMPT = `You extract action items from a wearable assistant's transcript.
Return only JSON: {"items":[{"title":"","suggested_goal":"","toolkit_hint":"","confidence":0.0}]}
An action item is something the USER committed to do or asked to have done, not something merely mentioned.
"title" is under 8 words. "suggested_goal" is the instruction you would give an agent to do it.
"toolkit_hint" is one of googlecalendar, gmail, github, or empty. Never invent another.
"confidence" is 0 to 1. If nothing qualifies return {"items":[]}.

Extract ONLY from the turn marked TURN TO EXTRACT. The earlier turns are context for
resolving pronouns and dates - never produce an item for something committed in them.

ACT-6: only commitments count. "I'll email Sam", "I need to book that", "remind me to file it"
are commitments. "Sam mentioned the deadline", "that was a good talk" are not. A turn where the
user asked Otto to do something is already a Task, not a suggestion, so it yields nothing.`;

interface Extracted {
  title?: string;
  suggested_goal?: string;
  toolkit_hint?: string;
  confidence?: number;
}

/** Fire and forget. Called by the gateway right after DATA-1 persistence. */
export function onTurnPersisted(turn: Turn): void {
  if (!turn.user_text.trim()) return;
  void extract(turn).catch((err: unknown) => {
    // Extraction failing must never affect the conversation.
    log.warn("extraction failed", {
      turn_id: turn.id,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

async function extract(turn: Turn): Promise<void> {
  const tlog = log.child({ turn_id: turn.id });

  // ACT-1: this turn plus the previous two for context.
  const recent = listTurns({ limit: 3 }).filter((t) => t.id !== turn.id).slice(0, 2).reverse();
  const context = recent
    .map((t) => `user: ${t.user_text}\notto: ${t.assistant_text}`)
    .join("\n---\n");
  const target = `user: ${turn.user_text}\notto: ${turn.assistant_text}`;

  const response = await openai.responses.create({
    model: env.extractModel,
    input: [
      { role: "system", content: PROMPT },
      {
        role: "user",
        content:
          (context ? `EARLIER TURNS (context only, do not extract):\n${context}\n\n` : "") +
          `TURN TO EXTRACT:\n${target}`,
      },
    ] as never,
    text: { format: { type: "json_object" } } as never,
  });

  const items = parse(response.output_text ?? "");
  if (items.length === 0) { tlog.info("nothing to extract"); return; }

  // ACT-2: a turn that already fired run_task is a Task, not a suggestion.
  const alreadyTasked = turn.task_ids
    .map((id) => getTask(id)?.goal ?? "")
    .filter(Boolean);
  const openItems = listActionItems("open");
  // ACT-3: a dismissed item is never re-extracted for that turn.
  const decidedHere = listActionItems().filter((i) => i.turn_id === turn.id);

  const created: string[] = [];
  for (const raw of items) {
    const title = (raw.title ?? "").trim();
    const goal = (raw.suggested_goal ?? "").trim();
    const confidence = Number(raw.confidence ?? 0);
    if (!title || !goal) continue;

    if (confidence < MIN_CONFIDENCE) {
      tlog.info("dropped, low confidence", { title, confidence });
      continue;
    }
    if (alreadyTasked.some((g) => overlap(g, goal) > DUPLICATE_OVERLAP)) {
      tlog.info("dropped, the user already asked Otto to do this", { title });
      continue;
    }
    if (openItems.some((i) => overlap(i.suggested_goal, goal) > DUPLICATE_OVERLAP)) {
      tlog.info("dropped, duplicate of an open item", { title });
      continue;
    }
    if (decidedHere.some((i) => overlap(i.suggested_goal, goal) > DUPLICATE_OVERLAP)) {
      tlog.info("dropped, already decided for this turn", { title });
      continue;
    }

    const item = createActionItem({
      turn_id: turn.id,
      title,
      suggested_goal: goal,
      toolkit_hint: (raw.toolkit_hint ?? "").trim() || undefined,
      confidence,
      // The words that produced it, for the card (ACT-3).
      snippet: turn.user_text.slice(0, 200),
    });
    created.push(item.id);
    tlog.info("action item", { title, confidence, toolkit: item.toolkit_hint });
  }

  if (created.length) {
    updateTurn(turn.id, { action_item_ids: [...turn.action_item_ids, ...created] });
  }
}

function parse(text: string): Extracted[] {
  try {
    const json = JSON.parse(text) as { items?: Extracted[] };
    return Array.isArray(json.items) ? json.items.slice(0, 5) : [];
  } catch {
    log.warn("extraction did not return JSON", { text: text.slice(0, 160) });
    return [];
  }
}

/** ACT-2: lowercase token overlap, as a fraction of the smaller set. */
function overlap(a: string, b: string): number {
  const tokens = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
  const x = tokens(a);
  const y = tokens(b);
  if (x.size === 0 || y.size === 0) return 0;
  let shared = 0;
  for (const t of x) if (y.has(t)) shared++;
  return shared / Math.min(x.size, y.size);
}
