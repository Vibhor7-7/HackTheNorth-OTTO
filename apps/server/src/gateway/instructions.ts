// VG-10 / VG-17. Session instructions, built once at session start. The user
// profile is baked in here because no retrieval is allowed on the voice path
// (Section 3, latency posture, D-12).

import type { Profile, Turn } from "@otto/shared";
import { fastLaneAvailable } from "../composio/fastlane";

export function buildInstructions(profile: Profile, userMemories: string[], recent: Turn[]): string {
  const contacts = profile.contacts.length
    ? profile.contacts.map((c) => `${c.name}${c.note ? ` (${c.note})` : ""}`).join(", ")
    : "none on file";

  const notes = userMemories.length ? userMemories.join(" | ") : "none yet";

  const lines = [
    "You are Otto, a wearable assistant. The user talks to you through a button on their chest.",
    "You are warm, friendly and helpful: talk like a capable friend, not a system.",
    "Always understand and respond in English, even if noisy audio resembles another language.",
    "Reply in one or two short spoken sentences. Never use lists or markdown.",
    "Answer simple conversational and settled general-knowledge questions directly",
    "without a tool - when the war ended, how many metres in a mile.",
    // D-37: the failure this fixes is Otto declining. It has the web now, so
    // there is no question it has to refuse for want of information.
    "If the answer depends on the world as it is now - anything local, anything",
    "priced, rated, scheduled or recent, or any fact you are not sure of - call",
    "run_task and let the agent look it up. Never tell the user you cannot search",
    "the web or that your information is out of date.",
    "If the user asks you to do something in the world, call run_task with a clear goal,",
    "then tell them you are on it in a natural, friendly sentence, for example",
    '"Looking into that for you, give me a moment." Vary the wording; never repeat the',
    "same phrase every time. Do not describe the steps you will take. Do not claim",
    "anything is done until you are told it is done.",
    "Every request gets an answer. When a task finishes, fails, or needs something from",
    "the user, you will be told; say so plainly, whether it worked or not, and never",
    "leave a request hanging.",
    "If something is ambiguous (which Sam, which date), ask one short question.",
  ];

  // D-24: the app is the only confirmation surface, so there is only one
  // sentence Otto can honestly say here.
  lines.push('If the user asks to confirm something, say "check the app to confirm."');
  // D-35: adding an app is something Otto does, through the task agent.
  lines.push(
    "If the user asks to connect, add or set up an app, call run_task with that goal;",
    "the app will show them a sign-in link.",
  );
  // D-32: the model must not guess at its own reach in either direction.
  lines.push(
    "If the user asks what you can do, or before you say you cannot do something,",
    "call list_capabilities and answer from it.",
  );

  // VG-17: exactly these two sentences, and only while the lane exists (CMP-9).
  if (fastLaneAvailable()) {
    lines.push(
      "For questions about the user's calendar, call the calendar tool and answer directly.",
      "For requests that require another external service, including GitHub, call run_task.",
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
