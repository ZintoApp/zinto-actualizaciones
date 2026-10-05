import { DentalReminderTimezoneError, getDentalReminderTimezone, resolveDentalReminderTimezone } from '../../services/dental-reminder-timezone';
import { dentalReminderMessageValues } from '@shared/utils/dental-reminder-message';
import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { requireAnyPermission, getUserPermissions } from '../../middleware';
import { storage, getErpErrorResponse, logContactAudit, DentalPhoneConflictError, ErpValidationError } from '../../storage';
import { insertDentalPatientProfileSchema, insertDentalChairSchema, PERMISSIONS } from '@shared/schema';
import channelManager from '../../services/channel-manager';
import { broadcastToCompany } from '../../utils/websocket';
import {
  dentalMedicalHistoryDetailsSchema,
  dentalPatientInfectiousTestInputSchema,
  dentalPatientVitalInputSchema,
} from '@shared/dental-medical-history';
import { ensureDentalBusinessType, DENTAL_TOOTH_NUMBERING_SETTING_KEY, normalizeDentalToothNumberingSystem } from './business-type';
import { parseInZoneToUTC } from '../../utils/timezone';
import {
  getDentalBookingPolicy,
  saveDentalBookingPolicy,
} from '../../services/dental-booking-policy-service';
import {
  approveDentalBookingRequest,
  bookDentalAppointment,
  confirmDentalBooking,
  declineDentalBooking,
  createManualDentalAppointment,
  evaluateManualDentalLocalSlot,
  getDentalAvailableSlots,
  getManualDentalAvailability,
  listPendingDentalBookings,
  resolveDentalCompanyTimezone,
  updateManualDentalAppointment,
} from '../../services/dental-booking-service';
import {
  DENTAL_AVAILABILITY_MAX_LIMIT,
  DENTAL_BOOKING_SOURCES,
} from '@shared/types/dental-booking-types';
import {
  DENTAL_CLINICAL_NOTE_TYPES,
  DENTAL_CLINICAL_DOCUMENT_CATEGORIES,
  DENTAL_TREATMENT_PLAN_STATUSES,
  DENTAL_TREATMENT_PLAN_CLINICAL_STATUSES,
  DENTAL_TREATMENT_PROCEDURE_STATUSES,
  DENTAL_TREATMENT_PROCEDURE_CLINICAL_STATUSES,
  normalizeDentalClinicalNoteType,
  normalizeDentalTreatmentPlanClinicalStatus,
  normalizeDentalTreatmentProcedureClinicalStatus,
  isDentalClinicalDocumentCategory,
} from '@shared/dental-clinical';
import { resolveCompanyCurrencyCode } from '../../services/erp/currency-service';
import { listResolvableSpecialties, collectKnownSpecialtyIds } from '@shared/types/dental-booking-types';
import { generateDentalClinicalNotePdf } from '../../services/dental-clinical-note-pdf-service';
import { getZonedDateTimeParts } from '@shared/utils/agent-schedule';
import {
  ContactCustomFieldValidationError,
  type CustomFieldValue,
} from '@shared/contact-custom-fields';
import { removeUnreferencedCustomFieldAttachments, validateEntityCustomFields } from '../../services/custom-field-value-service';
import { getConnection as getWhatsAppConnection } from '../../services/channels/whatsapp';
import { resolveUsernameViaUSync } from '../../services/whatsapp-username-resolver';
import { normalizeUsername, validateUsername } from '../../services/whatsapp-username-utils';
import { prepareInteractiveWhatsAppContact, WhatsAppUsernameCreationError } from '../../services/manual-whatsapp-contact';
import { emptyContactCreationMeta, type ContactCreationMeta } from '@shared/whatsapp-contact-identity';
import { isChannelAvailable } from '@shared/channel-utils';
import {
  dentalAppointmentColorOverrideSchema,
  dentalScheduleListQuerySchema,
  dentalUpcomingScheduleQuerySchema,
  sortDentalScheduleRows,
} from '@shared/types/dental-schedule-query';

import dentalQueueRouter from './dental-queue';
import dentalConsentRouter from './dental-consents';
import dentalConsentSendRouter from './dental-consent-send';
import dentalReminderBatchesRouter from './dental-reminder-batches';
const router = Router();
router.use('/reminder-batches', dentalReminderBatchesRouter);
router.use('/queue', dentalQueueRouter);
router.use(dentalConsentRouter);
router.use(dentalConsentSendRouter);

function addOneDayDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

/** Clinical plan access or ERP billing roles that need the treatment-plan billing UI. */
const DENTAL_TREATMENT_PLAN_READ_PERMISSIONS = [
  'view_dental_treatment_plans',
  'manage_dental_treatment_plans',
  'create_quotations',
  'manage_sales_orders',
  'view_sales_orders',
  'manage_invoices',
  'view_invoices',
];

const listSchema = z.object({
  search: z.string().optional(),
  tag: z.string().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  sex: z.string().optional(),
  limit: z.coerce.number().int().optional(),
  offset: z.coerce.number().int().optional(),
});

const contactIdSchema = z.object({
  contactId: z.coerce.number().int().positive(),
});

const membershipSchema = z.object({
  contactIds: z.array(z.coerce.number().int().positive()).max(200),
});

const eligibleSchema = z.object({
  search: z.string().optional(),
  limit: z.coerce.number().int().optional(),
});

const lookupByPhoneSchema = z.object({
  phone: z.string().trim().min(1),
});

const createWithContactSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(40).optional(),
  ),
  whatsappUsername: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(36).optional(),
  ),
  whatsappUsernameKey: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(128).optional(),
  ),
  email: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().email().optional(),
  ),
  customFields: z.record(z.string(), z.unknown()).optional(),
}).refine(body => Boolean(body.phone || body.whatsappUsername), {
  message: 'Phone number or WhatsApp username is required',
  path: ['phone'],
});

const contactCustomFieldsSchema = z.object({
  customFields: z.record(z.string(), z.unknown()),
});

const createSchema = insertDentalPatientProfileSchema
  .omit({ companyId: true })
  .extend({
    contactId: z.coerce.number().int().positive(),
    dateOfBirth: z.string().nullable().optional(),
    preferredProviderUserId: z.coerce.number().int().positive().nullable().optional(),
    medicalHistoryDetails: dentalMedicalHistoryDetailsSchema.optional(),
  });

const updateSchema = createSchema.omit({ contactId: true }).partial();

const clinicalRecordIdSchema = z.object({ recordId: z.coerce.number().int().positive() });

const vitalUpdateSchema = dentalPatientVitalInputSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field is required',
});
const infectiousTestUpdateSchema = dentalPatientInfectiousTestInputSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field is required',
});

const chairIdSchema = z.object({
  chairId: z.coerce.number().int().positive(),
});

const createChairSchema = insertDentalChairSchema
  .omit({ companyId: true })
  .extend({
    code: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(120),
    sortOrder: z.coerce.number().int().optional(),
    isActive: z.boolean().optional(),
  });

const updateChairSchema = createChairSchema.partial();

const appointmentStatusSchema = z.enum([
  'scheduled',
  'confirmed',
  'completed',
  'cancelled',
  'rescheduled',
  'no_show',
]);

const scheduleIdSchema = z.object({
  appointmentId: z.coerce.number().int().positive(),
});

const reminderBodySchema = z.object({
  conversationId: z.coerce.number().int().positive(),
  content: z.string().trim().min(1).max(8000),
  templateId: z.coerce.number().int().positive().optional(),
}).strict();
const reminderChannelSchema = z.object({ channelId: z.coerce.number().int().positive() }).strict();

const REMINDER_VARIABLES = new Set([
  'contact.name', 'contact.phone', 'contact.email', 'appointment.date',
  'appointment.start_time', 'appointment.end_time', 'appointment.duration',
  'appointment.service', 'appointment.provider', 'appointment.office',
  'appointment.status', 'appointment.notes', 'company.name', 'company.timezone',
]);

function renderReminderTemplate(content: string, values: Record<string, string>): string {
  return content.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, rawName: string) => {
    const name = rawName.trim();
    if (!REMINDER_VARIABLES.has(name)) throw new ErpValidationError(`Unsupported reminder variable: ${name}`);
    const value = values[name];
    if (value == null) throw new ErpValidationError(`Unable to resolve reminder variable: ${name}`);
    return value;
  });
}

const createScheduleSchema = z.object({
  contactId: z.coerce.number().int().positive(),
  catalogItemId: z.string().trim().min(1).max(64),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  scheduledAt: z.string().min(1),
  status: appointmentStatusSchema.optional(),
  providerUserId: z.coerce.number().int().positive().nullable().optional(),
  chairId: z.coerce.number().int().positive().nullable().optional(),
  isRecall: z.boolean().optional(),
  recallDueAt: z.string().nullable().optional(),
  calendarColor: dentalAppointmentColorOverrideSchema.optional(),
  overrideReason: z.string().trim().min(3).max(500).nullable().optional(),
}).strict();

const updateScheduleSchema = createScheduleSchema.partial().extend({
  contactId: z.coerce.number().int().positive().optional(),
});

const snapshotIdSchema = z.object({
  snapshotId: z.coerce.number().int().positive(),
});

const chartHistorySchema = z.object({
  limit: z.coerce.number().int().optional(),
  offset: z.coerce.number().int().optional(),
});

const numberingSystemSchema = z.enum(['FDI', 'UNIVERSAL', 'PALMER']);

const createChartSnapshotSchema = z.object({
  payload: z.record(z.string(), z.unknown()),
  numberingSystem: numberingSystemSchema.optional(),
});

const chartSettingsSchema = z.object({
  numberingSystem: numberingSystemSchema,
});

async function getCompanyToothNumbering(companyId: number) {
  const setting = await storage.getCompanySetting(companyId, DENTAL_TOOTH_NUMBERING_SETTING_KEY);
  return normalizeDentalToothNumberingSystem(setting?.value);
}

async function ensureDentalPatient(companyId: number, contactId: number) {
  const patient = await storage.getDentalPatientByContactId(companyId, contactId);
  if (!patient) return null;
  return patient;
}

const noteIdSchema = z.object({
  noteId: z.coerce.number().int().positive(),
});

const createClinicalNoteSchema = z.object({
  noteType: z.enum(DENTAL_CLINICAL_NOTE_TYPES).optional(),
  body: z.string().trim().min(1).max(10000),
  toothRefs: z.array(z.string().trim().min(1).max(8)).max(32).nullable().optional(),
});

const updateClinicalNoteSchema = createClinicalNoteSchema.partial();

const clinicalFeedSchema = z.object({
  filter: z.enum(['all', 'mine', 'voided']).default('all'),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const createProgressNoteSchema = createClinicalNoteSchema.extend({
  treatmentPlanId: z.coerce.number().int().positive().nullable().optional(),
  isPrivate: z.boolean().optional(),
});

const amendProgressNoteSchema = createClinicalNoteSchema.partial().extend({
  treatmentPlanId: z.coerce.number().int().positive().nullable().optional(),
  reason: z.string().trim().max(1000).nullable().optional(),
}).strict();

const voidProgressNoteSchema = z.object({
  reason: z.string().trim().min(3).max(1000),
}).strict();

const templateIdSchema = z.object({ templateId: z.coerce.number().int().positive() });
const clinicalTemplateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  specialtyId: z.string().trim().min(1).max(64),
  body: z.string().trim().min(1).max(10000),
  isActive: z.boolean().optional(),
}).strict();

async function clinicalAccess(req: Request) {
  const user = req.user as any;
  const permissions = (req as any).userPermissions ?? await getUserPermissions(user);
  return {
    userId: Number(user?.id),
    canViewPrivate: Boolean(user?.isSuperAdmin || permissions[PERMISSIONS.VIEW_PRIVATE_DENTAL_PROGRESS_NOTES]),
    canManageSettings: Boolean(user?.isSuperAdmin || permissions[PERMISSIONS.MANAGE_ERP_SETTINGS]),
  };
}

function canReadClinicalNote(note: { createdBy: number | null; isPrivate: boolean }, access: { userId: number; canViewPrivate: boolean }) {
  return !note.isPrivate || note.createdBy === access.userId || access.canViewPrivate;
}

async function resolveNoteTreatmentPlan(companyId: number, contactId: number, planId?: number | null) {
  if (planId == null) return { id: null, title: null };
  const plan = await storage.getDentalTreatmentPlan(companyId, planId);
  if (!plan || plan.contactId !== contactId) throw new ErpValidationError('Treatment plan does not belong to this patient');
  return { id: plan.id, title: plan.title };
}

async function auditDentalClinical(
  req: Request,
  params: {
    companyId: number;
    contactId: number;
    actionType: string;
    description: string;
    oldValues?: Record<string, unknown>;
    newValues?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  },
) {
  await logContactAudit({
    companyId: params.companyId,
    contactId: params.contactId,
    userId: (req.user as { id?: number } | undefined)?.id,
    actionType: params.actionType,
    actionCategory: 'dental_clinical',
    description: params.description,
    oldValues: params.oldValues ?? null,
    newValues: params.newValues ?? null,
    metadata: params.metadata ?? null,
    ipAddress: req.ip,
    userAgent: req.get('User-Agent'),
  });
}

async function recordDentalClinicalEvent(
  req: Request,
  params: {
    companyId: number;
    contactId: number;
    eventType: string;
    sourceType: string;
    sourceId?: number | string | null;
    title: string;
    description?: string | null;
    snapshot?: Record<string, unknown> | null;
    occurredAt?: Date;
  },
) {
  return storage.appendDentalClinicalEvent({
    companyId: params.companyId,
    contactId: params.contactId,
    eventType: params.eventType,
    sourceType: params.sourceType,
    sourceId: params.sourceId == null ? null : String(params.sourceId),
    eventKey: `${params.sourceType}:${params.sourceId ?? 'none'}:${params.eventType}:${randomUUID()}`,
    title: params.title,
    description: params.description ?? null,
    snapshot: params.snapshot ?? null,
    actorId: (req.user as any)?.id ?? null,
    occurredAt: params.occurredAt ?? new Date(),
  });
}

function handleRouteError(res: Response, error: unknown, logLabel: string) {
  if (error instanceof DentalReminderTimezoneError) return res.status(409).json({ success: false, code: error.code, status: error.status, error: error.message });
  if (error instanceof z.ZodError) {
    return res.status(400).json({ success: false, error: 'Validation failed', details: error.flatten() });
  }
  if (error instanceof DentalPhoneConflictError) {
    return res.status(409).json({
      success: false,
      error: error.message,
      code: error.code,
      contactId: error.contact.id,
      isPatient: error.isPatient,
      name: error.contact.name,
      phone: error.contact.phone,
      email: error.contact.email,
      whatsappUsername: error.contact.whatsappUsername ?? null,
      identityType: error.identityType,
    });
  }
  if (error instanceof WhatsAppUsernameCreationError) {
    return res.status(error.status).json({ success: false, code: error.code, error: error.message });
  }
  const mapped = getErpErrorResponse(error);
  if (mapped) return res.status(mapped.status).json({
    success: false,
    error: mapped.message,
    ...(mapped.code ? { code: mapped.code } : {}),
    ...(mapped.details !== undefined ? { details: mapped.details } : {}),
  });
  console.error(logLabel, error);
  return res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
}

async function canViewContactPhone(req: Request): Promise<boolean> {
  const user = req.user as { isSuperAdmin?: boolean } | undefined;
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  const permissions = await getUserPermissions(user as any);
  return permissions[PERMISSIONS.VIEW_CONTACT_PHONE] === true;
}

function maskContactPhone<T extends { phone?: string | null; identifier?: string | null }>(
  contact: T,
  allowPhone: boolean,
): T {
  if (allowPhone) return contact;
  return { ...contact, phone: null, identifier: null };
}

function parseDayBound(value: string, label: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new z.ZodError([
      { code: 'custom', message: `Invalid ${label}`, path: [label] },
    ]);
  }
  return date;
}

/** Minimal dental-gated health stub so `ensureDentalBusinessType` is verifiable. */
router.get('/health', async (req, res) => {
  const companyId = await ensureDentalBusinessType(req, res);
  if (!companyId) return;
  return res.json({ success: true, mode: 'dental', companyId });
});

router.get(
  '/patients/eligible-contacts',
  requireAnyPermission(['manage_dental_patients']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const query = eligibleSchema.parse(req.query);
      const allowPhone = await canViewContactPhone(req);
      const rows = await storage.listEligibleDentalContacts(companyId, query);
      return res.json({
        success: true,
        data: rows.map((row) => maskContactPhone(row, allowPhone)),
      });
    } catch (error) {
      return handleRouteError(res, error, 'Error listing eligible dental contacts:');
    }
  },
);

router.get(
  '/patients/lookup-by-phone',
  requireAnyPermission(['manage_dental_patients']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const query = lookupByPhoneSchema.parse(req.query);
      const allowPhone = await canViewContactPhone(req);
      const result = await storage.lookupDentalContactByPhone(companyId, query.phone);
      return res.json({
        success: true,
        data: {
          contact: result.contact ? maskContactPhone(result.contact, allowPhone) : null,
          isPatient: result.isPatient,
        },
      });
    } catch (error) {
      return handleRouteError(res, error, 'Error looking up dental contact by phone:');
    }
  },
);

router.post(
  '/patients/with-contact',
  requireAnyPermission(['manage_dental_patients']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;

      const user = req.user as { id?: number; isSuperAdmin?: boolean } | undefined;
      if (!user?.isSuperAdmin) {
        const permissions = await getUserPermissions(user as any);
        if (permissions[PERMISSIONS.CREATE_CONTACTS] !== true) {
          return res.status(403).json({
            success: false,
            error: 'Creating a new patient requires create contacts permission',
          });
        }
      }

      const body = createWithContactSchema.parse(req.body);
      const whatsappUsername = body.whatsappUsername
        ? normalizeUsername(body.whatsappUsername)
        : undefined;
      if (whatsappUsername && !validateUsername(whatsappUsername)) {
        return res.status(400).json({
          success: false,
          code: 'WHATSAPP_USERNAME_INVALID',
          error: 'WhatsApp username format is invalid',
        });
      }

      const [phoneMatch, usernameMatch] = await Promise.all([
        body.phone ? storage.lookupDentalContactByPhone(companyId, body.phone) : Promise.resolve(null),
        whatsappUsername
          ? storage.lookupDentalContactByWhatsAppUsername(companyId, whatsappUsername)
          : Promise.resolve(null),
      ]);
      if (phoneMatch?.contact && usernameMatch?.contact && phoneMatch.contact.id !== usernameMatch.contact.id) {
        return res.status(409).json({
          success: false,
          code: 'CONTACT_IDENTITIES_CONFLICT',
          error: 'The phone number and WhatsApp username belong to different contacts',
        });
      }
      const existingMatch = phoneMatch?.contact ? { ...phoneMatch, identityType: 'phone' as const } :
        usernameMatch?.contact ? { ...usernameMatch, identityType: 'whatsappUsername' as const } : null;
      if (existingMatch?.contact) {
        throw new DentalPhoneConflictError(existingMatch.contact, existingMatch.isPatient, existingMatch.identityType);
      }

      let customFields: Record<string, CustomFieldValue>;
      try {
        customFields = await validateEntityCustomFields({
          companyId,
          ownerType: 'contact',
          input: body.customFields,
          enforceRequired: true,
          allowMissingRequiredFiles: true,
        }) as Record<string, CustomFieldValue>;
      } catch (error) {
        if (error instanceof ContactCustomFieldValidationError) {
          return res.status(400).json({ success: false, error: error.message, fieldName: error.fieldName });
        }
        throw error;
      }
      let creationMeta: ContactCreationMeta = emptyContactCreationMeta();
      const connections = await storage.getChannelConnectionsByCompany(companyId);
      const resolvers = connections
        .filter(connection =>
          ['whatsapp', 'whatsapp_unofficial'].includes(connection.channelType) &&
          isChannelAvailable(connection)
        )
        .map(connection => getWhatsAppConnection(connection.id))
        .filter(Boolean)
        .map(socket => (username: string, key?: string) => resolveUsernameViaUSync(socket!, username, key));
      const prepared = await prepareInteractiveWhatsAppContact({
        companyId,
        name: body.name,
        phone: body.phone || null,
        whatsappUsername: whatsappUsername || null,
        identifierType: 'whatsapp_unofficial',
        source: 'dental',
      }, {
        usernameKey: body.whatsappUsernameKey,
        resolvers,
      });
      creationMeta = prepared.meta;
      const data = await storage.createDentalPatientWithNewContact(
        companyId,
        {
          name: body.name,
          phone: body.phone,
          whatsappUsername,
          whatsappLid: prepared.contact.whatsappLid,
          email: body.email,
          customFields,
        },
        { createdBy: user?.id ?? null },
      );

      await logContactAudit({
        companyId,
        contactId: data.contact.id,
        userId: user?.id,
        actionType: 'created',
        actionCategory: 'contact',
        description: `Dental patient contact created: ${data.contact.name}`,
        newValues: {
          name: data.contact.name,
          email: data.contact.email,
          phone: data.contact.phone,
          whatsappUsername: data.contact.whatsappUsername,
          source: 'dental',
          customFields: data.contact.customFields,
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });

      const allowPhone = await canViewContactPhone(req);
      return res.status(201).json({
        success: true,
        creationMeta,
        data: {
          ...data.profile,
          contact: maskContactPhone(data.contact, allowPhone),
        },
      });
    } catch (error) {
      return handleRouteError(res, error, 'Error creating dental patient with contact:');
    }
  },
);

router.post(
  '/patients/membership',
  requireAnyPermission(['view_dental_patients', 'manage_dental_patients']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const body = membershipSchema.parse(req.body);
      const data = await storage.listDentalPatientMembership(companyId, body.contactIds);
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error checking dental patient membership:');
    }
  },
);

router.get(
  '/patients',
  requireAnyPermission(['view_dental_patients', 'manage_dental_patients']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const query = listSchema.parse(req.query);
      const allowPhone = await canViewContactPhone(req);
      const result = await storage.listDentalPatients(companyId, {
        search: query.search,
        tag: query.tag,
        sex: query.sex,
        isActive: query.status === 'active' ? true : query.status === 'inactive' ? false : undefined,
        limit: query.limit,
        offset: query.offset,
      });
      return res.json({
        success: true,
        data: {
          ...result,
          data: result.data.map((row) => ({
            ...row,
            contact: maskContactPhone(row.contact, allowPhone),
          })),
        },
      });
    } catch (error) {
      return handleRouteError(res, error, 'Error listing dental patients:');
    }
  },
);

router.get(
  '/patients/stats',
  requireAnyPermission(['view_dental_patients', 'manage_dental_patients']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const data = await storage.getDentalPatientListStats(companyId);
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error getting dental patient stats:');
    }
  },
);

router.get(
  '/patients/:contactId',
  requireAnyPermission(['view_dental_patients', 'manage_dental_patients']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { contactId } = contactIdSchema.parse(req.params);
      const data = await storage.getDentalPatientByContactId(companyId, contactId);
      if (!data) return res.status(404).json({ success: false, error: 'Patient not found' });
      const allowPhone = await canViewContactPhone(req);
      return res.json({
        success: true,
        data: {
          ...data,
          contact: maskContactPhone(data.contact, allowPhone),
        },
      });
    } catch (error) {
      return handleRouteError(res, error, 'Error getting dental patient:');
    }
  },
);

router.post(
  '/patients',
  requireAnyPermission(['manage_dental_patients']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const body = createSchema.parse(req.body);
      const data = await storage.createDentalPatientProfile({ ...body, companyId });
      return res.status(201).json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error creating dental patient:');
    }
  },
);

router.patch(
  '/patients/:contactId',
  requireAnyPermission(['manage_dental_patients']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { contactId } = contactIdSchema.parse(req.params);
      const existing = await storage.getDentalPatientByContactId(companyId, contactId);
      if (!existing) return res.status(404).json({ success: false, error: 'Patient not found' });
      const updates = updateSchema.parse(req.body);
      const data = await storage.updateDentalPatientProfile(companyId, contactId, updates);
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error updating dental patient:');
    }
  },
);

router.patch(
  '/patients/:contactId/contact-custom-fields',
  requireAnyPermission(['view_dental_patients', 'manage_dental_patients']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const user = req.user as { id?: number; isSuperAdmin?: boolean } | undefined;
      let canViewDentalImaging = Boolean(user?.isSuperAdmin);
      if (!user?.isSuperAdmin) {
        const permissions = await getUserPermissions(user as any);
        if (permissions[PERMISSIONS.MANAGE_CONTACTS] !== true) {
          return res.status(403).json({ success: false, error: 'Manage contacts permission is required' });
        }
        canViewDentalImaging = permissions[PERMISSIONS.VIEW_DENTAL_IMAGING] === true;
      }

      const { contactId } = contactIdSchema.parse(req.params);
      const patient = await storage.getDentalPatientByContactId(companyId, contactId);
      if (!patient) return res.status(404).json({ success: false, error: 'Patient not found' });

      const body = contactCustomFieldsSchema.parse(req.body);
      let normalized: Record<string, CustomFieldValue>;
      try {
        normalized = await validateEntityCustomFields({
          companyId,
          ownerType: 'contact',
          ownerId: contactId,
          input: body.customFields,
          enforceRequired: true,
          existingValues: patient.contact.customFields as Record<string, unknown> | null,
          allowClinicalContactDocuments: canViewDentalImaging,
        }) as Record<string, CustomFieldValue>;
      } catch (error) {
        if (error instanceof ContactCustomFieldValidationError) {
          return res.status(400).json({ success: false, error: error.message, fieldName: error.fieldName });
        }
        throw error;
      }

      const previous = patient.contact.customFields && typeof patient.contact.customFields === 'object' && !Array.isArray(patient.contact.customFields)
        ? patient.contact.customFields as Record<string, unknown>
        : {};
      const updated = await storage.updateContact(contactId, { customFields: normalized });
      await removeUnreferencedCustomFieldAttachments({
        companyId,
        ownerType: 'contact',
        ownerId: contactId,
        customFields: normalized,
      });

      await logContactAudit({
        companyId,
        contactId,
        userId: user?.id,
        actionType: 'updated',
        actionCategory: 'contact',
        description: 'Contact custom fields updated from dental patient profile',
        oldValues: { customFields: previous },
        newValues: { customFields: normalized },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });

      return res.json({ success: true, data: { customFields: updated.customFields ?? {} } });
    } catch (error) {
      return handleRouteError(res, error, 'Error updating dental patient contact custom fields:');
    }
  },
);

router.delete(
  '/patients/:contactId',
  requireAnyPermission(['manage_dental_patients']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { contactId } = contactIdSchema.parse(req.params);
      const deleted = await storage.deleteDentalPatientProfile(companyId, contactId);
      if (!deleted) return res.status(404).json({ success: false, error: 'Patient not found' });
      return res.json({ success: true });
    } catch (error) {
      return handleRouteError(res, error, 'Error deleting dental patient:');
    }
  },
);

// --- Chairs ---

router.get(
  '/chairs',
  requireAnyPermission(['view_dental_schedule', 'manage_dental_schedule']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const activeOnly = req.query.activeOnly === 'true' || req.query.activeOnly === '1';
      const data = await storage.listDentalChairs(companyId, { activeOnly });
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error listing dental chairs:');
    }
  },
);

router.post(
  '/chairs',
  requireAnyPermission(['manage_dental_schedule']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const body = createChairSchema.parse(req.body);
      const data = await storage.createDentalChair({ ...body, companyId });
      return res.status(201).json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error creating dental chair:');
    }
  },
);

router.patch(
  '/chairs/:chairId',
  requireAnyPermission(['manage_dental_schedule']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { chairId } = chairIdSchema.parse(req.params);
      const updates = updateChairSchema.parse(req.body);
      const data = await storage.updateDentalChair(companyId, chairId, updates);
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error updating dental chair:');
    }
  },
);

router.delete(
  '/chairs/:chairId',
  requireAnyPermission(['manage_dental_schedule']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { chairId } = chairIdSchema.parse(req.params);
      const deleted = await storage.deleteDentalChair(companyId, chairId);
      if (!deleted) return res.status(404).json({ success: false, error: 'Chair not found' });
      return res.json({ success: true });
    } catch (error) {
      return handleRouteError(res, error, 'Error deleting dental chair:');
    }
  },
);

// --- Schedule ---

router.get(
  '/schedule/patient-options',
  requireAnyPermission(['view_dental_schedule', 'manage_dental_schedule']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const query = listSchema.parse(req.query);
      const result = await storage.listDentalPatients(companyId, {
        search: query.search,
        limit: Math.min(query.limit ?? 50, 100),
        offset: query.offset ?? 0,
      });
      return res.json({
        success: true,
        data: result.data.map((row) => ({
          contactId: row.contactId,
          name: row.contact.name,
        })),
      });
    } catch (error) {
      return handleRouteError(res, error, 'Error listing schedule patient options:');
    }
  },
);

router.get(
  '/schedule',
  requireAnyPermission(['view_dental_schedule', 'manage_dental_schedule']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const query = dentalScheduleListQuerySchema.parse(req.query);
      const timezone = await resolveDentalCompanyTimezone(companyId);
      const from = query.date
        ? parseInZoneToUTC(`${query.date}T00:00:00`, timezone)
        : query.fromDate
          ? parseInZoneToUTC(`${query.fromDate}T00:00:00`, timezone)
        : query.from
          ? parseDayBound(query.from, 'from')
          : undefined;
      const to = query.date
        ? parseInZoneToUTC(`${addOneDayDateKey(query.date)}T00:00:00`, timezone)
        : query.toDate
          ? parseInZoneToUTC(`${addOneDayDateKey(query.toDate)}T00:00:00`, timezone)
        : query.to
          ? parseDayBound(query.to, 'to')
          : undefined;
      if (from && to && to <= from) {
        return res.status(400).json({ success: false, error: '`to` must be after `from`' });
      }
      // `scheduled_at` is a legacy timestamp-without-time-zone column. Fetch a
      // padded range, then enforce the requested calendar day in the company's
      // timezone so host/browser timezone differences cannot shift rows a day.
      const dateQueryPaddingMs = 36 * 60 * 60 * 1000;
      const data = await storage.listDentalSchedule(companyId, {
        from: (query.date || query.fromDate) && from ? new Date(from.getTime() - dateQueryPaddingMs) : from,
        to: (query.date || query.toDate) && to ? new Date(to.getTime() + dateQueryPaddingMs) : to,
        providerUserId: query.providerUserId,
        chairId: query.chairId,
      });
      const allowPhone = await canViewContactPhone(req);
      const rows = query.date
        ? data.filter((appointment) =>
            getZonedDateTimeParts(appointment.scheduledAt, timezone).dateKey === query.date)
        : query.fromDate && query.toDate
          ? data.filter((appointment) => {
              const dateKey = getZonedDateTimeParts(appointment.scheduledAt, timezone).dateKey;
              return dateKey >= query.fromDate! && dateKey <= query.toDate!;
            })
          : data;
      return res.json({
        success: true,
        data: rows.map((row) => ({ ...row, contactPhone: allowPhone ? row.contactPhone : null })),
        timezone,
      });
    } catch (error) {
      return handleRouteError(res, error, 'Error listing dental schedule:');
    }
  },
);

router.get(
  '/schedule/upcoming',
  requireAnyPermission(['view_dental_schedule', 'manage_dental_schedule']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const query = dentalUpcomingScheduleQuerySchema.parse(req.query);
      const timezone = await resolveDentalCompanyTimezone(companyId);
      const data = await storage.listDentalSchedule(companyId, {
        from: new Date(),
        providerUserId: query.providerUserId,
        chairId: query.chairId,
      });
      const allowPhone = await canViewContactPhone(req);
      const activeStatuses = new Set(['scheduled', 'confirmed', 'held', 'pending_request']);
      const normalizedSearch = query.search?.toLocaleLowerCase() || '';
      const statusSearchLabels: Record<string, string> = query.locale?.toLowerCase().startsWith('es') ? {
        scheduled: 'programada', confirmed: 'confirmada', held: 'reservada', pending_request: 'solicitud pendiente',
      } : {
        scheduled: 'scheduled', confirmed: 'confirmed', held: 'held', pending_request: 'pending request',
      };
      const filtered = data.filter((row) => {
        if (!activeStatuses.has(row.status)) return false;
        if (query.serviceKey && row.bookingServiceKey !== query.serviceKey) return false;
        if (!normalizedSearch) return true;
        return [row.contactName, allowPhone ? row.contactPhone : null, row.bookingServiceLabel, row.title, row.providerName, row.chairName, statusSearchLabels[row.status] || row.status]
          .some((value) => String(value || '').toLocaleLowerCase().includes(normalizedSearch));
      }).sort((left, right) => new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime() || left.id - right.id);
      const serializable = filtered.map((row) => ({ ...row, scheduledAt: row.scheduledAt.toISOString() }));
      const sorted = sortDentalScheduleRows(serializable, query.sortBy, query.sortOrder);
      return res.json({
        success: true,
        data: sorted.slice(query.offset, query.offset + query.limit).map((row) => ({ ...row, contactPhone: allowPhone ? row.contactPhone : null })),
        total: sorted.length,
        timezone,
      });
    } catch (error) {
      return handleRouteError(res, error, 'Error listing upcoming dental appointments:');
    }
  },
);

router.get('/timezone', requireAnyPermission(['view_dental_schedule', 'manage_dental_schedule']), async (req, res) => {
  try {
    const companyId = await ensureDentalBusinessType(req, res);
    if (!companyId) return;
    return res.json(await getDentalReminderTimezone(companyId));
  } catch (error) { return handleRouteError(res, error, 'Error loading dental timezone:'); }
});

async function manualReminderValues(companyId: number, appointment: NonNullable<Awaited<ReturnType<typeof storage.getDentalScheduleAppointment>>>, timezone: string) {
  const [contact, company, appointments] = await Promise.all([
    storage.getContact(appointment.contactId), storage.getCompany(companyId), storage.listDentalSchedule(companyId, {}),
  ]);
  if (!contact || contact.companyId !== companyId) throw new Error('Patient unavailable');
  const details = appointments.find(item => item.id === appointment.id);
  return dentalReminderMessageValues({ appointment, contact, companyName: company?.name || '', timezone,
    providerName: details?.providerName, officeName: details?.chairName });
}

router.get(
  '/schedule/:appointmentId/reminder-context',
  requireAnyPermission(['view_dental_schedule', 'manage_dental_schedule']),
  requireAnyPermission([PERMISSIONS.MANAGE_CONVERSATIONS]),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { appointmentId } = scheduleIdSchema.parse(req.params);
      const appointment = await storage.getDentalScheduleAppointment(companyId, appointmentId);
      if (!appointment) return res.status(404).json({ success: false, code: 'APPOINTMENT_NOT_FOUND' });
      const connections = (await storage.getChannelConnectionsByCompany(companyId))
        .filter((channel) => channel.status === 'active');
      const activeIds = new Set(connections.map((channel) => channel.id));
      const conversations = (await storage.getConversationsByContact(appointment.contactId))
        .filter((conversation) => !conversation.isGroup && activeIds.has(conversation.channelId))
        .sort((a, b) => Number(new Date(b.lastMessageAt || 0)) - Number(new Date(a.lastMessageAt || 0)));
      const conversationOptions = await Promise.all(conversations.map(async (conversation) => {
        const latestInbound = [...(await storage.getMessagesByConversation(conversation.id))].reverse()
          .find((message) => message.direction === 'inbound');
        return {
          id: conversation.id,
          channelId: conversation.channelId,
          channelType: conversation.channelType,
          lastMessageAt: conversation.lastMessageAt,
          requiresApprovedTemplate: conversation.channelType === 'whatsapp_official'
            && (!latestInbound || Date.now() - Number(new Date(latestInbound.sentAt || latestInbound.createdAt || 0)) >= 24 * 60 * 60 * 1000),
        };
      }));
      const timezone = await getDentalReminderTimezone(companyId);
      const variables = timezone.status === 'valid' ? await manualReminderValues(companyId, appointment, timezone.timezone) : null;
      return res.json({
        success: true,
        data: {
          timezone, variables,
          defaultConversationId: conversations[0]?.id ?? null,
          defaultChannelId: conversations[0]?.channelId ?? null,
          conversations: conversationOptions,
        },
      });
    } catch (error) {
      return handleRouteError(res, error, 'Error loading appointment reminder context:');
    }
  },
);

router.post(
  '/schedule/:appointmentId/reminder-conversation',
  requireAnyPermission(['view_dental_schedule', 'manage_dental_schedule']),
  requireAnyPermission([PERMISSIONS.MANAGE_CONVERSATIONS]),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { appointmentId } = scheduleIdSchema.parse(req.params);
      const { channelId } = reminderChannelSchema.parse(req.body);
      const appointment = await storage.getDentalScheduleAppointment(companyId, appointmentId);
      if (!appointment) return res.status(404).json({ success: false, code: 'APPOINTMENT_NOT_FOUND' });
      const channel = await storage.getChannelConnection(channelId);
      if (!channel || channel.companyId !== companyId || channel.status !== 'active') return res.status(400).json({ success: false, code: 'CHANNEL_UNAVAILABLE' });
      if (!['whatsapp', 'whatsapp_unofficial', 'whatsapp_official'].includes(channel.channelType)) return res.status(400).json({ success: false, code: 'CHANNEL_CANNOT_START_CONVERSATION' });
      const existing = (await storage.getConversationsByContact(appointment.contactId)).find((item) => item.channelId === channelId && !item.isGroup);
      const conversation = existing || await storage.createConversation({ companyId, contactId: appointment.contactId, channelId, channelType: channel.channelType, status: 'open', assignedToUserId: (req.user as any).id, lastMessageAt: new Date() });
      return res.json({ success: true, data: { id: conversation.id, channelId: conversation.channelId, channelType: conversation.channelType } });
    } catch (error) {
      return handleRouteError(res, error, 'Error preparing reminder conversation:');
    }
  },
);

router.post(
  '/schedule/:appointmentId/reminder',
  requireAnyPermission(['view_dental_schedule', 'manage_dental_schedule']),
  requireAnyPermission([PERMISSIONS.MANAGE_CONVERSATIONS]),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { appointmentId } = scheduleIdSchema.parse(req.params);
      const body = reminderBodySchema.parse(req.body);
      const appointment = await storage.getDentalScheduleAppointment(companyId, appointmentId);
      if (!appointment) return res.status(404).json({ success: false, code: 'APPOINTMENT_NOT_FOUND' });
      const conversation = await storage.getConversation(body.conversationId);
      if (!conversation || conversation.companyId !== companyId || conversation.contactId !== appointment.contactId || conversation.isGroup) {
        return res.status(400).json({ success: false, code: 'INVALID_REMINDER_CHANNEL' });
      }
      const channel = await storage.getChannelConnection(conversation.channelId);
      if (!channel || channel.companyId !== companyId || channel.status !== 'active') {
        return res.status(400).json({ success: false, code: 'CHANNEL_UNAVAILABLE' });
      }
      const contact = await storage.getContact(appointment.contactId);
      if (!contact || contact.companyId !== companyId) return res.status(404).json({ success: false, code: 'PATIENT_NOT_FOUND' });
      const timezone = await resolveDentalReminderTimezone(companyId);
      const content = renderReminderTemplate(body.content, await manualReminderValues(companyId, appointment, timezone));
      const messages = await storage.getMessagesByConversation(conversation.id);
      const latestInbound = [...messages].reverse().find((message) => message.direction === 'inbound');
      if (conversation.channelType === 'whatsapp_official' && (!latestInbound || Date.now() - Number(new Date(latestInbound.sentAt || latestInbound.createdAt || 0)) >= 24 * 60 * 60 * 1000)) {
        return res.status(409).json({ success: false, code: 'OFFICIAL_TEMPLATE_REQUIRED' });
      }
      const recipient = channel.channelType === 'email'
        ? contact.email || contact.identifier
        : contact.identifier || contact.phone;
      if (!recipient) return res.status(400).json({ success: false, code: 'PATIENT_CHANNEL_IDENTITY_MISSING' });
      const result = await channelManager.sendDirectMessage(
        channel.channelType,
        recipient,
        'text',
        content,
        undefined,
        undefined,
        companyId,
        channel.id,
        (req.user as any).id,
      );
      if (!result.success) return res.status(502).json({ success: false, code: 'REMINDER_SEND_FAILED', error: result.error });
      await storage.updateConversation(conversation.id, { lastMessageAt: new Date() });
      broadcastToCompany({ type: 'conversationUpdated', data: await storage.getConversation(conversation.id) }, companyId);
      return res.json({ success: true, data: { conversationId: conversation.id, content } });
    } catch (error) {
      return handleRouteError(res, error, 'Error sending appointment reminder:');
    }
  },
);

const manualAvailabilityQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  contactId: z.coerce.number().int().positive(),
  providerUserId: z.coerce.number().int().positive(),
  catalogItemId: z.string().trim().min(1).max(64),
  appointmentId: z.coerce.number().int().positive().optional(),
});

router.get(
  '/schedule/availability',
  requireAnyPermission(['view_dental_schedule', 'manage_dental_schedule']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const query = manualAvailabilityQuerySchema.parse(req.query);
      const data = await getManualDentalAvailability({
        companyId,
        contactId: query.contactId,
        providerUserId: query.providerUserId,
        catalogItemId: query.catalogItemId,
        date: query.date,
        excludeAppointmentId: query.appointmentId,
      });
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error getting manual dental availability:');
    }
  },
);

const manualSlotEvaluationSchema = manualAvailabilityQuerySchema.omit({ appointmentId: true }).extend({
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  chairId: z.coerce.number().int().positive().nullable().optional(),
  appointmentId: z.coerce.number().int().positive().optional(),
});

router.post(
  '/schedule/validate-slot',
  requireAnyPermission(['manage_dental_schedule']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const body = manualSlotEvaluationSchema.parse(req.body);
      const data = await evaluateManualDentalLocalSlot({
        companyId,
        contactId: body.contactId,
        providerUserId: body.providerUserId,
        catalogItemId: body.catalogItemId,
        date: body.date,
        time: body.time,
        chairId: body.chairId,
        excludeAppointmentId: body.appointmentId,
      });
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error validating manual dental slot:');
    }
  },
);

router.post(
  '/schedule',
  requireAnyPermission(['manage_dental_schedule']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const body = createScheduleSchema.parse(req.body);
      const data = await createManualDentalAppointment(companyId, {
        ...body,
        providerUserId: body.providerUserId ?? null,
        recallDueAt: body.recallDueAt ? parseDayBound(body.recallDueAt, 'recallDueAt') : null,
      }, {
        userId: (req.user as { id?: number } | undefined)?.id ?? null,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });
      await recordDentalClinicalEvent(req, {
        companyId, contactId: data.contactId, eventType: data.isRecall ? 'recall_scheduled' : 'appointment_scheduled',
        sourceType: 'appointment', sourceId: data.id,
        title: data.isRecall ? 'Recall scheduled' : 'Appointment scheduled',
        description: data.title, snapshot: data as any, occurredAt: data.createdAt ?? new Date(),
      });
      return res.status(201).json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error creating dental appointment:');
    }
  },
);

router.patch(
  '/schedule/:appointmentId',
  requireAnyPermission(['manage_dental_schedule']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { appointmentId } = scheduleIdSchema.parse(req.params);
      const existingAppointment = await storage.getDentalScheduleAppointment(companyId, appointmentId);
      const body = updateScheduleSchema.parse(req.body);
      const data = await updateManualDentalAppointment(companyId, appointmentId, {
        ...body,
        recallDueAt: body.recallDueAt === undefined
          ? undefined
          : body.recallDueAt
            ? parseDayBound(body.recallDueAt, 'recallDueAt')
            : null,
      }, {
        userId: (req.user as { id?: number } | undefined)?.id ?? null,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });
      const eventType = body.status && body.status !== existingAppointment?.status
        ? `appointment_${body.status}`
        : body.scheduledAt && body.scheduledAt !== existingAppointment?.scheduledAt?.toISOString()
          ? 'appointment_rescheduled'
          : body.recallDueAt !== undefined
            ? 'recall_updated'
            : 'appointment_updated';
      await recordDentalClinicalEvent(req, {
        companyId, contactId: data.contactId, eventType, sourceType: 'appointment', sourceId: data.id,
        title: eventType.replaceAll('_', ' '), description: data.title,
        snapshot: { before: existingAppointment, after: data } as any,
      });
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error updating dental appointment:');
    }
  },
);

router.delete(
  '/schedule/:appointmentId',
  requireAnyPermission(['manage_dental_schedule']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { appointmentId } = scheduleIdSchema.parse(req.params);
      const existingAppointment = await storage.getDentalScheduleAppointment(companyId, appointmentId);
      if (!existingAppointment) return res.status(404).json({ success: false, error: 'Appointment not found' });
      const deleted = await storage.deleteDentalScheduleAppointment(companyId, appointmentId);
      if (!deleted) return res.status(404).json({ success: false, error: 'Appointment not found' });
      await recordDentalClinicalEvent(req, {
        companyId, contactId: existingAppointment.contactId, eventType: 'appointment_deleted',
        sourceType: 'appointment', sourceId: appointmentId, title: 'Appointment deleted',
        description: existingAppointment.title, snapshot: existingAppointment as any,
      });
      return res.json({ success: true });
    } catch (error) {
      return handleRouteError(res, error, 'Error deleting dental appointment:');
    }
  },
);

// --- Booking policy settings ---
router.get('/booking/reminder-options',
  requireAnyPermission(['view_dental_schedule', 'manage_dental_schedule']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { getDentalReminderOptions } = await import('../../services/dental-reminder-configuration');
      return res.json({ success: true, data: await getDentalReminderOptions(companyId) });
    } catch (error) { return handleRouteError(res, error, 'Error loading reminder options:'); }
  },
);

router.get('/booking/reminder-deliveries',
  requireAnyPermission(['view_dental_schedule', 'manage_dental_schedule']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { getPool } = await import('../../db');
      const result = await getPool().query(`SELECT appointment_id AS "appointmentId", rule_id AS "ruleId", status,
        scheduled_for AS "scheduledFor", sent_at AS "sentAt", last_error AS "lastError"
        FROM dental_appointment_reminders WHERE domain = 'dental' AND company_id = $1 ORDER BY updated_at DESC LIMIT 20`, [companyId]);
      return res.json({ success: true, data: result.rows });
    } catch (error) { return handleRouteError(res, error, 'Error loading reminder deliveries:'); }
  },
);

router.get(
  '/booking/settings',
  requireAnyPermission(['view_dental_schedule', 'manage_dental_schedule']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const policy = await getDentalBookingPolicy(companyId);
      return res.json({ success: true, data: policy });
    } catch (error) {
      return handleRouteError(res, error, 'Error getting dental booking settings:');
    }
  },
);

router.patch(
  '/booking/settings',
  requireAnyPermission(['manage_dental_schedule']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({ success: false, error: 'Validation failed', details: [] });
      }
      // Merge over the stored policy so a partial PATCH cannot silently reset untouched
      // sections back to their schema defaults.
      const current = await getDentalBookingPolicy(companyId);
      const merged = { ...current, ...req.body,
        ...(req.body.automaticReminders && typeof req.body.automaticReminders === 'object' && !Array.isArray(req.body.automaticReminders)
          ? { automaticReminders: { ...current.automaticReminders, ...req.body.automaticReminders } } : {}),
      } as {
        bookableCatalog?: Array<{ productId?: number | null }>;
      };
      const catalogProductIds = [
        ...new Set(
          (merged.bookableCatalog ?? [])
            .map((item) => item.productId)
            .filter((id): id is number => typeof id === 'number' && Number.isInteger(id) && id > 0),
        ),
      ];
      if (catalogProductIds.length > 0) {
        const products = await storage.getProductsByIds(companyId, catalogProductIds);
        const byId = new Map(products.map((product) => [product.id, product]));
        const productErrors: Array<{ path: string; message: string }> = [];
        for (const [index, item] of (merged.bookableCatalog ?? []).entries()) {
          if (item.productId == null) continue;
          const product = byId.get(item.productId);
          if (!product) {
            productErrors.push({
              path: `bookableCatalog.${index}.productId`,
              message: `Product ${item.productId} was not found`,
            });
            continue;
          }
          if (product.type !== 'service') {
            productErrors.push({
              path: `bookableCatalog.${index}.productId`,
              message: `Product ${item.productId} must be type service`,
            });
          }
        }
        if (productErrors.length > 0) {
          return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: productErrors,
          });
        }
      }

      const result = await saveDentalBookingPolicy(companyId, merged);
      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: result.errors,
        });
      }

      const { applyDentalAutoAddPolicyChange } = await import('../../services/dental-auto-add-service');
      const autoAdd = await applyDentalAutoAddPolicyChange(
        companyId,
        current.autoAddPatients,
        result.policy.autoAddPatients,
      );

      return res.json({ success: true, data: result.policy, autoAdd });
    } catch (error) {
      return handleRouteError(res, error, 'Error updating dental booking settings:');
    }
  },
);

router.get(
  '/booking/product-options',
  requireAnyPermission(['view_dental_schedule', 'manage_dental_schedule']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const query = listSchema.parse(req.query);
      const result = await storage.getProducts(companyId, {
        search: query.search,
        status: 'active',
        type: 'service',
        limit: Math.min(query.limit ?? 50, 100),
        offset: query.offset ?? 0,
      });
      return res.json({
        success: true,
        data: result.data.map((product) => ({
          id: product.id,
          name: product.name,
          sku: product.sku,
          estimatedDurationMinutes: product.estimatedDurationMinutes ?? null,
        })),
      });
    } catch (error) {
      return handleRouteError(res, error, 'Error listing dental booking product options:');
    }
  },
);

router.get(
  '/booking/settings/auto-add-preview',
  requireAnyPermission(['view_dental_schedule', 'manage_dental_schedule']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const data = await storage.countDentalAutoAddCandidates(companyId);
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error getting dental auto-add preview:');
    }
  },
);

const availabilityQuerySchema = z.object({
  providerUserId: z.coerce.number().int().positive(),
  catalogItemId: z.string().trim().min(1).max(64),
  from: z.string().min(1),
  to: z.string().min(1),
  limit: z.coerce.number().int().positive().max(DENTAL_AVAILABILITY_MAX_LIMIT).optional(),
});

router.get(
  '/booking/availability',
  requireAnyPermission(['view_dental_schedule', 'manage_dental_schedule']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const query = availabilityQuerySchema.parse(req.query);
      const data = await getDentalAvailableSlots(companyId, query);
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error getting dental booking availability:');
    }
  },
);

const bookAppointmentSchema = z.object({
  contactId: z.coerce.number().int().positive(),
  providerUserId: z.coerce.number().int().positive(),
  scheduledAt: z.string().min(1),
  catalogItemId: z.string().trim().min(1).max(64),
  bookingSource: z.enum(DENTAL_BOOKING_SOURCES).default('staff'),
  chairId: z.coerce.number().int().positive().nullable().optional(),
});

router.post(
  '/booking',
  requireAnyPermission(['manage_dental_schedule']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const body = bookAppointmentSchema.parse(req.body);
      const userId = (req.user as { id?: number } | undefined)?.id;
      const data = await bookDentalAppointment(companyId, body, userId);
      await recordDentalClinicalEvent(req, {
        companyId, contactId: data.contactId, eventType: 'appointment_booked', sourceType: 'appointment',
        sourceId: data.id, title: 'Appointment booked', description: data.title, snapshot: data as any,
      });
      return res.status(201).json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error booking dental appointment:');
    }
  },
);

const bookingAppointmentIdSchema = z.object({
  appointmentId: z.coerce.number().int().positive(),
});

const pendingBookingsQuerySchema = z.object({
  providerUserId: z.coerce.number().int().positive().optional(),
  from: z.string().min(1).optional(),
  to: z.string().min(1).optional(),
  status: z.enum(['held', 'pending_request', 'all']).optional(),
});

router.get(
  '/booking/pending',
  requireAnyPermission(['view_dental_schedule', 'manage_dental_schedule']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const query = pendingBookingsQuerySchema.parse(req.query);
      const data = await listPendingDentalBookings(companyId, query);
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error listing pending dental bookings:');
    }
  },
);

router.post(
  '/booking/:appointmentId/confirm',
  requireAnyPermission(['manage_dental_schedule']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { appointmentId } = bookingAppointmentIdSchema.parse(req.params);
      const data = await confirmDentalBooking(companyId, appointmentId);
      await recordDentalClinicalEvent(req, {
        companyId, contactId: data.contactId, eventType: 'appointment_confirmed', sourceType: 'appointment',
        sourceId: data.id, title: 'Appointment confirmed', description: data.title, snapshot: data as any,
      });
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error confirming dental booking:');
    }
  },
);

router.post(
  '/booking/:appointmentId/approve',
  requireAnyPermission(['manage_dental_schedule']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { appointmentId } = bookingAppointmentIdSchema.parse(req.params);
      const data = await approveDentalBookingRequest(companyId, appointmentId);
      await recordDentalClinicalEvent(req, {
        companyId, contactId: data.contactId, eventType: 'appointment_approved', sourceType: 'appointment',
        sourceId: data.id, title: 'Appointment request approved', description: data.title, snapshot: data as any,
      });
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error approving dental booking request:');
    }
  },
);

router.post(
  '/booking/:appointmentId/decline',
  requireAnyPermission(['manage_dental_schedule']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { appointmentId } = bookingAppointmentIdSchema.parse(req.params);
      const data = await declineDentalBooking(companyId, appointmentId);
      await recordDentalClinicalEvent(req, {
        companyId, contactId: data.contactId, eventType: 'appointment_declined', sourceType: 'appointment',
        sourceId: data.id, title: 'Appointment request declined', description: data.title, snapshot: data as any,
      });
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error declining dental booking:');
    }
  },
);

// --- Chart snapshots ---

router.get(
  '/chart/settings',
  requireAnyPermission(['view_dental_chart', 'edit_dental_chart']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const numberingSystem = await getCompanyToothNumbering(companyId);
      return res.json({ success: true, data: { numberingSystem } });
    } catch (error) {
      return handleRouteError(res, error, 'Error getting dental chart settings:');
    }
  },
);

router.patch(
  '/chart/settings',
  requireAnyPermission(['edit_dental_chart']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const body = chartSettingsSchema.parse(req.body);
      await storage.saveCompanySetting(companyId, DENTAL_TOOTH_NUMBERING_SETTING_KEY, body.numberingSystem);
      return res.json({ success: true, data: { numberingSystem: body.numberingSystem } });
    } catch (error) {
      return handleRouteError(res, error, 'Error updating dental chart settings:');
    }
  },
);

router.get(
  '/patients/:contactId/chart/latest',
  requireAnyPermission(['view_dental_chart', 'edit_dental_chart']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { contactId } = contactIdSchema.parse(req.params);
      const patient = await ensureDentalPatient(companyId, contactId);
      if (!patient) return res.status(404).json({ success: false, error: 'Patient not found' });
      const snapshot = await storage.getLatestDentalChartSnapshot(companyId, contactId);
      const numberingSystem = await getCompanyToothNumbering(companyId);
      return res.json({
        success: true,
        data: {
          snapshot: snapshot ?? null,
          numberingSystem,
          patient: { contactId: patient.contactId, name: patient.contact.name },
        },
      });
    } catch (error) {
      return handleRouteError(res, error, 'Error getting latest dental chart:');
    }
  },
);

router.get(
  '/patients/:contactId/chart/history',
  requireAnyPermission(['view_dental_chart', 'edit_dental_chart']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { contactId } = contactIdSchema.parse(req.params);
      const patient = await ensureDentalPatient(companyId, contactId);
      if (!patient) return res.status(404).json({ success: false, error: 'Patient not found' });
      const query = chartHistorySchema.parse(req.query);
      const data = await storage.listDentalChartSnapshotHistory(companyId, contactId, query);
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error listing dental chart history:');
    }
  },
);

router.get(
  '/patients/:contactId/chart/snapshots/:snapshotId',
  requireAnyPermission(['view_dental_chart', 'edit_dental_chart']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { contactId } = contactIdSchema.parse(req.params);
      const { snapshotId } = snapshotIdSchema.parse(req.params);
      const patient = await ensureDentalPatient(companyId, contactId);
      if (!patient) return res.status(404).json({ success: false, error: 'Patient not found' });
      const snapshot = await storage.getDentalChartSnapshot(companyId, snapshotId);
      if (!snapshot || snapshot.contactId !== contactId) {
        return res.status(404).json({ success: false, error: 'Snapshot not found' });
      }
      return res.json({ success: true, data: snapshot });
    } catch (error) {
      return handleRouteError(res, error, 'Error getting dental chart snapshot:');
    }
  },
);

router.post(
  '/patients/:contactId/chart/snapshots',
  requireAnyPermission(['edit_dental_chart']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { contactId } = contactIdSchema.parse(req.params);
      const patient = await ensureDentalPatient(companyId, contactId);
      if (!patient) return res.status(404).json({ success: false, error: 'Patient not found' });
      const body = createChartSnapshotSchema.parse(req.body);
      const numberingSystem = body.numberingSystem ?? (await getCompanyToothNumbering(companyId));
      const data = await storage.createDentalChartSnapshot({
        companyId,
        contactId,
        numberingSystem,
        payload: body.payload,
        createdBy: (req.user as { id?: number } | undefined)?.id ?? null,
      });
      await recordDentalClinicalEvent(req, {
        companyId, contactId, eventType: 'chart_snapshot_created', sourceType: 'chart_snapshot',
        sourceId: data.id, title: 'Dental chart snapshot saved', snapshot: { version: data.version, numberingSystem: data.numberingSystem },
      });
      return res.status(201).json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error creating dental chart snapshot:');
    }
  },
);

// --- Clinical notes, timeline, documents ---

router.get(
  '/clinical-document-categories',
  requireAnyPermission(['view_dental_imaging', 'manage_dental_imaging']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      return res.json({ success: true, data: DENTAL_CLINICAL_DOCUMENT_CATEGORIES });
    } catch (error) {
      return handleRouteError(res, error, 'Error listing clinical document categories:');
    }
  },
);

router.get(
  '/clinical-note-specialties',
  requireAnyPermission(['edit_dental_chart', 'view_erp_settings', 'manage_erp_settings']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const policy = await getDentalBookingPolicy(companyId);
      return res.json({ success: true, data: listResolvableSpecialties(policy) });
    } catch (error) {
      return handleRouteError(res, error, 'Error listing clinical note specialties:');
    }
  },
);

router.get(
  '/clinical-note-templates',
  requireAnyPermission(['edit_dental_chart', 'view_erp_settings', 'manage_erp_settings']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const access = await clinicalAccess(req);
      const includeInactive = req.query.includeInactive === 'true' && access.canManageSettings;
      const data = await storage.listDentalClinicalNoteTemplates(companyId, { activeOnly: !includeInactive });
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error listing clinical note templates:');
    }
  },
);

router.post(
  '/clinical-note-templates',
  requireAnyPermission(['manage_erp_settings']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const body = clinicalTemplateSchema.parse(req.body);
      const policy = await getDentalBookingPolicy(companyId);
      if (!collectKnownSpecialtyIds(policy.customSpecialties).has(body.specialtyId)) {
        return res.status(400).json({ success: false, error: 'Unknown dental specialty' });
      }
      const userId = (req.user as any)?.id ?? null;
      const data = await storage.createDentalClinicalNoteTemplate({
        companyId,
        ...body,
        isActive: body.isActive ?? true,
        createdBy: userId,
        updatedBy: userId,
      });
      return res.status(201).json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error creating clinical note template:');
    }
  },
);

router.patch(
  '/clinical-note-templates/:templateId',
  requireAnyPermission(['manage_erp_settings']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { templateId } = templateIdSchema.parse(req.params);
      const body = clinicalTemplateSchema.partial().parse(req.body);
      if (body.specialtyId) {
        const policy = await getDentalBookingPolicy(companyId);
        if (!collectKnownSpecialtyIds(policy.customSpecialties).has(body.specialtyId)) {
          return res.status(400).json({ success: false, error: 'Unknown dental specialty' });
        }
      }
      const data = await storage.updateDentalClinicalNoteTemplate(companyId, templateId, {
        ...body,
        updatedBy: (req.user as any)?.id ?? null,
      });
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error updating clinical note template:');
    }
  },
);

router.get(
  '/patients/:contactId/clinical-feed',
  requireAnyPermission(['view_dental_chart', 'edit_dental_chart']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { contactId } = contactIdSchema.parse(req.params);
      const patient = await ensureDentalPatient(companyId, contactId);
      if (!patient) return res.status(404).json({ success: false, error: 'Patient not found' });
      const query = clinicalFeedSchema.parse(req.query);
      const access = await clinicalAccess(req);
      const data = await storage.listDentalClinicalFeed(companyId, contactId, { ...query, ...access });
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error listing dental clinical feed:');
    }
  },
);

router.get(
  '/patients/:contactId/clinical-note-treatment-plans',
  requireAnyPermission(['edit_dental_chart']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { contactId } = contactIdSchema.parse(req.params);
      const patient = await ensureDentalPatient(companyId, contactId);
      if (!patient) return res.status(404).json({ success: false, error: 'Patient not found' });
      const result = await storage.listDentalTreatmentPlans(companyId, { contactId, limit: 100, offset: 0 });
      return res.json({ success: true, data: result.data.map((plan) => ({
        id: plan.id, title: plan.title, status: plan.status, estimatedTotal: plan.estimatedTotal, currency: plan.currency,
      })) });
    } catch (error) {
      return handleRouteError(res, error, 'Error listing patient treatment plans for clinical note:');
    }
  },
);

router.get(
  '/patients/:contactId/timeline',
  requireAnyPermission(['view_dental_chart', 'edit_dental_chart']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { contactId } = contactIdSchema.parse(req.params);
      const patient = await ensureDentalPatient(companyId, contactId);
      if (!patient) return res.status(404).json({ success: false, error: 'Patient not found' });
      const query = listSchema.parse(req.query);
      const access = await clinicalAccess(req);
      const timeline = await storage.listDentalPatientTimeline(companyId, contactId, { ...query, limit: 100 });
      const data = timeline.filter((entry) => entry.kind !== 'clinical_note' || canReadClinicalNote(entry, access));
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error listing dental patient timeline:');
    }
  },
);

router.get(
  '/patients/:contactId/clinical-notes',
  requireAnyPermission(['view_dental_chart', 'edit_dental_chart']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { contactId } = contactIdSchema.parse(req.params);
      const patient = await ensureDentalPatient(companyId, contactId);
      if (!patient) return res.status(404).json({ success: false, error: 'Patient not found' });
      const query = clinicalFeedSchema.parse({ ...req.query, filter: req.query.filter ?? 'all' });
      const access = await clinicalAccess(req);
      const feed = await storage.listDentalClinicalFeed(companyId, contactId, { ...query, ...access });
      const data = feed.filter((entry) => entry.kind === 'note');
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error listing dental clinical notes:');
    }
  },
);

router.post(
  '/patients/:contactId/clinical-notes',
  requireAnyPermission(['edit_dental_chart']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { contactId } = contactIdSchema.parse(req.params);
      const patient = await ensureDentalPatient(companyId, contactId);
      if (!patient) return res.status(404).json({ success: false, error: 'Patient not found' });
      const body = createProgressNoteSchema.parse(req.body);
      const plan = await resolveNoteTreatmentPlan(companyId, contactId, body.treatmentPlanId);
      const userId = (req.user as { id?: number } | undefined)?.id;
      if (!userId) return res.status(401).json({ success: false, error: 'Authenticated author required' });
      const data = await storage.createDentalClinicalNote({
        companyId,
        contactId,
        noteType: normalizeDentalClinicalNoteType(body.noteType),
        body: body.body,
        toothRefs: body.toothRefs ?? null,
        treatmentPlanId: plan.id,
        treatmentPlanTitleSnapshot: plan.title,
        isPrivate: body.isPrivate ?? false,
        createdBy: userId,
        updatedBy: userId,
      });
      await auditDentalClinical(req, {
        companyId,
        contactId,
        actionType: 'dental_clinical_note_created',
        description: `Clinical note created (${data.noteType})`,
        newValues: {
          noteId: data.id,
          noteType: data.noteType,
          body: data.body,
          toothRefs: data.toothRefs,
          treatmentPlanId: data.treatmentPlanId,
          isPrivate: data.isPrivate,
        },
      });
      return res.status(201).json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error creating dental clinical note:');
    }
  },
);

router.patch(
  '/patients/:contactId/clinical-notes/:noteId',
  requireAnyPermission(['edit_dental_chart']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { contactId } = contactIdSchema.parse(req.params);
      const { noteId } = noteIdSchema.parse(req.params);
      const patient = await ensureDentalPatient(companyId, contactId);
      if (!patient) return res.status(404).json({ success: false, error: 'Patient not found' });
      const existing = await storage.getDentalClinicalNote(companyId, noteId);
      if (!existing || existing.contactId !== contactId) {
        return res.status(404).json({ success: false, error: 'Clinical note not found' });
      }
      const access = await clinicalAccess(req);
      if (!canReadClinicalNote(existing, access)) {
        return res.status(404).json({ success: false, error: 'Clinical note not found' });
      }
      if (existing.voidedAt) return res.status(409).json({ success: false, error: 'Voided clinical notes cannot be amended' });
      const body = amendProgressNoteSchema.parse(req.body);
      const updates: Record<string, unknown> = { ...body };
      delete updates.reason;
      if (body.noteType != null) updates.noteType = normalizeDentalClinicalNoteType(body.noteType);
      if (body.treatmentPlanId !== undefined) {
        const plan = await resolveNoteTreatmentPlan(companyId, contactId, body.treatmentPlanId);
        updates.treatmentPlanId = plan.id;
        updates.treatmentPlanTitleSnapshot = plan.title;
      }
      const data = await storage.amendDentalClinicalNote(companyId, noteId, updates as any, access.userId, body.reason);
      await auditDentalClinical(req, {
        companyId,
        contactId,
        actionType: 'dental_clinical_note_updated',
        description: `Clinical note updated (${data.noteType})`,
        oldValues: {
          noteType: existing.noteType,
          body: existing.body,
          toothRefs: existing.toothRefs,
        },
        newValues: {
          noteType: data.noteType,
          body: data.body,
          toothRefs: data.toothRefs,
          treatmentPlanId: data.treatmentPlanId,
        },
        metadata: { noteId: data.id },
      });
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error updating dental clinical note:');
    }
  },
);

router.post(
  '/patients/:contactId/clinical-notes/:noteId/void',
  requireAnyPermission(['edit_dental_chart']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { contactId } = contactIdSchema.parse(req.params);
      const { noteId } = noteIdSchema.parse(req.params);
      const body = voidProgressNoteSchema.parse(req.body);
      const existing = await storage.getDentalClinicalNote(companyId, noteId);
      const access = await clinicalAccess(req);
      if (!existing || existing.contactId !== contactId || !canReadClinicalNote(existing, access)) {
        return res.status(404).json({ success: false, error: 'Clinical note not found' });
      }
      if (existing.createdBy !== access.userId && !access.canViewPrivate) {
        return res.status(403).json({ success: false, error: 'Only the author or an authorized clinical administrator may void this note' });
      }
      const data = await storage.voidDentalClinicalNote(companyId, noteId, access.userId, body.reason);
      await auditDentalClinical(req, {
        companyId, contactId, actionType: 'dental_clinical_note_voided',
        description: `Clinical note voided (${existing.noteType})`,
        oldValues: { noteId, voidedAt: null },
        newValues: { noteId, voidedAt: data.voidedAt, voidReason: data.voidReason },
      });
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error voiding dental clinical note:');
    }
  },
);

router.get(
  '/patients/:contactId/clinical-notes/:noteId/history',
  requireAnyPermission(['view_dental_chart', 'edit_dental_chart']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { contactId } = contactIdSchema.parse(req.params);
      const { noteId } = noteIdSchema.parse(req.params);
      const note = await storage.getDentalClinicalNote(companyId, noteId);
      const access = await clinicalAccess(req);
      if (!note || note.contactId !== contactId || !canReadClinicalNote(note, access)) {
        return res.status(404).json({ success: false, error: 'Clinical note not found' });
      }
      return res.json({ success: true, data: await storage.listDentalClinicalNoteRevisions(companyId, noteId) });
    } catch (error) {
      return handleRouteError(res, error, 'Error listing clinical note history:');
    }
  },
);

router.get(
  '/patients/:contactId/clinical-notes/:noteId/pdf',
  requireAnyPermission(['view_dental_chart', 'edit_dental_chart']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { contactId } = contactIdSchema.parse(req.params);
      const { noteId } = noteIdSchema.parse(req.params);
      const note = await storage.getDentalClinicalNote(companyId, noteId);
      const access = await clinicalAccess(req);
      if (!note || note.contactId !== contactId || !canReadClinicalNote(note, access)) {
        return res.status(404).json({ success: false, error: 'Clinical note not found' });
      }
      const [patient, company, author, revisions] = await Promise.all([
        storage.getDentalPatientByContactId(companyId, contactId),
        storage.getCompany(companyId),
        note.createdBy ? storage.getUser(note.createdBy) : Promise.resolve(undefined),
        storage.listDentalClinicalNoteRevisions(companyId, noteId),
      ]);
      if (!patient) return res.status(404).json({ success: false, error: 'Patient not found' });
      const pdf = await generateDentalClinicalNotePdf({
        note: { ...note, authorName: author?.fullName ?? null }, revisions,
        patientName: patient.contact.name,
        patientReference: `P-${String(patient.id).padStart(5, '0')}`,
        companyName: company?.name ?? '',
        language: (req.user as any)?.languagePreference ?? 'en',
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="clinical-note-${note.id}.pdf"`);
      res.setHeader('Cache-Control', 'private, no-store');
      return res.send(pdf);
    } catch (error) {
      return handleRouteError(res, error, 'Error generating clinical note PDF:');
    }
  },
);

router.get(
  '/patients/:contactId/vitals',
  requireAnyPermission(['view_dental_patients', 'manage_dental_patients']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { contactId } = contactIdSchema.parse(req.params);
      if (!(await ensureDentalPatient(companyId, contactId))) {
        return res.status(404).json({ success: false, error: 'Patient not found' });
      }
      const [data, timezone] = await Promise.all([
        storage.listDentalPatientVitals(companyId, contactId),
        resolveDentalCompanyTimezone(companyId),
      ]);
      return res.json({ success: true, data, timezone });
    } catch (error) {
      return handleRouteError(res, error, 'Error listing patient vitals:');
    }
  },
);

router.post(
  '/patients/:contactId/vitals',
  requireAnyPermission(['manage_dental_patients']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { contactId } = contactIdSchema.parse(req.params);
      if (!(await ensureDentalPatient(companyId, contactId))) {
        return res.status(404).json({ success: false, error: 'Patient not found' });
      }
      const body = dentalPatientVitalInputSchema.parse(req.body);
      const userId = (req.user as { id?: number } | undefined)?.id ?? null;
      const data = await storage.createDentalPatientVital({
        ...body,
        notes: body.notes || null,
        companyId,
        contactId,
        createdBy: userId,
        updatedBy: userId,
      });
      await auditDentalClinical(req, {
        companyId, contactId, actionType: 'dental_patient_vital_created',
        description: 'Patient vital recorded', newValues: { ...body, id: data.id },
      });
      return res.status(201).json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error recording patient vital:');
    }
  },
);

router.patch(
  '/patients/:contactId/vitals/:recordId',
  requireAnyPermission(['manage_dental_patients']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { contactId } = contactIdSchema.parse(req.params);
      const { recordId } = clinicalRecordIdSchema.parse(req.params);
      const existing = await storage.getDentalPatientVital(companyId, recordId);
      if (!existing || existing.contactId !== contactId) {
        return res.status(404).json({ success: false, error: 'Patient vital not found' });
      }
      const body = vitalUpdateSchema.parse(req.body);
      const data = await storage.updateDentalPatientVital(companyId, recordId, {
        ...body,
        ...(body.notes !== undefined ? { notes: body.notes || null } : {}),
        updatedBy: (req.user as { id?: number } | undefined)?.id ?? null,
      });
      await auditDentalClinical(req, {
        companyId, contactId, actionType: 'dental_patient_vital_updated',
        description: 'Patient vital updated', oldValues: existing as any, newValues: data as any,
      });
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error updating patient vital:');
    }
  },
);

router.delete(
  '/patients/:contactId/vitals/:recordId',
  requireAnyPermission(['manage_dental_patients']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { contactId } = contactIdSchema.parse(req.params);
      const { recordId } = clinicalRecordIdSchema.parse(req.params);
      const existing = await storage.getDentalPatientVital(companyId, recordId);
      if (!existing || existing.contactId !== contactId) {
        return res.status(404).json({ success: false, error: 'Patient vital not found' });
      }
      await storage.deleteDentalPatientVital(companyId, recordId);
      await auditDentalClinical(req, {
        companyId, contactId, actionType: 'dental_patient_vital_deleted',
        description: 'Patient vital deleted', oldValues: existing as any,
      });
      return res.json({ success: true });
    } catch (error) {
      return handleRouteError(res, error, 'Error deleting patient vital:');
    }
  },
);

router.get(
  '/patients/:contactId/infectious-tests',
  requireAnyPermission(['view_dental_patients', 'manage_dental_patients']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { contactId } = contactIdSchema.parse(req.params);
      if (!(await ensureDentalPatient(companyId, contactId))) {
        return res.status(404).json({ success: false, error: 'Patient not found' });
      }
      return res.json({ success: true, data: await storage.listDentalPatientInfectiousTests(companyId, contactId) });
    } catch (error) {
      return handleRouteError(res, error, 'Error listing infectious screening records:');
    }
  },
);

router.post(
  '/patients/:contactId/infectious-tests',
  requireAnyPermission(['manage_dental_patients']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { contactId } = contactIdSchema.parse(req.params);
      if (!(await ensureDentalPatient(companyId, contactId))) {
        return res.status(404).json({ success: false, error: 'Patient not found' });
      }
      const body = dentalPatientInfectiousTestInputSchema.parse(req.body);
      const userId = (req.user as { id?: number } | undefined)?.id ?? null;
      const data = await storage.createDentalPatientInfectiousTest({
        ...body,
        testDate: body.testDate || null,
        notes: body.notes || null,
        companyId,
        contactId,
        createdBy: userId,
        updatedBy: userId,
      });
      await auditDentalClinical(req, {
        companyId, contactId, actionType: 'dental_patient_infectious_test_created',
        description: 'Infectious screening record created', newValues: { ...body, id: data.id },
      });
      return res.status(201).json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error creating infectious screening record:');
    }
  },
);

router.patch(
  '/patients/:contactId/infectious-tests/:recordId',
  requireAnyPermission(['manage_dental_patients']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { contactId } = contactIdSchema.parse(req.params);
      const { recordId } = clinicalRecordIdSchema.parse(req.params);
      const existing = await storage.getDentalPatientInfectiousTest(companyId, recordId);
      if (!existing || existing.contactId !== contactId) {
        return res.status(404).json({ success: false, error: 'Infectious screening record not found' });
      }
      const body = infectiousTestUpdateSchema.parse(req.body);
      const data = await storage.updateDentalPatientInfectiousTest(companyId, recordId, {
        ...body,
        ...(body.testDate !== undefined ? { testDate: body.testDate || null } : {}),
        ...(body.notes !== undefined ? { notes: body.notes || null } : {}),
        updatedBy: (req.user as { id?: number } | undefined)?.id ?? null,
      });
      await auditDentalClinical(req, {
        companyId, contactId, actionType: 'dental_patient_infectious_test_updated',
        description: 'Infectious screening record updated', oldValues: existing as any, newValues: data as any,
      });
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error updating infectious screening record:');
    }
  },
);

router.delete(
  '/patients/:contactId/infectious-tests/:recordId',
  requireAnyPermission(['manage_dental_patients']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { contactId } = contactIdSchema.parse(req.params);
      const { recordId } = clinicalRecordIdSchema.parse(req.params);
      const existing = await storage.getDentalPatientInfectiousTest(companyId, recordId);
      if (!existing || existing.contactId !== contactId) {
        return res.status(404).json({ success: false, error: 'Infectious screening record not found' });
      }
      await storage.deleteDentalPatientInfectiousTest(companyId, recordId);
      await auditDentalClinical(req, {
        companyId, contactId, actionType: 'dental_patient_infectious_test_deleted',
        description: 'Infectious screening record deleted', oldValues: existing as any,
      });
      return res.json({ success: true });
    } catch (error) {
      return handleRouteError(res, error, 'Error deleting infectious screening record:');
    }
  },
);

router.delete(
  '/patients/:contactId/clinical-notes/:noteId',
  requireAnyPermission(['edit_dental_chart']),
  (_req, res) => res.status(405).json({ success: false, error: 'Clinical notes cannot be deleted; use the void action instead' }),
);

router.get(
  '/patients/:contactId/clinical-documents',
  requireAnyPermission(['view_dental_imaging', 'manage_dental_imaging']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { contactId } = contactIdSchema.parse(req.params);
      const patient = await ensureDentalPatient(companyId, contactId);
      if (!patient) return res.status(404).json({ success: false, error: 'Patient not found' });
      const documents = await storage.getContactDocuments(contactId);
      const data = documents.filter((doc) => isDentalClinicalDocumentCategory(doc.category));
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error listing clinical documents:');
    }
  },
);

// --- Treatment plans ---

const planIdSchema = z.object({
  planId: z.coerce.number().int().positive(),
});

const procedureIdSchema = z.object({
  procedureId: z.coerce.number().int().positive(),
});

const treatmentPlanListSchema = z.object({
  contactId: z.coerce.number().int().positive().optional(),
  status: z.enum(DENTAL_TREATMENT_PLAN_STATUSES).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().optional(),
  offset: z.coerce.number().int().optional(),
});

const procedureInputSchema = z.object({
  productId: z.coerce.number().int().positive().nullable().optional(),
  description: z.string().trim().min(1).max(500),
  toothRefs: z.array(z.string().trim().min(1).max(8)).max(32).nullable().optional(),
  surfaces: z.string().trim().max(64).nullable().optional(),
  phase: z.coerce.number().int().positive().max(20).optional(),
  status: z.enum(DENTAL_TREATMENT_PROCEDURE_CLINICAL_STATUSES).optional(),
  quantity: z.coerce.number().positive().max(1000).optional(),
  unitPrice: z.coerce.number().min(0).max(1_000_000).optional(),
  estimatedAmount: z.coerce.number().min(0).max(10_000_000).optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

const createTreatmentPlanSchema = z.object({
  contactId: z.coerce.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).nullable().optional(),
  status: z.enum(DENTAL_TREATMENT_PLAN_CLINICAL_STATUSES).optional(),
  currency: z.string().trim().min(1).max(8).optional(),
  procedures: z.array(procedureInputSchema).max(100).optional(),
});

const updateTreatmentPlanSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  status: z.enum(DENTAL_TREATMENT_PLAN_CLINICAL_STATUSES).optional(),
  currency: z.string().trim().min(1).max(8).optional(),
});

const updateProcedureSchema = procedureInputSchema.partial();

function mapProcedureInput(body: z.infer<typeof procedureInputSchema>) {
  const quantity = body.quantity ?? 1;
  const unitPrice = body.unitPrice ?? 0;
  return {
    productId: body.productId ?? null,
    description: body.description,
    toothRefs: body.toothRefs ?? null,
    surfaces: body.surfaces ?? null,
    phase: body.phase ?? 1,
    status: normalizeDentalTreatmentProcedureClinicalStatus(body.status),
    quantity: String(quantity),
    unitPrice: String(unitPrice),
    estimatedAmount: String(body.estimatedAmount ?? quantity * unitPrice),
    sortOrder: body.sortOrder,
    notes: body.notes ?? null,
  };
}

router.get(
  '/treatment-plans/product-options',
  requireAnyPermission(DENTAL_TREATMENT_PLAN_READ_PERMISSIONS),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const query = listSchema.parse(req.query);
      const result = await storage.getProducts(companyId, {
        search: query.search,
        status: 'active',
        type: 'service',
        limit: Math.min(query.limit ?? 50, 100),
        offset: query.offset ?? 0,
      });
      return res.json({
        success: true,
        data: result.data.map((product) => ({
          id: product.id,
          name: product.name,
          sku: product.sku,
          unitPrice: product.unitPrice,
          currency: product.currency,
          type: product.type,
          estimatedDurationMinutes: product.estimatedDurationMinutes ?? null,
        })),
      });
    } catch (error) {
      return handleRouteError(res, error, 'Error listing treatment plan product options:');
    }
  },
);

router.get(
  '/treatment-plans/patient-options',
  requireAnyPermission(DENTAL_TREATMENT_PLAN_READ_PERMISSIONS),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const query = listSchema.parse(req.query);
      const result = await storage.listDentalPatients(companyId, {
        search: query.search,
        limit: Math.min(query.limit ?? 50, 100),
        offset: query.offset ?? 0,
      });
      return res.json({
        success: true,
        data: result.data.map((row) => ({
          contactId: row.contactId,
          name: row.contact.name,
        })),
      });
    } catch (error) {
      return handleRouteError(res, error, 'Error listing treatment plan patient options:');
    }
  },
);

router.get(
  '/treatment-plans',
  requireAnyPermission(DENTAL_TREATMENT_PLAN_READ_PERMISSIONS),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const query = treatmentPlanListSchema.parse(req.query);
      const data = await storage.listDentalTreatmentPlans(companyId, query);
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error listing dental treatment plans:');
    }
  },
);

router.get(
  '/treatment-plans/:planId',
  requireAnyPermission(DENTAL_TREATMENT_PLAN_READ_PERMISSIONS),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { planId } = planIdSchema.parse(req.params);
      const data = await storage.getDentalTreatmentPlan(companyId, planId);
      if (!data) return res.status(404).json({ success: false, error: 'Treatment plan not found' });
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error getting dental treatment plan:');
    }
  },
);

router.post(
  '/treatment-plans',
  requireAnyPermission(['manage_dental_treatment_plans']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const body = createTreatmentPlanSchema.parse(req.body);
      const userId = (req.user as { id?: number } | undefined)?.id ?? null;
      const currency = await resolveCompanyCurrencyCode(companyId, body.currency);
      const data = await storage.createDentalTreatmentPlan(
        {
          companyId,
          contactId: body.contactId,
          title: body.title,
          description: body.description ?? null,
          status: normalizeDentalTreatmentPlanClinicalStatus(body.status),
          currency,
          estimatedTotal: '0',
          salesOrderId: null,
          createdBy: userId,
          updatedBy: userId,
        },
        (body.procedures ?? []).map(mapProcedureInput),
      );
      await recordDentalClinicalEvent(req, {
        companyId, contactId: data.contactId, eventType: 'treatment_plan_created', sourceType: 'treatment_plan',
        sourceId: data.id, title: 'Treatment plan created', description: data.title, snapshot: data as any,
      });
      return res.status(201).json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error creating dental treatment plan:');
    }
  },
);

router.patch(
  '/treatment-plans/:planId',
  requireAnyPermission(['manage_dental_treatment_plans']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { planId } = planIdSchema.parse(req.params);
      const existingPlan = await storage.getDentalTreatmentPlan(companyId, planId);
      if (!existingPlan) return res.status(404).json({ success: false, error: 'Treatment plan not found' });
      const body = updateTreatmentPlanSchema.parse(req.body);
      const updates: Record<string, unknown> = { ...body };
      if (body.status != null) updates.status = normalizeDentalTreatmentPlanClinicalStatus(body.status);
      updates.updatedBy = (req.user as { id?: number } | undefined)?.id ?? null;
      const data = await storage.updateDentalTreatmentPlan(companyId, planId, updates as any);
      await recordDentalClinicalEvent(req, {
        companyId, contactId: existingPlan.contactId,
        eventType: body.status && body.status !== existingPlan.status ? `treatment_plan_${data.status}` : 'treatment_plan_updated',
        sourceType: 'treatment_plan', sourceId: data.id, title: 'Treatment plan updated',
        description: data.title, snapshot: { before: existingPlan, after: data } as any,
      });
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error updating dental treatment plan:');
    }
  },
);

router.delete(
  '/treatment-plans/:planId',
  requireAnyPermission(['manage_dental_treatment_plans']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { planId } = planIdSchema.parse(req.params);
      const existingPlan = await storage.getDentalTreatmentPlan(companyId, planId);
      if (!existingPlan) return res.status(404).json({ success: false, error: 'Treatment plan not found' });
      const deleted = await storage.deleteDentalTreatmentPlan(companyId, planId);
      if (!deleted) return res.status(404).json({ success: false, error: 'Treatment plan not found' });
      await recordDentalClinicalEvent(req, {
        companyId, contactId: existingPlan.contactId, eventType: 'treatment_plan_deleted', sourceType: 'treatment_plan',
        sourceId: planId, title: 'Treatment plan deleted', description: existingPlan.title, snapshot: existingPlan as any,
      });
      return res.json({ success: true });
    } catch (error) {
      return handleRouteError(res, error, 'Error deleting dental treatment plan:');
    }
  },
);

router.post(
  '/treatment-plans/:planId/procedures',
  requireAnyPermission(['manage_dental_treatment_plans']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { planId } = planIdSchema.parse(req.params);
      const body = procedureInputSchema.parse(req.body);
      const plan = await storage.getDentalTreatmentPlan(companyId, planId);
      if (!plan) return res.status(404).json({ success: false, error: 'Treatment plan not found' });
      const data = await storage.createDentalTreatmentProcedure(companyId, planId, mapProcedureInput(body));
      await recordDentalClinicalEvent(req, {
        companyId, contactId: plan.contactId, eventType: 'procedure_added', sourceType: 'treatment_procedure',
        sourceId: data.id, title: 'Treatment procedure added', description: data.description, snapshot: data as any,
      });
      return res.status(201).json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error creating dental treatment procedure:');
    }
  },
);

router.patch(
  '/treatment-plans/:planId/procedures/:procedureId',
  requireAnyPermission(['manage_dental_treatment_plans']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { planId } = planIdSchema.parse(req.params);
      const { procedureId } = procedureIdSchema.parse(req.params);
      const plan = await storage.getDentalTreatmentPlan(companyId, planId);
      if (!plan) return res.status(404).json({ success: false, error: 'Treatment plan not found' });
      if (!plan.procedures.some((p) => p.id === procedureId)) {
        return res.status(404).json({ success: false, error: 'Procedure not found' });
      }
      const body = updateProcedureSchema.parse(req.body);
      const updates: Record<string, unknown> = { ...body };
      if (body.status != null) updates.status = normalizeDentalTreatmentProcedureClinicalStatus(body.status);
      if (body.quantity != null) updates.quantity = String(body.quantity);
      if (body.unitPrice != null) updates.unitPrice = String(body.unitPrice);
      if (body.estimatedAmount != null) updates.estimatedAmount = String(body.estimatedAmount);
      if (body.toothRefs !== undefined) updates.toothRefs = body.toothRefs;
      if (body.surfaces !== undefined) updates.surfaces = body.surfaces;
      if (body.notes !== undefined) updates.notes = body.notes;
      if (body.productId !== undefined) updates.productId = body.productId;
      const data = await storage.updateDentalTreatmentProcedure(companyId, procedureId, updates as any);
      const previous = plan.procedures.find((p) => p.id === procedureId)!;
      await recordDentalClinicalEvent(req, {
        companyId, contactId: plan.contactId,
        eventType: body.status && body.status !== previous.status ? `procedure_${data.status}` : 'procedure_updated',
        sourceType: 'treatment_procedure', sourceId: data.id, title: 'Treatment procedure updated',
        description: data.description, snapshot: { before: previous, after: data } as any,
      });
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error updating dental treatment procedure:');
    }
  },
);

router.delete(
  '/treatment-plans/:planId/procedures/:procedureId',
  requireAnyPermission(['manage_dental_treatment_plans']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { planId } = planIdSchema.parse(req.params);
      const { procedureId } = procedureIdSchema.parse(req.params);
      const plan = await storage.getDentalTreatmentPlan(companyId, planId);
      if (!plan) return res.status(404).json({ success: false, error: 'Treatment plan not found' });
      if (!plan.procedures.some((p) => p.id === procedureId)) {
        return res.status(404).json({ success: false, error: 'Procedure not found' });
      }
      const existingProcedure = plan.procedures.find((p) => p.id === procedureId)!;
      const deleted = await storage.deleteDentalTreatmentProcedure(companyId, procedureId);
      if (!deleted) return res.status(404).json({ success: false, error: 'Procedure not found' });
      await recordDentalClinicalEvent(req, {
        companyId, contactId: plan.contactId, eventType: 'procedure_deleted', sourceType: 'treatment_procedure',
        sourceId: procedureId, title: 'Treatment procedure deleted', description: existingProcedure.description,
        snapshot: existingProcedure as any,
      });
      return res.json({ success: true });
    } catch (error) {
      return handleRouteError(res, error, 'Error deleting dental treatment procedure:');
    }
  },
);

const approvalBodySchema = z.object({
  decision: z.enum(['approved', 'rejected']).optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

router.get(
  '/treatment-plans/:planId/approvals',
  requireAnyPermission(DENTAL_TREATMENT_PLAN_READ_PERMISSIONS),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { planId } = planIdSchema.parse(req.params);
      const plan = await storage.getDentalTreatmentPlan(companyId, planId);
      if (!plan) return res.status(404).json({ success: false, error: 'Treatment plan not found' });
      const data = await storage.listDentalPlanApprovals(companyId, planId);
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error listing dental plan approvals:');
    }
  },
);

router.post(
  '/treatment-plans/:planId/create-quotation',
  requireAnyPermission(['create_quotations', 'manage_sales_orders']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { planId } = planIdSchema.parse(req.params);
      const userId = (req.user as { id?: number } | undefined)?.id ?? null;
      const plan = await storage.getDentalTreatmentPlan(companyId, planId);
      if (!plan) return res.status(404).json({ success: false, error: 'Treatment plan not found' });
      const data = await storage.createDentalTreatmentPlanQuotation(companyId, planId, userId);
      await recordDentalClinicalEvent(req, {
        companyId, contactId: plan.contactId, eventType: 'treatment_plan_quotation_created', sourceType: 'treatment_plan',
        sourceId: planId, title: 'Treatment plan quotation created', description: plan.title,
        snapshot: { salesOrderId: data.salesOrder.id, orderNumber: data.salesOrder.orderNumber } as any,
      });
      return res.status(201).json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error creating quotation from treatment plan:');
    }
  },
);

router.post(
  '/treatment-plans/:planId/approvals',
  requireAnyPermission(['manage_dental_treatment_plans']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { planId } = planIdSchema.parse(req.params);
      const body = approvalBodySchema.parse(req.body ?? {});
      const userId = (req.user as { id?: number } | undefined)?.id ?? null;
      const plan = await storage.getDentalTreatmentPlan(companyId, planId);
      if (!plan) return res.status(404).json({ success: false, error: 'Treatment plan not found' });
      const data = await storage.createDentalPlanApproval(companyId, planId, {
        decision: body.decision,
        notes: body.notes,
        approvedBy: userId,
      });
      await recordDentalClinicalEvent(req, {
        companyId, contactId: plan.contactId, eventType: `treatment_plan_${data.approval.decision}`,
        sourceType: 'treatment_plan_approval', sourceId: data.approval.id,
        title: `Treatment plan ${data.approval.decision}`, description: body.notes ?? plan.title,
        snapshot: data.approval as any,
      });
      return res.status(201).json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error recording dental plan approval:');
    }
  },
);

router.post(
  '/treatment-plans/:planId/create-invoice',
  requireAnyPermission(['manage_invoices']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { planId } = planIdSchema.parse(req.params);
      const userId = (req.user as { id?: number } | undefined)?.id ?? null;
      const plan = await storage.getDentalTreatmentPlan(companyId, planId);
      if (!plan) return res.status(404).json({ success: false, error: 'Treatment plan not found' });
      const data = await storage.createDentalTreatmentPlanInvoice(companyId, planId, userId);
      await recordDentalClinicalEvent(req, {
        companyId, contactId: plan.contactId, eventType: 'treatment_plan_invoice_created', sourceType: 'treatment_plan',
        sourceId: planId, title: 'Treatment plan invoice created', description: plan.title,
        snapshot: { invoiceId: data.invoice.id, invoiceNumber: data.invoice.invoiceNumber } as any,
      });
      return res.status(201).json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error creating invoice from treatment plan:');
    }
  },
);

export default router;
