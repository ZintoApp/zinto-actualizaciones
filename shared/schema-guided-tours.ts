import { pgTable, serial, text, integer, timestamp, jsonb, uuid, primaryKey } from 'drizzle-orm/pg-core';
import type { TourDefinition } from './guided-tours';
export const guidedTours = pgTable('guided_tours', {
  id: serial('id').primaryKey(), slug: text('slug').notNull().unique(), status: text('status').notNull().default('draft'),
  version: integer('version').notNull().default(0), draftRevision: integer('draft_revision').notNull().default(1),
  publishedRevision: integer('published_revision'), createdBy: integer('created_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(), updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
export const guidedTourRevisions = pgTable('guided_tour_revisions', {
  tourId: integer('tour_id').notNull().references(() => guidedTours.id, { onDelete: 'cascade' }),
  revision: integer('revision').notNull(), definition: jsonb('definition').$type<TourDefinition>().notNull(),
  publishedAt: timestamp('published_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => [primaryKey({ columns: [table.tourId, table.revision] })]);
export const guidedTourMedia = pgTable('guided_tour_media', {
  id: uuid('id').primaryKey(), tourId: integer('tour_id').notNull().references(() => guidedTours.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(), mimeType: text('mime_type').notNull(), size: integer('size').notNull(),
  createdBy: integer('created_by'), createdAt: timestamp('created_at').defaultNow().notNull(),
});
