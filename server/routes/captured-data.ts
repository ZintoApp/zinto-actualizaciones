import { Router } from 'express';
import { storage } from '../storage';
import { ensureAuthenticated, requireAnyPermission } from '../middleware';
import { PERMISSIONS } from '@shared/schema';
import { logger } from '../utils/logger';
import { parseExportFormat, sendTabularExport, type ExportColumn } from '../utils/tabular-export';

const router = Router();

function parseDateRange(query: Record<string, unknown>) {
  const parse = (value: unknown, endOfDay = false) => {
    if (!value) return undefined;
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return undefined;
    date.setHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
    return date;
  };
  return { startDate: parse(query.startDate), endDate: parse(query.endDate, true) };
}

function capturedFieldHeader(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

router.get('/', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_CAPTURED_DATA, PERMISSIONS.MANAGE_CAPTURED_DATA]), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const flowId = req.query.flowId ? parseInt(req.query.flowId as string, 10) : undefined;
    const contactId = req.query.contactId ? parseInt(req.query.contactId as string, 10) : undefined;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = Math.min(req.query.limit ? parseInt(req.query.limit as string, 10) : 50, 100);

    const startDateStr = req.query.startDate as string | undefined;
    const endDateStr = req.query.endDate as string | undefined;

    let startDate: Date | undefined;
    let endDate: Date | undefined;

    if (startDateStr) {
      const parsed = new Date(startDateStr);
      if (!Number.isNaN(parsed.getTime())) {
        startDate = new Date(parsed);
        startDate.setHours(0, 0, 0, 0);
      }
    }

    if (endDateStr) {
      const parsed = new Date(endDateStr);
      if (!Number.isNaN(parsed.getTime())) {
        endDate = new Date(parsed);
        endDate.setHours(23, 59, 59, 999);
      }
    }

    if (startDate && endDate && startDate > endDate) {
      return res.status(400).json({ success: false, error: 'Start date must be on or before end date' });
    }

    const result = await storage.getCapturedFormSubmissions(companyId, {
      flowId: Number.isNaN(flowId as number) ? undefined : flowId,
      contactId: Number.isNaN(contactId as number) ? undefined : contactId,
      startDate,
      endDate,
      page: Number.isNaN(page) || page < 1 ? 1 : page,
      limit: Number.isNaN(limit) || limit < 1 ? 50 : limit
    });

    res.json({
      success: true,
      data: result.data,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages
      }
    });
  } catch (error) {
    logger.error('captured-data-routes', 'Error fetching captured form submissions', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.get('/export', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_CAPTURED_DATA, PERMISSIONS.MANAGE_CAPTURED_DATA]), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ success: false, error: 'Company ID required' });

    const format = parseExportFormat(req.query.format);
    if (!format) return res.status(400).json({ success: false, error: 'Unsupported export format' });

    const flowId = req.query.flowId ? Number(req.query.flowId) : undefined;
    const contactId = req.query.contactId ? Number(req.query.contactId) : undefined;
    const submissionId = req.query.submissionId ? Number(req.query.submissionId) : undefined;
    const { startDate, endDate } = parseDateRange(req.query as Record<string, unknown>);
    if (startDate && endDate && startDate > endDate) {
      return res.status(400).json({ success: false, error: 'Start date must be on or before end date' });
    }

    const maxRows = 5_000;
    let submissions: Awaited<ReturnType<typeof storage.getCapturedFormSubmissions>>['data'] = [];
    if (submissionId !== undefined) {
      if (!Number.isInteger(submissionId)) return res.status(400).json({ success: false, error: 'Invalid submission ID' });
      const submission = await storage.getCapturedFormSubmissionById(companyId, submissionId);
      if (!submission) return res.status(404).json({ success: false, error: 'Submission not found' });
      const [flow, contact] = await Promise.all([
        storage.getFlow(submission.flowId),
        storage.getContact(submission.contactId),
      ]);
      submissions = [{
        ...submission,
        flowName: flow?.companyId === companyId ? flow.name : '',
        contactName: contact?.companyId === companyId ? contact.name : '',
        capturedFields: submission.capturedFields && typeof submission.capturedFields === 'object'
          ? submission.capturedFields as Record<string, unknown>
          : {},
      }];
    } else {
      let page = 1;
      while (submissions.length < maxRows) {
        const result = await storage.getCapturedFormSubmissions(companyId, {
          flowId: Number.isInteger(flowId) ? flowId : undefined,
          contactId: Number.isInteger(contactId) ? contactId : undefined,
          startDate,
          endDate,
          page,
          limit: 100,
        });
        submissions.push(...result.data.slice(0, maxRows - submissions.length));
        if (submissions.length >= result.total || result.data.length === 0) break;
        page += 1;
      }
    }

    const fieldKeys = Array.from(new Set(submissions.flatMap((submission) => Object.keys(submission.capturedFields ?? {}))));
    const columns: ExportColumn[] = [
      { key: 'submissionId', header: 'Submission ID', type: 'number', width: 16 },
      { key: 'contactName', header: 'Contact', width: 24 },
      { key: 'contactId', header: 'Contact ID', type: 'number', width: 14 },
      { key: 'flowName', header: 'Flow', width: 24 },
      { key: 'flowId', header: 'Flow ID', type: 'number', width: 12 },
      { key: 'submittedAt', header: 'Submitted At', type: 'date', numberFormat: 'yyyy-mm-dd hh:mm:ss', width: 22 },
      ...fieldKeys.map((fieldKey, index): ExportColumn => ({
        key: `capturedField${index}`,
        header: capturedFieldHeader(fieldKey),
        width: 24,
      })),
    ];
    const rows = submissions.map((submission) => {
      const row: Record<string, unknown> = {
        submissionId: submission.id,
        contactName: submission.contactName,
        contactId: submission.contactId,
        flowName: submission.flowName,
        flowId: submission.flowId,
        submittedAt: submission.submittedAt,
      };
      fieldKeys.forEach((fieldKey, index) => {
        const value = submission.capturedFields?.[fieldKey];
        row[`capturedField${index}`] = typeof value === 'object' && value !== null ? JSON.stringify(value) : value;
      });
      return row;
    });

    await sendTabularExport(res, {
      filename: submissionId === undefined ? `captured-data-${new Date().toISOString().slice(0, 10)}` : `submission-${submissionId}`,
      format,
      sheets: [{ name: 'Captured Data', columns, rows }],
    });
  } catch (error) {
    logger.error('captured-data-routes', 'Error exporting captured form submissions', error);
    if (!res.headersSent) res.status(500).json({ success: false, error: 'Failed to export captured data' });
  }
});

router.get('/:id', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_CAPTURED_DATA, PERMISSIONS.MANAGE_CAPTURED_DATA]), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid submission ID' });
    }

    const submission = await storage.getCapturedFormSubmissionById(companyId, id);
    if (!submission) {
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }

    res.json({ success: true, data: submission });
  } catch (error) {
    logger.error('captured-data-routes', 'Error fetching captured form submission', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.delete('/:id', ensureAuthenticated, requireAnyPermission([PERMISSIONS.MANAGE_CAPTURED_DATA]), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid submission ID' });
    }

    const deleted = await storage.deleteCapturedFormSubmission(companyId, id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('captured-data-routes', 'Error deleting captured form submission', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
