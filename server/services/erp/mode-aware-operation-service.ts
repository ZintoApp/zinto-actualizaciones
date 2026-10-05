import type { Contact, Conversation, InsertRestaurantReservation, InsertRestaurantWaitlistEntry } from '@shared/schema';
import type { ErpBusinessType } from '@shared/erp-capabilities';
import { storage, ErpValidationError } from '../../storage';
import {
  createConflictSafeRestaurantReservation,
  findRestaurantReservationAvailability,
  updateConflictSafeRestaurantReservation,
} from './restaurant-reservation-service';
import {
  listLocalBookableCatalog,
  listLocalBookableDentists,
  listLocalDentalAppointmentsForContact,
  localDentalBookAppointment,
  localDentalCancelAppointment,
  localDentalCheckAvailability,
  localDentalRescheduleAppointment,
} from '../dental-ai-booking-adapter';

export type ModeAwareErpOperationResult = {
  response: unknown;
  variables: Record<string, unknown>;
};

type Params = {
  businessType: ErpBusinessType;
  resource: string;
  operation: string;
  data: Record<string, unknown>;
  companyId: number;
  actorUserId: number;
  contact: Contact;
  conversation: Conversation;
  resolve: (value: unknown) => string;
};

function positiveInt(value: unknown, label: string): number {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new ErpValidationError(`${label} must be a positive integer`);
  return parsed;
}

function optionalPositiveInt(value: unknown): number | undefined {
  const raw = String(value ?? '').trim();
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function ownRecord<T extends { companyId: number; contactId?: number | null }>(
  record: T | undefined,
  companyId: number,
  contactId: number,
  label: string,
): T {
  if (!record || record.companyId !== companyId || record.contactId !== contactId) {
    throw new ErpValidationError(`${label} not found`);
  }
  return record;
}

function nonClinicalTreatmentPlan(plan: any) {
  return {
    id: plan.id,
    title: plan.title,
    status: plan.status,
    currency: plan.currency,
    estimatedTotal: plan.estimatedTotal,
    salesOrderId: plan.salesOrderId ?? null,
    salesOrderStatus: plan.salesOrderStatus ?? null,
    procedureCount: plan.procedureCount ?? (Array.isArray(plan.procedures) ? plan.procedures.length : 0),
    procedures: Array.isArray(plan.procedures)
      ? plan.procedures.map((procedure: any) => ({
          id: procedure.id,
          productId: procedure.productId ?? null,
          description: procedure.description,
          phase: procedure.phase,
          status: procedure.status,
          quantity: procedure.quantity,
          unitPrice: procedure.unitPrice,
          estimatedAmount: procedure.estimatedAmount,
          sortOrder: procedure.sortOrder,
        }))
      : undefined,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

export async function executeModeAwareErpOperation(params: Params): Promise<ModeAwareErpOperationResult | undefined> {
  const { resource, operation, companyId, contact, conversation, data, resolve: rv } = params;

  if (resource === 'catalog') {
    if (operation === 'get_product') {
      const product = await storage.getProduct(positiveInt(rv(data.productId), 'productId'));
      if (!product || product.companyId !== companyId) throw new ErpValidationError('Product not found');
      return { response: product, variables: { 'erp.catalog.product': product, 'erp.catalog.productId': product.id } };
    }
    const query = rv(data.query).trim();
    const productType = rv(data.productType).trim();
    const result = await storage.getProducts(companyId, {
      ...(query ? { search: query } : {}),
      ...(['physical', 'service', 'digital'].includes(productType) ? { type: productType } : {}),
      status: 'active',
      limit: Math.min(100, Math.max(1, Number(data.limit) || 20)),
    });
    return { response: result, variables: { 'erp.catalog.products': result.data, 'erp.catalog.count': result.total } };
  }

  if (resource.startsWith('restaurant_')) {
    if (params.businessType !== 'restaurant') throw new ErpValidationError('Restaurant ERP mode is not enabled for this company');
    if (resource === 'restaurant_table' && operation === 'check_availability') {
      const response = await findRestaurantReservationAvailability({
        companyId,
        reservationAt: rv(data.reservationAt),
        expectedDurationMinutes: rv(data.expectedDurationMinutes),
        guestCount: rv(data.guestCount),
      });
      return { response, variables: { 'erp.restaurant.table.available': response, 'erp.restaurant.table.availableCount': response.length } };
    }
    if (resource === 'restaurant_reservation') {
      if (operation === 'list') {
        const result = await storage.getRestaurantReservations(companyId, { contactId: contact.id, limit: 50 });
        const response = result.data;
        return { response, variables: { 'erp.restaurant.reservation.items': response, 'erp.restaurant.reservation.count': response.length } };
      }
      if (operation === 'create') {
        const reservation = await createConflictSafeRestaurantReservation({
          companyId,
          contactId: contact.id,
          tableId: optionalPositiveInt(rv(data.tableId)) ?? null,
          status: 'booked',
          reservationAt: new Date(rv(data.reservationAt)),
          expectedDurationMinutes: Number(rv(data.expectedDurationMinutes)) || 90,
          guestCount: Number(rv(data.guestCount)) || 1,
          guestName: rv(data.guestName).trim() || contact.name || 'Guest',
          guestPhone: rv(data.guestPhone).trim() || contact.phone || contact.identifier || '',
          guestEmail: rv(data.guestEmail).trim() || contact.email || null,
          notes: rv(data.notes).trim() || null,
          createdBy: params.actorUserId,
        } as InsertRestaurantReservation);
        return { response: reservation, variables: { 'erp.restaurant.reservation.id': reservation.id, 'erp.restaurant.reservation.record': reservation } };
      }
      const reservationId = positiveInt(rv(data.reservationId), 'reservationId');
      const existing = ownRecord(await storage.getRestaurantReservation(reservationId), companyId, contact.id, 'Reservation');
      if (operation === 'get') return { response: existing, variables: { 'erp.restaurant.reservation.id': existing.id, 'erp.restaurant.reservation.record': existing } };
      if (operation === 'cancel') {
        const response = await storage.updateRestaurantReservation(existing.id, { status: 'cancelled', cancelledAt: new Date() });
        return { response, variables: { 'erp.restaurant.reservation.id': response.id, 'erp.restaurant.reservation.record': response } };
      }
      if (operation === 'update') {
        const response = await updateConflictSafeRestaurantReservation(companyId, existing.id, {
          reservationAt: rv(data.reservationAt).trim() ? new Date(rv(data.reservationAt)) : existing.reservationAt,
          expectedDurationMinutes: Number(rv(data.expectedDurationMinutes)) || existing.expectedDurationMinutes || 90,
          guestCount: Number(rv(data.guestCount)) || existing.guestCount,
          tableId: optionalPositiveInt(rv(data.tableId)) ?? existing.tableId,
          guestName: rv(data.guestName).trim() || existing.guestName,
          guestPhone: rv(data.guestPhone).trim() || existing.guestPhone,
          guestEmail: rv(data.guestEmail).trim() || existing.guestEmail,
          notes: rv(data.notes).trim() || existing.notes,
        });
        return { response, variables: { 'erp.restaurant.reservation.id': response.id, 'erp.restaurant.reservation.record': response } };
      }
    }
    if (resource === 'restaurant_waitlist') {
      if (operation === 'get_current') {
        const result = await storage.getRestaurantWaitlistEntries(companyId, { contactId: contact.id, status: 'waiting', limit: 50 });
        const response = result.data;
        return { response, variables: { 'erp.restaurant.waitlist.items': response, 'erp.restaurant.waitlist.count': response.length } };
      }
      if (operation === 'join') {
        const entry = await storage.createRestaurantWaitlistEntry({
          companyId,
          contactId: contact.id,
          targetTableId: optionalPositiveInt(rv(data.tableId)) ?? null,
          status: 'waiting',
          guestCount: Number(rv(data.guestCount)) || 1,
          quotedWaitMinutes: optionalPositiveInt(rv(data.quotedWaitMinutes)) ?? null,
          guestName: rv(data.guestName).trim() || contact.name || 'Guest',
          guestPhone: rv(data.guestPhone).trim() || contact.phone || contact.identifier || '',
          guestEmail: rv(data.guestEmail).trim() || contact.email || null,
          notes: rv(data.notes).trim() || null,
        } as InsertRestaurantWaitlistEntry);
        return { response: entry, variables: { 'erp.restaurant.waitlist.id': entry.id, 'erp.restaurant.waitlist.record': entry } };
      }
      const entryId = positiveInt(rv(data.waitlistEntryId), 'waitlistEntryId');
      const existing = ownRecord(await storage.getRestaurantWaitlistEntry(entryId), companyId, contact.id, 'Waitlist entry');
      const response = await storage.updateRestaurantWaitlistEntry(existing.id, operation === 'leave'
        ? { status: 'left', leftAt: new Date() }
        : {
            guestCount: Number(rv(data.guestCount)) || existing.guestCount,
            quotedWaitMinutes: optionalPositiveInt(rv(data.quotedWaitMinutes)) ?? existing.quotedWaitMinutes,
            notes: rv(data.notes).trim() || existing.notes,
          });
      return { response, variables: { 'erp.restaurant.waitlist.id': response.id, 'erp.restaurant.waitlist.record': response } };
    }
    if (resource === 'restaurant_delivery' && operation === 'get_status') {
      const dispatch = await storage.getRestaurantDeliveryDispatch(positiveInt(rv(data.deliveryDispatchId), 'deliveryDispatchId'));
      if (!dispatch || dispatch.companyId !== companyId) throw new ErpValidationError('Delivery dispatch not found');
      const orderContext = await storage.getRestaurantOrderContext(dispatch.orderContextId);
      const order = orderContext ? await storage.getSalesOrder(orderContext.salesOrderId) : undefined;
      if (!orderContext || orderContext.companyId !== companyId || !order || order.contactId !== contact.id) throw new ErpValidationError('Delivery dispatch not found');
      const response = { id: dispatch.id, status: dispatch.status, provider: dispatch.provider, providerReference: dispatch.providerReference, assignedAt: dispatch.assignedAt, pickedUpAt: dispatch.pickedUpAt, deliveredAt: dispatch.deliveredAt, failedAt: dispatch.failedAt };
      return { response, variables: { 'erp.restaurant.delivery.id': dispatch.id, 'erp.restaurant.delivery.status': dispatch.status, 'erp.restaurant.delivery.record': response } };
    }
  }

  if (resource.startsWith('dental_')) {
    if (params.businessType !== 'dental') throw new ErpValidationError('Dental ERP mode is not enabled for this company');
    if (resource === 'dental_patient' && operation === 'get') {
      const patient = await storage.getDentalPatientByContactId(companyId, contact.id);
      const response = patient ? { contactId: patient.contactId, isPatient: true, preferredProviderUserId: patient.preferredProviderUserId ?? null } : { contactId: contact.id, isPatient: false, preferredProviderUserId: null };
      return { response, variables: { 'erp.dental.patient.record': response, 'erp.dental.patient.isPatient': response.isPatient } };
    }
    if (resource === 'dental_booking') {
      if (operation === 'list_services') {
        const response = await listLocalBookableCatalog(companyId);
        return { response, variables: { 'erp.dental.appointment.services': response } };
      }
      if (operation === 'list_providers') {
        const response = await listLocalBookableDentists(companyId, data);
        return { response, variables: { 'erp.dental.appointment.providers': response } };
      }
      if (operation === 'list_appointments') {
        const response = await listLocalDentalAppointmentsForContact({ companyId, contactId: contact.id });
        return { response, variables: { 'erp.dental.appointment.items': response, 'erp.dental.appointment.count': response.length } };
      }
      if (operation === 'check_availability') {
        const scheduledAt = rv(data.scheduledAt).trim();
        const response = await localDentalCheckAvailability({ companyId, nodeData: data, args: { date: scheduledAt.slice(0, 10), catalog_item_id: rv(data.catalogItemId), provider_user_id: rv(data.providerUserId) } });
        return { response, variables: { 'erp.dental.appointment.availability': response } };
      }
      if (operation === 'book') {
        const response = await localDentalBookAppointment({ companyId, contactId: contact.id, nodeData: data, args: { start_datetime: rv(data.scheduledAt), catalog_item_id: rv(data.catalogItemId), provider_user_id: rv(data.providerUserId) }, createdBy: params.actorUserId });
        return { response, variables: { 'erp.dental.appointment.id': response.id, 'erp.dental.appointment.record': response } };
      }
      const appointmentId = positiveInt(rv(data.appointmentId), 'appointmentId');
      if (operation === 'cancel') {
        const response = await localDentalCancelAppointment({ companyId, contactId: contact.id, appointmentId });
        return { response, variables: { 'erp.dental.appointment.id': response.id, 'erp.dental.appointment.record': response } };
      }
      if (operation === 'reschedule') {
        const response = await localDentalRescheduleAppointment({
          companyId,
          contactId: contact.id,
          appointmentId,
          scheduledAt: rv(data.scheduledAt),
        });
        return { response, variables: { 'erp.dental.appointment.id': response.id, 'erp.dental.appointment.record': response } };
      }
    }
    if (resource === 'dental_treatment_plan') {
      if (operation === 'list') {
        const response = await storage.listDentalTreatmentPlans(companyId, { contactId: contact.id, limit: 50 });
        const safePlans = response.data.map(nonClinicalTreatmentPlan);
        return { response: safePlans, variables: { 'erp.dental.treatmentPlan.items': safePlans, 'erp.dental.treatmentPlan.count': response.total } };
      }
      const planId = positiveInt(rv(data.treatmentPlanId), 'treatmentPlanId');
      const plan = await storage.getDentalTreatmentPlan(companyId, planId);
      if (!plan || plan.contactId !== contact.id) throw new ErpValidationError('Treatment plan not found');
      if (operation === 'get') {
        const safePlan = nonClinicalTreatmentPlan(plan);
        return { response: safePlan, variables: { 'erp.dental.treatmentPlan.id': plan.id, 'erp.dental.treatmentPlan.record': safePlan } };
      }
      if (operation === 'get_billing_status') {
        const invoice = plan.salesOrderId ? await storage.getActiveInvoiceForSalesOrder(companyId, plan.salesOrderId) : undefined;
        const response = { planId: plan.id, planStatus: plan.status, salesOrderId: plan.salesOrderId, salesOrderStatus: plan.salesOrderStatus, invoiceId: invoice?.id ?? null, invoiceStatus: invoice?.status ?? null, amountDue: invoice?.amountDue ?? null };
        return { response, variables: { 'erp.dental.treatmentPlan.billing': response } };
      }
      if (operation === 'request_approval') {
        const candidateAssignedUser = conversation.assignedToUserId ? await storage.getUser(conversation.assignedToUserId) : undefined;
        const assignedUser = candidateAssignedUser?.companyId === companyId ? candidateAssignedUser : undefined;
        const decision = rv(data.approvalDecision) === 'rejected' ? 'rejected' : 'approved';
        const task = await storage.createContactTask({
          companyId,
          contactId: contact.id,
          title: `Review treatment plan ${plan.id} ${decision} request`,
          description: `Customer requested ${decision} review for treatment plan ${plan.id} in conversation ${conversation.id}.${rv(data.approvalNotes).trim() ? ` Notes: ${rv(data.approvalNotes).trim()}` : ''}`,
          priority: 'high',
          status: 'not_started',
          category: 'dental_treatment_plan_approval',
          assignedTo: assignedUser?.fullName || assignedUser?.username || null,
          createdBy: params.actorUserId,
        });
        return { response: task, variables: { 'erp.dental.approvalRequest.id': task.id, 'erp.dental.approvalRequest.record': task } };
      }
    }
  }

  return undefined;
}
