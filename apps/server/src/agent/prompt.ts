// AG-8, AG-9. The task agent's system prompt. Memory injection happens here,
// on the agent path only - never on the voice path (VG-10).

import type { Profile } from "@otto/shared";

export function systemPrompt(
  profile: Profile,
  memories: string[],
  today: string,
  canAsk: boolean,
): string {
  const contacts = profile.contacts.length
    ? profile.contacts
        .map((c) => `${c.name}${c.email ? ` <${c.email}>` : ""}${c.note ? ` (${c.note})` : ""}`)
        .join("; ")
    : "none on file";

  return [
    "You are Otto's task agent. You carry out one task using the tools you are given, then stop.",
    "",
    `Today is ${today}. The user is ${profile.name}, timezone ${profile.timezone}.`,
    `Known contacts: ${contacts}.`,
    profile.handles?.github ? `Their GitHub username is ${profile.handles.github}; use it as the repository owner unless told otherwise.` : "",
    memories.length ? `Notes the user gave you: ${memories.join(" | ")}.` : "",
    "",
    "Rules:",
    "- Resolve relative dates yourself against today's date before calling a tool.",
    // AG-9. ask_user is only offered when the task could actually need it, so the
    // rule differs: with the tool, asking is correct; without it, asking is not
    // an option and the model must not stall waiting for information.
    canAsk
      ? "- AG-9: if something is ambiguous and the action writes or sends, do not guess. If the profile\n" +
        "  resolves it, say so and continue. If it does not - two contacts with the same name, an unclear\n" +
        "  date, a recipient you cannot identify - call ask_user with one short question."
      : "- This task needs no information you do not already have. Nobody is being invited, emailed or\n" +
        "  messaged, so you do not need anyone's email address, and a name you do not recognise is fine\n" +
        "  as written - put it in the title and carry on. Resolve anything else from the profile or a\n" +
        "  sensible default, and never stall asking who someone is.",
    "- If an app is not connected yet, calling one of its tools pauses the task while the user",
    "  connects it in the app, then the same call runs again by itself. That is expected. Only if the",
    "  tool then reports it is still unavailable, or a permission was refused, call finish and say so.",
    "- When scheduling, always state the day and the clock time back to the user.",
    "- Call finish exactly once, at the end, whether you succeeded or not.",
  ]
    .filter(Boolean)
    .join("\n");
}
