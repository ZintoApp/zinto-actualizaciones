CREATE TABLE IF NOT EXISTS dental_queue_counters (
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  day date NOT NULL, last_number integer NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, day)
);
CREATE TABLE IF NOT EXISTS dental_queue_turns (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  day date NOT NULL, number text NOT NULL,
  contact_id integer NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  appointment_id integer REFERENCES contact_appointments(id) ON DELETE SET NULL,
  scheduled_at timestamptz,
  provider_user_id integer NOT NULL, provider_name text NOT NULL,
  chair_id integer NOT NULL, chair_name text NOT NULL,
  service_key text NOT NULL, service_label text NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','called','in_service','finished','skipped','cancelled','invalidated')),
  issued_at timestamptz NOT NULL DEFAULT now(), queued_at timestamptz NOT NULL DEFAULT now(),
  called_at timestamptz, started_at timestamptz, finished_at timestamptz,
  reason text, created_by integer REFERENCES users(id) ON DELETE SET NULL,
  updated_by integer REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(company_id, day, number), UNIQUE(id, company_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS dental_queue_active_patient ON dental_queue_turns(company_id, contact_id)
  WHERE status IN ('waiting','called','in_service','skipped');
CREATE UNIQUE INDEX IF NOT EXISTS dental_queue_active_appointment ON dental_queue_turns(company_id, appointment_id)
  WHERE status IN ('waiting','called','in_service','skipped');
CREATE UNIQUE INDEX IF NOT EXISTS dental_queue_busy_provider ON dental_queue_turns(company_id, provider_user_id)
  WHERE status IN ('called','in_service');
CREATE UNIQUE INDEX IF NOT EXISTS dental_queue_busy_room ON dental_queue_turns(company_id, chair_id)
  WHERE status IN ('called','in_service');
CREATE INDEX IF NOT EXISTS dental_queue_day ON dental_queue_turns(company_id, day, status);
CREATE TABLE IF NOT EXISTS dental_queue_events (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  turn_id integer,
  kind text NOT NULL, request_id uuid, request_fingerprint text,
  response jsonb, actor_id integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, request_id),
  FOREIGN KEY(turn_id, company_id) REFERENCES dental_queue_turns(id, company_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS dental_queue_events_cursor ON dental_queue_events(company_id, id);

-- Cover writes through the schedule, contacts, AI, or any other appointment surface.
CREATE OR REPLACE FUNCTION invalidate_dental_queue_appointment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE why text;
BEGIN
  IF TG_OP = 'DELETE' THEN why := 'appointment_deleted';
  ELSIF NEW.status NOT IN ('scheduled','confirmed') THEN why := 'appointment_' || NEW.status;
  ELSIF NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
     OR NEW.contact_id IS DISTINCT FROM OLD.contact_id
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.provider_user_id IS DISTINCT FROM OLD.provider_user_id
     OR NEW.chair_id IS DISTINCT FROM OLD.chair_id
     OR NEW.booking_service_key IS DISTINCT FROM OLD.booking_service_key
     OR NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes THEN why := 'appointment_changed';
  END IF;
  IF why IS NOT NULL THEN
    WITH invalidated AS (
      UPDATE dental_queue_turns SET status = 'invalidated', reason = why, finished_at = now()
      WHERE appointment_id = OLD.id AND status IN ('waiting','skipped') RETURNING id, company_id
    ) INSERT INTO dental_queue_events(company_id, turn_id, kind)
      SELECT company_id, id, 'invalidated' FROM invalidated;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS dental_queue_appointment_write ON contact_appointments;
CREATE TRIGGER dental_queue_appointment_write BEFORE UPDATE OR DELETE ON contact_appointments
  FOR EACH ROW EXECUTE FUNCTION invalidate_dental_queue_appointment();
