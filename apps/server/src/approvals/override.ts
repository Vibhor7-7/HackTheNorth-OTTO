// D-33: the auto-approve override. While it is on, an R2 call still creates its
// Approval record - Task detail shows exactly what ran - but the server approves
// it the instant it is created instead of holding the loop for the app.
//
// Deliberately in memory only. The approval moment is the product (AP-1, D-3),
// so the bypass must be impossible to leave on by accident: a server restart
// turns it off, every auto-approved call is logged at WARN, and the app shows a
// banner on every tab while it is on. Nothing here is written to the store.

import type { Settings } from "@otto/shared";
import { env } from "../env";
import { publish } from "../bus";
import { logger } from "../log";

const log = logger("override");

let autoApprove = false;

export function currentSettings(): Settings {
  return { auto_approve: autoApprove, demo_mode: env.demoMode };
}

export function isAutoApprove(): boolean {
  return autoApprove;
}

export function setAutoApprove(on: boolean): Settings {
  if (on !== autoApprove) {
    autoApprove = on;
    if (on) {
      log.warn("=".repeat(72));
      log.warn("AUTO-APPROVE IS ON - R2 actions run without asking (D-33)");
      log.warn("Switch it off in the app's Settings, or restart the server.");
      log.warn("=".repeat(72));
    } else {
      log.info("auto-approve off; R2 actions hold for approval again");
    }
    publish({ type: "settings.updated", data: currentSettings() });
  }
  return currentSettings();
}
