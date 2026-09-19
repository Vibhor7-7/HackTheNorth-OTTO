// DATA-1, DATA-2, DATA-4, DATA-6, DATA-7. One SQLite file, zero setup.
// Raw audio is never stored (DATA-1). JSON-shaped columns hold the array and
// record fields from Section 7.3; everything else is a scalar.

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS tasks (
  id             TEXT PRIMARY KEY,
  goal           TEXT NOT NULL,
  status         TEXT NOT NULL,
  source         TEXT NOT NULL,
  spoken_summary TEXT,
  detail_md      TEXT,
  error          TEXT,
  toolkits_used  TEXT NOT NULL DEFAULT '[]',
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_status  ON tasks(status);

CREATE TABLE IF NOT EXISTS task_steps (
  id              TEXT PRIMARY KEY,
  task_id         TEXT NOT NULL REFERENCES tasks(id),
  seq             INTEGER NOT NULL,
  kind            TEXT NOT NULL,
  toolkit         TEXT,
  tool_slug       TEXT,
  risk            TEXT,
  summary         TEXT NOT NULL,
  args_redacted   TEXT,
  result_redacted TEXT,
  duration_ms     INTEGER,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_steps_task ON task_steps(task_id, seq);

CREATE TABLE IF NOT EXISTS approvals (
  id         TEXT PRIMARY KEY,
  task_id    TEXT NOT NULL REFERENCES tasks(id),
  step_id    TEXT NOT NULL,
  code       TEXT NOT NULL,
  summary    TEXT NOT NULL,
  facts      TEXT NOT NULL DEFAULT '{}',
  args_hash  TEXT NOT NULL,
  status     TEXT NOT NULL,
  channel    TEXT,
  expires_at TEXT NOT NULL,
  decided_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_approvals_code   ON approvals(code, status);

CREATE TABLE IF NOT EXISTS connection_requests (
  id           TEXT PRIMARY KEY,
  task_id      TEXT NOT NULL REFERENCES tasks(id),
  step_id      TEXT NOT NULL,
  toolkit      TEXT NOT NULL,
  link         TEXT NOT NULL,
  status       TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_connections_status ON connection_requests(status, created_at DESC);

CREATE TABLE IF NOT EXISTS turns (
  id              TEXT PRIMARY KEY,
  user_text       TEXT NOT NULL DEFAULT '',
  assistant_text  TEXT NOT NULL DEFAULT '',
  task_ids        TEXT NOT NULL DEFAULT '[]',
  action_item_ids TEXT NOT NULL DEFAULT '[]',
  latency_ms      INTEGER,
  started_at      TEXT NOT NULL,
  ended_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_turns_started ON turns(started_at DESC);

CREATE TABLE IF NOT EXISTS action_items (
  id            TEXT PRIMARY KEY,
  turn_id       TEXT NOT NULL,
  title         TEXT NOT NULL,
  suggested_goal TEXT NOT NULL,
  toolkit_hint  TEXT,
  confidence    REAL NOT NULL,
  snippet       TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL,
  task_id       TEXT,
  created_at    TEXT NOT NULL,
  decided_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_action_items_status ON action_items(status, created_at DESC);

CREATE TABLE IF NOT EXISTS memories (
  id         TEXT PRIMARY KEY,
  text       TEXT NOT NULL,
  source     TEXT NOT NULL,
  task_id    TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
  id         TEXT PRIMARY KEY,
  role       TEXT NOT NULL,
  text       TEXT NOT NULL,
  citations  TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_created ON chat_messages(created_at DESC);

-- Single-row key/value for the profile document (DATA-4). One user (1.4).
CREATE TABLE IF NOT EXISTS kv (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;
