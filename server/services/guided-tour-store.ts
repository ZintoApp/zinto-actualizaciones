import type { Pool, PoolClient } from 'pg';
import type { GuidedTour, GuidedTourSummary, TourDefinition } from '../../shared/guided-tours';
import { randomUUID } from 'node:crypto';

export interface ImportedTour {
  definition: TourDefinition; destination?: { id: number; version: number };
  media: { id: string; filename: string; mime: string; size: number }[];
}

export class TourConflict extends Error {}
export class TourNotFound extends Error {}
const mapTour = (row: any): GuidedTour => ({ id: row.id, version: row.version, status: row.status,
  publishedRevision: row.published_revision, revision: row.revision, definition: row.definition, publishedAt: row.published_at });

export function createGuidedTourStore(pool: Pick<Pool, 'query' | 'connect'>) {
  async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async function writeTranslations(client: PoolClient, id: number, revision: number, definition: TourDefinition) {
    const namespace = `guided_tour_${id}_${revision}`;
    const ns = await client.query('INSERT INTO translation_namespaces(name, description) VALUES ($1,$2) ON CONFLICT(name) DO UPDATE SET description=EXCLUDED.description RETURNING id', [namespace, 'Guided tour content']);
    const texts: [string, Record<string,string>][] = [['title', definition.title], ['description', definition.description]];
    for (const step of definition.steps) texts.push([`${step.id}_title`, step.title], [`${step.id}_content`, step.content]);
    for (const media of [...definition.media, ...definition.steps.flatMap(step => step.media)]) texts.push([`media_${media.id}_caption`,media.caption],[`media_${media.id}_alt`,media.alt]);
    for (const [key, values] of new Map(texts)) {
      const keyResult = await client.query('INSERT INTO translation_keys(namespace_id,key) VALUES ($1,$2) RETURNING id', [ns.rows[0].id,key]);
      for (const [code,value] of Object.entries(values)) await client.query('INSERT INTO translations(key_id,language_id,value) SELECT $1,id,$2 FROM languages WHERE code=$3', [keyResult.rows[0].id,value,code]);
    }
  }
  return {
    async exportSnapshot(selections: { id: number; version: number }[]) {
      return transaction(async client => {
        await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        const result = await client.query(`SELECT t.*,r.revision,r.definition FROM guided_tours t
          JOIN guided_tour_revisions r ON r.tour_id=t.id AND r.revision=t.draft_revision WHERE t.id=ANY($1::int[])`, [selections.map(item => item.id)]);
        const tours = selections.map(item => {
          const row = result.rows.find(row => row.id === item.id);
          if (!row || row.version !== item.version) throw new TourConflict();
          return mapTour(row);
        });
        const media = await client.query('SELECT * FROM guided_tour_media WHERE tour_id=ANY($1::int[])', [selections.map(item => item.id)]);
        return { tours, media: media.rows };
      });
    },
    async importBatch(items: ImportedTour[], userId: number) {
      return transaction(async client => {
        // Lock destinations in a stable order, then validate every replacement before writing.
        const destinations = items.flatMap(item => item.destination ? [item.destination.id] : []);
        if (new Set(destinations).size !== destinations.length) throw new TourConflict();
        const locked = await client.query('SELECT * FROM guided_tours WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE', [destinations]);
        for (const item of items) if (item.destination) {
          const row = locked.rows.find(row => row.id === item.destination!.id);
          if (!row || row.version !== item.destination.version || row.slug !== item.definition.slug) throw new TourConflict();
        }
        const results: GuidedTour[] = [];
        for (const item of items) {
          const definition = structuredClone(item.definition);
          let row: any;
          if (item.destination) {
            row = (await client.query('UPDATE guided_tours SET version=version+1,draft_revision=draft_revision+1,updated_at=NOW() WHERE id=$1 RETURNING *', [item.destination.id])).rows[0];
          } else {
            // ON CONFLICT also handles concurrent imports of the same slug.
            for (;;) {
              row = (await client.query('INSERT INTO guided_tours(slug,created_by) VALUES ($1,$2) ON CONFLICT(slug) DO NOTHING RETURNING *', [definition.slug, userId])).rows[0];
              if (row) break;
              definition.slug = `${item.definition.slug.slice(0, 65)}-${randomUUID().slice(0, 8)}`;
            }
          }
          for (const media of item.media) await client.query('INSERT INTO guided_tour_media(id,tour_id,filename,mime_type,size,created_by) VALUES ($1,$2,$3,$4,$5,$6)', [media.id,row.id,media.filename,media.mime,media.size,userId]);
          await client.query('INSERT INTO guided_tour_revisions(tour_id,revision,definition) VALUES ($1,$2,$3)', [row.id,row.draft_revision,definition]);
          await writeTranslations(client,row.id,row.draft_revision,definition);
          results.push(mapTour({ ...row, revision: row.draft_revision, definition }));
        }
        return results;
      });
    },
    async summaries(): Promise<GuidedTourSummary[]> {
      const result = await pool.query(`SELECT t.id, t.version, t.status, t.published_revision, r.revision,
        jsonb_build_object('title',r.definition->'title','feature',r.definition->'feature','order',r.definition->'order') AS definition,
        jsonb_array_length(r.definition->'steps') AS step_count
        FROM guided_tours t JOIN guided_tour_revisions r ON r.tour_id=t.id AND r.revision=t.draft_revision ORDER BY t.id`);
      return result.rows.map(row => ({ ...mapTour(row), stepCount: row.step_count }));
    },
    async draft(id: number): Promise<GuidedTour | undefined> {
      const result = await pool.query(`SELECT t.*,r.revision,r.definition,r.published_at FROM guided_tours t
        JOIN guided_tour_revisions r ON r.tour_id=t.id AND r.revision=t.draft_revision WHERE t.id=$1`, [id]);
      return result.rows[0] && mapTour(result.rows[0]);
    },
    async list(admin = false): Promise<GuidedTour[]> {
      const result = await pool.query(`SELECT t.*, r.revision, r.definition FROM guided_tours t JOIN guided_tour_revisions r ON r.tour_id=t.id AND r.revision=t.${admin ? 'draft_revision' : 'published_revision'} ${admin ? '' : "WHERE t.status='published'"} ORDER BY t.id`);
      return result.rows.map(mapTour);
    },
    async revision(id: number, revision: number): Promise<GuidedTour | undefined> {
      const result = await pool.query('SELECT t.*,r.revision,r.definition,r.published_at FROM guided_tours t JOIN guided_tour_revisions r ON r.tour_id=t.id WHERE t.id=$1 AND r.revision=$2', [id,revision]);
      return result.rows[0] && mapTour(result.rows[0]);
    },
    async create(definition: TourDefinition, userId: number | null, seed = false) {
      return transaction(async client => {
        if (seed) {
          // The marker survives deletion and also backfills already-installed seeds.
          const marker = await client.query('INSERT INTO app_settings(key,value) VALUES ($1,$2) ON CONFLICT(key) DO NOTHING RETURNING id', [`guided_tours.seed_applied.${definition.slug}`, true]);
          if (!marker.rows.length) return null;
        }
        const row = await client.query(`INSERT INTO guided_tours(slug,created_by,status,published_revision) VALUES ($1,$2,$3,$4) ${seed ? 'ON CONFLICT(slug) DO NOTHING' : ''} RETURNING *`, [definition.slug,userId,seed ? 'published' : 'draft',seed ? 1 : null]);
        if (!row.rows.length) return null;
        const id = row.rows[0].id;
        await client.query('INSERT INTO guided_tour_revisions(tour_id,revision,definition,published_at) VALUES ($1,1,$2,$3)', [id,definition,seed ? new Date() : null]);
        await writeTranslations(client,id,1,definition);
        return mapTour({ ...row.rows[0], revision:1,definition });
      });
    },
    async update(id: number, version: number, definition: TourDefinition) {
      return transaction(async client => {
        const updated = await client.query('UPDATE guided_tours SET version=version+1,draft_revision=draft_revision+1,slug=$3,updated_at=NOW() WHERE id=$1 AND version=$2 RETURNING *', [id,version,definition.slug]);
        if (!updated.rows.length) throw new TourConflict();
        const row = updated.rows[0];
        await client.query('INSERT INTO guided_tour_revisions(tour_id,revision,definition) VALUES ($1,$2,$3)', [id,row.draft_revision,definition]);
        await writeTranslations(client,id,row.draft_revision,definition);
        return mapTour({ ...row,revision:row.draft_revision,definition });
      });
    },
    async transition(id: number, version: number, action: 'publish' | 'draft' | 'archive' | 'delete') {
      return transaction(async client => {
        const current = await client.query('SELECT * FROM guided_tours WHERE id=$1 FOR UPDATE',[id]);
        if (!current.rows.length) throw new TourNotFound();
        const row = current.rows[0];
        if (row.version !== version) throw new TourConflict();
        if (action === 'delete') {
          const media = await client.query('SELECT filename FROM guided_tour_media WHERE tour_id=$1',[id]);
          const namespaces = await client.query("SELECT id FROM translation_namespaces WHERE name IN (SELECT 'guided_tour_' || tour_id || '_' || revision FROM guided_tour_revisions WHERE tour_id=$1)", [id]);
          const namespaceIds = namespaces.rows.map(item => item.id);
          await client.query('DELETE FROM translations WHERE key_id IN (SELECT id FROM translation_keys WHERE namespace_id=ANY($1::int[]))', [namespaceIds]);
          await client.query('DELETE FROM translation_keys WHERE namespace_id=ANY($1::int[])', [namespaceIds]);
          await client.query('DELETE FROM translation_namespaces WHERE id=ANY($1::int[])', [namespaceIds]);
          await client.query('DELETE FROM guided_tours WHERE id=$1',[id]);
          return { filenames: media.rows.map(item => item.filename) as string[] };
        }
        await client.query(`UPDATE guided_tours SET status=$2,version=version+1,updated_at=NOW()${action === 'publish' ? ',published_revision=draft_revision' : ''} WHERE id=$1`,[id,action === 'publish' ? 'published' : action === 'draft' ? 'draft' : 'archived']);
        if (action === 'publish') await client.query('UPDATE guided_tour_revisions SET published_at=COALESCE(published_at,NOW()) WHERE tour_id=$1 AND revision=$2',[id,row.draft_revision]);
        return { filenames: [] as string[] };
      });
    },
    async media(id: string) { return (await pool.query('SELECT * FROM guided_tour_media WHERE id=$1',[id])).rows[0]; },
    async publishedMediaReferences(id: string): Promise<GuidedTour[]> {
      const result = await pool.query(`SELECT t.*,r.revision,r.definition,r.published_at
        FROM guided_tours t JOIN guided_tour_revisions r ON r.tour_id=t.id
        WHERE t.status='published' AND r.published_at IS NOT NULL
        AND (r.definition->'media' @> $1::jsonb OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(r.definition->'steps') step WHERE step->'media' @> $1::jsonb
        ))`, [JSON.stringify([{id}])]);
      return result.rows.map(mapTour);
    },
    async addMedia(id: string, tourId: number, filename: string, mime: string, size: number, userId: number) {
      await pool.query('INSERT INTO guided_tour_media(id,tour_id,filename,mime_type,size,created_by) VALUES ($1,$2,$3,$4,$5,$6)',[id,tourId,filename,mime,size,userId]);
    },
    async removeUnusedMedia(id: string) {
      return transaction(async client => {
        const media = await client.query('SELECT * FROM guided_tour_media WHERE id=$1 FOR UPDATE',[id]);
        if (!media.rows.length) throw new TourNotFound();
        const refs = await client.query('SELECT 1 FROM guided_tour_revisions r JOIN guided_tours t ON t.id=r.tour_id WHERE r.tour_id=$1 AND (r.published_at IS NOT NULL OR r.revision=t.draft_revision) AND r.definition::text LIKE $2 LIMIT 1',[media.rows[0].tour_id,`%${id}%`]);
        if (refs.rows.length) throw new TourConflict('Media is referenced by a revision');
        await client.query('DELETE FROM guided_tour_media WHERE id=$1',[id]);
        return media.rows[0].filename as string;
      });
    },
  };
}
