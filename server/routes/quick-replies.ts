import { Router } from 'express';
import { db } from '../db';
import { quickReplyTemplates, PERMISSIONS } from '../../shared/schema';
import { eq, and, asc } from 'drizzle-orm';
import { ensureAuthenticated, getUserPermissions, requireAnyPermission } from '../middleware';
import { storage } from '../storage';
import { resolveDentalCompanyTimezone } from '../services/dental-booking-service';

const QUICK_REPLY_VARIABLE_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/g;
const ACTIVE_DENTAL_APPOINTMENT_STATUSES = new Set(['scheduled', 'confirmed', 'held', 'pending_request']);

function quickReplyLocale(rawLocale: unknown): 'en' | 'es' {
  return typeof rawLocale === 'string' && rawLocale.toLowerCase().startsWith('es') ? 'es' : 'en';
}

function quickReplyStatusLabel(status: string, locale: 'en' | 'es'): string {
  const labels: Record<'en' | 'es', Record<string, string>> = {
    en: { scheduled: 'Scheduled', confirmed: 'Confirmed', held: 'Held', pending_request: 'Pending request' },
    es: { scheduled: 'Programada', confirmed: 'Confirmada', held: 'Reservada', pending_request: 'Solicitud pendiente' },
  };
  return labels[locale][status] || status;
}

const router = Router();

router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const companyId = user.isSuperAdmin ? undefined : user.companyId;

    let templates;

    if (companyId) {
      templates = await db.select()
        .from(quickReplyTemplates)
        .where(and(
          eq(quickReplyTemplates.companyId, companyId),
          eq(quickReplyTemplates.isActive, true)
        ))
        .orderBy(asc(quickReplyTemplates.sortOrder), asc(quickReplyTemplates.name));
    } else {
      templates = await db.select()
        .from(quickReplyTemplates)
        .where(eq(quickReplyTemplates.isActive, true))
        .orderBy(asc(quickReplyTemplates.sortOrder), asc(quickReplyTemplates.name));
    }

    res.json({
      success: true,
      data: templates
    });
  } catch (error) {
    console.error('Error fetching quick reply templates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch quick reply templates'
    });
  }
});

router.get('/:id', ensureAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const templateId = parseInt(req.params.id);
    const companyId = user.isSuperAdmin ? undefined : user.companyId;

    if (isNaN(templateId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid template ID'
      });
    }

    let template;

    if (companyId) {
      template = await db.select()
        .from(quickReplyTemplates)
        .where(and(
          eq(quickReplyTemplates.id, templateId),
          eq(quickReplyTemplates.companyId, companyId)
        ))
        .limit(1);
    } else {
      template = await db.select()
        .from(quickReplyTemplates)
        .where(eq(quickReplyTemplates.id, templateId))
        .limit(1);
    }

    if (!template.length) {
      return res.status(404).json({
        success: false,
        error: 'Quick reply template not found'
      });
    }

    res.json({
      success: true,
      data: template[0]
    });
  } catch (error) {
    console.error('Error fetching quick reply template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch quick reply template'
    });
  }
});

router.post('/:id/render', ensureAuthenticated, requireAnyPermission([PERMISSIONS.MANAGE_CONVERSATIONS]), async (req, res) => {
  try {
    const user = req.user as any;
    const templateId = Number.parseInt(req.params.id, 10);
    const conversationId = Number(req.body?.conversationId);
    if (!Number.isInteger(templateId) || templateId <= 0 || !Number.isInteger(conversationId) || conversationId <= 0) {
      return res.status(400).json({ success: false, code: 'INVALID_QUICK_REPLY_CONTEXT', errorCode: 'INVALID_QUICK_REPLY_CONTEXT' });
    }

    const conversation = await storage.getConversation(conversationId);
    if (!conversation?.companyId || (!user.isSuperAdmin && conversation.companyId !== user.companyId)) {
      return res.status(404).json({ success: false, code: 'QUICK_REPLY_CONTEXT_NOT_FOUND', errorCode: 'QUICK_REPLY_CONTEXT_NOT_FOUND' });
    }
    if (!conversation.contactId) {
      return res.status(400).json({ success: false, code: 'QUICK_REPLY_CONTACT_REQUIRED', errorCode: 'QUICK_REPLY_CONTACT_REQUIRED' });
    }

    const [template] = await db.select()
      .from(quickReplyTemplates)
      .where(and(
        eq(quickReplyTemplates.id, templateId),
        eq(quickReplyTemplates.companyId, conversation.companyId),
        eq(quickReplyTemplates.isActive, true),
      ))
      .limit(1);
    if (!template) return res.status(404).json({ success: false, code: 'QUICK_REPLY_TEMPLATE_NOT_FOUND', errorCode: 'QUICK_REPLY_TEMPLATE_NOT_FOUND' });

    const contact = await storage.getContact(conversation.contactId);
    if (!contact || contact.companyId !== conversation.companyId) {
      return res.status(404).json({ success: false, code: 'QUICK_REPLY_CONTACT_REQUIRED', errorCode: 'QUICK_REPLY_CONTACT_REQUIRED' });
    }

    const requestedVariables = Array.from(template.content.matchAll(QUICK_REPLY_VARIABLE_PATTERN), (match) => match[1].trim());
    const needsAppointment = requestedVariables.some((variable) => variable.startsWith('appointment.'));
    const serverNow = new Date();
    const timezone = await resolveDentalCompanyTimezone(conversation.companyId);
    const locale = quickReplyLocale(req.body?.locale);
    const company = await storage.getCompany(conversation.companyId);
    const dateFormat = new Intl.DateTimeFormat(locale, { timeZone: timezone, year: 'numeric', month: 'long', day: 'numeric' });
    const timeFormat = new Intl.DateTimeFormat(locale, { timeZone: timezone, hour: 'numeric', minute: '2-digit', hour12: true });
    const dateTimeFormat = new Intl.DateTimeFormat(locale, { timeZone: timezone, year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

    let appointment: Awaited<ReturnType<typeof storage.listDentalSchedule>>[number] | undefined;
    if (needsAppointment) {
      if (!user.isSuperAdmin) {
        const permissions = await getUserPermissions(user);
        if (!permissions[PERMISSIONS.VIEW_DENTAL_SCHEDULE] && !permissions[PERMISSIONS.MANAGE_DENTAL_SCHEDULE]) {
          return res.status(403).json({ success: false, code: 'DENTAL_APPOINTMENT_ACCESS_DENIED', errorCode: 'DENTAL_APPOINTMENT_ACCESS_DENIED' });
        }
      }
      appointment = (await storage.listDentalSchedule(conversation.companyId, { from: serverNow }))
        .find((item) => item.contactId === contact.id && ACTIVE_DENTAL_APPOINTMENT_STATUSES.has(item.status));
      if (!appointment) {
        return res.status(409).json({ success: false, code: 'DENTAL_APPOINTMENT_NOT_FOUND', errorCode: 'DENTAL_APPOINTMENT_NOT_FOUND' });
      }
    }

    const appointmentStartsAt = appointment ? new Date(appointment.scheduledAt) : null;
    const appointmentEndsAt = appointmentStartsAt
      ? new Date(appointmentStartsAt.getTime() + (appointment?.durationMinutes || 60) * 60_000)
      : null;
    const values: Record<string, string> = {
      'contact.id': String(contact.id),
      'contact.name': contact.name || '',
      'contact.phone': contact.phone || contact.identifier || '',
      'contact.email': contact.email || '',
      'contact.identifier': contact.identifier || '',
      'contact.username': (contact as any).whatsappUsername || '',
      'contact.company': company?.name || '',
      'conversation.id': String(conversation.id),
      'conversation.channelType': conversation.channelType || '',
      'conversation.status': conversation.status || '',
      'date.today': dateFormat.format(serverNow),
      'time.now': timeFormat.format(serverNow),
      'datetime.now': dateTimeFormat.format(serverNow),
      'company.name': company?.name || '',
      'company.timezone': timezone,
      name: contact.name || '',
      phone: contact.phone || contact.identifier || '',
      email: contact.email || '',
      company: company?.name || '',
      date: dateFormat.format(serverNow),
      time: timeFormat.format(serverNow),
    };
    if (appointment && appointmentStartsAt && appointmentEndsAt) {
      Object.assign(values, {
        'appointment.date': dateFormat.format(appointmentStartsAt),
        'appointment.start_time': timeFormat.format(appointmentStartsAt),
        'appointment.end_time': timeFormat.format(appointmentEndsAt),
        'appointment.duration': String(appointment.durationMinutes || 60),
        'appointment.service': appointment.bookingServiceLabel || appointment.title || '',
        'appointment.provider': appointment.providerName || '',
        'appointment.office': appointment.chairName || appointment.location || '',
        'appointment.status': quickReplyStatusLabel(appointment.status, locale),
        'appointment.notes': appointment.description || '',
      });
    }

    const unresolved = Array.from(new Set(requestedVariables.filter((variable) => !(variable in values))));
    if (unresolved.length) {
      return res.status(422).json({ success: false, code: 'QUICK_REPLY_VARIABLES_UNRESOLVED', errorCode: 'QUICK_REPLY_VARIABLES_UNRESOLVED', variables: unresolved });
    }
    const content = template.content.replace(QUICK_REPLY_VARIABLE_PATTERN, (_match, rawName: string) => values[rawName.trim()] ?? '');
    return res.json({ success: true, data: { content, appointmentId: appointment?.id ?? null, timezone } });
  } catch (error) {
    console.error('Error rendering quick reply template:', error);
    return res.status(500).json({ success: false, code: 'QUICK_REPLY_RENDER_FAILED', errorCode: 'QUICK_REPLY_RENDER_FAILED' });
  }
});

router.post('/', ensureAuthenticated, requireAnyPermission([PERMISSIONS.MANAGE_TEMPLATES]), async (req, res) => {
  try {
    const user = req.user as any;
    const { name, content, category = 'general', variables = [] } = req.body;

    if (!name || !content) {
      return res.status(400).json({
        success: false,
        error: 'Name and content are required'
      });
    }

    const maxSortOrder = await db.select({ max: quickReplyTemplates.sortOrder })
      .from(quickReplyTemplates)
      .where(eq(quickReplyTemplates.companyId, user.companyId))
      .limit(1);

    const nextSortOrder = (maxSortOrder[0]?.max || 0) + 1;

    const newTemplate = await db.insert(quickReplyTemplates).values({
      companyId: user.companyId,
      createdById: user.id,
      name: name.trim(),
      content: content.trim(),
      category: category.trim(),
      variables: variables || [],
      sortOrder: nextSortOrder,
      isActive: true
    }).returning();

    res.status(201).json({
      success: true,
      data: newTemplate[0]
    });
  } catch (error) {
    console.error('Error creating quick reply template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create quick reply template'
    });
  }
});

router.put('/:id', ensureAuthenticated, requireAnyPermission([PERMISSIONS.MANAGE_TEMPLATES]), async (req, res) => {
  try {
    const user = req.user as any;
    const templateId = parseInt(req.params.id);
    const { name, content, category, variables, isActive, sortOrder } = req.body;

    if (isNaN(templateId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid template ID'
      });
    }

    const existingTemplate = await db.select()
      .from(quickReplyTemplates)
      .where(and(
        eq(quickReplyTemplates.id, templateId),
        eq(quickReplyTemplates.companyId, user.companyId)
      ))
      .limit(1);

    if (!existingTemplate.length) {
      return res.status(404).json({
        success: false,
        error: 'Quick reply template not found'
      });
    }

    const updateData: any = {
      updatedAt: new Date()
    };

    if (name !== undefined) updateData.name = name.trim();
    if (content !== undefined) updateData.content = content.trim();
    if (category !== undefined) updateData.category = category.trim();
    if (variables !== undefined) updateData.variables = variables;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;

    const updatedTemplate = await db.update(quickReplyTemplates)
      .set(updateData)
      .where(eq(quickReplyTemplates.id, templateId))
      .returning();

    res.json({
      success: true,
      data: updatedTemplate[0]
    });
  } catch (error) {
    console.error('Error updating quick reply template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update quick reply template'
    });
  }
});

router.delete('/:id', ensureAuthenticated, requireAnyPermission([PERMISSIONS.MANAGE_TEMPLATES]), async (req, res) => {
  try {
    const user = req.user as any;
    const templateId = parseInt(req.params.id);

    if (isNaN(templateId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid template ID'
      });
    }

    const existingTemplate = await db.select()
      .from(quickReplyTemplates)
      .where(and(
        eq(quickReplyTemplates.id, templateId),
        eq(quickReplyTemplates.companyId, user.companyId)
      ))
      .limit(1);

    if (!existingTemplate.length) {
      return res.status(404).json({
        success: false,
        error: 'Quick reply template not found'
      });
    }

    await db.update(quickReplyTemplates)
      .set({ 
        isActive: false,
        updatedAt: new Date()
      })
      .where(eq(quickReplyTemplates.id, templateId));

    res.json({
      success: true,
      message: 'Quick reply template deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting quick reply template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete quick reply template'
    });
  }
});



export default router;
