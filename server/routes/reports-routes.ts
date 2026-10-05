/**
 * Reports API Routes
 * Conversation metrics reports: agent performance, response time, channel SLA, volume heatmap, resolution, CSV export.
 */

import { Router, Request } from 'express';
import { db } from '../db';
import { conversationMetrics, users, conversations, PERMISSIONS } from '@shared/schema';
import { eq, and, gte, lte, sql, avg, min, max, count, isNotNull, isNull } from 'drizzle-orm';
import { ensureAuthenticated, requireAnyPermission, requirePermission } from '../middleware';
import { parseExportFormat, sendTabularExport } from '../utils/tabular-export';

const router = Router();

interface BotCoverageSummary {
  totalConversations: number;
  botAssistedConversations: number;
  unassistedConversations: number;
  unassistedContacts: number;
}

interface BotCoverageRow {
  conversationId: number;
  contactId: number | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  channelType: string;
  status: string | null;
  contactedAt: Date | string | null;
  assignedAgentName: string | null;
  inboundMessages: number;
  botMessages: number;
  agentMessages: number;
  unassistedConversationCount: number;
}

function parseDateRange(from?: string, to?: string): { fromDate: Date; toDate: Date } {
  const toDate = to ? new Date(to) : new Date();
  const fromDate = from ? new Date(from) : (() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d;
  })();
  return { fromDate, toDate };
}

function getCompanyId(req: Request): number | null {
  return (req as any).user?.companyId ?? null;
}

function requestedExportFormat(req: Request) {
  return parseExportFormat(req.query.format);
}

/**
 * A conversation is eligible once the customer has sent at least one inbound
 * message. It is bot-assisted when it contains at least one outbound bot
 * message. Bot activity is intentionally checked across the full conversation,
 * while the date range selects when the conversation began.
 */
export async function queryBotCoverage(
  companyId: number,
  fromDate: Date,
  toDate: Date,
  pagination?: { page: number; pageSize: number }
): Promise<{ summary: BotCoverageSummary; rows: BotCoverageRow[] }> {
  const summaryResult = await db.execute(sql`
    WITH eligible_conversations AS (
      SELECT
        c.id,
        c.contact_id,
        EXISTS (
          SELECT 1
          FROM messages bot_message
          WHERE bot_message.conversation_id = c.id
            AND bot_message.direction = 'outbound'
            AND bot_message.is_from_bot = true
        ) AS bot_assisted
      FROM conversations c
      WHERE c.company_id = ${companyId}
        AND c.created_at >= ${fromDate}
        AND c.created_at <= ${toDate}
        AND EXISTS (
          SELECT 1
          FROM messages inbound_message
          WHERE inbound_message.conversation_id = c.id
            AND inbound_message.direction = 'inbound'
        )
    )
    SELECT
      COUNT(*)::int AS total_conversations,
      COUNT(*) FILTER (WHERE bot_assisted)::int AS bot_assisted_conversations,
      COUNT(*) FILTER (WHERE NOT bot_assisted)::int AS unassisted_conversations,
      COUNT(DISTINCT COALESCE(contact_id::text, 'conversation:' || id::text))
        FILTER (WHERE NOT bot_assisted)::int AS unassisted_contacts
    FROM eligible_conversations
  `);

  const rawSummary = (summaryResult as { rows?: Record<string, unknown>[] }).rows?.[0] ?? {};
  const summary: BotCoverageSummary = {
    totalConversations: Number(rawSummary.total_conversations ?? 0),
    botAssistedConversations: Number(rawSummary.bot_assisted_conversations ?? 0),
    unassistedConversations: Number(rawSummary.unassisted_conversations ?? 0),
    unassistedContacts: Number(rawSummary.unassisted_contacts ?? 0),
  };

  const pagingSql = pagination
    ? sql`LIMIT ${pagination.pageSize} OFFSET ${pagination.page * pagination.pageSize}`
    : sql``;
  const rowsResult = await db.execute(sql`
    WITH unassisted AS (
      SELECT
        c.id AS conversation_id,
        c.contact_id,
        COALESCE(c.contact_id::text, 'conversation:' || c.id::text) AS person_key,
        contact.name AS contact_name,
        contact.email AS contact_email,
        contact.phone AS contact_phone,
        c.channel_type,
        c.status,
        c.created_at AS contacted_at,
        assigned_user.full_name AS assigned_agent_name,
        (
          SELECT COUNT(*)::int
          FROM messages inbound_message
          WHERE inbound_message.conversation_id = c.id
            AND inbound_message.direction = 'inbound'
        ) AS inbound_messages,
        (
          SELECT COUNT(*)::int
          FROM messages bot_message
          WHERE bot_message.conversation_id = c.id
            AND bot_message.direction = 'outbound'
            AND bot_message.is_from_bot = true
        ) AS bot_messages,
        (
          SELECT COUNT(*)::int
          FROM messages agent_message
          WHERE agent_message.conversation_id = c.id
            AND agent_message.direction = 'outbound'
            AND agent_message.is_from_bot = false
            AND agent_message.sender_type = 'user'
        ) AS agent_messages
      FROM conversations c
      LEFT JOIN contacts contact ON contact.id = c.contact_id
      LEFT JOIN users assigned_user ON assigned_user.id = c.assigned_to_user_id
      WHERE c.company_id = ${companyId}
        AND c.created_at >= ${fromDate}
        AND c.created_at <= ${toDate}
        AND EXISTS (
          SELECT 1
          FROM messages inbound_message
          WHERE inbound_message.conversation_id = c.id
            AND inbound_message.direction = 'inbound'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM messages bot_message
          WHERE bot_message.conversation_id = c.id
            AND bot_message.direction = 'outbound'
            AND bot_message.is_from_bot = true
        )
    ), ranked AS (
      SELECT
        unassisted.*,
        COUNT(*) OVER (PARTITION BY person_key)::int AS unassisted_conversation_count,
        ROW_NUMBER() OVER (PARTITION BY person_key ORDER BY contacted_at DESC, conversation_id DESC) AS person_row_number
      FROM unassisted
    )
    SELECT
      conversation_id,
      contact_id,
      contact_name,
      contact_email,
      contact_phone,
      channel_type,
      status,
      contacted_at,
      assigned_agent_name,
      inbound_messages,
      bot_messages,
      agent_messages,
      unassisted_conversation_count
    FROM ranked
    WHERE person_row_number = 1
    ORDER BY contacted_at DESC, conversation_id DESC
    ${pagingSql}
  `);

  const rawRows = (rowsResult as { rows?: Record<string, unknown>[] }).rows ?? [];
  const rows: BotCoverageRow[] = rawRows.map((row) => ({
    conversationId: Number(row.conversation_id),
    contactId: row.contact_id == null ? null : Number(row.contact_id),
    contactName: row.contact_name == null ? null : String(row.contact_name),
    contactEmail: row.contact_email == null ? null : String(row.contact_email),
    contactPhone: row.contact_phone == null ? null : String(row.contact_phone),
    channelType: String(row.channel_type),
    status: row.status == null ? null : String(row.status),
    contactedAt: row.contacted_at as Date | string | null,
    assignedAgentName: row.assigned_agent_name == null ? null : String(row.assigned_agent_name),
    inboundMessages: Number(row.inbound_messages ?? 0),
    botMessages: Number(row.bot_messages ?? 0),
    agentMessages: Number(row.agent_messages ?? 0),
    unassistedConversationCount: Number(row.unassisted_conversation_count ?? 1),
  }));

  return { summary, rows };
}

// --- Agent performance query (shared by GET and export)
async function queryAgentPerformance(companyId: number, fromDate: Date, toDate: Date, agentId?: number) {
  const conditions = [
    eq(conversationMetrics.companyId, companyId),
    gte(conversationMetrics.contactedAt, fromDate),
    lte(conversationMetrics.contactedAt, toDate)
  ];
  if (agentId != null) {
    conditions.push(eq(conversationMetrics.assignedToUserId, agentId));
  }
  const rows = await db
    .select({
      agentId: conversationMetrics.assignedToUserId,
      agentName: users.fullName,
      agentEmail: users.email,
      conversationsHandled: count(),
      avgFirstResponseTimeSec: avg(conversationMetrics.firstResponseTimeSec),
      avgResolutionTimeSec: avg(conversationMetrics.resolutionTimeSec),
      totalAgentMessages: sql<number>`coalesce(sum(${conversationMetrics.agentMessages}), 0)`,
      resolvedCount: sql<number>`count(*) filter (where ${conversationMetrics.resolvedAt} is not null)`
    })
    .from(conversationMetrics)
    .innerJoin(conversations, eq(conversationMetrics.conversationId, conversations.id))
    .leftJoin(users, eq(conversationMetrics.assignedToUserId, users.id))
    .where(and(...conditions))
    .groupBy(conversationMetrics.assignedToUserId, users.fullName, users.email);

  return rows.map(row => {
    const conversationsHandled = Number(row.conversationsHandled ?? 0);
    const resolvedCount = Number(row.resolvedCount ?? 0);
    const resolutionRate = conversationsHandled > 0 ? (resolvedCount / conversationsHandled) * 100 : 0;
    return {
      agentId: row.agentId,
      agentName: row.agentName ?? null,
      agentEmail: row.agentEmail ?? null,
      conversationsHandled,
      avgFirstResponseTimeSec: row.avgFirstResponseTimeSec != null ? Number(row.avgFirstResponseTimeSec) : null,
      avgResolutionTimeSec: row.avgResolutionTimeSec != null ? Number(row.avgResolutionTimeSec) : null,
      totalAgentMessages: Number(row.totalAgentMessages ?? 0),
      resolutionRate
    };
  });
}

/**
 * GET /agent-performance
 */
router.get('/agent-performance', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_REPORTS, PERMISSIONS.VIEW_AGENT_REPORTS]), async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (companyId == null) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const { from, to, agentId } = req.query;
    const { fromDate, toDate } = parseDateRange(from as string, to as string);
    const agentIdNum = agentId != null && agentId !== '' ? parseInt(String(agentId), 10) : undefined;
    const data = await queryAgentPerformance(companyId, fromDate, toDate, isNaN(agentIdNum!) ? undefined : agentIdNum);
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching agent performance:', error);
    return res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * GET /response-time
 */
router.get('/response-time', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_REPORTS, PERMISSIONS.VIEW_AGENT_REPORTS, PERMISSIONS.VIEW_RESPONSE_TIME_REPORTS]), async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (companyId == null) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const { from, to, channelType } = req.query;
    const { fromDate, toDate } = parseDateRange(from as string, to as string);
    const conditions = [
      eq(conversationMetrics.companyId, companyId),
      isNotNull(conversationMetrics.firstResponseTimeSec),
      gte(conversationMetrics.contactedAt, fromDate),
      lte(conversationMetrics.contactedAt, toDate)
    ];
    if (channelType != null && channelType !== '') {
      conditions.push(eq(conversationMetrics.channelType, String(channelType)));
    }
    const rows = await db
      .select({
        day: sql`date_trunc('day', ${conversationMetrics.contactedAt})`,
        channelType: conversationMetrics.channelType,
        avgSec: avg(conversationMetrics.firstResponseTimeSec),
        minSec: min(conversationMetrics.firstResponseTimeSec),
        maxSec: max(conversationMetrics.firstResponseTimeSec),
        p95Sec: sql<number>`percentile_cont(0.95) within group (order by ${conversationMetrics.firstResponseTimeSec})`,
        sampleCount: count()
      })
      .from(conversationMetrics)
      .innerJoin(conversations, eq(conversationMetrics.conversationId, conversations.id))
      .where(and(...conditions))
      .groupBy(sql`date_trunc('day', ${conversationMetrics.contactedAt})`, conversationMetrics.channelType);

    const data = rows.map(row => ({
      day: row.day,
      channelType: row.channelType,
      avgSec: row.avgSec != null ? Number(row.avgSec) : null,
      minSec: row.minSec != null ? Number(row.minSec) : null,
      maxSec: row.maxSec != null ? Number(row.maxSec) : null,
      p95Sec: row.p95Sec != null ? Number(row.p95Sec) : null,
      sampleCount: Number(row.sampleCount ?? 0)
    }));
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching response time:', error);
    return res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * GET /channel-sla
 */
router.get('/channel-sla', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_REPORTS, PERMISSIONS.VIEW_AGENT_REPORTS]), async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (companyId == null) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const { from, to, slaThresholdSec } = req.query;
    const { fromDate, toDate } = parseDateRange(from as string, to as string);
    const threshold = slaThresholdSec != null && slaThresholdSec !== '' ? parseInt(String(slaThresholdSec), 10) : 300;
    const rows = await db
      .select({
        channelType: conversationMetrics.channelType,
        total: count(),
        withinSla: sql<number>`count(*) filter (where ${conversationMetrics.firstResponseTimeSec} <= ${threshold})`,
        avgFirstResponseTimeSec: avg(conversationMetrics.firstResponseTimeSec)
      })
      .from(conversationMetrics)
      .innerJoin(conversations, eq(conversationMetrics.conversationId, conversations.id))
      .where(and(
        eq(conversationMetrics.companyId, companyId),
        isNotNull(conversationMetrics.firstResponseTimeSec),
        gte(conversationMetrics.contactedAt, fromDate),
        lte(conversationMetrics.contactedAt, toDate)
      ))
      .groupBy(conversationMetrics.channelType);

    const data = rows.map(row => {
      const total = Number(row.total ?? 0);
      const withinSla = Number(row.withinSla ?? 0);
      const slaComplianceRate = total > 0 ? (withinSla / total) * 100 : 0;
      return {
        channelType: row.channelType,
        total,
        withinSla,
        slaComplianceRate,
        avgFirstResponseTimeSec: row.avgFirstResponseTimeSec != null ? Number(row.avgFirstResponseTimeSec) : null
      };
    });
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching channel SLA:', error);
    return res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * GET /volume-heatmap
 */
router.get('/volume-heatmap', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_REPORTS, PERMISSIONS.VIEW_AGENT_REPORTS]), async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (companyId == null) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const { from, to } = req.query;
    const { fromDate, toDate } = parseDateRange(from as string, to as string);
    const rows = await db
      .select({
        dayOfWeek: sql<number>`extract(dow from ${conversationMetrics.contactedAt})`,
        hourOfDay: sql<number>`extract(hour from ${conversationMetrics.contactedAt})`,
        conversationCount: count()
      })
      .from(conversationMetrics)
      .innerJoin(conversations, eq(conversationMetrics.conversationId, conversations.id))
      .where(and(
        eq(conversationMetrics.companyId, companyId),
        gte(conversationMetrics.contactedAt, fromDate),
        lte(conversationMetrics.contactedAt, toDate)
      ))
      .groupBy(sql`extract(dow from ${conversationMetrics.contactedAt})`, sql`extract(hour from ${conversationMetrics.contactedAt})`);

    const data = rows.map(row => ({
      dayOfWeek: Number(row.dayOfWeek ?? 0),
      hourOfDay: Number(row.hourOfDay ?? 0),
      conversationCount: Number(row.conversationCount ?? 0)
    }));
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching volume heatmap:', error);
    return res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * GET /resolution
 */
router.get('/resolution', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_REPORTS, PERMISSIONS.VIEW_AGENT_REPORTS]), async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (companyId == null) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const { from, to } = req.query;
    const { fromDate, toDate } = parseDateRange(from as string, to as string);
    const [row] = await db
      .select({
        total: count(),
        resolved: sql<number>`count(*) filter (where ${conversationMetrics.resolvedAt} is not null)`,
        open: sql<number>`count(*) filter (where ${conversationMetrics.resolvedAt} is null)`,
        avgResolutionTimeSec: avg(conversationMetrics.resolutionTimeSec)
      })
      .from(conversationMetrics)
      .innerJoin(conversations, eq(conversationMetrics.conversationId, conversations.id))
      .where(and(
        eq(conversationMetrics.companyId, companyId),
        gte(conversationMetrics.contactedAt, fromDate),
        lte(conversationMetrics.contactedAt, toDate)
      ));

    const total = Number(row?.total ?? 0);
    const resolved = Number(row?.resolved ?? 0);
    const open = Number(row?.open ?? 0);
    const resolutionRate = total > 0 ? (resolved / total) * 100 : 0;
    const data = {
      total,
      resolved,
      open,
      resolutionRate,
      avgResolutionTimeSec: row?.avgResolutionTimeSec != null ? Number(row.avgResolutionTimeSec) : null
    };
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching resolution:', error);
    return res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * GET /csat
 * Customer satisfaction metrics for the Resolution & CSAT tab. Returns stub when no CSAT source exists.
 */
router.get('/csat', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_REPORTS, PERMISSIONS.VIEW_AGENT_REPORTS]), async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (companyId == null) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const { from, to } = req.query;
    const { fromDate, toDate } = parseDateRange(from as string, to as string);
    // No CSAT table in schema yet; return contract-compliant stub so client can render section
    const data = {
      avgScore: null as number | null,
      responseCount: 0,
      distribution: [] as { score: number; count: number }[]
    };
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching CSAT:', error);
    return res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * GET /bot-coverage
 * Lists customer conversations that received no outbound bot response.
 */
router.get('/bot-coverage', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_REPORTS, PERMISSIONS.VIEW_AGENT_REPORTS]), async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (companyId == null) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const { from, to } = req.query;
    const { fromDate, toDate } = parseDateRange(from as string, to as string);
    const requestedPage = Number.parseInt(String(req.query.page ?? '0'), 10);
    const requestedPageSize = Number.parseInt(String(req.query.pageSize ?? '10'), 10);
    const page = Number.isFinite(requestedPage) ? Math.max(0, requestedPage) : 0;
    const pageSize = Number.isFinite(requestedPageSize) ? Math.min(100, Math.max(1, requestedPageSize)) : 10;
    const data = await queryBotCoverage(companyId, fromDate, toDate, { page, pageSize });

    return res.json({
      success: true,
      data: {
        ...data,
        pagination: {
          page,
          pageSize,
          totalRows: data.summary.unassistedContacts,
          totalPages: Math.ceil(data.summary.unassistedContacts / pageSize),
        },
      },
    });
  } catch (error) {
    console.error('Error fetching bot coverage:', error);
    return res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * GET /export/agent-performance
 */
router.get('/export/agent-performance', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_REPORTS, PERMISSIONS.VIEW_AGENT_REPORTS]), requirePermission(PERMISSIONS.EXPORT_REPORTS), async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (companyId == null) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const { from, to } = req.query;
    const { fromDate, toDate } = parseDateRange(from as string, to as string);
    const rows = await queryAgentPerformance(companyId, fromDate, toDate);
    const format = requestedExportFormat(req);
    if (!format) return res.status(400).json({ success: false, error: 'Unsupported export format' });
    const records = rows.map(r => ({
      agentId: r.agentId ?? '',
      agentName: r.agentName ?? '',
      agentEmail: r.agentEmail ?? '',
      conversationsHandled: r.conversationsHandled,
      avgFirstResponseTimeSec: r.avgFirstResponseTimeSec ?? '',
      avgResolutionTimeSec: r.avgResolutionTimeSec ?? '',
      totalAgentMessages: r.totalAgentMessages,
      resolutionRate: r.resolutionRate
    }));
    return await sendTabularExport(res, {
      filename: `agent-performance-${Date.now()}`,
      format,
      sheets: [{
        name: 'Agent Performance',
        columns: [
          { key: 'agentId', header: 'Agent ID', type: 'string' },
          { key: 'agentName', header: 'Agent Name', width: 24 },
          { key: 'agentEmail', header: 'Agent Email', width: 28 },
          { key: 'conversationsHandled', header: 'Conversations Handled', type: 'number' },
          { key: 'avgFirstResponseTimeSec', header: 'Avg First Response (sec)', type: 'number', numberFormat: '0.0' },
          { key: 'avgResolutionTimeSec', header: 'Avg Resolution Time (sec)', type: 'number', numberFormat: '0.0' },
          { key: 'totalAgentMessages', header: 'Total Agent Messages', type: 'number' },
          { key: 'resolutionRate', header: 'Resolution Rate (%)', type: 'number', numberFormat: '0.0' },
        ],
        rows: records,
      }],
    });
  } catch (error) {
    console.error('Error exporting agent performance:', error);
    return res.status(500).json({ success: false, error: String(error) });
  }
});

router.get('/export/response-time', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_REPORTS, PERMISSIONS.VIEW_AGENT_REPORTS, PERMISSIONS.VIEW_RESPONSE_TIME_REPORTS]), requirePermission(PERMISSIONS.EXPORT_REPORTS), async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (companyId == null) return res.status(400).json({ success: false, error: 'Company ID required' });
    const format = requestedExportFormat(req);
    if (!format) return res.status(400).json({ success: false, error: 'Unsupported export format' });
    const { fromDate, toDate } = parseDateRange(req.query.from as string, req.query.to as string);
    const rows = await db.select({
      day: sql`date_trunc('day', ${conversationMetrics.contactedAt})`,
      channelType: conversationMetrics.channelType,
      avgSec: avg(conversationMetrics.firstResponseTimeSec),
      minSec: min(conversationMetrics.firstResponseTimeSec),
      maxSec: max(conversationMetrics.firstResponseTimeSec),
      p95Sec: sql<number>`percentile_cont(0.95) within group (order by ${conversationMetrics.firstResponseTimeSec})`,
      sampleCount: count(),
    }).from(conversationMetrics).where(and(
      eq(conversationMetrics.companyId, companyId),
      isNotNull(conversationMetrics.firstResponseTimeSec),
      gte(conversationMetrics.contactedAt, fromDate),
      lte(conversationMetrics.contactedAt, toDate),
    )).groupBy(sql`date_trunc('day', ${conversationMetrics.contactedAt})`, conversationMetrics.channelType);
    const records = rows.map((row) => ({
      day: row.day,
      channelType: row.channelType ?? 'Other',
      avgSec: row.avgSec == null ? null : Number(row.avgSec),
      minSec: row.minSec == null ? null : Number(row.minSec),
      maxSec: row.maxSec == null ? null : Number(row.maxSec),
      p95Sec: row.p95Sec == null ? null : Number(row.p95Sec),
      sampleCount: Number(row.sampleCount ?? 0),
    }));
    return await sendTabularExport(res, { filename: `response-time-${Date.now()}`, format, sheets: [{
      name: 'Response Time', rows: records, columns: [
        { key: 'day', header: 'Day', type: 'date', numberFormat: 'yyyy-mm-dd' },
        { key: 'channelType', header: 'Channel', width: 20 },
        { key: 'avgSec', header: 'Average (sec)', type: 'number', numberFormat: '0.0' },
        { key: 'minSec', header: 'Minimum (sec)', type: 'number', numberFormat: '0.0' },
        { key: 'maxSec', header: 'Maximum (sec)', type: 'number', numberFormat: '0.0' },
        { key: 'p95Sec', header: 'P95 (sec)', type: 'number', numberFormat: '0.0' },
        { key: 'sampleCount', header: 'Conversations', type: 'number' },
      ],
    }] });
  } catch (error) {
    console.error('Error exporting response time:', error);
    return res.status(500).json({ success: false, error: String(error) });
  }
});

router.get('/export/channel-sla', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_REPORTS, PERMISSIONS.VIEW_AGENT_REPORTS]), requirePermission(PERMISSIONS.EXPORT_REPORTS), async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (companyId == null) return res.status(400).json({ success: false, error: 'Company ID required' });
    const format = requestedExportFormat(req);
    if (!format) return res.status(400).json({ success: false, error: 'Unsupported export format' });
    const { fromDate, toDate } = parseDateRange(req.query.from as string, req.query.to as string);
    const threshold = req.query.slaThresholdSec ? Math.max(1, parseInt(String(req.query.slaThresholdSec), 10)) : 300;
    const rows = await db.select({
      channelType: conversationMetrics.channelType,
      total: count(),
      withinSla: sql<number>`count(*) filter (where ${conversationMetrics.firstResponseTimeSec} <= ${threshold})`,
      avgFirstResponseTimeSec: avg(conversationMetrics.firstResponseTimeSec),
    }).from(conversationMetrics).where(and(
      eq(conversationMetrics.companyId, companyId),
      isNotNull(conversationMetrics.firstResponseTimeSec),
      gte(conversationMetrics.contactedAt, fromDate),
      lte(conversationMetrics.contactedAt, toDate),
    )).groupBy(conversationMetrics.channelType);
    const records = rows.map((row) => {
      const total = Number(row.total ?? 0);
      const withinSla = Number(row.withinSla ?? 0);
      return { channelType: row.channelType ?? 'Other', total, withinSla, slaComplianceRate: total ? (withinSla / total) * 100 : 0, avgFirstResponseTimeSec: row.avgFirstResponseTimeSec == null ? null : Number(row.avgFirstResponseTimeSec) };
    });
    return await sendTabularExport(res, { filename: `channel-sla-${Date.now()}`, format, sheets: [{
      name: 'Channel SLA', rows: records, columns: [
        { key: 'channelType', header: 'Channel', width: 20 },
        { key: 'total', header: 'Conversations', type: 'number' },
        { key: 'withinSla', header: 'Within SLA', type: 'number' },
        { key: 'slaComplianceRate', header: 'SLA Compliance (%)', type: 'number', numberFormat: '0.0' },
        { key: 'avgFirstResponseTimeSec', header: 'Avg First Response (sec)', type: 'number', numberFormat: '0.0' },
      ],
    }] });
  } catch (error) {
    console.error('Error exporting channel SLA:', error);
    return res.status(500).json({ success: false, error: String(error) });
  }
});

router.get('/export/volume-heatmap', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_REPORTS, PERMISSIONS.VIEW_AGENT_REPORTS]), requirePermission(PERMISSIONS.EXPORT_REPORTS), async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (companyId == null) return res.status(400).json({ success: false, error: 'Company ID required' });
    const format = requestedExportFormat(req);
    if (!format) return res.status(400).json({ success: false, error: 'Unsupported export format' });
    const { fromDate, toDate } = parseDateRange(req.query.from as string, req.query.to as string);
    const rows = await db.select({
      dayOfWeek: sql<number>`extract(dow from ${conversationMetrics.contactedAt})`,
      hourOfDay: sql<number>`extract(hour from ${conversationMetrics.contactedAt})`,
      conversationCount: count(),
    }).from(conversationMetrics).where(and(
      eq(conversationMetrics.companyId, companyId),
      gte(conversationMetrics.contactedAt, fromDate),
      lte(conversationMetrics.contactedAt, toDate),
    )).groupBy(sql`extract(dow from ${conversationMetrics.contactedAt})`, sql`extract(hour from ${conversationMetrics.contactedAt})`);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const records = rows.map((row) => ({ day: days[Number(row.dayOfWeek ?? 0)], hour: Number(row.hourOfDay ?? 0), conversations: Number(row.conversationCount ?? 0) }));
    return await sendTabularExport(res, { filename: `volume-heatmap-${Date.now()}`, format, sheets: [{
      name: 'Volume Heatmap', rows: records, columns: [
        { key: 'day', header: 'Day' },
        { key: 'hour', header: 'Hour (0-23)', type: 'number' },
        { key: 'conversations', header: 'Conversations', type: 'number' },
      ],
    }] });
  } catch (error) {
    console.error('Error exporting volume heatmap:', error);
    return res.status(500).json({ success: false, error: String(error) });
  }
});

router.get('/export/resolution', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_REPORTS, PERMISSIONS.VIEW_AGENT_REPORTS]), requirePermission(PERMISSIONS.EXPORT_REPORTS), async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (companyId == null) return res.status(400).json({ success: false, error: 'Company ID required' });
    const format = requestedExportFormat(req);
    if (!format) return res.status(400).json({ success: false, error: 'Unsupported export format' });
    const { fromDate, toDate } = parseDateRange(req.query.from as string, req.query.to as string);
    const [row] = await db.select({
      total: count(),
      resolved: sql<number>`count(*) filter (where ${conversationMetrics.resolvedAt} is not null)`,
      open: sql<number>`count(*) filter (where ${conversationMetrics.resolvedAt} is null)`,
      avgResolutionTimeSec: avg(conversationMetrics.resolutionTimeSec),
    }).from(conversationMetrics).where(and(
      eq(conversationMetrics.companyId, companyId),
      gte(conversationMetrics.contactedAt, fromDate),
      lte(conversationMetrics.contactedAt, toDate),
    ));
    const total = Number(row?.total ?? 0);
    const records = [{ total, resolved: Number(row?.resolved ?? 0), open: Number(row?.open ?? 0), resolutionRate: total ? (Number(row?.resolved ?? 0) / total) * 100 : 0, avgResolutionTimeSec: row?.avgResolutionTimeSec == null ? null : Number(row.avgResolutionTimeSec) }];
    return await sendTabularExport(res, { filename: `resolution-${Date.now()}`, format, sheets: [{
      name: 'Resolution', rows: records, columns: [
        { key: 'total', header: 'Total Conversations', type: 'number' },
        { key: 'resolved', header: 'Resolved', type: 'number' },
        { key: 'open', header: 'Open', type: 'number' },
        { key: 'resolutionRate', header: 'Resolution Rate (%)', type: 'number', numberFormat: '0.0' },
        { key: 'avgResolutionTimeSec', header: 'Avg Resolution Time (sec)', type: 'number', numberFormat: '0.0' },
      ],
    }] });
  } catch (error) {
    console.error('Error exporting resolution:', error);
    return res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * GET /export/bot-coverage
 */
router.get('/export/bot-coverage', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_REPORTS, PERMISSIONS.VIEW_AGENT_REPORTS]), requirePermission(PERMISSIONS.EXPORT_REPORTS), async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (companyId == null) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const { from, to } = req.query;
    const { fromDate, toDate } = parseDateRange(from as string, to as string);
    const { rows } = await queryBotCoverage(companyId, fromDate, toDate);
    const format = requestedExportFormat(req);
    if (!format) return res.status(400).json({ success: false, error: 'Unsupported export format' });
    const records = rows.map((row) => ({
      ...row,
      contactId: row.contactId ?? '',
      contactName: row.contactName ?? '',
      contactEmail: row.contactEmail ?? '',
      contactPhone: row.contactPhone ?? '',
      status: row.status ?? '',
      contactedAt: row.contactedAt ? new Date(row.contactedAt).toISOString() : '',
      assignedAgentName: row.assignedAgentName ?? '',
    }));
    return await sendTabularExport(res, {
      filename: `bot-coverage-${Date.now()}`,
      format,
      sheets: [{
        name: 'Unassisted People',
        columns: [
          { key: 'conversationId', header: 'Conversation ID', type: 'string' },
          { key: 'contactId', header: 'Contact ID', type: 'string' },
          { key: 'contactName', header: 'Contact Name', width: 24 },
          { key: 'contactEmail', header: 'Contact Email', width: 28 },
          { key: 'contactPhone', header: 'Contact Phone', width: 20 },
          { key: 'channelType', header: 'Channel' },
          { key: 'status', header: 'Status' },
          { key: 'contactedAt', header: 'Conversation Started At', type: 'date', width: 22, numberFormat: 'yyyy-mm-dd hh:mm' },
          { key: 'assignedAgentName', header: 'Assigned Agent', width: 24 },
          { key: 'unassistedConversationCount', header: 'Unassisted Conversations', type: 'number' },
          { key: 'inboundMessages', header: 'Inbound Messages', type: 'number' },
          { key: 'agentMessages', header: 'Agent Messages', type: 'number' },
          { key: 'botMessages', header: 'Bot Messages', type: 'number' },
        ],
        rows: records,
      }],
    });
  } catch (error) {
    console.error('Error exporting bot coverage:', error);
    return res.status(500).json({ success: false, error: String(error) });
  }
});

export default router;
