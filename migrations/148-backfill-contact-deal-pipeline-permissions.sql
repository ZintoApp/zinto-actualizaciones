-- Migration: Backfill create_contacts, delete_contacts, view_own_pipelines, create_deals, delete_deals
-- into role_permissions for all companies (admin=all true; agent per DEFAULT_ROLE_PERMISSIONS spec).
-- Updates create_default_role_permissions so new companies receive these keys.

-- Section A — Backfill permissions for existing companies
DO $$
DECLARE
  company_record RECORD;
  current_permissions jsonb;
BEGIN
  RAISE NOTICE 'Starting contact/deal/pipeline permission backfill for all companies...';

  FOR company_record IN SELECT id FROM companies LOOP
    SELECT COALESCE(permissions, '{}'::jsonb) INTO current_permissions
    FROM role_permissions
    WHERE company_id = company_record.id AND role = 'admin';

    current_permissions := COALESCE(current_permissions, '{}'::jsonb) || '{
      "create_contacts": true,
      "delete_contacts": true,
      "view_own_pipelines": true,
      "create_deals": true,
      "delete_deals": true
    }'::jsonb;

    INSERT INTO role_permissions (company_id, role, permissions)
    VALUES (company_record.id, 'admin', current_permissions)
    ON CONFLICT (company_id, role)
    DO UPDATE SET
      permissions = EXCLUDED.permissions,
      updated_at = NOW();

    SELECT COALESCE(permissions, '{}'::jsonb) INTO current_permissions
    FROM role_permissions
    WHERE company_id = company_record.id AND role = 'agent';

    current_permissions := COALESCE(current_permissions, '{}'::jsonb);

    IF NOT (current_permissions ? 'create_contacts') THEN
      current_permissions := current_permissions || '{"create_contacts": true}'::jsonb;
    END IF;
    IF NOT (current_permissions ? 'delete_contacts') THEN
      current_permissions := current_permissions || '{"delete_contacts": false}'::jsonb;
    END IF;
    IF NOT (current_permissions ? 'view_own_pipelines') THEN
      current_permissions := current_permissions || '{"view_own_pipelines": true}'::jsonb;
    END IF;
    IF NOT (current_permissions ? 'create_deals') THEN
      current_permissions := current_permissions || '{"create_deals": true}'::jsonb;
    END IF;
    IF NOT (current_permissions ? 'delete_deals') THEN
      current_permissions := current_permissions || '{"delete_deals": false}'::jsonb;
    END IF;

    INSERT INTO role_permissions (company_id, role, permissions)
    VALUES (company_record.id, 'agent', current_permissions)
    ON CONFLICT (company_id, role)
    DO UPDATE SET
      permissions = EXCLUDED.permissions,
      updated_at = NOW();
  END LOOP;

  RAISE NOTICE 'Contact/deal/pipeline permission backfill completed.';
END $$;

-- Section B — Replace create_default_role_permissions (extends 141: adds the 5 keys)
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
      "create_contacts": true,
      "delete_contacts": true,
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
      "view_own_pipelines": true,
      "create_deals": true,
      "delete_deals": true,
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
      "create_contacts": true,
      "delete_contacts": false,
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
      "view_own_pipelines": true,
      "create_deals": true,
      "delete_deals": false,
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
