-- Migration 031: Backfill company usage nullability and store bandwidth as exact bytes
-- Date: 2026-05-06
-- Description: Applies production-safe company usage backfills after 030 and adds durable media ownership.

UPDATE companies
SET
  current_storage_used = COALESCE(current_storage_used, 0),
  current_bandwidth_used = COALESCE(current_bandwidth_used, 0),
  files_count = COALESCE(files_count, 0),
  last_usage_update = COALESCE(last_usage_update, CURRENT_TIMESTAMP)
WHERE current_storage_used IS NULL
  OR current_bandwidth_used IS NULL
  OR files_count IS NULL
  OR last_usage_update IS NULL;

DROP VIEW IF EXISTS company_usage_overview;

ALTER TABLE companies
ALTER COLUMN current_bandwidth_used TYPE BIGINT
USING current_bandwidth_used::BIGINT * 1048576;

ALTER TABLE companies
ALTER COLUMN current_storage_used SET DEFAULT 0,
ALTER COLUMN current_storage_used SET NOT NULL,
ALTER COLUMN current_bandwidth_used SET DEFAULT 0,
ALTER COLUMN current_bandwidth_used SET NOT NULL,
ALTER COLUMN files_count SET DEFAULT 0,
ALTER COLUMN files_count SET NOT NULL,
ALTER COLUMN last_usage_update SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN last_usage_update SET NOT NULL;

COMMENT ON COLUMN companies.current_bandwidth_used IS 'Current monthly bandwidth used in exact bytes';

CREATE TABLE IF NOT EXISTS media_file_ownership (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  public_url TEXT NOT NULL UNIQUE,
  bucket TEXT NOT NULL,
  file_size BIGINT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_media_file_ownership_company_id ON media_file_ownership(company_id);
CREATE INDEX IF NOT EXISTS idx_media_file_ownership_bucket ON media_file_ownership(bucket);

CREATE OR REPLACE VIEW company_usage_overview AS
SELECT 
  c.id as company_id,
  c.name as company_name,
  c.current_storage_used,
  c.current_bandwidth_used,
  c.files_count,
  c.last_usage_update,
  p.name as plan_name,
  p.storage_limit,
  p.bandwidth_limit,
  p.file_upload_limit,
  p.total_files_limit,
  CASE 
    WHEN p.storage_limit > 0 THEN ROUND((c.current_storage_used::DECIMAL / p.storage_limit) * 100, 2)
    ELSE 0 
  END as storage_percentage,
  CASE 
    WHEN p.bandwidth_limit > 0 THEN ROUND(((c.current_bandwidth_used::DECIMAL / 1048576) / p.bandwidth_limit) * 100, 2)
    ELSE 0 
  END as bandwidth_percentage,
  CASE 
    WHEN p.total_files_limit > 0 THEN ROUND((c.files_count::DECIMAL / p.total_files_limit) * 100, 2)
    ELSE 0 
  END as files_percentage,
  CASE 
    WHEN p.storage_limit > 0 AND (c.current_storage_used::DECIMAL / p.storage_limit) >= 0.8 THEN true
    ELSE false 
  END as storage_near_limit,
  CASE 
    WHEN p.bandwidth_limit > 0 AND ((c.current_bandwidth_used::DECIMAL / 1048576) / p.bandwidth_limit) >= 0.8 THEN true
    ELSE false 
  END as bandwidth_near_limit,
  CASE 
    WHEN p.total_files_limit > 0 AND (c.files_count::DECIMAL / p.total_files_limit) >= 0.8 THEN true
    ELSE false 
  END as files_near_limit,
  CASE 
    WHEN p.storage_limit > 0 AND c.current_storage_used >= p.storage_limit THEN true
    ELSE false 
  END as storage_exceeded,
  CASE 
    WHEN p.bandwidth_limit > 0 AND (c.current_bandwidth_used::DECIMAL / 1048576) >= p.bandwidth_limit THEN true
    ELSE false 
  END as bandwidth_exceeded,
  CASE 
    WHEN p.total_files_limit > 0 AND c.files_count >= p.total_files_limit THEN true
    ELSE false 
  END as files_exceeded
FROM companies c
LEFT JOIN plans p ON c.plan_id = p.id
WHERE c.active = true;
