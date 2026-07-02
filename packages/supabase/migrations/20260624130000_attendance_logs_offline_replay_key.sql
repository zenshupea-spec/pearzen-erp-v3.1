-- H-9: Idempotency key for offline attendance replay (one log per vault row).

ALTER TABLE attendance_logs
  ADD COLUMN IF NOT EXISTS offline_replay_key text;

CREATE UNIQUE INDEX IF NOT EXISTS attendance_logs_offline_replay_guard_uidx
  ON attendance_logs (emp_number, offline_replay_key)
  WHERE offline_replay_key IS NOT NULL;

COMMENT ON COLUMN attendance_logs.offline_replay_key IS
  'Client vault row id — duplicate processLocationPing replays with the same key are rejected idempotently.';
