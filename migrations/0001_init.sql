-- D1 (SQLite) schema. All access goes through the Worker; there is no client-side DB access.
-- Timestamps are ISO-8601 UTC strings, so text comparison orders them correctly.

CREATE TABLE app_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  school_name TEXT NOT NULL DEFAULT 'مدرسة عبدالرحمن بن أبي بكر الابتدائية',
  education_office TEXT NOT NULL DEFAULT '',
  academic_year TEXT NOT NULL DEFAULT '',
  term TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT 'الدراسات الإسلامية',
  grade TEXT NOT NULL DEFAULT 'السادس',
  enabled_classes TEXT NOT NULL DEFAULT '[4,5,6]', -- JSON array of integers
  teacher_name TEXT NOT NULL DEFAULT '',
  footer_text TEXT NOT NULL DEFAULT '',
  updated_at TEXT
);
INSERT INTO app_settings (id) VALUES (1);

CREATE TABLE logos (
  kind TEXT PRIMARY KEY CHECK (kind IN ('ministry', 'school')),
  mime TEXT NOT NULL CHECK (mime IN ('image/png', 'image/webp', 'image/svg+xml')),
  data BLOB NOT NULL,
  sha256 TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE settings_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  changed_at TEXT NOT NULL,
  summary TEXT NOT NULL
);

-- One row per approved import ("version"). draft_id is unique so a draft can be committed only once.
CREATE TABLE datasets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  draft_id TEXT NOT NULL UNIQUE,
  committed_at TEXT NOT NULL,
  source_filename TEXT NOT NULL,
  sheet_name TEXT NOT NULL,
  student_count INTEGER NOT NULL,
  class_counts TEXT NOT NULL,
  warning_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_id INTEGER NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  source_row INTEGER NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  class_no INTEGER NOT NULL,
  scores TEXT NOT NULL,  -- JSON
  quran TEXT NOT NULL,   -- JSON
  hadith TEXT NOT NULL,  -- JSON
  final_total REAL,      -- numeric final total only (NULL for empty / non-numeric)
  note TEXT,
  UNIQUE (dataset_id, email)
);

CREATE TABLE class_stats (
  dataset_id INTEGER NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  class_no INTEGER NOT NULL,
  average REAL,
  highest REAL,
  counted INTEGER NOT NULL,
  total INTEGER NOT NULL,
  PRIMARY KEY (dataset_id, class_no)
);

-- Pointer to the live dataset. data_updated_at changes only when student data
-- is approved or restored — never for settings changes.
CREATE TABLE app_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  active_dataset_id INTEGER REFERENCES datasets(id) ON DELETE SET NULL,
  data_updated_at TEXT
);
INSERT INTO app_state (id) VALUES (1);

-- Validated upload awaiting approval. What is previewed is exactly what is committed.
CREATE TABLE import_drafts (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  payload TEXT NOT NULL
);

-- Keyed by e-mail so codes survive data re-imports. code_hash = HMAC-SHA256(pepper, email:code).
CREATE TABLE access_codes (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE admin_credentials (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  password_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE admin_sessions (
  token_hash TEXT PRIMARY KEY,
  csrf_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX admin_sessions_expires_idx ON admin_sessions (expires_at);

CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  window_start TEXT NOT NULL,
  count INTEGER NOT NULL
);
