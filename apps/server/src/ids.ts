import { randomBytes, randomUUID } from "node:crypto";

// Prefixed ids so a log line or an SSE payload says what it is at a glance.
export const newId = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

export const nowIso = () => new Date().toISOString();

// AP-3: 4-digit approval code the user texts back.
export const approvalCode = () => String(1000 + (randomBytes(2).readUInt16BE(0) % 9000));
