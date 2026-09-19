// Per-turn stage timings. Values are ms since the turn started.
// Only stages known before the first audio byte can go in response headers;
// the rest are logged to stdout when the turn finishes.

export type Timings = Record<string, number>;

export function startTimer() {
  const t0 = performance.now();
  const marks: Timings = {};
  return {
    mark(stage: string) {
      if (!(stage in marks)) marks[stage] = Math.round(performance.now() - t0);
    },
    marks,
  };
}

export function timingHeaders(marks: Timings): Record<string, string> {
  const h: Record<string, string> = {};
  for (const [k, v] of Object.entries(marks)) h[`X-Timing-${k}`] = String(v);
  return h;
}

export function logTimings(deviceId: string, mode: string, marks: Timings) {
  const parts = Object.entries(marks).map(([k, v]) => `${k}=${v}ms`).join(' ');
  console.log(`[turn] device=${deviceId} mode=${mode} ${parts}`);
}
