-- 147: Follow-up dispatch guard — only allow cancellation before outbound dispatch begins;
--      complete-to-sent uses compare-and-swap on processing_claim_id.

ALTER TABLE follow_up_schedules
  ADD COLUMN IF NOT EXISTS dispatch_started_at TIMESTAMP;
