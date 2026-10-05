-- Migration: Add conversation_metrics table and reports permissions (view_reports, export_reports, view_agent_reports, view_response_time_reports)
-- Section A: Create conversation_metrics table with indexes.
-- Section B: Backfill the 4 new permissions for all existing companies (admin=true, agent=false).
-- Section C: Replace create_default_role_permissions so new companies get the new keys.

-- Section A — Create the conversation_metrics table
CREATE TABLE IF NOT EXISTS conversation_metrics (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  assigned_to_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  channel_type TEXT NOT NULL,
  contacted_at TIMESTAMP NOT NULL,
  assigned_at TIMESTAMP,
  first_response_at TIMESTAMP,
  resolved_at TIMESTAMP,
  first_response_time_sec INTEGER,
  resolution_time_sec INTEGER,
  total_messages INTEGER NOT NULL DEFAULT 0,
  agent_messages INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS conversation_metrics_company_id_idx ON conversation_metrics(company_id);
CREATE INDEX IF NOT EXISTS conversation_metrics_conversation_id_idx ON conversation_metrics(conversation_id);
CREATE INDEX IF NOT EXISTS conversation_metrics_assigned_to_user_id_idx ON conversation_metrics(assigned_to_user_id);
CREATE INDEX IF NOT EXISTS conversation_metrics_channel_type_idx ON conversation_metrics(channel_type);
CREATE INDEX IF NOT EXISTS conversation_metrics_contacted_at_idx ON conversation_metrics(contacted_at);

-- Deduplicate: keep one row per conversation_id (smallest id) before enforcing uniqueness
DELETE FROM conversation_metrics cm1
WHERE EXISTS (
  SELECT 1 FROM conversation_metrics cm2
  WHERE cm2.conversation_id = cm1.conversation_id AND cm2.id < cm1.id
);

-- Replace non-unique conversation_id index with unique constraint (idempotent)
DROP INDEX IF EXISTS conversation_metrics_conversation_id_idx;
CREATE UNIQUE INDEX IF NOT EXISTS conversation_metrics_conversation_id_unique ON conversation_metrics(conversation_id);

-- Section B — Backfill permissions for existing companies
DO $$
DECLARE
  company_record RECORD;
  current_permissions jsonb;
BEGIN
  RAISE NOTICE 'Starting reports permission migration for all companies...';

  FOR company_record IN SELECT id FROM companies LOOP
    -- Admin role: merge 4 new keys as true (ensure not NULL when no row exists)
    SELECT COALESCE(permissions, '{}'::jsonb) INTO current_permissions
    FROM role_permissions
    WHERE company_id = company_record.id AND role = 'admin';

    current_permissions := COALESCE(current_permissions, '{}'::jsonb) || '{
      "view_reports": true,
      "export_reports": true,
      "view_agent_reports": true,
      "view_response_time_reports": true
    }'::jsonb;

    INSERT INTO role_permissions (company_id, role, permissions)
    VALUES (company_record.id, 'admin', current_permissions)
    ON CONFLICT (company_id, role)
    DO UPDATE SET
      permissions = EXCLUDED.permissions,
      updated_at = NOW();

    -- Agent role: add each key only if it does not already exist, set to false; ensure row exists via INSERT ... ON CONFLICT
    SELECT COALESCE(permissions, '{}'::jsonb) INTO current_permissions
    FROM role_permissions
    WHERE company_id = company_record.id AND role = 'agent';

    current_permissions := COALESCE(current_permissions, '{}'::jsonb);

    IF NOT (current_permissions ? 'view_reports') THEN
      current_permissions := current_permissions || '{"view_reports": false}'::jsonb;
    END IF;
    IF NOT (current_permissions ? 'export_reports') THEN
      current_permissions := current_permissions || '{"export_reports": false}'::jsonb;
    END IF;
    IF NOT (current_permissions ? 'view_agent_reports') THEN
      current_permissions := current_permissions || '{"view_agent_reports": false}'::jsonb;
    END IF;
    IF NOT (current_permissions ? 'view_response_time_reports') THEN
      current_permissions := current_permissions || '{"view_response_time_reports": false}'::jsonb;
    END IF;

    INSERT INTO role_permissions (company_id, role, permissions)
    VALUES (company_record.id, 'agent', current_permissions)
    ON CONFLICT (company_id, role)
    DO UPDATE SET
      permissions = EXCLUDED.permissions,
      updated_at = NOW();
  END LOOP;

  RAISE NOTICE 'Reports permission backfill completed.';
END $$;

-- Section C — Replace create_default_role_permissions with updated JSON (includes 4 new report keys)
CREATE OR REPLACE FUNCTION create_default_role_permissions(company_id_param INTEGER)
RETURNS VOID AS $$
BEGIN
  INSERT INTO role_permissions (company_id, role, permissions)
  VALUES (
    company_id_param,
    'admin',
    '{
      "view_all_conversations": true,
      "view_assigned_conversations": true,
      "assign_conversations": true,
      "manage_conversations": true,
      "view_contacts": true,
      "view_own_contacts": true,
      "view_assigned_contacts": true,
      "view_company_contacts": true,
      "manage_contacts": true,
      "view_contact_phone": true,
      "view_channels": true,
      "manage_channels": true,
      "view_flows": true,
      "manage_flows": true,
      "view_analytics": true,
      "view_detailed_analytics": true,
      "view_team": true,
      "manage_team": true,
      "view_settings": true,
      "manage_settings": true,
      "view_pipeline": true,
      "manage_pipeline": true,
      "view_calendar": true,
      "manage_calendar": true,
      "view_tasks": true,
      "manage_tasks": true,
      "view_campaigns": true,
      "create_campaigns": true,
      "edit_campaigns": true,
      "delete_campaigns": true,
      "manage_templates": true,
      "manage_segments": true,
      "view_campaign_analytics": true,
      "manage_whatsapp_accounts": true,
      "configure_channels": true,
      "view_pages": true,
      "manage_pages": true,
      "create_backups": true,
      "restore_backups": true,
      "manage_backups": true,
      "view_call_logs": true,
      "manage_call_logs": true,
      "export_call_logs": true,
      "delete_call_logs": true,
      "view_reports": true,
      "export_reports": true,
      "view_agent_reports": true,
      "view_response_time_reports": true
    }'::jsonb
  )
  ON CONFLICT (company_id, role) DO NOTHING;

  INSERT INTO role_permissions (company_id, role, permissions)
  VALUES (
    company_id_param,
    'agent',
    '{
      "view_all_conversations": false,
      "view_assigned_conversations": true,
      "assign_conversations": false,
      "manage_conversations": true,
      "view_contacts": true,
      "view_own_contacts": true,
      "view_assigned_contacts": true,
      "view_company_contacts": false,
      "manage_contacts": false,
      "view_contact_phone": false,
      "view_channels": false,
      "manage_channels": false,
      "view_flows": false,
      "manage_flows": false,
      "view_analytics": false,
      "view_detailed_analytics": false,
      "view_team": false,
      "manage_team": false,
      "view_settings": false,
      "manage_settings": false,
      "view_pipeline": false,
      "manage_pipeline": false,
      "view_calendar": true,
      "manage_calendar": false,
      "view_tasks": true,
      "manage_tasks": false,
      "view_campaigns": true,
      "create_campaigns": false,
      "edit_campaigns": false,
      "delete_campaigns": false,
      "manage_templates": false,
      "manage_segments": false,
      "view_campaign_analytics": true,
      "manage_whatsapp_accounts": false,
      "configure_channels": false,
      "view_pages": false,
      "manage_pages": false,
      "create_backups": false,
      "restore_backups": false,
      "manage_backups": false,
      "view_call_logs": true,
      "manage_call_logs": false,
      "export_call_logs": false,
      "delete_call_logs": false,
      "view_reports": false,
      "export_reports": false,
      "view_agent_reports": false,
      "view_response_time_reports": false
    }'::jsonb
  )
  ON CONFLICT (company_id, role) DO NOTHING;
END;
$$ LANGUAGE plpgsql;
