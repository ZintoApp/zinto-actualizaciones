import { Router, type Response } from 'express';
import { z } from 'zod';
import { requireAnyPermission } from '../../middleware';
import { getErpErrorResponse, storage } from '../../storage';
import {
  insertChartOfAccountSchema,
  insertFiscalYearSchema,
  insertJournalEntrySchema,
  insertJournalEntryLineSchema,
  accountTypeEnum,
  journalReferenceTypeEnum,
  journalEntryStatusEnum,
} from '@shared/schema';
import { sendValidationError } from '../../utils/erp-zod-validation';

const router = Router();

const ERP_ACCOUNTING_READ_PERMISSIONS = ['view_accounting', 'manage_accounting'];
const ERP_ACCOUNTING_REPORT_PERMISSIONS = ['view_erp_reports', ...ERP_ACCOUNTING_READ_PERMISSIONS];
const ERP_ACCOUNTING_MANAGE_PERMISSIONS = ['manage_accounting'];
const ERP_JOURNAL_POST_PERMISSIONS = ['manage_accounting', 'post_journal_entries'];
const ERP_FISCAL_PERMISSIONS = ['manage_accounting', 'close_fiscal_year'];

const updateChartOfAccountBodySchema = insertChartOfAccountSchema
  .omit({ companyId: true, balance: true })
  .partial()
  .strict();

function coerceFiscalYearBody(input: unknown): unknown {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) return input;
  const body = { ...(input as Record<string, unknown>) };
  if (body.startDate) body.startDate = new Date(String(body.startDate));
  if (body.endDate) body.endDate = new Date(String(body.endDate));
  return body;
}

const fiscalYearBodyFieldsSchema = z.object({
  name: z.string().min(1),
  startDate: z.date(),
  endDate: z.date(),
  isClosed: z.boolean().optional(),
});

const createFiscalYearBodySchema = z.preprocess(
  coerceFiscalYearBody,
  fiscalYearBodyFieldsSchema.strict(),
);

const updateFiscalYearBodySchema = z.preprocess(
  coerceFiscalYearBody,
  fiscalYearBodyFieldsSchema.omit({ isClosed: true }).partial().strict(),
);

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

function handleRouteError(res: Response, error: unknown, context: string) {
  const mapped = getErpErrorResponse(error);
  if (mapped) {
    return res.status(mapped.status).json({
      success: false,
      error: mapped.message,
    });
  }
  console.error(context, error);
  return res.status(500).json({
    success: false,
    error: 'Unexpected server error',
  });
}

function optionalQueryInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function optionalQueryDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

// ===== CHART OF ACCOUNTS =====

router.get('/accounts', requireAnyPermission(ERP_ACCOUNTING_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const accounts = await storage.getChartOfAccounts(companyId);
    return res.json({ success: true, data: accounts });
  } catch (error) {
    return handleRouteError(res, error, 'Error fetching chart of accounts:');
  }
});

router.get('/accounts/:id', requireAnyPermission(ERP_ACCOUNTING_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const account = await storage.getChartOfAccount(id);
    if (!account || account.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }
    return res.json({ success: true, data: account });
  } catch (error) {
    return handleRouteError(res, error, 'Error fetching chart of account:');
  }
});

router.post('/accounts', requireAnyPermission(ERP_ACCOUNTING_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const parsed = insertChartOfAccountSchema.safeParse({ ...req.body, companyId });
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    // Validate parentAccountId belongs to the same company
    if (parsed.data.parentAccountId) {
      const parentAccount = await storage.getChartOfAccount(parsed.data.parentAccountId);
      if (!parentAccount || parentAccount.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Parent account does not belong to this company' });
      }
    }
    const account = await storage.createChartOfAccount(parsed.data, companyId);
    return res.json({ success: true, data: account });
  } catch (error) {
    return handleRouteError(res, error, 'Error creating chart of account:');
  }
});

router.put('/accounts/:id', requireAnyPermission(ERP_ACCOUNTING_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const existing = await storage.getChartOfAccount(id);
    if (!existing || existing.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }
    const parsed = updateChartOfAccountBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    // Validate parentAccountId belongs to the same company
    if (parsed.data.parentAccountId) {
      const parentAccount = await storage.getChartOfAccount(parsed.data.parentAccountId);
      if (!parentAccount || parentAccount.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Parent account does not belong to this company' });
      }
    }
    const account = await storage.updateChartOfAccount(id, parsed.data, companyId);
    return res.json({ success: true, data: account });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating chart of account:');
  }
});

router.delete('/accounts/:id', requireAnyPermission(ERP_ACCOUNTING_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const existing = await storage.getChartOfAccount(id);
    if (!existing || existing.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }
    const deleted = await storage.deleteChartOfAccount(id);
    return res.json({ success: true, data: { deleted } });
  } catch (error) {
    return handleRouteError(res, error, 'Error deleting chart of account:');
  }
});

router.post('/accounts/seed', requireAnyPermission(ERP_ACCOUNTING_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const accounts = await storage.seedDefaultChartOfAccounts(companyId);
    return res.json({ success: true, data: accounts });
  } catch (error) {
    return handleRouteError(res, error, 'Error seeding chart of accounts:');
  }
});

// ===== FISCAL YEARS =====

router.get('/fiscal-years', requireAnyPermission(ERP_ACCOUNTING_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const fiscalYears = await storage.getFiscalYears(companyId);
    return res.json({ success: true, data: fiscalYears });
  } catch (error) {
    return handleRouteError(res, error, 'Error fetching fiscal years:');
  }
});

router.post('/fiscal-years', requireAnyPermission(ERP_ACCOUNTING_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const parsed = createFiscalYearBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const fiscalYear = await storage.createFiscalYear({ ...parsed.data, companyId });
    return res.json({ success: true, data: fiscalYear });
  } catch (error) {
    return handleRouteError(res, error, 'Error creating fiscal year:');
  }
});

router.put('/fiscal-years/:id', requireAnyPermission(ERP_ACCOUNTING_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const existing = await storage.getFiscalYear(id);
    if (!existing || existing.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Fiscal year not found' });
    }
    const parsed = updateFiscalYearBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const fiscalYear = await storage.updateFiscalYear(id, parsed.data, companyId);
    return res.json({ success: true, data: fiscalYear });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating fiscal year:');
  }
});

router.post('/fiscal-years/:id/close', requireAnyPermission(ERP_FISCAL_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const existing = await storage.getFiscalYear(id);
    if (!existing || existing.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Fiscal year not found' });
    }
    const fiscalYear = await storage.closeFiscalYear(id, req.user?.id ?? 0, companyId);
    return res.json({ success: true, data: fiscalYear });
  } catch (error) {
    return handleRouteError(res, error, 'Error closing fiscal year:');
  }
});

// ===== JOURNAL ENTRIES =====

router.get('/journal-entries', requireAnyPermission(ERP_ACCOUNTING_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const filters = {
      status: req.query.status as string | undefined,
      referenceType: req.query.referenceType as string | undefined,
      fiscalYearId: optionalQueryInt(req.query.fiscalYearId as string),
      dateFrom: optionalQueryDate(req.query.dateFrom as string),
      dateTo: optionalQueryDate(req.query.dateTo as string),
      search: req.query.search as string | undefined,
      limit: optionalQueryInt(req.query.limit as string) ?? 50,
      offset: optionalQueryInt(req.query.offset as string) ?? 0,
    };
    const result = await storage.getJournalEntries(companyId, filters);
    return res.json({ success: true, ...result });
  } catch (error) {
    return handleRouteError(res, error, 'Error fetching journal entries:');
  }
});

router.get('/journal-entries/:id', requireAnyPermission(ERP_ACCOUNTING_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const entry = await storage.getJournalEntry(id);
    if (!entry || entry.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Journal entry not found' });
    }
    const lines = await storage.getJournalEntryLines(id);
    return res.json({ success: true, data: { ...entry, lines } });
  } catch (error) {
    return handleRouteError(res, error, 'Error fetching journal entry:');
  }
});

const journalEntryWithLinesSchema = z.object({
  entry: insertJournalEntrySchema.omit({ entryNumber: true, reversalOfJournalEntryId: true }).extend({ entryNumber: z.string().optional() }),
  lines: z.array(insertJournalEntryLineSchema.omit({ journalEntryId: true })),
});

router.post('/journal-entries', requireAnyPermission(ERP_ACCOUNTING_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const body = {
      ...req.body,
      entry: {
        ...req.body.entry,
        companyId,
        date: req.body.entry?.date ? new Date(req.body.entry.date) : new Date(),
        createdBy: req.user?.id ?? null,
      },
    };
    const parsed = journalEntryWithLinesSchema.safeParse(body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    for (const line of parsed.data.lines) {
      if (line.accountId <= 0) {
        return res.status(400).json({
          success: false,
          error: `Account ID ${line.accountId} must be greater than 0`,
        });
      }
    }
    // Validate that all account IDs belong to the current company
    const accountIds = parsed.data.lines.map(l => l.accountId);
    const uniqueAccountIds = [...new Set(accountIds)];
    for (const accountId of uniqueAccountIds) {
      const account = await storage.getChartOfAccount(accountId);
      if (!account || account.companyId !== companyId) {
        return res.status(400).json({ success: false, error: `Account ID ${accountId} does not belong to this company` });
      }
    }
    const lines = parsed.data.lines.map(l => ({ ...l, journalEntryId: 0 }));
    const entry = await storage.createJournalEntry(
      { ...parsed.data.entry, entryNumber: parsed.data.entry.entryNumber ?? '' },
      lines,
      companyId,
    );
    return res.json({ success: true, data: entry });
  } catch (error) {
    return handleRouteError(res, error, 'Error creating journal entry:');
  }
});

router.put('/journal-entries/:id', requireAnyPermission(ERP_ACCOUNTING_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const existing = await storage.getJournalEntry(id);
    if (!existing || existing.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Journal entry not found' });
    }

    const body = {
      ...req.body,
      entry: {
        ...req.body.entry,
        companyId,
        date: req.body.entry?.date ? new Date(req.body.entry.date) : new Date(),
        createdBy: existing.createdBy,
      },
    };
    const parsed = journalEntryWithLinesSchema.safeParse(body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    for (const line of parsed.data.lines) {
      if (line.accountId <= 0) {
        return res.status(400).json({
          success: false,
          error: `Account ID ${line.accountId} must be greater than 0`,
        });
      }
    }

    const lines = parsed.data.lines.map(l => ({ ...l, journalEntryId: id }));
    const entry = await storage.updateJournalEntry(
      id,
      { ...parsed.data.entry, entryNumber: existing.entryNumber },
      lines,
      companyId,
    );
    return res.json({ success: true, data: entry });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating journal entry:');
  }
});

router.delete('/journal-entries/:id', requireAnyPermission(ERP_ACCOUNTING_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const existing = await storage.getJournalEntry(id);
    if (!existing || existing.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Journal entry not found' });
    }
    const deleted = await storage.deleteJournalEntry(id, companyId);
    return res.json({ success: true, data: { deleted } });
  } catch (error) {
    return handleRouteError(res, error, 'Error deleting journal entry:');
  }
});

router.post('/journal-entries/:id/post', requireAnyPermission(ERP_JOURNAL_POST_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const entry = await storage.getJournalEntry(id);
    if (!entry || entry.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Journal entry not found' });
    }
    const posted = await storage.postJournalEntry(id, req.user?.id ?? 0, companyId);
    return res.json({ success: true, data: posted });
  } catch (error) {
    return handleRouteError(res, error, 'Error posting journal entry:');
  }
});

router.post('/journal-entries/:id/reverse', requireAnyPermission(ERP_JOURNAL_POST_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const entry = await storage.getJournalEntry(id);
    if (!entry || entry.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Journal entry not found' });
    }
    const reversed = await storage.reverseJournalEntry(id, req.user?.id ?? 0);
    return res.json({ success: true, data: reversed });
  } catch (error) {
    return handleRouteError(res, error, 'Error reversing journal entry:');
  }
});

// ===== ACCOUNTS RECEIVABLE / PAYABLE =====

router.get('/accounts-receivable', requireAnyPermission(ERP_ACCOUNTING_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const filters = {
      contactId: optionalQueryInt(req.query.contactId as string),
      status: req.query.status as string | undefined,
      limit: optionalQueryInt(req.query.limit as string) ?? 50,
      offset: optionalQueryInt(req.query.offset as string) ?? 0,
    };
    const result = await storage.getAccountsReceivable(companyId, filters);
    return res.json({ success: true, ...result });
  } catch (error) {
    return handleRouteError(res, error, 'Error fetching accounts receivable:');
  }
});

router.get('/accounts-payable', requireAnyPermission(ERP_ACCOUNTING_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const filters = {
      supplierId: optionalQueryInt(req.query.supplierId as string),
      status: req.query.status as string | undefined,
      limit: optionalQueryInt(req.query.limit as string) ?? 50,
      offset: optionalQueryInt(req.query.offset as string) ?? 0,
    };
    const result = await storage.getAccountsPayable(companyId, filters);
    return res.json({ success: true, ...result });
  } catch (error) {
    return handleRouteError(res, error, 'Error fetching accounts payable:');
  }
});

// ===== FINANCIAL REPORTS =====

router.get('/reports/trial-balance', requireAnyPermission(ERP_ACCOUNTING_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const asOfDate = optionalQueryDate(req.query.asOfDate as string) ?? new Date();
    const data = await storage.getTrialBalance(companyId, asOfDate);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error generating trial balance:');
  }
});

router.get('/reports/profit-loss', requireAnyPermission(ERP_ACCOUNTING_REPORT_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const startDate = optionalQueryDate(req.query.startDate as string);
    const endDate = optionalQueryDate(req.query.endDate as string);
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, error: 'startDate and endDate are required' });
    }
    const data = await storage.getProfitAndLoss(companyId, startDate, endDate);
    const baseRow = await storage.getBaseCurrency(companyId);
    const baseCurrency = (baseRow?.code ?? 'USD').trim().toUpperCase();
    return res.json({ success: true, data, baseCurrency });
  } catch (error) {
    return handleRouteError(res, error, 'Error generating profit and loss:');
  }
});

router.get('/reports/balance-sheet', requireAnyPermission(ERP_ACCOUNTING_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const asOfDate = optionalQueryDate(req.query.asOfDate as string);
    if (!asOfDate) {
      return res.status(400).json({ success: false, error: 'asOfDate is required' });
    }
    const data = await storage.getBalanceSheet(companyId, asOfDate);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error generating balance sheet:');
  }
});

router.get('/reports/ar-aging', requireAnyPermission(ERP_ACCOUNTING_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const data = await storage.getArAging(companyId);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error generating AR aging:');
  }
});

router.get('/reports/ap-aging', requireAnyPermission(ERP_ACCOUNTING_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const data = await storage.getApAging(companyId);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, 'Error generating AP aging:');
  }
});

export default router;
