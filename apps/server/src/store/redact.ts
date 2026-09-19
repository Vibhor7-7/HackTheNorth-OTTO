// DATA-3: secrets never appear in a TaskStep or an SSE payload.

const SECRET_KEY = /(token|key|password|authorization|secret|credential|api[-_]?key|bearer)/i;
const REDACTED = "[redacted]";

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return REDACTED;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY.test(k) ? REDACTED : redact(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "string" && value.length > 600) return `${value.slice(0, 600)}...`;
  return value;
}
