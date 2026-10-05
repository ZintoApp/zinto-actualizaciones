CREATE TABLE IF NOT EXISTS appsumo_config (
  id integer PRIMARY KEY CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false,
  api_key_encrypted text,
  client_id text,
  client_secret_encrypted text,
  api_next_request_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO appsumo_config(id) VALUES (1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS appsumo_tiers (
  tier integer PRIMARY KEY CHECK (tier BETWEEN 1 AND 3),
  plan_id integer NOT NULL UNIQUE REFERENCES plans(id)
);
CREATE TABLE IF NOT EXISTS appsumo_licenses (
  license_key uuid PRIMARY KEY,
  previous_key uuid,
  replacement_key uuid,
  tier integer CHECK (tier BETWEEN 1 AND 3),
  status text NOT NULL DEFAULT 'inactive' CHECK (status IN ('inactive','active','deactivated','superseded')),
  company_id integer REFERENCES companies(id),
  pending_company_id integer REFERENCES companies(id),
  user_id integer REFERENCES users(id),
  management_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS appsumo_current_company ON appsumo_licenses(company_id)
  WHERE company_id IS NOT NULL AND replacement_key IS NULL;
CREATE INDEX IF NOT EXISTS appsumo_previous_key ON appsumo_licenses(previous_key);
CREATE TABLE IF NOT EXISTS appsumo_events (
  id bigserial PRIMARY KEY,
  fingerprint text NOT NULL UNIQUE,
  license_key uuid NOT NULL,
  event text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processed','failed')),
  attempts integer NOT NULL DEFAULT 0,
  error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS appsumo_pending_events ON appsumo_events(next_attempt_at) WHERE status <> 'processed';
CREATE TABLE IF NOT EXISTS appsumo_activations (
  token_hash text PRIMARY KEY,
  license_key uuid NOT NULL REFERENCES appsumo_licenses(license_key),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  target_company_id integer REFERENCES companies(id),
  billing_stopped_at timestamptz,
  billing_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS appsumo_license_key uuid REFERENCES appsumo_licenses(license_key);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS appsumo_suspended boolean NOT NULL DEFAULT false;

-- All existing billing writers must preserve an AppSumo entitlement, including
-- late payment callbacks and administrative edits. Only the licensing transaction
-- may change the binding. Do not change companies.active (approval/admin control).
CREATE OR REPLACE FUNCTION preserve_appsumo_entitlement() RETURNS trigger AS $$
DECLARE entitlement record;
BEGIN
  IF current_setting('app.appsumo_write', true) IS DISTINCT FROM 'on' THEN
    NEW.appsumo_license_key := OLD.appsumo_license_key;
    NEW.appsumo_suspended := OLD.appsumo_suspended;
  END IF;
  IF NEW.appsumo_license_key IS NOT NULL THEN
    SELECT l.status, p.id, p.name, p.max_users INTO entitlement
      FROM appsumo_licenses l JOIN appsumo_tiers t ON t.tier = l.tier
      JOIN plans p ON p.id = t.plan_id WHERE l.license_key = NEW.appsumo_license_key;
    IF FOUND THEN
      NEW.plan_id := entitlement.id;
      NEW.plan := lower(entitlement.name);
      NEW.max_users := entitlement.max_users;
      NEW.subscription_status := CASE WHEN entitlement.status = 'active' THEN 'active' ELSE 'inactive' END;
      NEW.appsumo_suspended := entitlement.status <> 'active';
      NEW.subscription_end_date := NULL;
      NEW.trial_start_date := NULL;
      NEW.trial_end_date := NULL;
      NEW.is_in_trial := false;
      NEW.auto_renewal := false;
      NEW.grace_period_end := NULL;
      NEW.pause_start_date := NULL;
      NEW.pause_end_date := NULL;
      NEW.dunning_attempts := 0;
      NEW.stripe_subscription_id := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS preserve_appsumo_entitlement ON companies;
CREATE TRIGGER preserve_appsumo_entitlement BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION preserve_appsumo_entitlement();
