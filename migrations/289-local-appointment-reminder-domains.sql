-- Extend the existing durable queue; old jobs retain their Dental identity.
ALTER TABLE dental_appointment_reminders ADD COLUMN IF NOT EXISTS domain text NOT NULL DEFAULT 'dental';
ALTER TABLE dental_appointment_reminders DROP CONSTRAINT IF EXISTS appointment_reminder_domain_check;
ALTER TABLE dental_appointment_reminders ADD CONSTRAINT appointment_reminder_domain_check CHECK(domain IN ('dental','real_estate'));
ALTER TABLE dental_appointment_reminders DROP CONSTRAINT IF EXISTS dental_reminder_occurrence_rule_unique;
CREATE UNIQUE INDEX IF NOT EXISTS appointment_reminder_domain_occurrence_unique ON dental_appointment_reminders(domain,company_id,appointment_id,occurrence,rule_id);
CREATE OR REPLACE FUNCTION invalidate_dental_reminder_settings() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c integer; k text;
BEGIN
  c := COALESCE(NEW.company_id,OLD.company_id); k := COALESCE(NEW.key,OLD.key);
  IF TG_OP IN ('DELETE','INSERT') OR (k IN ('dentalBookingPolicy','realEstateSettings') AND NEW.value->'automaticReminders' IS DISTINCT FROM OLD.value->'automaticReminders') OR (k IN ('erpBusinessType','defaultTimezone') AND NEW.value IS DISTINCT FROM OLD.value) THEN
    IF k IN ('dentalBookingPolicy','realEstateSettings','erpBusinessType','defaultTimezone') THEN
      UPDATE dental_appointment_reminders SET status='cancelled',claim_id=NULL,lease_expires_at=NULL,
        updated_at=now(),last_error='Reminder settings changed'
      WHERE company_id=c AND status IN ('pending','processing') AND dispatch_started_at IS NULL
        AND (k IN ('erpBusinessType','defaultTimezone') OR domain=CASE WHEN k='dentalBookingPolicy' THEN 'dental' ELSE 'real_estate' END);
    END IF;
  END IF;
  RETURN COALESCE(NEW,OLD);
END $$;
DROP TRIGGER IF EXISTS dental_reminder_settings_write ON company_settings;
CREATE TRIGGER dental_reminder_settings_write AFTER INSERT OR UPDATE OR DELETE ON company_settings
FOR EACH ROW EXECUTE FUNCTION invalidate_dental_reminder_settings();
-- Relationship changes must invalidate a prepared claim just like rescheduling.
CREATE OR REPLACE FUNCTION invalidate_local_appointment_reminder_link() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a integer;
BEGIN
  IF TG_OP='UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
  a := COALESCE(NEW.appointment_id,OLD.appointment_id);
  UPDATE dental_reminder_appointments SET occurrence=occurrence+1,eligible_since=now() WHERE appointment_id=a;
  UPDATE dental_appointment_reminders SET status='cancelled',claim_id=NULL,lease_expires_at=NULL,
    updated_at=now(),last_error='Local appointment relationship changed'
  WHERE appointment_id=a AND status IN ('pending','processing') AND dispatch_started_at IS NULL;
  RETURN COALESCE(NEW,OLD);
END $$;
DROP TRIGGER IF EXISTS local_appointment_reminder_link_write ON real_estate_appointments;
CREATE TRIGGER local_appointment_reminder_link_write AFTER INSERT OR UPDATE OR DELETE ON real_estate_appointments
FOR EACH ROW EXECUTE FUNCTION invalidate_local_appointment_reminder_link();
