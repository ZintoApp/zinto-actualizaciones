import express from 'express';
import { storage } from '../storage';
import FollowUpScheduler from '../services/follow-up-scheduler';
import { ensureAuthenticated } from '../middleware';
import { smartWebSocketBroadcaster } from '../utils/smart-websocket-broadcaster';

const router = express.Router();
const followUpScheduler = FollowUpScheduler.getInstance();

/** API response types */
interface ActiveFollowUpResponse {
  id: number;
  scheduleId: string;
  conversationId: number;
  contactId: number;
  messageType: string;
  messageContent: string;
  scheduledFor: Date;
  status: string;
  cancelOnUserResponse: boolean;
  cancelCondition: 'any_message' | 'specific_topic' | 'none';
  monitoringStartedAt: Date | null;
  lastUserMessageAt: Date | null;
  isMonitored: boolean;
  willCancelOnResponse: boolean;
}

interface FollowUpStatsResponse {
  conversationId: number;
  summary: {
    totalScheduled: number;
    totalSent: number;
    totalCancelled: number;
    totalFailed: number;
    totalPending: number;
    totalOverdue: number;
  };
  cancellation: {
    totalWithCancellation: number;
    cancelledByUserResponse: number;
    cancelledManually: number;
    cancelledByCondition: number;
  };
  monitoring: {
    activelyMonitored: number;
    averageMonitoringDuration: number | null;
  };
  generatedAt: Date;
}

function parseConversationId(value: string): number | null {
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n <= 0) return null;
  return n;
}

function validateCancelBody(body: Record<string, unknown>): { reason?: string; metadata?: Record<string, unknown>; errors?: string[] } {
  const errors: string[] = [];
  let reason: string | undefined;
  let metadata: Record<string, unknown> | undefined;
  if (body.reason !== undefined) {
    if (typeof body.reason !== 'string') {
      errors.push('reason must be a string');
    } else if (body.reason.length > 500) {
      errors.push('reason must be at most 500 characters');
    } else {
      reason = body.reason;
    }
  }
  if (body.metadata !== undefined) {
    if (typeof body.metadata !== 'object' || body.metadata === null || Array.isArray(body.metadata)) {
      errors.push('metadata must be a valid JSON object');
    } else {
      metadata = body.metadata as Record<string, unknown>;
    }
  }
  if (errors.length) return { errors };
  return { reason, metadata };
}

/**
 * Get scheduler status
 */
router.get('/scheduler/status', ensureAuthenticated, async (req, res) => {
  try {
    const status = followUpScheduler.getStatus();
    res.json(status);
  } catch (error) {
    console.error('Error getting scheduler status:', error);
    res.status(500).json({ error: 'Failed to get scheduler status' });
  }
});

/**
 * Get follow-up templates for a company
 */
router.get('/templates/company/:companyId', ensureAuthenticated, async (req, res) => {
  try {
    const { companyId } = req.params;
    const templates = await storage.getFollowUpTemplatesByCompany(parseInt(companyId));
    res.json(templates);
  } catch (error) {
    console.error('Error getting follow-up templates:', error);
    res.status(500).json({ error: 'Failed to get follow-up templates' });
  }
});

/**
 * Create a follow-up template
 */
router.post('/templates', ensureAuthenticated, async (req, res) => {
  try {
    const templateData = req.body;

    const requiredFields = ['name', 'companyId', 'messageType', 'messageContent'];
    for (const field of requiredFields) {
      if (!templateData[field]) {
        return res.status(400).json({ error: `Missing required field: ${field}` });
      }
    }

    const template = {
      name: templateData.name,
      description: templateData.description || null,
      companyId: templateData.companyId,
      messageType: templateData.messageType,
      messageContent: templateData.messageContent,
      mediaUrl: templateData.mediaUrl || null,
      caption: templateData.caption || null,
      defaultDelayAmount: templateData.defaultDelayAmount || 24,
      defaultDelayUnit: templateData.defaultDelayUnit || 'hours',
      variables: templateData.variables || {},
      isActive: templateData.isActive !== false
    };

    const result = await storage.createFollowUpTemplate(template);
    res.status(201).json(result);
  } catch (error) {
    console.error('Error creating follow-up template:', error);
    res.status(500).json({ error: 'Failed to create follow-up template' });
  }
});

/**
 * Update a follow-up template
 */
router.put('/templates/:id', ensureAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    delete updates.id;
    delete updates.createdAt;

    const result = await storage.updateFollowUpTemplate(parseInt(id), updates);

    if (!result || result.length === 0) {
      return res.status(404).json({ error: 'Follow-up template not found' });
    }

    res.json(result[0]);
  } catch (error) {
    console.error('Error updating follow-up template:', error);
    res.status(500).json({ error: 'Failed to update follow-up template' });
  }
});

/**
 * Delete a follow-up template
 */
router.delete('/templates/:id', ensureAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;

    const success = await storage.deleteFollowUpTemplate(parseInt(id));

    if (!success) {
      return res.status(404).json({ error: 'Follow-up template not found' });
    }

    res.json({ message: 'Follow-up template deleted successfully' });
  } catch (error) {
    console.error('Error deleting follow-up template:', error);
    res.status(500).json({ error: 'Failed to delete follow-up template' });
  }
});

/**
 * Get active follow-ups for a conversation (scheduled, future, with cancellation metadata)
 */
router.get('/active/:conversationId', ensureAuthenticated, async (req, res) => {
  const { conversationId: rawId } = req.params;
  const conversationId = parseConversationId(rawId);
  if (conversationId === null) {
    return res.status(400).json({ error: 'conversationId must be a valid positive integer' });
  }
  try {
    const conversation = await storage.getConversation(conversationId);
    if (conversation && req.user && (req.user as { companyId?: number }).companyId != null) {
      const userCompanyId = (req.user as { companyId?: number }).companyId;
      if (conversation.companyId !== userCompanyId) {
        return res.status(403).json({ error: 'Access denied to this conversation' });
      }
    }
    const rows = await storage.getActiveFollowUpsByConversation(conversationId, false);
    const now = new Date();
    const active: ActiveFollowUpResponse[] = (rows as Record<string, unknown>[])
      .filter((s) => s.status === 'scheduled' && s.scheduledFor && new Date(s.scheduledFor as string) > now)
      .map((s) => {
        const cancelOnUserResponse = Boolean(s.cancelOnUserResponse);
        const cancelCondition = (s.cancelCondition as 'any_message' | 'specific_topic' | 'none') || 'none';
        return {
          id: s.id as number,
          scheduleId: s.scheduleId as string,
          conversationId: s.conversationId as number,
          contactId: s.contactId as number,
          messageType: s.messageType as string,
          messageContent: s.messageContent as string,
          scheduledFor: s.scheduledFor as Date,
          status: s.status as string,
          cancelOnUserResponse,
          cancelCondition,
          monitoringStartedAt: (s.monitoringStartedAt as Date | null) ?? null,
          lastUserMessageAt: (s.lastUserMessageAt as Date | null) ?? null,
          isMonitored: cancelOnUserResponse,
          willCancelOnResponse: cancelOnUserResponse && cancelCondition !== 'none'
        };
      });
    return res.status(200).json(active);
  } catch (error) {
    console.error('GET /active/:conversationId failed', { conversationId, error });
    res.status(500).json({ error: 'Failed to get active follow-ups' });
  }
});

/**
 * Get follow-up statistics for a conversation
 */
router.get('/stats/:conversationId', ensureAuthenticated, async (req, res) => {
  const { conversationId: rawId } = req.params;
  const conversationId = parseConversationId(rawId);
  if (conversationId === null) {
    return res.status(400).json({ error: 'conversationId must be a valid positive integer' });
  }
  try {
    const conversation = await storage.getConversation(conversationId);
    if (conversation && req.user && (req.user as { companyId?: number }).companyId != null) {
      const userCompanyId = (req.user as { companyId?: number }).companyId;
      if (conversation.companyId !== userCompanyId) {
        return res.status(403).json({ error: 'Access denied to this conversation' });
      }
    }
    const schedules = (await storage.getFollowUpSchedulesByConversation(conversationId)) as Record<string, unknown>[];
    const now = new Date();

    const totalScheduled = schedules.filter((s) => s.status === 'scheduled').length;
    const totalSent = schedules.filter((s) => s.status === 'sent').length;
    const totalCancelled = schedules.filter((s) => s.status === 'cancelled').length;
    const totalFailed = schedules.filter((s) => s.status === 'failed').length;
    const totalPending = schedules.filter(
      (s) => s.status === 'scheduled' && s.scheduledFor && new Date(s.scheduledFor as string) > now
    ).length;
    const totalOverdue = schedules.filter(
      (s) => s.status === 'scheduled' && s.scheduledFor && new Date(s.scheduledFor as string) <= now
    ).length;

    const totalWithCancellation = schedules.filter((s) => s.cancelOnUserResponse === true).length;
    const cancelledByUserResponse = schedules.filter(
      (s) =>
        s.status === 'cancelled' &&
        (s.cancelCondition === 'any_message' || s.cancelCondition === 'specific_topic')
    ).length;

    let cancelledByCondition = 0;
    let cancelledManuallyFromLogs = 0;
    const cancelledSchedules = schedules.filter((s) => s.status === 'cancelled');
    for (const s of cancelledSchedules) {
      const logs = (await storage.getFollowUpExecutionLogs(s.scheduleId as string)) as Record<string, unknown>[];
      let hasByCondition = false;
      let hasManual = false;
      for (const log of logs) {
        const msg = (log.errorMessage as string) || '';
        if (msg.includes('Cancelled by condition')) hasByCondition = true;
        if (msg.includes('Manual cancellation')) hasManual = true;
      }
      if (hasByCondition) cancelledByCondition += 1;
      if (hasManual) cancelledManuallyFromLogs += 1;
    }

    const activelyMonitored = schedules.filter(
      (s) =>
        s.cancelOnUserResponse === true &&
        s.status === 'scheduled' &&
        s.monitoringStartedAt != null
    ).length;

    let totalDurationMs = 0;
    let monitoredWithDuration = 0;
    for (const s of schedules) {
      if (
        s.cancelOnUserResponse === true &&
        s.monitoringStartedAt != null &&
        s.lastUserMessageAt != null
      ) {
        const start = new Date(s.monitoringStartedAt as string).getTime();
        const end = new Date(s.lastUserMessageAt as string).getTime();
        if (end >= start) {
          totalDurationMs += end - start;
          monitoredWithDuration += 1;
        }
      }
    }
    const averageMonitoringDuration =
      monitoredWithDuration > 0 ? Math.round(totalDurationMs / monitoredWithDuration) : null;

    const stats: FollowUpStatsResponse = {
      conversationId,
      summary: {
        totalScheduled,
        totalSent,
        totalCancelled,
        totalFailed,
        totalPending,
        totalOverdue
      },
      cancellation: {
        totalWithCancellation,
        cancelledByUserResponse,
        cancelledManually: cancelledManuallyFromLogs,
        cancelledByCondition
      },
      monitoring: {
        activelyMonitored,
        averageMonitoringDuration
      },
      generatedAt: new Date()
    };
    return res.status(200).json(stats);
  } catch (error) {
    console.error('GET /stats/:conversationId failed', { conversationId, error });
    res.status(500).json({ error: 'Failed to get follow-up statistics' });
  }
});

/**
 * Get follow-up schedules for a conversation
 */
router.get('/conversation/:conversationId', ensureAuthenticated, async (req, res) => {
  const { conversationId: rawId } = req.params;
  const conversationId = parseConversationId(rawId);
  if (conversationId === null) {
    return res.status(400).json({ error: 'conversationId must be a valid positive integer' });
  }
  try {
    const schedules = await storage.getFollowUpSchedulesByConversation(conversationId);
    res.json(schedules);
  } catch (error) {
    console.error('Error getting follow-up schedules:', { conversationId, error });
    res.status(500).json({ error: 'Failed to get follow-up schedules' });
  }
});

/**
 * Get follow-up schedules for a contact
 */
router.get('/contact/:contactId', ensureAuthenticated, async (req, res) => {
  try {
    const { contactId } = req.params;
    const schedules = await storage.getFollowUpSchedulesByContact(parseInt(contactId));
    res.json(schedules);
  } catch (error) {
    console.error('Error getting follow-up schedules:', error);
    res.status(500).json({ error: 'Failed to get follow-up schedules' });
  }
});

/**
 * Manually cancel a follow-up with reason and execution log
 */
router.post('/:scheduleId/cancel', ensureAuthenticated, async (req, res) => {
  const { scheduleId } = req.params;
  if (!scheduleId || typeof scheduleId !== 'string' || scheduleId.trim() === '') {
    return res.status(400).json({ error: 'scheduleId must be a non-empty string' });
  }
  const validation = validateCancelBody(req.body || {});
  if (validation.errors && validation.errors.length > 0) {
    return res.status(400).json({ error: 'Validation failed', details: validation.errors });
  }
  const { reason, metadata } = validation;
  try {
    const schedule = await storage.getFollowUpSchedule(scheduleId);
    if (!schedule) {
      return res.status(404).json({ error: 'Follow-up schedule not found' });
    }
    const s = schedule as Record<string, unknown>;
    if (s.status === 'cancelled') {
      return res.status(400).json({ error: 'Follow-up already cancelled' });
    }
    if (s.status !== 'scheduled' && s.status !== 'processing') {
      return res.status(400).json({ error: 'Follow-up can no longer be cancelled' });
    }
    const conversationId = s.conversationId as number;
    const conversation = await storage.getConversation(conversationId);
    if (!conversation || (req.user && (req.user as { companyId?: number }).companyId != null && conversation.companyId !== (req.user as { companyId?: number }).companyId)) {
      return res.status(403).json({ error: 'Access denied to this conversation' });
    }
    const success = await followUpScheduler.cancelFollowUp(scheduleId, { skipBroadcast: true });
    if (!success) {
      return res.status(500).json({ error: 'Failed to cancel follow-up' });
    }
    await storage.createFollowUpExecutionLog({
      scheduleId,
      executionAttempt: 1,
      status: 'failed',
      errorMessage: `Manual cancellation: ${reason || 'No reason provided'}`,
      executedAt: new Date(),
      ...(metadata && Object.keys(metadata).length > 0 ? { responseContent: JSON.stringify(metadata) } : {})
    });
    const userId = (req.user as { id?: number })?.id;
    followUpScheduler.emit('followUpManuallyCancelled', { scheduleId, reason: reason || undefined, userId });
    smartWebSocketBroadcaster.broadcast({
      type: 'followUpManuallyCancelled',
      data: { scheduleId, conversationId, reason: reason || undefined, userId },
      conversationId,
      companyId: conversation.companyId ?? undefined,
    });
    return res.status(200).json({
      message: 'Follow-up cancelled successfully',
      scheduleId,
      cancelledAt: new Date(),
      reason: reason || undefined
    });
  } catch (error) {
    console.error('POST /:scheduleId/cancel failed', { scheduleId, error });
    res.status(500).json({ error: 'Failed to cancel follow-up' });
  }
});

/**
 * Get execution logs for a follow-up schedule
 */
router.get('/:scheduleId/logs', ensureAuthenticated, async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const logs = await storage.getFollowUpExecutionLogs(scheduleId);
    res.json(logs);
  } catch (error) {
    console.error('Error getting follow-up execution logs:', error);
    res.status(500).json({ error: 'Failed to get execution logs' });
  }
});

/**
 * Get a specific follow-up schedule
 */
router.get('/:scheduleId', ensureAuthenticated, async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const schedule = await storage.getFollowUpSchedule(scheduleId);

    if (!schedule) {
      return res.status(404).json({ error: 'Follow-up schedule not found' });
    }

    res.json(schedule);
  } catch (error) {
    console.error('Error getting follow-up schedule:', error);
    res.status(500).json({ error: 'Failed to get follow-up schedule' });
  }
});

/**
 * Update a follow-up schedule
 */
router.put('/:scheduleId', ensureAuthenticated, async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const updates = req.body;

    delete updates.id;
    delete updates.scheduleId;
    delete updates.createdAt;

    const result = await storage.updateFollowUpSchedule(scheduleId, updates);

    if (!result || result.length === 0) {
      return res.status(404).json({ error: 'Follow-up schedule not found' });
    }

    res.json(result[0]);
  } catch (error) {
    console.error('Error updating follow-up schedule:', error);
    res.status(500).json({ error: 'Failed to update follow-up schedule' });
  }
});

/**
 * Cancel a follow-up schedule (DELETE)
 */
router.delete('/:scheduleId', ensureAuthenticated, async (req, res) => {
  try {
    const { scheduleId } = req.params;

    const success = await followUpScheduler.cancelFollowUp(scheduleId);

    if (!success) {
      return res.status(404).json({ error: 'Follow-up schedule not found' });
    }

    res.json({ message: 'Follow-up schedule cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling follow-up schedule:', error);
    res.status(500).json({ error: 'Failed to cancel follow-up schedule' });
  }
});

/**
 * Create a new follow-up schedule
 */
router.post('/', ensureAuthenticated, async (req, res) => {
  try {
    const scheduleData = req.body;

    const requiredFields = ['conversationId', 'contactId', 'messageType', 'messageContent', 'scheduledFor'];
    for (const field of requiredFields) {
      if (!scheduleData[field]) {
        return res.status(400).json({ error: `Missing required field: ${field}` });
      }
    }

    const scheduleId = `followup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const followUpSchedule = {
      scheduleId,
      sessionId: scheduleData.sessionId || null,
      flowId: scheduleData.flowId || 0,
      conversationId: scheduleData.conversationId,
      contactId: scheduleData.contactId,
      companyId: scheduleData.companyId || 0,
      nodeId: scheduleData.nodeId || 'manual',
      messageType: scheduleData.messageType,
      messageContent: scheduleData.messageContent,
      mediaUrl: scheduleData.mediaUrl || null,
      caption: scheduleData.caption || null,
      templateId: scheduleData.templateId || null,
      triggerEvent: scheduleData.triggerEvent || 'manual',
      triggerNodeId: scheduleData.triggerNodeId || null,
      delayAmount: scheduleData.delayAmount || null,
      delayUnit: scheduleData.delayUnit || null,
      scheduledFor: new Date(scheduleData.scheduledFor),
      specificDatetime: scheduleData.specificDatetime ? new Date(scheduleData.specificDatetime) : null,
      status: 'scheduled' as const,
      maxRetries: scheduleData.maxRetries || 3,
      channelType: scheduleData.channelType || 'whatsapp',
      channelConnectionId: scheduleData.channelConnectionId || null,
      variables: scheduleData.variables || {},
      executionContext: scheduleData.executionContext || {},
      expiresAt: scheduleData.expiresAt ? new Date(scheduleData.expiresAt) : new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)) // 30 days default
    };

    const result = await storage.createFollowUpSchedule(followUpSchedule);
    res.status(201).json(result);
  } catch (error) {
    console.error('Error creating follow-up schedule:', error);
    res.status(500).json({ error: 'Failed to create follow-up schedule' });
  }
});

export default router;
