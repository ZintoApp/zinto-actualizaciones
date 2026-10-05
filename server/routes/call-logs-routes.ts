/**
 * Call Logs API Routes
 * Handles HTTP endpoints for call logs management
 */

import { Router } from 'express';
import { callLogsService } from '../services/call-logs-service';
import { fetchLatestTwilioRecordingForCall } from '../services/call-agent-service';
import { requirePermission, requireAnyPermission, ensureAuthenticated } from '../middleware';
import { PERMISSIONS } from '@shared/schema';
import { parseExportFormat, sendTabularExport } from '../utils/tabular-export';
import axios from 'axios';
import { storage } from '../storage';
import { db } from '../db';
import { calls } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import path from 'path';

const router = Router();

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

function recordingDownloadExtension(contentType: string | undefined, recordingUrl: string): string {
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('wav')) return 'wav';
  if (ct.includes('mpeg') || ct.includes('mp3')) return 'mp3';
  if (ct.includes('ogg')) return 'ogg';
  if (ct.includes('mp4') || ct.includes('audio/mp4')) return 'm4a';
  const m = recordingUrl.match(/\.([a-z0-9]+)(?:\?|#|$)/i);
  if (m && ['mp3', 'wav', 'ogg', 'm4a'].includes(m[1].toLowerCase())) {
    return m[1].toLowerCase();
  }
  return 'audio';
}

/**
 * GET /api/call-logs
 * List call logs with filters and pagination
 */
router.get('/', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_CALL_LOGS, PERMISSIONS.MANAGE_CALL_LOGS]), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const filters = {
      status: req.query.status as string,
      direction: req.query.direction as 'inbound' | 'outbound',
      contactId: req.query.contactId ? parseInt(req.query.contactId as string) : undefined,
      flowId: req.query.flowId ? parseInt(req.query.flowId as string) : undefined,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      search: req.query.search as string,
      phoneNumber: req.query.phoneNumber as string,
      callType: req.query.callType as 'direct' | 'ai-powered'
    };

    const pagination = {
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50
    };

    const result = await callLogsService.getCallLogs(
      companyId,
      filters,
      pagination,
      req.user?.id,
      req.user?.role ?? undefined
    );

    res.json({
      success: true,
      data: result.calls,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages
      }
    });
  } catch (error) {
    console.error('Error fetching call logs:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

/**
 * GET /api/call-logs/stats
 * Get call log statistics
 */
router.get('/stats', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_CALL_LOGS, PERMISSIONS.MANAGE_CALL_LOGS]), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const dateRange = {
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string
    };

    const stats = await callLogsService.getCallLogStats(companyId, dateRange);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error fetching call log stats:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

/**
 * GET /api/call-logs/ai-metrics
 * Get AI-specific call metrics
 */
router.get('/ai-metrics', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_CALL_LOGS, PERMISSIONS.MANAGE_CALL_LOGS]), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const dateRange = {
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string
    };

    const metrics = await callLogsService.getAICallMetrics(companyId, dateRange);
    res.json({ success: true, data: metrics });
  } catch (error) {
    console.error('Error fetching AI metrics:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

/**
 * GET /api/call-logs/ai-performance
 * Get detailed AI performance analytics
 */
router.get('/ai-performance', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_CALL_LOGS, PERMISSIONS.MANAGE_CALL_LOGS]), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const filters = {
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string
    };

    const analytics = await callLogsService.getAIPerformanceAnalytics(companyId, filters);
    res.json({ success: true, data: analytics });
  } catch (error) {
    console.error('Error fetching AI performance analytics:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

/**
 * GET /api/call-logs/:id/elevenlabs-analysis
 * Get ElevenLabs post-call analysis (transcription, summary, evaluation, audio) for an AI-powered call
 */
router.get('/:id/elevenlabs-analysis', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_CALL_LOGS, PERMISSIONS.MANAGE_CALL_LOGS]), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const callId = parseInt(req.params.id);
    if (isNaN(callId)) {
      return res.status(400).json({ success: false, error: 'Invalid call ID' });
    }

    const call = await callLogsService.getCallLogById(companyId, callId);
    if (!call) {
      return res.status(404).json({ success: false, error: 'Call not found' });
    }

    const analysis = await callLogsService.getElevenlabsAnalysisForCall(companyId, callId);
    res.json({ success: true, data: analysis });
  } catch (error) {
    console.error('Error fetching ElevenLabs analysis:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

/**
 * GET /api/call-logs/:id
 * Get single call log details
 */
router.get('/:id', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_CALL_LOGS, PERMISSIONS.MANAGE_CALL_LOGS]), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const callId = parseInt(req.params.id);
    if (isNaN(callId)) {
      return res.status(400).json({ success: false, error: 'Invalid call ID' });
    }

    let call = await callLogsService.getCallLogById(companyId, callId);
    if (!call) {
      return res.status(404).json({ success: false, error: 'Call not found' });
    }

    // If the call status is non-terminal and we have a Twilio call SID, poll Twilio
    // for the real status. This handles cases where status callback webhooks can't
    // reach the server (e.g. tunnel auth, firewall, etc.).
    const nonTerminalStatuses = ['initiated', 'queued', 'ringing', 'in-progress'];
    if (call.twilioCallSid && nonTerminalStatuses.includes(call.status)) {
      try {
        const channelConnection = call.channelId
          ? await storage.getChannelConnection(call.channelId)
          : null;
        const connData = channelConnection?.connectionData as any;
        const accountSid = connData?.accountSid;
        const authToken = connData?.authToken;
        if (accountSid && authToken) {
          const twilioRes = await axios.get(
            `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${call.twilioCallSid}.json`,
            {
              auth: { username: accountSid, password: authToken },
              timeout: 3000
            }
          );
          const twilioStatus = twilioRes.data?.status;
          if (twilioStatus && twilioStatus !== call.status) {
            const updateData: any = { twilioCallSid: call.twilioCallSid, status: twilioStatus };
            if (twilioStatus === 'in-progress' && !call.startedAt) {
              updateData.startedAt = new Date();
            }
            if (['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(twilioStatus)) {
              updateData.endedAt = new Date();
              if (twilioRes.data?.duration) {
                updateData.durationSec = parseInt(twilioRes.data.duration);
              }
            }
            call = (await callLogsService.upsertCallLog(updateData)).call;
          }
        }
      } catch (err) {
        // Non-critical: polling is a fallback, don't fail the request
        console.warn('[CallLogs] Twilio status poll failed:', (err as any).message);
      }
    }

    // Concrete Twilio recording when status callback / recording webhook missed or lagged
    const terminalOk = ['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(call.status);
    if (
      call.twilioCallSid &&
      terminalOk &&
      !call.recordingUrl &&
      call.recordingExpectedFrom !== 'elevenlabs' &&
      call.recordingRequested !== false
    ) {
      try {
        const channelConnection = call.channelId
          ? await storage.getChannelConnection(call.channelId)
          : null;
        const connData = channelConnection?.connectionData as any;
        const accountSid = connData?.accountSid;
        const authToken = connData?.authToken;
        if (accountSid && authToken) {
          const rec = await fetchLatestTwilioRecordingForCall(call.twilioCallSid, accountSid, authToken);
          if (rec?.recordingUrl) {
            call = (
              await callLogsService.upsertCallLog({
                twilioCallSid: call.twilioCallSid,
                recordingUrl: rec.recordingUrl,
                recordingSid: rec.recordingSid
              })
            ).call;
          }
        }
      } catch (recErr) {
        console.warn('[CallLogs] Twilio recording fetch failed:', (recErr as any).message);
      }
    }

    res.json({ success: true, data: call });
  } catch (error) {
    console.error('Error fetching call log:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

/**
 * PUT /api/call-logs/:id
 * Update call log (notes, starred status)
 */
router.put('/:id', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_CALL_LOGS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const callId = parseInt(req.params.id);
    if (isNaN(callId)) {
      return res.status(400).json({ success: false, error: 'Invalid call ID' });
    }

    const updates: { notes?: string; isStarred?: boolean } = {};
    if (req.body.notes !== undefined) {
      updates.notes = req.body.notes;
    }
    if (req.body.isStarred !== undefined) {
      updates.isStarred = req.body.isStarred;
    }

    const updatedCall = await callLogsService.updateCallLog(companyId, callId, updates);
    if (!updatedCall) {
      return res.status(404).json({ success: false, error: 'Call not found' });
    }

    res.json({ success: true, data: updatedCall });
  } catch (error) {
    console.error('Error updating call log:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

/**
 * DELETE /api/call-logs/:id
 * Delete call log
 */
router.delete('/:id', ensureAuthenticated, requirePermission(PERMISSIONS.DELETE_CALL_LOGS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const callId = parseInt(req.params.id);
    if (isNaN(callId)) {
      return res.status(400).json({ success: false, error: 'Invalid call ID' });
    }

    const deleted = await callLogsService.deleteCallLog(companyId, callId);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Call not found' });
    }

    res.json({ success: true, message: 'Call log deleted successfully' });
  } catch (error) {
    console.error('Error deleting call log:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

/**
 * POST /api/call-logs/bulk-delete
 * Bulk delete call logs by IDs
 */
router.post('/bulk-delete', ensureAuthenticated, requirePermission(PERMISSIONS.DELETE_CALL_LOGS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const { callIds } = req.body;
    if (!Array.isArray(callIds) || callIds.length === 0) {
      return res.status(400).json({ success: false, error: 'callIds array is required' });
    }

    const validCallIds = callIds
      .map(id => parseInt(String(id)))
      .filter(id => !isNaN(id));

    if (validCallIds.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid call IDs provided' });
    }

    const deletedCount = await callLogsService.deleteCallLogs(companyId, validCallIds);
    res.json({ success: true, deletedCount, message: `${deletedCount} call log(s) deleted successfully` });
  } catch (error) {
    console.error('Error bulk deleting call logs:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

/**
 * POST /api/call-logs/clear
 * Clear all call logs for the company (optionally with filters)
 */
router.post('/clear', ensureAuthenticated, requirePermission(PERMISSIONS.DELETE_CALL_LOGS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const filters = {
      status: req.body.status as string,
      direction: req.body.direction as 'inbound' | 'outbound',
      startDate: req.body.startDate as string,
      endDate: req.body.endDate as string
    };

    const deletedCount = await callLogsService.clearCallLogs(companyId, filters);
    res.json({ success: true, deletedCount, message: `${deletedCount} call log(s) cleared successfully` });
  } catch (error) {
    console.error('Error clearing call logs:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

/**
 * POST /api/call-logs/:id/re-initiate
 * Re-initiate call to same number
 */
router.post('/:id/re-initiate', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_CALL_LOGS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const callId = parseInt(req.params.id);
    if (isNaN(callId)) {
      return res.status(400).json({ success: false, error: 'Invalid call ID' });
    }

    // Get original call
    const originalCall = await callLogsService.getCallLogById(companyId, callId);
    if (!originalCall) {
      return res.status(404).json({ success: false, error: 'Call not found' });
    }

    // Use stored agent config or require new config
    const agentConfig = originalCall.agentConfig || req.body.agentConfig;
    if (!agentConfig) {
      return res.status(400).json({ success: false, error: 'Agent configuration required' });
    }

    // Import call agent service
    const callAgentService = await import('../services/call-agent-service');
    const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 
                          process.env.PUBLIC_URL?.replace(/^https?:\/\//, '') ||
                          'localhost:3000';

    // Initiate new call
    const callResult = await callAgentService.initiateOutboundCall(
      {
        ...agentConfig,
        toNumber: originalCall.to || originalCall.from || '',
        executionMode: 'async'
      },
      webhookBaseUrl
    );

    res.json({ success: true, data: callResult });
  } catch (error) {
    console.error('Error re-initiating call:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

/**
 * GET /api/call-logs/export
 * Export call logs to CSV/Excel
 */
router.get('/export', ensureAuthenticated, requirePermission(PERMISSIONS.EXPORT_CALL_LOGS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const format = parseExportFormat(req.query.format);
    if (!format) return res.status(400).json({ success: false, error: 'Unsupported export format' });
    const filters = {
      status: req.query.status as string,
      direction: req.query.direction as 'inbound' | 'outbound',
      contactId: req.query.contactId ? parseInt(req.query.contactId as string) : undefined,
      flowId: req.query.flowId ? parseInt(req.query.flowId as string) : undefined,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      search: req.query.search as string
    };

    // Get all calls (no pagination for export)
    const result = await callLogsService.getCallLogs(companyId, filters, { page: 1, limit: 10000 }, req.user?.id, req.user?.role ?? undefined);

    const records = result.calls.map(call => ({
        id: call.id,
        status: call.status,
        direction: call.direction,
        from: call.from,
        to: call.to,
        durationSec: call.durationSec,
        startedAt: call.startedAt ? new Date(call.startedAt).toISOString() : '',
        endedAt: call.endedAt ? new Date(call.endedAt).toISOString() : '',
        contact: call.contact?.name || '',
        flow: call.flow?.name || '',
        cost: call.cost || 0,
        currency: call.costCurrency || 'USD',
        notes: call.notes || ''
      }));
    return await sendTabularExport(res, { filename: `call-logs-${Date.now()}`, format, sheets: [{
      name: 'Call Logs', rows: records, columns: [
        { key: 'id', header: 'Call ID', type: 'string' },
        { key: 'status', header: 'Status' },
        { key: 'direction', header: 'Direction' },
        { key: 'from', header: 'From', type: 'string', width: 20 },
        { key: 'to', header: 'To', type: 'string', width: 20 },
        { key: 'durationSec', header: 'Duration (sec)', type: 'number' },
        { key: 'startedAt', header: 'Started At', type: 'date', width: 22, numberFormat: 'yyyy-mm-dd hh:mm' },
        { key: 'endedAt', header: 'Ended At', type: 'date', width: 22, numberFormat: 'yyyy-mm-dd hh:mm' },
        { key: 'contact', header: 'Contact', width: 24 },
        { key: 'flow', header: 'Flow', width: 24 },
        { key: 'cost', header: 'Cost', type: 'currency', numberFormat: '#,##0.00' },
        { key: 'currency', header: 'Currency' },
        { key: 'notes', header: 'Notes', width: 36 },
      ],
    }] });
  } catch (error) {
    console.error('Error exporting call logs:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

/**
 * GET /api/call-logs/:id/recording
 * Proxy recording download from Twilio
 */
router.get('/:id/recording', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_CALL_LOGS, PERMISSIONS.MANAGE_CALL_LOGS]), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const callId = parseInt(req.params.id);
    if (isNaN(callId)) {
      return res.status(400).json({ success: false, error: 'Invalid call ID' });
    }

    const call = await callLogsService.getCallLogById(companyId, callId);
    if (!call) {
      return res.status(404).json({ success: false, error: 'Call not found' });
    }

    if (!call.recordingUrl) {
      return res.status(404).json({ success: false, error: 'Recording not available' });
    }

    if (call.provider === 'whatsapp' && call.recordingUrl.startsWith('/uploads/call-recordings/')) {
      const relative = call.recordingUrl.slice('/uploads/'.length);
      const absolute = path.resolve('uploads', relative);
      const allowedRoot = path.resolve('uploads', 'call-recordings', String(companyId));
      if (!absolute.startsWith(`${allowedRoot}${path.sep}`)) return res.status(403).json({ success: false, error: 'Recording path is outside this company.' });
      return res.download(absolute, `call-${callId}-recording${path.extname(absolute)}`);
    }

    // Resolve Twilio credentials from the call's channel connection
    let accountSid: string | undefined;
    let authToken: string | undefined;

    if (call.channelId && call.channel) {
      // Get channel connection to retrieve Twilio credentials
      const connection = await storage.getChannelConnection(call.channelId);
      if (connection && connection.connectionData) {
        const connectionData = connection.connectionData as any;
        accountSid = connectionData.accountSid;
        authToken = connectionData.authToken;
      }
    }

    // No fallback to .env - return error if credentials not available
    if (!accountSid || !authToken) {
      console.error(`[Call Recording] Twilio credentials not available for call ${callId}, channelId: ${call.channelId}`);
      return res.status(500).json({ 
        success: false, 
        error: 'Twilio credentials not available for this call\'s channel connection.' 
      });
    }

    // Fetch recording from Twilio (or other URL on the log) using per-tenant credentials
    const response = await axios.get(call.recordingUrl, {
      responseType: 'stream',
      auth: {
        username: accountSid,
        password: authToken
      }
    });

    const upstreamType = response.headers['content-type'];
    const contentType =
      typeof upstreamType === 'string' && upstreamType.length > 0 ? upstreamType : 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    const ext = recordingDownloadExtension(contentType, call.recordingUrl);
    res.setHeader('Content-Disposition', `attachment; filename="call-${callId}-recording.${ext}"`);
    response.data.pipe(res);
  } catch (error) {
    console.error('Error fetching recording:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

/**
 * DELETE /api/call-logs/:id/hangup
 * Hang up an active call
 */
router.delete('/:id/hangup', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_CALL_LOGS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const callId = parseInt(req.params.id);
    if (isNaN(callId)) {
      return res.status(400).json({ success: false, error: 'Invalid call ID' });
    }

    // Get call log
    const call = await callLogsService.getCallLogById(companyId, callId);
    if (!call) {
      return res.status(404).json({ success: false, error: 'Call not found' });
    }

    // Check if call is still active (allow all non-terminal states)
    if (!['queued', 'initiated', 'ringing', 'in-progress'].includes(call.status)) {
      return res.status(400).json({ success: false, error: 'Call cannot be terminated - it is already in a terminal state' });
    }

    // Get Twilio credentials from channel connection
    let accountSid: string | undefined;
    let authToken: string | undefined;

    if (call.channelId && call.channel) {
      const connection = await storage.getChannelConnection(call.channelId);
      if (connection && connection.connectionData) {
        const connectionData = connection.connectionData as any;
        accountSid = connectionData.accountSid;
        authToken = connectionData.authToken;
      }
    }

    // Determine the correct Twilio Call SID
    const twilioCallSid = call.twilioCallSid || call.callSid;
    
    // No fallback to .env - return error if credentials not available
    if (!accountSid || !authToken) {
      console.error(`[Call Hangup] Twilio credentials not available for call ${callId}, channelId: ${call.channelId}`);
      return res.status(500).json({ 
        success: false, 
        error: 'Twilio credentials not available for this call\'s channel connection.' 
      });
    }
    
    if (!twilioCallSid) {
      return res.status(500).json({ success: false, error: 'Twilio call SID not available' });
    }

    // Call Twilio API to terminate the call
    try {
      const response = await axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${twilioCallSid}.json`,
        'Status=completed',
        {
          auth: {
            username: accountSid,
            password: authToken
          },
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      // Update call log status to completed
      await db
        .update(calls)
        .set({ 
          status: 'completed',
          endedAt: new Date(),
          updatedAt: new Date()
        })
        .where(and(eq(calls.id, callId), eq(calls.companyId, companyId)));

      // Broadcast call completed event
      const { CallLogsEventEmitter } = await import('../utils/websocket');
      CallLogsEventEmitter.emitCallCompleted(callId, companyId, {
        callSid: twilioCallSid,
        status: 'completed',
        endedAt: new Date()
      });

      res.json({ success: true, message: 'Call terminated successfully' });
    } catch (twilioError: any) {
      console.error('Twilio API error:', twilioError.response?.data || twilioError.message);
      
      // If call is already completed in Twilio, update our records
      if (twilioError.response?.status === 404) {
        await db
          .update(calls)
          .set({ 
            status: 'completed',
            updatedAt: new Date()
          })
          .where(and(eq(calls.id, callId), eq(calls.companyId, companyId)));
        res.json({ success: true, message: 'Call was already completed' });
      } else {
        res.status(500).json({ success: false, error: 'Failed to terminate call' });
      }
    }
  } catch (error) {
    console.error('Error hanging up call:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

/**
 * POST /api/call-logs/:id/link-contact
 * Link call to contact
 */
router.post('/:id/link-contact', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_CALL_LOGS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const callId = parseInt(req.params.id);
    if (isNaN(callId)) {
      return res.status(400).json({ success: false, error: 'Invalid call ID' });
    }

    const { contactId } = req.body;
    if (!contactId) {
      return res.status(400).json({ success: false, error: 'Contact ID required' });
    }

    const updatedCall = await callLogsService.linkCallToContact(companyId, callId, contactId);
    if (!updatedCall) {
      return res.status(404).json({ success: false, error: 'Call not found' });
    }

    res.json({ success: true, data: updatedCall });
  } catch (error) {
    console.error('Error linking call to contact:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

export default router;
