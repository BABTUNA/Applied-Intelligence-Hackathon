-- EverNav: log one row per completed agent navigation.
-- No FK to auth.users on purpose — the hackathon demo runs without sign-up;
-- user_id is a free-text identifier provided by the extension popup.

CREATE TABLE sessions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text        NOT NULL,
  site         text        NOT NULL,
  task         text        NOT NULL,
  step_count   integer     NOT NULL DEFAULT 0,
  completed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sessions_completed_at_idx ON sessions (completed_at DESC);

-- Anon access: extension and dashboard both authenticate as `anon` (public
-- JWT). Hackathon demo only — production would tie writes to auth.uid().
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_insert_sessions" ON sessions
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "anon_select_sessions" ON sessions
  FOR SELECT TO anon
  USING (true);
