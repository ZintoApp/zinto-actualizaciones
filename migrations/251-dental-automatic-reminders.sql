-- Dental reminders have no dependency on flows or an existing conversation.
CREATE TABLE IF NOT EXISTS dental_reminder_appointments (
  appointment_id integer PRIMARY KEY REFERENCES contact_appointments(id) ON DELETE CASCADE,
  occurrence integer NOT NULL DEFAULT 1,
  eligible_since timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dental_appointment_reminders (
  id bigserial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  appointment_id integer NOT NULL REFERENCES contact_appointments(id) ON DELETE CASCADE,
  occurrence integer NOT NULL,
  rule_id text NOT NULL,
  scheduled_for timestamptz NOT NULL,
  next_attempt_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CONSTRAINT dental_reminder_status_check CHECK (status IN ('pending','processing','sent','cancelled','skipped','failed','unknown')),
  attempts integer NOT NULL DEFAULT 0,
  claim_id uuid,
  lease_expires_at timestamptz,
  dispatch_started_at timestamptz,
  conversation_id integer REFERENCES conversations(id) ON DELETE SET NULL,
  channel_connection_id integer REFERENCES channel_connections(id) ON DELETE SET NULL,
  message_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dental_reminder_occurrence_rule_unique UNIQUE (company_id, appointment_id, occurrence, rule_id)
);
CREATE INDEX IF NOT EXISTS dental_reminder_due_idx ON dental_appointment_reminders(next_attempt_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS dental_reminder_company_idx ON dental_appointment_reminders(company_id, updated_at DESC);

INSERT INTO dental_reminder_appointments (appointment_id, eligible_since)
SELECT id, COALESCE(created_at AT TIME ZONE 'UTC', now()) FROM contact_appointments
ON CONFLICT DO NOTHING;

-- Shared DB writes cover the ERP schedule, contact appointments, AI adapter and expiry worker.
CREATE OR REPLACE FUNCTION track_dental_reminder_appointment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO dental_reminder_appointments (appointment_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  ELSE
    IF NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
       OR NEW.contact_id IS DISTINCT FROM OLD.contact_id
       OR NEW.company_id IS DISTINCT FROM OLD.company_id THEN
      INSERT INTO dental_reminder_appointments (appointment_id, occurrence, eligible_since)
      VALUES (NEW.id, 1, now())
      ON CONFLICT (appointment_id) DO UPDATE
      SET occurrence = dental_reminder_appointments.occurrence + 1, eligible_since = now();
    ELSIF NEW.status IN ('scheduled','confirmed') AND OLD.status NOT IN ('scheduled','confirmed') THEN
      UPDATE dental_reminder_appointments SET eligible_since = now() WHERE appointment_id = NEW.id;
    END IF;
    IF NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
       OR NEW.contact_id IS DISTINCT FROM OLD.contact_id
       OR NEW.company_id IS DISTINCT FROM OLD.company_id
       OR NEW.status NOT IN ('scheduled','confirmed') THEN
      UPDATE dental_appointment_reminders SET status = 'cancelled', claim_id = NULL,
        lease_expires_at = NULL, updated_at = now(), last_error = 'Appointment changed'
      WHERE appointment_id = NEW.id AND status IN ('pending','processing') AND dispatch_started_at IS NULL;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS dental_reminder_appointment_write ON contact_appointments;
CREATE TRIGGER dental_reminder_appointment_write AFTER INSERT OR UPDATE ON contact_appointments
FOR EACH ROW EXECUTE FUNCTION track_dental_reminder_appointment();

CREATE OR REPLACE FUNCTION invalidate_dental_reminder_settings() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.key = 'dentalBookingPolicy' AND (NEW.value->'automaticReminders') IS DISTINCT FROM (OLD.value->'automaticReminders'))
     OR (NEW.key = 'erpBusinessType' AND NEW.value IS DISTINCT FROM OLD.value) THEN
    UPDATE dental_appointment_reminders SET status = 'cancelled', claim_id = NULL,
      lease_expires_at = NULL, updated_at = now(), last_error = 'Reminder settings changed'
    WHERE company_id = NEW.company_id AND status IN ('pending','processing') AND dispatch_started_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS dental_reminder_settings_write ON company_settings;
CREATE TRIGGER dental_reminder_settings_write AFTER UPDATE ON company_settings
FOR EACH ROW EXECUTE FUNCTION invalidate_dental_reminder_settings();
