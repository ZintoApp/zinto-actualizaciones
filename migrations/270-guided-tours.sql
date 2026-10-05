CREATE TABLE IF NOT EXISTS guided_tours (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  version INTEGER NOT NULL DEFAULT 0,
  draft_revision INTEGER NOT NULL DEFAULT 1,
  published_revision INTEGER,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS guided_tour_revisions (
  tour_id INTEGER NOT NULL REFERENCES guided_tours(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  definition JSONB NOT NULL,
  published_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tour_id, revision)
);
CREATE TABLE IF NOT EXISTS guided_tour_media (
  id UUID PRIMARY KEY,
  tour_id INTEGER NOT NULL REFERENCES guided_tours(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS guided_tours_published_idx ON guided_tours(status);
