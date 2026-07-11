-- Add step_summary column to store per-session step history as JSON.
ALTER TABLE sessions ADD COLUMN step_summary jsonb;
