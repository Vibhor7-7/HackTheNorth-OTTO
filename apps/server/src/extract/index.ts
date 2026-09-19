// ACT-1. After every Turn is persisted, one cheap extraction call looks for
// commitments the user made. Never on the voice path; never blocks the next turn.

import type { Turn } from "@otto/shared";
import { logger } from "../log";

const log = logger("extract");

/**
 * Called by the gateway right after DATA-1 persistence. Fire and forget.
 *
 * [TODO ACT-1..ACT-6] One EXTRACT_MODEL call with this turn plus the previous
 * two for context, strict JSON out, keep items with confidence >= 0.6, skip
 * anything this turn already fired run_task for, dedupe against open items by
 * lowercase token overlap over 0.7, then createActionItem() which emits
 * action_item.created on SSE (ACT-4).
 */
export function onTurnPersisted(turn: Turn): void {
  if (!turn.user_text) return;
  log.info("extraction skipped (not implemented)", { turn_id: turn.id });
}
