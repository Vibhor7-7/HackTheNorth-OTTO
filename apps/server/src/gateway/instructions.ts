// VG-10 / VG-17. Session instructions, built once at session start. The user
// profile is baked in here because no retrieval is allowed on the voice path
// (Section 3, latency posture, D-12).

import type { Profile, Turn } from "@otto/shared";
import { smsEnabled } from "../env";
import { fastLaneAvailable } from "../composio/fastlane";

export function buildInstructions(profile: Profile, userMemories: string[], recent: Turn[]): string {
  const contacts = profile.contacts.length
    ? profile.contacts.map((c) => `${c.name}${c.note ? ` (${c.note})` : ""}`).join(", ")
    : "none on file";

  const notes = userMemories.length ? userMemories.join(" | ") : "none yet";

  const lines = [
    "You are Otto, a wearable assistant. The user talks to you through a button on their chest.",
    "Reply in one or two short spoken sentences. Never use lists or markdown.",
    "If the user asks you to do something in the world, call run_task with a clear goal",
    'and say "On it" or similar. Do not describe what you will do. Do not claim anything',
    "is done until you are told it is done.",
    "If something is ambiguous (which Sam, which date), ask one short question.",
  ];

  // D-22: one code path decides which sentence Otto speaks.
  lines.push(
    smsEnabled
      ? 'If the user asks to confirm something, say "I\'ve texted you to confirm."'
      : 'If the user asks to confirm something, say "check the app to confirm."',
  );

  // VG-17: exactly these two sentences, and only while the lane exists (CMP-9).
  if (fastLaneAvailable()) {
    lines.push(
      "For questions about the user's calendar, call the calendar tool and answer directly.",
      "For anything that changes the world, call run_task.",
    );
  }

  lines.push(
    `User profile: ${profile.name}, timezone ${profile.timezone}. Frequent contacts: ${contacts}.`,
    `Notes the user gave you: ${notes}.`,
  );

  // VG-9: a reconnected session is re-seeded with a two-line summary of the last
  // three turns so the user does not notice the drop.
  if (recent.length) {
    const summary = recent
      .slice(0, 3)
      .reverse()
      .map((t) => `user: ${t.user_text} / you: ${t.assistant_text}`)
      .join(" -- ");
    lines.push(`Recently in this conversation: ${summary}`);
  }

  return lines.join("\n");
}
