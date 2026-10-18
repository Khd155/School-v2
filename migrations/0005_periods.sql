-- The school year has two semesters, each with two periods. Each period has its own
-- published dataset, last-update time, parent visibility and maximum grades.
CREATE TABLE periods (
  key TEXT PRIMARY KEY CHECK (key IN ('t1p1', 't1p2', 't2p1', 't2p2')),
  sort INTEGER NOT NULL,
  active_dataset_id INTEGER REFERENCES datasets(id) ON DELETE SET NULL,
  data_updated_at TEXT,
  visible INTEGER NOT NULL DEFAULT 0 CHECK (visible IN (0, 1)),
  score_max TEXT NOT NULL
);

-- Existing data is semester 1, period 1 and stays visible to parents.
INSERT INTO periods (key, sort, active_dataset_id, data_updated_at, visible, score_max)
SELECT 't1p1', 1, st.active_dataset_id, st.data_updated_at, 1, s.score_max
FROM app_state st, app_settings s WHERE st.id = 1 AND s.id = 1;
INSERT INTO periods (key, sort, visible, score_max) SELECT 't1p2', 2, 0, score_max FROM app_settings WHERE id = 1;
INSERT INTO periods (key, sort, visible, score_max) SELECT 't2p1', 3, 0, score_max FROM app_settings WHERE id = 1;
INSERT INTO periods (key, sort, visible, score_max) SELECT 't2p2', 4, 0, score_max FROM app_settings WHERE id = 1;

ALTER TABLE datasets ADD COLUMN period TEXT NOT NULL DEFAULT 't1p1';
CREATE INDEX datasets_period_idx ON datasets (period, committed_at);

ALTER TABLE lookup_log ADD COLUMN period TEXT;
UPDATE lookup_log SET period = 't1p1' WHERE outcome = 'success';

-- app_state.active_dataset_id and app_settings.score_max are superseded by `periods`
-- (kept, unused, so this migration is reversible by hand).
