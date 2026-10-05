-- Upgrade installations that created guided_tour_revisions before publication
-- timestamps were introduced. CREATE TABLE IF NOT EXISTS cannot add columns.
ALTER TABLE guided_tour_revisions
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMP;

-- Only the explicitly published revision is known to have been published.
-- Older revisions may be drafts; never grant them published access by inference.
-- Retain this marker for archived tours as well, without changing their status.
UPDATE guided_tour_revisions AS revision
SET published_at = revision.created_at
FROM guided_tours AS tour
WHERE revision.tour_id = tour.id
  AND revision.revision = tour.published_revision
  AND revision.published_at IS NULL;
