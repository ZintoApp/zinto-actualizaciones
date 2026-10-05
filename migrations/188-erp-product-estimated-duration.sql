-- Migration: Add product estimated service duration
-- Description: Store optional product-level service duration in minutes
-- Date: 2026-05-16

ALTER TABLE "products"
ADD COLUMN IF NOT EXISTS "estimated_duration_minutes" integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_estimated_duration_minutes_positive'
  ) THEN
    ALTER TABLE "products"
    ADD CONSTRAINT "products_estimated_duration_minutes_positive"
    CHECK ("estimated_duration_minutes" IS NULL OR "estimated_duration_minutes" > 0);
  END IF;
END $$;
