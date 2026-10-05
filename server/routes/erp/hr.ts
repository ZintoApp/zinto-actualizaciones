import { Router, type Response } from 'express';
import { z } from 'zod';
import { requireAnyPermission } from '../../middleware';
import { storage } from '../../storage';
import {
  insertDepartmentSchema,
  insertEmployeeSchema,
  insertLeaveRequestSchema,
  insertAttendanceRecordSchema,
} from '@shared/schema';
import { sendValidationError } from '../../utils/erp-zod-validation';

const router = Router();

const ERP_HR_READ_PERMISSIONS = ['view_hr', 'manage_hr'];
const ERP_HR_MANAGE_PERMISSIONS = ['manage_hr'];
const ERP_LEAVE_APPROVE_PERMISSIONS = ['manage_hr', 'approve_leave'];

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

function handleRouteError(res: Response, error: unknown, logLabel: string) {
  if (error instanceof z.ZodError) {
    return sendValidationError(res, error);
  }
  const dbError = error as { code?: string; constraint?: string };
  if (dbError?.code === '23505') {
    const messages: Record<string, string> = {
      unique_company_user_employee: 'User already has an employee record',
      unique_company_employee_id: 'Employee ID already exists for this company',
      unique_employee_attendance_date: 'Attendance already exists for this employee and date',
    };
    return res.status(400).json({
      success: false,
      error: messages[dbError.constraint ?? ''] ?? 'Duplicate record',
    });
  }
  if (error instanceof Error) {
    const businessMessages = [
      'Leave start date must be on or before end date',
      'Leave days must be positive',
      'Only pending leave requests can be approved',
      'Only pending leave requests can be rejected',
      'Attendance check-out must be after check-in',
      'Department parent cannot create a reporting cycle',
      'Department hierarchy contains a reporting cycle',
      'Employee manager cannot create a reporting cycle',
      'Employee hierarchy contains a reporting cycle',
    ];
    if (businessMessages.includes(error.message)) {
      return res.status(400).json({ success: false, error: error.message });
    }
  }
  console.error(logLabel, error);
  return res.status(500).json({ success: false, error: getErrorMessage(error) });
}

function hasManageHrPermission(req: any): boolean {
  return Boolean(req.user?.isSuperAdmin || req.userPermissions?.manage_hr);
}

function optionalQueryInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = parseInt(String(value), 10);
  return Number.isNaN(n) ? undefined : n;
}

function optionalQueryDate(value: unknown): Date | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function coerceNumericBody(input: unknown): unknown {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) return input;
  const o = { ...(input as Record<string, unknown>) };
  for (const k of ['salary', 'days', 'hoursWorked']) {
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v)) {
      o[k] = String(v);
    }
  }
  return o;
}

/** Coerce ISO date strings from JSON into Date for Drizzle timestamp columns. */
function preprocessHrRequestBody(input: unknown): unknown {
  const base = coerceNumericBody(input);
  if (base == null || typeof base !== 'object' || Array.isArray(base)) return base;
  const o = { ...(base as Record<string, unknown>) };
  for (const k of ['hireDate', 'terminationDate', 'startDate', 'endDate', 'date', 'checkIn', 'checkOut'] as const) {
    if (!(k in o)) continue;
    const v = o[k];
    if (v === null || v === undefined) continue;
    if (v instanceof Date) continue;
    if (typeof v === 'string' && v.trim()) {
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) o[k] = d;
    }
  }
  return o;
}

const listEmployeesQuerySchema = z.object({
  search: z.string().optional(),
  departmentId: z.preprocess(optionalQueryInt, z.number().int().optional()),
  status: z.string().optional(),
  limit: z.preprocess(optionalQueryInt, z.number().int().optional()),
  offset: z.preprocess(optionalQueryInt, z.number().int().optional()),
});

const listLeaveQuerySchema = z.object({
  employeeId: z.preprocess(optionalQueryInt, z.number().int().optional()),
  status: z.string().optional(),
  leaveType: z.string().optional(),
  dateFrom: z.preprocess(optionalQueryDate, z.date().optional()),
  dateTo: z.preprocess(optionalQueryDate, z.date().optional()),
  limit: z.preprocess(optionalQueryInt, z.number().int().optional()),
  offset: z.preprocess(optionalQueryInt, z.number().int().optional()),
});

const listAttendanceQuerySchema = z.object({
  employeeId: z.preprocess(optionalQueryInt, z.number().int().optional()),
  status: z.string().optional(),
  dateFrom: z.preprocess(optionalQueryDate, z.date().optional()),
  dateTo: z.preprocess(optionalQueryDate, z.date().optional()),
  limit: z.preprocess(optionalQueryInt, z.number().int().optional()),
  offset: z.preprocess(optionalQueryInt, z.number().int().optional()),
});

const createDepartmentBodySchema = insertDepartmentSchema.omit({ companyId: true }).strict();
const updateDepartmentBodySchema = insertDepartmentSchema.omit({ companyId: true }).partial().strict();

const createEmployeeBodySchema = z.preprocess(
  preprocessHrRequestBody,
  insertEmployeeSchema
    .omit({ companyId: true, employeeId: true })
    .extend({ employeeId: z.string().optional() })
    .strict()
);
const updateEmployeeBodySchema = z.preprocess(
  preprocessHrRequestBody,
  insertEmployeeSchema.omit({ companyId: true, userId: true }).partial().strict()
);

const createLeaveBodySchema = z.preprocess(
  preprocessHrRequestBody,
  insertLeaveRequestSchema
    .omit({ companyId: true, status: true, approvedBy: true })
    .extend({ employeeId: z.number().int().optional() })
    .strict()
    .superRefine((data, ctx) => {
      if (new Date(data.startDate).getTime() > new Date(data.endDate).getTime()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: 'End date must be on or after start date' });
      }
      const days = Number(data.days);
      if (!Number.isFinite(days) || days <= 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['days'], message: 'Days must be positive' });
      }
    })
);
const updateLeaveBodySchema = z.preprocess(
  preprocessHrRequestBody,
  insertLeaveRequestSchema
    .omit({ companyId: true, status: true, approvedBy: true })
    .partial()
    .strict()
    .superRefine((data, ctx) => {
      if (data.startDate && data.endDate && new Date(data.startDate).getTime() > new Date(data.endDate).getTime()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: 'End date must be on or after start date' });
      }
      if (data.days !== undefined) {
        const days = Number(data.days);
        if (!Number.isFinite(days) || days <= 0) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['days'], message: 'Days must be positive' });
        }
      }
    })
);

const createAttendanceBodySchema = z.preprocess(
  preprocessHrRequestBody,
  insertAttendanceRecordSchema
    .omit({ companyId: true })
    .strict()
    .superRefine((data, ctx) => {
      if (data.checkIn && data.checkOut && new Date(data.checkOut).getTime() <= new Date(data.checkIn).getTime()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['checkOut'], message: 'Check-out must be after check-in' });
      }
    })
);
const updateAttendanceBodySchema = z.preprocess(
  preprocessHrRequestBody,
  insertAttendanceRecordSchema
    .omit({ companyId: true })
    .partial()
    .strict()
    .superRefine((data, ctx) => {
      if (data.checkIn && data.checkOut && new Date(data.checkOut).getTime() <= new Date(data.checkIn).getTime()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['checkOut'], message: 'Check-out must be after check-in' });
      }
    })
);

// ----- Departments -----

router.get('/departments', requireAnyPermission(ERP_HR_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const rows = await storage.getDepartments(companyId);
    return res.json({ success: true, data: rows });
  } catch (error) {
    return handleRouteError(res, error, 'Error listing departments:');
  }
});

router.post('/departments', requireAnyPermission(ERP_HR_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const parsed = createDepartmentBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    if (parsed.data.managerId != null) {
      const u = await storage.getUser(parsed.data.managerId);
      if (!u || u.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Manager must be a user in this company' });
      }
    }
    if (parsed.data.parentDepartmentId != null) {
      const p = await storage.getDepartment(parsed.data.parentDepartmentId);
      if (!p || p.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Parent department must belong to this company' });
      }
    }
    const created = await storage.createDepartment({
      ...parsed.data,
      companyId,
    });
    return res.json({ success: true, data: created });
  } catch (error) {
    return handleRouteError(res, error, 'Error creating department:');
  }
});

router.put('/departments/:id', requireAnyPermission(ERP_HR_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const existing = await storage.getDepartment(id);
    if (!existing || existing.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Department not found' });
    }
    const parsed = updateDepartmentBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    if (parsed.data.managerId != null) {
      const u = await storage.getUser(parsed.data.managerId);
      if (!u || u.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Manager must be a user in this company' });
      }
    }
    if (parsed.data.parentDepartmentId != null) {
      if (parsed.data.parentDepartmentId === id) {
        return res.status(400).json({ success: false, error: 'Department cannot be its own parent' });
      }
      const p = await storage.getDepartment(parsed.data.parentDepartmentId);
      if (!p || p.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Parent department must belong to this company' });
      }
    }
    const updated = await storage.updateDepartment(id, parsed.data);
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating department:');
  }
});

router.delete('/departments/:id', requireAnyPermission(ERP_HR_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const existing = await storage.getDepartment(id);
    if (!existing || existing.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Department not found' });
    }
    await storage.deleteDepartment(id);
    return res.json({ success: true, data: true });
  } catch (error) {
    return handleRouteError(res, error, 'Error deleting department:');
  }
});

// ----- Employees -----

router.get('/employees', requireAnyPermission(ERP_HR_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const parsed = listEmployeesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const { data, total } = await storage.getEmployees(companyId, parsed.data);
    const enrichment = await storage.getEmployeeEnrichment(data.map((emp) => emp.id));
    const enriched = data.map((emp) => {
      const details = enrichment.get(emp.id);
      return {
        ...emp,
        fullName: details?.user?.fullName ?? null,
        departmentName: details?.department?.name ?? null,
      };
    });
    return res.json({ success: true, data: { data: enriched, total } });
  } catch (error) {
    return handleRouteError(res, error, 'Error listing employees:');
  }
});

router.get('/employees/:id', requireAnyPermission(ERP_HR_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const row = await storage.getEmployee(id);
    if (!row || row.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Employee not found' });
    }
    const enrichment = await storage.getEmployeeEnrichment([row.id]);
    const details = enrichment.get(row.id);
    return res.json({
      success: true,
      data: {
        ...row,
        fullName: details?.user?.fullName ?? null,
        departmentName: details?.department?.name ?? null,
      },
    });
  } catch (error) {
    return handleRouteError(res, error, 'Error getting employee:');
  }
});

router.post('/employees', requireAnyPermission(ERP_HR_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const parsed = createEmployeeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const u = await storage.getUser(parsed.data.userId);
    if (!u || u.companyId !== companyId) {
      return res.status(400).json({ success: false, error: 'User not found in this company' });
    }
    const dup = await storage.getEmployeeByUserId(companyId, parsed.data.userId);
    if (dup) {
      return res.status(400).json({ success: false, error: 'User already has an employee record' });
    }
    if (parsed.data.departmentId != null) {
      const d = await storage.getDepartment(parsed.data.departmentId);
      if (!d || d.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Invalid department' });
      }
    }
    if (parsed.data.managerId != null) {
      const mgr = await storage.getEmployee(parsed.data.managerId);
      if (!mgr || mgr.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Manager must be an employee in this company' });
      }
    }
    const { employeeId: incomingEmployeeId, ...employeeRest } = parsed.data;
    const created = await storage.createEmployee({
      ...employeeRest,
      companyId,
      employeeId: incomingEmployeeId?.trim() ?? '',
    });
    return res.json({ success: true, data: created });
  } catch (error) {
    return handleRouteError(res, error, 'Error creating employee:');
  }
});

router.put('/employees/:id', requireAnyPermission(ERP_HR_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const existing = await storage.getEmployee(id);
    if (!existing || existing.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Employee not found' });
    }
    const parsed = updateEmployeeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    if (parsed.data.departmentId != null) {
      const d = await storage.getDepartment(parsed.data.departmentId);
      if (!d || d.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Invalid department' });
      }
    }
    if (parsed.data.managerId != null) {
      if (parsed.data.managerId === id) {
        return res.status(400).json({ success: false, error: 'Employee cannot be their own manager' });
      }
      const mgr = await storage.getEmployee(parsed.data.managerId);
      if (!mgr || mgr.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Manager must be an employee in this company' });
      }
    }
    const updated = await storage.updateEmployee(id, parsed.data);
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating employee:');
  }
});

router.delete('/employees/:id', requireAnyPermission(ERP_HR_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const existing = await storage.getEmployee(id);
    if (!existing || existing.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Employee not found' });
    }
    const archived = await storage.deleteEmployee(id);
    return res.json({ success: true, data: archived });
  } catch (error) {
    return handleRouteError(res, error, 'Error deleting employee:');
  }
});

// ----- Leave requests -----

router.get('/leave-requests', requireAnyPermission(ERP_HR_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const parsed = listLeaveQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const { data, total } = await storage.getLeaveRequests(companyId, parsed.data);
    const employeeDetails = await storage.getEmployeeEnrichment(data.map((lr) => lr.employeeId));
    const approvers = await storage.getUsersByIds(
      data.map((lr) => lr.approvedBy).filter((id): id is number => id != null)
    );
    const enriched = data.map((lr) => {
      const details = employeeDetails.get(lr.employeeId);
      const approver = lr.approvedBy != null ? approvers.get(lr.approvedBy) : undefined;
      return {
        ...lr,
        employeeName: details?.user?.fullName ?? null,
        approvedByName: approver?.fullName ?? null,
      };
    });
    return res.json({ success: true, data: { data: enriched, total } });
  } catch (error) {
    return handleRouteError(res, error, 'Error listing leave requests:');
  }
});

router.post('/leave-requests', requireAnyPermission(ERP_HR_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const parsed = createLeaveBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const canManageHr = hasManageHrPermission(req);
    let employeeId = parsed.data.employeeId;
    if (canManageHr) {
      if (employeeId == null) {
        return res.status(400).json({ success: false, error: 'Employee is required' });
      }
    } else {
      const currentEmployee = req.user?.id
        ? await storage.getEmployeeByUserId(companyId, req.user.id)
        : undefined;
      if (!currentEmployee) {
        return res.status(400).json({ success: false, error: 'Current user does not have an employee record' });
      }
      employeeId = currentEmployee.id;
    }
    const emp = await storage.getEmployee(employeeId);
    if (!emp || emp.companyId !== companyId) {
      return res.status(400).json({ success: false, error: 'Employee not found' });
    }
    const created = await storage.createLeaveRequest({
      ...parsed.data,
      employeeId,
      companyId,
      status: 'pending',
      approvedBy: null,
    });
    return res.json({ success: true, data: created });
  } catch (error) {
    return handleRouteError(res, error, 'Error creating leave request:');
  }
});

router.put('/leave-requests/:id', requireAnyPermission(ERP_HR_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const existing = await storage.getLeaveRequest(id);
    if (!existing || existing.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Leave request not found' });
    }
    const parsed = updateLeaveBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    if (parsed.data.employeeId != null) {
      const emp = await storage.getEmployee(parsed.data.employeeId);
      if (!emp || emp.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Employee not found' });
      }
    }
    const updated = await storage.updateLeaveRequest(id, parsed.data);
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating leave request:');
  }
});

router.delete('/leave-requests/:id', requireAnyPermission(ERP_HR_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const existing = await storage.getLeaveRequest(id);
    if (!existing || existing.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Leave request not found' });
    }
    await storage.deleteLeaveRequest(id);
    return res.json({ success: true, data: true });
  } catch (error) {
    return handleRouteError(res, error, 'Error deleting leave request:');
  }
});

router.post('/leave-requests/:id/approve', requireAnyPermission(ERP_LEAVE_APPROVE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    if (!companyId || !userId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const existing = await storage.getLeaveRequest(id);
    if (!existing || existing.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Leave request not found' });
    }
    if (existing.status !== 'pending') {
      return res.status(400).json({ success: false, error: 'Only pending leave requests can be approved' });
    }
    const updated = await storage.approveLeaveRequest(id, userId);
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleRouteError(res, error, 'Error approving leave request:');
  }
});

router.post('/leave-requests/:id/reject', requireAnyPermission(ERP_LEAVE_APPROVE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    if (!companyId || !userId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const existing = await storage.getLeaveRequest(id);
    if (!existing || existing.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Leave request not found' });
    }
    if (existing.status !== 'pending') {
      return res.status(400).json({ success: false, error: 'Only pending leave requests can be rejected' });
    }
    const notesSchema = z.object({ notes: z.string().optional() });
    const parsed = notesSchema.safeParse(req.body ?? {});
    const updated = await storage.rejectLeaveRequest(id, userId, parsed.success ? parsed.data.notes : undefined);
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleRouteError(res, error, 'Error rejecting leave request:');
  }
});

// ----- Attendance -----

router.get('/attendance', requireAnyPermission(ERP_HR_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const parsed = listAttendanceQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const { data, total } = await storage.getAttendanceRecords(companyId, parsed.data);
    const employeeDetails = await storage.getEmployeeEnrichment(data.map((rec) => rec.employeeId));
    const enriched = data.map((rec) => {
      const details = employeeDetails.get(rec.employeeId);
      return {
        ...rec,
        employeeName: details?.user?.fullName ?? null,
      };
    });
    return res.json({ success: true, data: { data: enriched, total } });
  } catch (error) {
    return handleRouteError(res, error, 'Error listing attendance:');
  }
});

router.post('/attendance', requireAnyPermission(ERP_HR_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const parsed = createAttendanceBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const emp = await storage.getEmployee(parsed.data.employeeId);
    if (!emp || emp.companyId !== companyId) {
      return res.status(400).json({ success: false, error: 'Employee not found' });
    }
    const created = await storage.createAttendanceRecord({
      ...parsed.data,
      companyId,
    });
    return res.json({ success: true, data: created });
  } catch (error) {
    return handleRouteError(res, error, 'Error creating attendance:');
  }
});

router.put('/attendance/:id', requireAnyPermission(ERP_HR_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const existing = await storage.getAttendanceRecord(id);
    if (!existing || existing.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Attendance record not found' });
    }
    const parsed = updateAttendanceBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    if (parsed.data.employeeId != null) {
      const emp = await storage.getEmployee(parsed.data.employeeId);
      if (!emp || emp.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Employee not found' });
      }
    }
    const updated = await storage.updateAttendanceRecord(id, parsed.data);
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating attendance:');
  }
});

router.delete('/attendance/:id', requireAnyPermission(ERP_HR_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const existing = await storage.getAttendanceRecord(id);
    if (!existing || existing.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Attendance record not found' });
    }
    await storage.deleteAttendanceRecord(id);
    return res.json({ success: true, data: true });
  } catch (error) {
    return handleRouteError(res, error, 'Error deleting attendance:');
  }
});

export default router;
