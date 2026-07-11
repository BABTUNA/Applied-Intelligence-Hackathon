-- Track session outcome: completed, stopped, error, max_steps, unknown.
ALTER TABLE sessions ADD COLUMN outcome text DEFAULT 'unknown';
ALTER TABLE sessions ADD COLUMN outcome_reason text;
