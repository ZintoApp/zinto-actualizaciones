-- Migration: Add captured_form_submissions table and captured data permissions (view_captured_data, manage_captured_data)
-- Section A: Create captured_form_submissions table with indexes.
-- Section B: Backfill the 2 new permissions for all existing companies (admin=true, agent=false).
-- Section C: Replace create_default_role_permissions so new companies get the new keys.

-- Section A — Create the captured_form_submissions table
CREATE TABLE IF NOT EXISTS captured_form_submissions (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  flow_id INTEGER NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  session_id TEXT REFERENCES flow_sessions(session_id) ON DELETE SET NULL,
  captured_fields JSONB NOT NULL DEFAULT '{}',
  submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS captured_form_submissions_company_id_idx ON captured_form_submissions(company_id);
CREATE INDEX IF NOT EXISTS captured_form_submissions_flow_id_idx ON captured_form_submissions(flow_id);
CREATE INDEX IF NOT EXISTS captured_form_submissions_contact_id_idx ON captured_form_submissions(contact_id);

-- Section B — Backfill permissions for existing companies
DO $$
DECLARE
  company_record RECORD;
  current_permissions jsonb;
BEGIN
  RAISE NOTICE 'Starting captured data permission migration for all companies...';

  FOR company_record IN SELECT id FROM companies LOOP
    -- Admin role: merge 2 new keys as true (ensure not NULL when no row exists)
    SELECT COALESCE(permissions, '{}'::jsonb) INTO current_permissions
    FROM role_permissions
    WHERE company_id = company_record.id AND role = 'admin';

    current_permissions := COALESCE(current_permissions, '{}'::jsonb) || '{
      "view_captured_data": true,
      "manage_captured_data": true
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

    IF NOT (current_permissions ? 'view_captured_data') THEN
      current_permissions := current_permissions || '{"view_captured_data": false}'::jsonb;
    END IF;
    IF NOT (current_permissions ? 'manage_captured_data') THEN
      current_permissions := current_permissions || '{"manage_captured_data": false}'::jsonb;
    END IF;

    INSERT INTO role_permissions (company_id, role, permissions)
    VALUES (company_record.id, 'agent', current_permissions)
    ON CONFLICT (company_id, role)
    DO UPDATE SET
      permissions = EXCLUDED.permissions,
      updated_at = NOW();
  END LOOP;

  RAISE NOTICE 'Captured data permission backfill completed.';
END $$;

-- Section C — Replace create_default_role_permissions with updated JSON (includes 2 new captured data keys)
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
      "view_response_time_reports": true,
      "view_captured_data": true,
      "manage_captured_data": true
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
      "view_response_time_reports": false,
      "view_captured_data": false,
      "manage_captured_data": false
    }'::jsonb
  )
  ON CONFLICT (company_id, role) DO NOTHING;
END;
$$ LANGUAGE plpgsql;
