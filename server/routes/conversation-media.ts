import { Router } from 'express';
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { requireMediaConversation } from '../services/conversation-media-access';
import type { ConversationMediaItem, ConversationMediaPage, MediaCategory, MediaDirection, MediaSort } from '../../shared/conversation-media';

type MediaCursor = { date: string; message: number; attachment: number; scope?: string };

export function parseMediaPageQuery(query: Record<string, any>) {
  const category = query.category || 'media';
  if (!['media', 'documents', 'audio'].includes(category)) throw new Error('Invalid media category');
  const limit = query.limit === undefined ? 24 : Number(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('Limit must be between 1 and 50');
  if (query.q !== undefined && (typeof query.q !== 'string' || query.q.length > 200)) throw new Error('Search must be at most 200 characters');
  const q = (query.q || '').trim();
  const direction = query.direction || 'all';
  const sort = query.sort || 'newest';
  if (!['all', 'inbound', 'outbound'].includes(direction)) throw new Error('Invalid direction');
  if (!['newest', 'oldest'].includes(sort)) throw new Error('Invalid sort order');
  const timeZone = query.timeZone === undefined ? 'UTC' : query.timeZone;
  if (typeof timeZone !== 'string' || timeZone.length > 100) throw new Error('Invalid timezone');
  try { new Intl.DateTimeFormat('en', { timeZone }).format(); } catch { throw new Error('Invalid timezone'); }
  if (query.includeSummary !== undefined && !['1', '0', 'true', 'false'].includes(query.includeSummary)) throw new Error('Invalid summary option');
  const includeSummary = query.includeSummary === '1' || query.includeSummary === 'true';
  let cursor: MediaCursor | null = null;
  if (query.cursor) {
    if (typeof query.cursor !== 'string' || query.cursor.length > 512) throw new Error('Invalid cursor');
    try { cursor = JSON.parse(Buffer.from(query.cursor, 'base64url').toString()); } catch { throw new Error('Invalid cursor'); }
    if (!cursor || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}$/.test(cursor.date) || !Number.isFinite(Date.parse(cursor.date)) ||
      !Number.isSafeInteger(cursor.message) || cursor.message < 1 || !Number.isSafeInteger(cursor.attachment) || cursor.attachment < 0 ||
      (cursor.scope !== undefined && (typeof cursor.scope !== 'string' || !/^[a-f0-9]{64}$/.test(cursor.scope)))) throw new Error('Invalid cursor');
    // Old cursors remain valid for the original, unfiltered newest-first API.
    if (!cursor.scope && (q || direction !== 'all' || sort !== 'newest')) throw new Error('Cursor does not match filters');
  }
  return { category: category as MediaCategory, limit, cursor, q, direction: direction as MediaDirection, sort: sort as MediaSort, timeZone, includeSummary };
}

const router = Router();
router.get('/:id/media', async (req, res) => {
  try {
    let page;
    try { page = parseMediaPageQuery(req.query); } catch (error: any) { return res.status(400).json({ message: error.message }); }
    const conversation = await requireMediaConversation(req.user, Number(req.params.id));
    const scope = createHash('sha256').update(JSON.stringify([conversation.id, page.category, page.q.toLowerCase(), page.direction, page.sort, page.timeZone])).digest('hex');
    if (page.cursor?.scope && page.cursor.scope !== scope) return res.status(400).json({ message: 'Cursor does not match filters' });
    const comparison = page.sort === 'oldest' ? sql`>` : sql`<`;
    const order = page.sort === 'oldest' ? sql`ASC` : sql`DESC`;
    const cursorFilter = page.cursor ? sql`AND (created_at, message_id, attachment_id) ${comparison} (${page.cursor.date}::timestamp, ${page.cursor.message}, ${page.cursor.attachment})` : sql``;
    const directionFilter = page.direction === 'all' ? sql`` : sql`AND direction = ${page.direction}`;
    // Literal substring matching: filenames containing % or _ are not LIKE patterns.
    const searchFilter = page.q ? sql`AND strpos(lower(filename), lower(${page.q})) > 0` : sql``;
    const includeSummary = page.includeSummary && !page.cursor;
    const summary = includeSummary ? sql`, jsonb_build_object(
      'categoryCounts', (SELECT jsonb_build_object(
        'media', count(*) FILTER (WHERE category = 'media'),
        'documents', count(*) FILTER (WHERE category = 'documents'),
        'audio', count(*) FILTER (WHERE category = 'audio')) FROM filtered),
      'totalCount', (SELECT count(*) FROM filtered WHERE category = ${page.category}),
      'dateCounts', (SELECT COALESCE(jsonb_object_agg(day, total), '{}'::jsonb) FROM (
        SELECT to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE ${page.timeZone}, 'YYYY-MM-DD') AS day, count(*) AS total
        FROM filtered WHERE category = ${page.category} GROUP BY day
      ) dates)
    ) AS summary` : sql``;
    // Summaries and the first page share one database snapshot. Later pages omit aggregates.
    const result = await db.execute(sql`
      WITH attachments AS (
        SELECT m.id AS message_id, 0 AS attachment_id, m.type, m.direction,
          COALESCE(m.created_at, m.sent_at, '1970-01-01'::timestamp) AS created_at,
          COALESCE(NULLIF(m.metadata->>'filename', ''), NULLIF(m.metadata->>'fileName', ''), CASE WHEN m.type = 'document' THEN NULLIF(m.content, '') END, m.type || '-' || m.id) AS filename,
          CASE WHEN COALESCE(m.metadata->>'fileSize', m.metadata->>'mediaFileSize') ~ '^[0-9]{1,15}$' THEN COALESCE(m.metadata->>'fileSize', m.metadata->>'mediaFileSize')::bigint ELSE NULL END AS size,
          CASE WHEN m.type IN ('image', 'video', 'sticker') THEN 'media' WHEN m.type IN ('audio', 'voice') THEN 'audio' ELSE 'documents' END AS category
        FROM messages m WHERE m.conversation_id = ${conversation.id} AND m.type IN ('image', 'video', 'sticker', 'audio', 'voice', 'document') AND m.anonymized_at IS NULL
        UNION ALL
        SELECT m.id, a.id, CASE WHEN a.content_type LIKE 'image/%' THEN 'image' WHEN a.content_type LIKE 'video/%' THEN 'video' WHEN a.content_type LIKE 'audio/%' THEN 'audio' ELSE 'document' END,
          m.direction, COALESCE(m.created_at, m.sent_at, '1970-01-01'::timestamp), a.filename, a.size::bigint,
          CASE WHEN a.content_type LIKE 'image/%' OR a.content_type LIKE 'video/%' THEN 'media' WHEN a.content_type LIKE 'audio/%' THEN 'audio' ELSE 'documents' END
        FROM messages m JOIN email_attachments a ON a.message_id = m.id
        WHERE m.conversation_id = ${conversation.id} AND m.anonymized_at IS NULL
      ), filtered AS (
        SELECT * FROM attachments WHERE true ${directionFilter} ${searchFilter}
      ) SELECT COALESCE((SELECT jsonb_agg(p) FROM (
        SELECT *, to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US') AS cursor_date FROM filtered
        WHERE category = ${page.category} ${cursorFilter}
        ORDER BY created_at ${order}, message_id ${order}, attachment_id ${order} LIMIT ${page.limit + 1}
      ) p), '[]'::jsonb) AS items ${summary}
    `);
    const payload = result.rows[0] as { items: any[]; summary?: ConversationMediaPage['summary'] };
    const rows = payload.items;
    const hasMore = rows.length > page.limit;
    const visible = rows.slice(0, page.limit);
    const items: ConversationMediaItem[] = visible.map(row => {
      const attachment = Number(row.attachment_id);
      const url = `/api/messages/${row.message_id}/stream-media${attachment ? `?attachmentId=${attachment}` : ''}`;
      const separator = attachment ? '&' : '?';
      return { id: `${row.message_id}:${attachment}`, messageId: Number(row.message_id), attachmentId: attachment || null,
        type: row.type, filename: String(row.filename).slice(0, 200), size: row.size === null ? null : Number(row.size),
        createdAt: `${row.cursor_date}Z`, direction: row.direction, downloadUrl: url, previewUrl: `${url}${separator}inline=1`,
        thumbnailUrl: ['image', 'sticker'].includes(row.type) ? `${url}${separator}thumbnail=1` : null };
    });
    const last = visible.at(-1);
    const response: ConversationMediaPage = { items, hasMore, nextCursor: hasMore && last ? Buffer.from(JSON.stringify({ date: last.cursor_date, message: Number(last.message_id), attachment: Number(last.attachment_id), scope })).toString('base64url') : null,
      ...(includeSummary ? { summary: payload.summary } : {}) };
    res.json(response);
  } catch (error: any) { res.status(error.status || 500).json({ message: error.message }); }
});
export default router;
