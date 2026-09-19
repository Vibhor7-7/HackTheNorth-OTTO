// NF-4: structured logs with turn_id and task_id on every line. A failed demo
// run has to be debuggable in under a minute.

type Fields = Record<string, unknown>;

function emit(level: string, component: string, msg: string, fields?: Fields) {
  const parts = [new Date().toISOString(), level, component, msg];
  if (fields) {
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined || v === null) continue;
      parts.push(`${k}=${typeof v === "string" ? v : JSON.stringify(v)}`);
    }
  }
  const line = parts.join(" ");
  if (level === "ERROR") console.error(line);
  else console.log(line);
}

export function logger(component: string, base: Fields = {}) {
  const merge = (f?: Fields) => ({ ...base, ...f });
  return {
    info: (msg: string, f?: Fields) => emit("INFO ", component, msg, merge(f)),
    warn: (msg: string, f?: Fields) => emit("WARN ", component, msg, merge(f)),
    error: (msg: string, f?: Fields) => emit("ERROR", component, msg, merge(f)),
    child: (f: Fields) => logger(component, merge(f)),
  };
}

export type Logger = ReturnType<typeof logger>;
