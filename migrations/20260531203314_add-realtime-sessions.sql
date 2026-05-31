-- Realtime: dashboard subscribes to the `sessions` channel and re-renders
-- live whenever a new session lands. Lets judges see the counter tick up
-- in real time during the demo without a manual refresh.

INSERT INTO realtime.channels (pattern, description, enabled)
VALUES ('sessions', 'Live session inserts for the EverNav dashboard', true)
ON CONFLICT (pattern) DO NOTHING;

CREATE OR REPLACE FUNCTION notify_session_insert()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM realtime.publish(
    'sessions',
    'session_logged',
    jsonb_build_object(
      'id',           NEW.id,
      'user_id',      NEW.user_id,
      'site',         NEW.site,
      'task',         NEW.task,
      'step_count',   NEW.step_count,
      'completed_at', NEW.completed_at
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS sessions_realtime_insert ON sessions;
CREATE TRIGGER sessions_realtime_insert
  AFTER INSERT ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION notify_session_insert();
