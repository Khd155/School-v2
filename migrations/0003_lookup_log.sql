-- Parent lookup attempts, shown to the teacher as «سجل البحث».
-- Never stores the access code or the client IP. Pruned to the most recent rows on insert.
CREATE TABLE lookup_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  email TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'email_not_found', 'wrong_code', 'no_result', 'rate_limited')),
  student_name TEXT,
  class_no INTEGER
);
CREATE INDEX lookup_log_created_idx ON lookup_log (created_at);
CREATE INDEX lookup_log_email_idx ON lookup_log (email);
