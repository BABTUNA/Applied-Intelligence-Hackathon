-- Add a `category` column that the log-session edge function classifies via
-- the InsForge AI gateway (security / navigation / configuration / other).

ALTER TABLE sessions
  ADD COLUMN category text;
