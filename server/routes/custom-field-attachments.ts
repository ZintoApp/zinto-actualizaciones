import { resolveContactViewScope } from '../../shared/contact-access';
import crypto from 'crypto';
import path from 'path';
import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import fsExtra from 'fs-extra';
import { PERMISSIONS } from '@shared/schema';
import { isCustomFieldFileReference, type CustomFieldFileReference } from '@shared/contact-custom-fields';
import { isDentalClinicalDocumentCategory } from '@shared/dental-clinical';
import { assertUserCanAccessPipeline, getUserPermissions } from '../middleware';
import { storage, logContactAudit } from '../storage';
import { dataUsageTracker } from '../services/data-usage-tracker';
import { removeUnreferencedCustomFieldAttachments } from '../services/custom-field-value-service';

const router = Router();
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const POST_CREATE_ATTACHMENT_WINDOW_MS = 15 * 60 * 1000;
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);

const upload = multer({
  // Buffer at most 10 MB until the owner has been authorized; rejected uploads never reach disk.
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, callback) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) callback(null, true);
    else callback(new Error('Invalid file type. Only PDF, images, Word documents, and text files are allowed.'));
  },
});

type OwnerType = 'contact' | 'deal';
type OwnerAuthorization =
  | {
      companyId: number;
      owner: NonNullable<Awaited<ReturnType<typeof storage.getContact>>> | NonNullable<Awaited<ReturnType<typeof storage.getDeal>>>;
    }
  | { status: number; error: string };

function parseOwner(req: Request): { ownerType: OwnerType; ownerId: number } | null {
  const ownerType = String(req.query.ownerType ?? req.body?.ownerType ?? '');
  const ownerId = Number(req.query.ownerId ?? req.body?.ownerId);
  if ((ownerType !== 'contact' && ownerType !== 'deal') || !Number.isInteger(ownerId) || ownerId <= 0) return null;
  return { ownerType, ownerId };
}

async function authorizeOwner(req: Request, ownerType: OwnerType, ownerId: number, write: boolean): Promise<OwnerAuthorization> {
  const user = req.user as any;
  const companyId = Number(user?.companyId);
  if (!companyId) return { status: 400, error: 'Company ID required' } as const;
  const permissions = user.isSuperAdmin ? {} : await getUserPermissions(user);

  if (ownerType === 'contact') {
    const contact = await storage.getContact(ownerId);
    if (!contact || contact.companyId !== companyId) return { status: 404, error: 'Contact not found' } as const;
    if (!user.isSuperAdmin) {
      const scope = resolveContactViewScope(permissions);
      const scopedAccess = scope && (await storage.getAccessibleContactIds([ownerId], {
        companyId, userId: user.id, contactScope: scope,
      })).length === 1;
      const dentalAccess = !write &&
        (permissions[PERMISSIONS.VIEW_DENTAL_PATIENTS] === true || permissions[PERMISSIONS.MANAGE_DENTAL_PATIENTS] === true) &&
        Boolean(await storage.getDentalPatientByContactId(companyId, ownerId));
      if (!scopedAccess && !dentalAccess) return { status: 404, error: 'Contact not found' } as const;
    }
    if (write && !user.isSuperAdmin) {
      const canManage = permissions[PERMISSIONS.MANAGE_CONTACTS] === true;
      const createdAt = contact.createdAt ? new Date(contact.createdAt).getTime() : 0;
      const canFinishOwnCreate = permissions[PERMISSIONS.CREATE_CONTACTS] === true &&
        contact.createdBy === user.id && Date.now() - createdAt <= POST_CREATE_ATTACHMENT_WINDOW_MS;
      if (!canManage && !canFinishOwnCreate) return { status: 403, error: 'Manage contacts permission is required' } as const;
    }
    return { companyId, owner: contact } as const;
  }

  const deal = await storage.getDeal(ownerId);
  if (!deal || deal.companyId !== companyId) return { status: 404, error: 'Deal not found' } as const;
  const pipeline = await storage.getPipeline(deal.pipelineId);
  if (!pipeline) return { status: 404, error: 'Pipeline not found' } as const;
  const access = await assertUserCanAccessPipeline(user, pipeline, permissions);
  if (!access.ok) return { status: access.status, error: access.message } as const;
  if (write && !user.isSuperAdmin && user.role !== 'admin') {
    const canEdit = permissions[PERMISSIONS.EDIT_DEALS] === true;
    const activities = canEdit ? [] : await storage.getDealActivities(ownerId);
    const canFinishOwnCreate = permissions[PERMISSIONS.CREATE_DEALS] === true && activities.some(
      (activity) => activity.type === 'create' && activity.userId === user.id &&
        Date.now() - new Date(activity.createdAt ?? 0).getTime() <= POST_CREATE_ATTACHMENT_WINDOW_MS,
    );
    if (!canEdit && !canFinishOwnCreate) return { status: 403, error: 'Edit deals permission is required' } as const;
  }
  return { companyId, owner: deal } as const;
}

function toReference(source: CustomFieldFileReference['source'], row: {
  id: number;
  originalName: string;
  fileUrl: string;
  mimeType: string;
  fileSize: number;
}): CustomFieldFileReference {
  return { source, id: row.id, name: row.originalName, url: row.fileUrl, mimeType: row.mimeType, size: row.fileSize };
}

router.get('/', async (req, res) => {
  const parsed = parseOwner(req);
  if (!parsed) return res.status(400).json({ error: 'Valid ownerType and ownerId are required' });
  const auth = await authorizeOwner(req, parsed.ownerType, parsed.ownerId, false);
  if ('error' in auth) return res.status(auth.status).json({ error: auth.error });

  const attachments = await storage.listCustomFieldAttachments(auth.companyId, parsed.ownerType, parsed.ownerId);
  const files: CustomFieldFileReference[] = attachments.map((row) => toReference('custom_field_attachment', row));
  if (parsed.ownerType === 'contact') {
    const user = req.user as any;
    const permissions = user.isSuperAdmin ? {} : await getUserPermissions(user);
    const canViewDentalImaging = user.isSuperAdmin || permissions[PERMISSIONS.VIEW_DENTAL_IMAGING] === true;
    const documents = (await storage.getContactDocuments(parsed.ownerId)).filter(
      (document) => canViewDentalImaging || !isDentalClinicalDocumentCategory(document.category),
    );
    files.push(...documents.map((row) => toReference('contact_document', row)));
  }
  return res.json({ data: files });
});

router.post('/', upload.single('file'), async (req, res) => {
  try {
    const parsed = parseOwner(req);
    if (!parsed) return res.status(400).json({ error: 'Valid ownerType and ownerId are required' });
    const auth = await authorizeOwner(req, parsed.ownerType, parsed.ownerId, true);
    if ('error' in auth) return res.status(auth.status).json({ error: auth.error });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const directory = path.join(process.cwd(), 'uploads', 'custom-field-files');
    await fsExtra.ensureDir(directory);
    req.file.filename = `${crypto.randomBytes(16).toString('hex')}${path.extname(req.file.originalname)}`;
    req.file.path = path.join(directory, req.file.filename);
    await fsExtra.writeFile(req.file.path, req.file.buffer);


    const attachment = await storage.createCustomFieldAttachment({
      companyId: auth.companyId,
      ownerType: parsed.ownerType,
      contactId: parsed.ownerType === 'contact' ? parsed.ownerId : null,
      dealId: parsed.ownerType === 'deal' ? parsed.ownerId : null,
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      filePath: req.file.path,
      fileUrl: `/uploads/custom-field-files/${req.file.filename}`,
      uploadedBy: (req.user as any)?.id ?? null,
    });
    void dataUsageTracker.trackFileUpload(auth.companyId, req.file.size);

    if (parsed.ownerType === 'contact') {
      await logContactAudit({
        companyId: auth.companyId,
        contactId: parsed.ownerId,
        userId: (req.user as any)?.id,
        actionType: 'document_uploaded',
        actionCategory: 'custom_field',
        description: `Custom field attachment uploaded: ${attachment.originalName}`,
        newValues: { attachmentId: attachment.id, name: attachment.originalName, size: attachment.fileSize },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });
    } else {
      await storage.createDealActivity({
        dealId: parsed.ownerId,
        userId: (req.user as any).id,
        type: 'file_upload',
        content: `Attachment uploaded: ${attachment.originalName}`,
        metadata: { attachmentId: attachment.id, fileSize: attachment.fileSize },
      });
    }
    return res.status(201).json({ data: toReference('custom_field_attachment', attachment) });
  } catch (error) {
    if (req.file?.path) await fsExtra.unlink(req.file.path).catch(() => undefined);
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
    }
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to upload file' });
  }
});

router.put('/value', async (req, res) => {
  const parsed = parseOwner(req);
  if (!parsed) return res.status(400).json({ error: 'Valid ownerType and ownerId are required' });
  const auth = await authorizeOwner(req, parsed.ownerType, parsed.ownerId, true);
  if ('error' in auth) return res.status(auth.status).json({ error: auth.error });
  const fieldName = typeof req.body?.fieldName === 'string' ? req.body.fieldName : '';
  const definitions = await storage.getCompanyCustomFields(auth.companyId, parsed.ownerType);
  const definition = definitions.find((field: any) => field.fieldName === fieldName && field.fieldType === 'file_select');
  if (!definition) return res.status(404).json({ error: 'File custom field not found' });

  let reference: CustomFieldFileReference | null = req.body?.value ?? null;
  if (reference == null) {
    if (definition.required) return res.status(400).json({ error: `${definition.fieldLabel} is required` });
  } else {
    if (!isCustomFieldFileReference(reference)) return res.status(400).json({ error: 'Invalid file reference' });
    if (reference.source === 'contact_document') {
      if (parsed.ownerType !== 'contact') return res.status(400).json({ error: 'Contact documents cannot be assigned to deals' });
      const document = await storage.getContactDocument(reference.id);
      if (!document || document.contactId !== parsed.ownerId) return res.status(404).json({ error: 'Document not found' });
      if (isDentalClinicalDocumentCategory(document.category) && !(req.user as any)?.isSuperAdmin) {
        const permissions = await getUserPermissions(req.user as any);
        if (permissions[PERMISSIONS.VIEW_DENTAL_IMAGING] !== true) {
          return res.status(403).json({ error: 'Dental imaging permission is required' });
        }
      }
      reference = toReference('contact_document', document);
    } else {
      const attachment = await storage.getCustomFieldAttachment(auth.companyId, reference.id);
      const matchesOwner = attachment && attachment.ownerType === parsed.ownerType && (
        parsed.ownerType === 'contact' ? attachment.contactId === parsed.ownerId : attachment.dealId === parsed.ownerId
      );
      if (!attachment || !matchesOwner) return res.status(404).json({ error: 'Attachment not found' });
      reference = toReference('custom_field_attachment', attachment);
    }
  }

  const current = auth.owner.customFields && typeof auth.owner.customFields === 'object' && !Array.isArray(auth.owner.customFields)
    ? auth.owner.customFields as Record<string, unknown>
    : {};
  const next = { ...current };
  if (reference) next[fieldName] = reference;
  else delete next[fieldName];
  if (parsed.ownerType === 'contact') await storage.updateContact(parsed.ownerId, { customFields: next });
  else await storage.updateDeal(parsed.ownerId, { customFields: next });
  await removeUnreferencedCustomFieldAttachments({
    companyId: auth.companyId,
    ownerType: parsed.ownerType,
    ownerId: parsed.ownerId,
    customFields: next,
  });

  if (parsed.ownerType === 'contact') {
    await logContactAudit({
      companyId: auth.companyId,
      contactId: parsed.ownerId,
      userId: (req.user as any)?.id,
      actionType: 'updated',
      actionCategory: 'custom_field',
      description: `${definition.fieldLabel} file ${reference ? 'selected' : 'cleared'}`,
      oldValues: { [fieldName]: current[fieldName] ?? null },
      newValues: { [fieldName]: reference },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });
  } else {
    await storage.createDealActivity({
      dealId: parsed.ownerId,
      userId: (req.user as any).id,
      type: 'custom_field_file',
      content: `${definition.fieldLabel} file ${reference ? 'selected' : 'cleared'}`,
      metadata: { fieldName, reference },
    });
  }
  return res.json({ data: { fieldName, value: reference, customFields: next } });
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const companyId = Number((req.user as any)?.companyId);
  if (!Number.isInteger(id) || id <= 0 || !companyId) return res.status(400).json({ error: 'Invalid attachment ID' });
  const attachment = await storage.getCustomFieldAttachment(companyId, id);
  if (!attachment) return res.status(404).json({ error: 'Attachment not found' });
  const ownerType = attachment.ownerType as OwnerType;
  const ownerId = ownerType === 'contact' ? attachment.contactId : attachment.dealId;
  if (!ownerId) return res.status(409).json({ error: 'Attachment owner is invalid' });
  const auth = await authorizeOwner(req, ownerType, ownerId, true);
  if ('error' in auth) return res.status(auth.status).json({ error: auth.error });

  const { attachment: deleted, clearedFields } = await storage.deleteCustomFieldAttachmentAndClearReferences(companyId, id);
  if (deleted) {
    await fsExtra.unlink(deleted.filePath).catch(() => undefined);
    void dataUsageTracker.trackFileDelete(companyId, deleted.fileSize);
  }
  if (ownerType === 'contact') {
    await logContactAudit({
      companyId,
      contactId: ownerId,
      userId: (req.user as any)?.id,
      actionType: 'deleted',
      actionCategory: 'custom_field',
      description: `Custom field attachment deleted: ${attachment.originalName}`,
      oldValues: { attachment: toReference('custom_field_attachment', attachment) },
      newValues: { clearedFields },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });
  } else {
    await storage.createDealActivity({
      dealId: ownerId,
      userId: (req.user as any).id,
      type: 'custom_field_file',
      content: `Custom field attachment deleted: ${attachment.originalName}`,
      metadata: { attachmentId: id, clearedFields },
    });
  }
  return res.json({ success: true, clearedFields });
});

export default router;
