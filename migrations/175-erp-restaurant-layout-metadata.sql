ALTER TABLE restaurant_sections
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS floor_level integer,
  ADD COLUMN IF NOT EXISTS display_color text,
  ADD COLUMN IF NOT EXISTS layout_config jsonb;

ALTER TABLE restaurant_tables
  ADD COLUMN IF NOT EXISTS pos_x integer,
  ADD COLUMN IF NOT EXISTS pos_y integer,
  ADD COLUMN IF NOT EXISTS layout_width integer,
  ADD COLUMN IF NOT EXISTS layout_height integer,
  ADD COLUMN IF NOT EXISTS rotation integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS table_shape text,
  ADD COLUMN IF NOT EXISTS table_type text,
  ADD COLUMN IF NOT EXISTS is_reservable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS metadata jsonb;
