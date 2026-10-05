-- Migration: Enforce single-use journal entry reversals
-- Description: Add an explicit self-reference for reversal journal entries.

BEGIN;

ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS reversal_of_journal_entry_id INTEGER;

WITH inferred_reversals AS (
  SELECT
    reversal.id AS reversal_id,
    source.id AS source_id,
    ROW_NUMBER() OVER (
      PARTITION BY source.id
      ORDER BY reversal.created_at ASC NULLS LAST, reversal.id ASC
    ) AS rn
  FROM journal_entries reversal
  INNER JOIN journal_entries source
    ON source.id = reversal.reference_id
  WHERE reversal.reversal_of_journal_entry_id IS NULL
    AND reversal.reference_type = 'adjustment'
    AND reversal.description LIKE ('Reversal of ' || source.entry_number || ':%')
)
UPDATE journal_entries
SET reversal_of_journal_entry_id = inferred_reversals.source_id
FROM inferred_reversals
WHERE journal_entries.id = inferred_reversals.reversal_id
  AND inferred_reversals.rn = 1;

ALTER TABLE journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_reversal_of_fk,
  ADD CONSTRAINT journal_entries_reversal_of_fk
    FOREIGN KEY (reversal_of_journal_entry_id) REFERENCES journal_entries(id) ON DELETE RESTRICT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'unique_journal_entry_reversal_source'
  ) THEN
    ALTER TABLE journal_entries
      ADD CONSTRAINT unique_journal_entry_reversal_source
      UNIQUE (reversal_of_journal_entry_id);
  END IF;
END $$;

COMMIT;
