export const ERP_BUSINESS_TYPES = ['standard', 'restaurant', 'dental', 'real_estate'] as const;
export const ERP_BUSINESS_TYPE_SETTING_KEY = 'erpBusinessType';
export type ErpBusinessType = (typeof ERP_BUSINESS_TYPES)[number];

export function normalizeErpBusinessType(value: unknown): ErpBusinessType {
  if (value === 'restaurant' || value === 'dental' || value === 'real_estate') return value;
  return 'standard';
}

export function inferExplicitRequestedErpMode(instruction: string): ErpBusinessType | undefined {
  const text = instruction.toLocaleLowerCase();
  const standard = /\b(?:standard|estándar|estandar|generic|genérico|generico)\s+(?:erp|business|negocio)\b/u.test(text);
  const dental = /\b(dental|dentist|dentista|dentistry|odontology|odontolog(?:y|ist|ía|o|a)|tooth|teeth|diente|treatment plan|plan de tratamiento)\b/u.test(text);
  const restaurant = /\b(restaurant|restaurante|dine[- ]?in|takeaway|waitlist|kitchen ticket|table reservation|reserva de mesa|lista de espera|para llevar)\b/u.test(text);
  if (standard && !dental && !restaurant) return 'standard';
  if (dental && !restaurant && !standard) return 'dental';
  if (restaurant && !dental && !standard) return 'restaurant';
  return undefined;
}

export const ERP_SHARED_RESOURCES = [
  'catalog',
  'sales_order',
  'invoice',
  'customer_notification',
] as const;
export const ERP_RESTAURANT_RESOURCES = [
  'restaurant_table',
  'restaurant_reservation',
  'restaurant_waitlist',
  'restaurant_delivery',
] as const;
export const ERP_DENTAL_RESOURCES = [
  'dental_patient',
  'dental_booking',
  'dental_treatment_plan',
] as const;

export type ErpResource =
  | (typeof ERP_SHARED_RESOURCES)[number]
  | (typeof ERP_RESTAURANT_RESOURCES)[number]
  | (typeof ERP_DENTAL_RESOURCES)[number];

export const ERP_RESOURCES: readonly ErpResource[] = [
  ...ERP_SHARED_RESOURCES,
  ...ERP_RESTAURANT_RESOURCES,
  ...ERP_DENTAL_RESOURCES,
];

export const ERP_OPERATIONS: Record<ErpResource, readonly string[]> = {
  catalog: ['search_products', 'get_product'],
  sales_order: ['create', 'add_line_item', 'update', 'confirm', 'set_status', 'cancel', 'get'],
  invoice: ['generate_from_sales_order', 'create', 'send', 'record_payment', 'void', 'cancel', 'get'],
  customer_notification: ['send_order_confirmation', 'send_invoice', 'send_quotation'],
  restaurant_table: ['check_availability'],
  restaurant_reservation: ['list', 'get', 'create', 'update', 'cancel'],
  restaurant_waitlist: ['get_current', 'join', 'update', 'leave'],
  restaurant_delivery: ['get_status'],
  dental_patient: ['get'],
  dental_booking: ['list_services', 'list_providers', 'check_availability', 'list_appointments', 'book', 'reschedule', 'cancel'],
  dental_treatment_plan: ['list', 'get', 'get_billing_status', 'request_approval'],
};

export const ERP_RESOURCE_BUSINESS_TYPE: Partial<Record<ErpResource, Exclude<ErpBusinessType, 'standard'>>> = {
  restaurant_table: 'restaurant',
  restaurant_reservation: 'restaurant',
  restaurant_waitlist: 'restaurant',
  restaurant_delivery: 'restaurant',
  dental_patient: 'dental',
  dental_booking: 'dental',
  dental_treatment_plan: 'dental',
};

export const ERP_EXECUTABLE_RESOURCES_BY_BUSINESS_TYPE: Record<ErpBusinessType, readonly ErpResource[]> = {
  real_estate: ERP_SHARED_RESOURCES,
  standard: ERP_SHARED_RESOURCES,
  restaurant: [...ERP_SHARED_RESOURCES, ...ERP_RESTAURANT_RESOURCES],
  dental: [...ERP_SHARED_RESOURCES, ...ERP_DENTAL_RESOURCES],
};

export type ErpResourceCapability = {
  resource: ErpResource;
  operations: readonly string[];
  fields: readonly string[];
  outputs: readonly string[];
  safetyScope: 'company' | 'current_contact';
  requiredBusinessType: Exclude<ErpBusinessType, 'standard'> | null;
};

const capability = (
  resource: ErpResource,
  fields: readonly string[],
  outputs: readonly string[],
  safetyScope: ErpResourceCapability['safetyScope'] = 'company',
): ErpResourceCapability => ({
  resource,
  operations: ERP_OPERATIONS[resource],
  fields,
  outputs,
  safetyScope,
  requiredBusinessType: ERP_RESOURCE_BUSINESS_TYPE[resource] ?? null,
});

export const ERP_RESOURCE_CAPABILITIES: Record<ErpResource, ErpResourceCapability> = {
  catalog: capability('catalog', ['query', 'productType', 'productId', 'limit'], ['erp.catalog.*']),
  sales_order: capability('sales_order', ['salesOrderId', 'contactId', 'dealId', 'currency', 'notes', 'assignedToUserId', 'validUntil', 'targetStatus', 'line items'], ['erp.salesOrder.*']),
  invoice: capability('invoice', ['invoiceId', 'salesOrderId', 'contactId', 'currency', 'line items', 'amount', 'paymentMethod', 'referenceNumber', 'notes'], ['erp.invoice.*']),
  customer_notification: capability('customer_notification', ['salesOrderId', 'invoiceId', 'messageTemplate', 'includePdfLink'], ['erp.lastResponse']),
  restaurant_table: capability('restaurant_table', ['reservationAt', 'expectedDurationMinutes', 'guestCount'], ['erp.restaurant.table.*']),
  restaurant_reservation: capability('restaurant_reservation', ['reservationId', 'reservationAt', 'expectedDurationMinutes', 'guestCount', 'tableId', 'guestName', 'guestPhone', 'guestEmail', 'notes'], ['erp.restaurant.reservation.*'], 'current_contact'),
  restaurant_waitlist: capability('restaurant_waitlist', ['waitlistEntryId', 'guestCount', 'tableId', 'quotedWaitMinutes', 'guestName', 'guestPhone', 'guestEmail', 'notes'], ['erp.restaurant.waitlist.*'], 'current_contact'),
  restaurant_delivery: capability('restaurant_delivery', ['deliveryDispatchId'], ['erp.restaurant.delivery.*'], 'current_contact'),
  dental_patient: capability('dental_patient', [], ['erp.dental.patient.*'], 'current_contact'),
  dental_booking: capability('dental_booking', ['appointmentId', 'providerUserId', 'catalogItemId', 'scheduledAt'], ['erp.dental.appointment.*'], 'current_contact'),
  dental_treatment_plan: capability('dental_treatment_plan', ['treatmentPlanId', 'approvalDecision', 'approvalNotes'], ['erp.dental.treatmentPlan.*', 'erp.dental.approvalRequest.*'], 'current_contact'),
};

export function getErpRequiredBusinessType(resource: unknown): Exclude<ErpBusinessType, 'standard'> | undefined {
  return ERP_RESOURCE_BUSINESS_TYPE[String(resource) as ErpResource];
}

export function isErpResourceAvailable(resource: unknown, businessType: ErpBusinessType): resource is ErpResource {
  return ERP_EXECUTABLE_RESOURCES_BY_BUSINESS_TYPE[businessType].includes(resource as ErpResource);
}

export type ErpCapabilityModule = {
  key: string;
  name: string;
  description: string;
  executableInV1: boolean;
};

export const ERP_CAPABILITY_CATALOG: Record<ErpBusinessType, readonly ErpCapabilityModule[]> = {
  real_estate: [
    { key: 'properties', name: 'Properties and contacts', description: 'Property inventory and CRM-linked owners, tenants, and buyers.', executableInV1: false },
    { key: 'schedule', name: 'Local schedule', description: 'Viewings, consultations, inspections, and handovers.', executableInV1: false },
    { key: 'projects', name: 'Development inventory', description: 'Projects, buildings, floors, units, reservations, and sale agreements.', executableInV1: false },
    { key: 'operations', name: 'Property operations', description: 'Leases, maintenance, inspections, and documents.', executableInV1: false },
    { key: 'billing', name: 'Invoices and payments', description: 'Shared Catalog, invoice, payment, and accounting services.', executableInV1: true },
  ],
  standard: [
    { key: 'catalog', name: 'Products and services', description: 'Products, variants, prices, images, service duration, and catalog search.', executableInV1: true },
    { key: 'sales', name: 'Sales and quotations', description: 'Sales orders, quotations, line items, status changes, and customer delivery details.', executableInV1: true },
    { key: 'billing', name: 'Invoices and payments', description: 'Invoices, payment recording, PDF delivery, and billing status.', executableInV1: true },
    { key: 'inventory', name: 'Inventory', description: 'Warehouses, stock movements, transfers, and stock adjustments.', executableInV1: false },
    { key: 'purchasing', name: 'Purchasing and suppliers', description: 'Suppliers, purchase orders, receiving, and supplier invoices.', executableInV1: false },
    { key: 'accounting', name: 'Accounting and tax', description: 'Accounts, journals, fiscal years, taxes, currencies, and financial reports.', executableInV1: false },
    { key: 'workforce', name: 'HR and payroll', description: 'Employees, attendance, leave, payroll, and departments.', executableInV1: false },
  ],
  restaurant: [
    { key: 'catalog', name: 'Menu and products', description: 'Menu items, variants, modifiers, prices, images, and availability.', executableInV1: true },
    { key: 'orders', name: 'Restaurant orders', description: 'Dine-in, takeaway, and delivery orders with tables, modifiers, and special instructions.', executableInV1: true },
    { key: 'reservations', name: 'Reservations and waitlist', description: 'Capacity-aware table availability, reservations, and waitlist entries.', executableInV1: true },
    { key: 'delivery', name: 'Delivery tracking', description: 'Customer-visible delivery dispatch status.', executableInV1: true },
    { key: 'billing', name: 'Invoices and payments', description: 'Shared invoice, payment, and customer notification workflows.', executableInV1: true },
    { key: 'floor', name: 'Floor and QR administration', description: 'Sections, tables, layout, and QR token administration.', executableInV1: false },
    { key: 'kitchen', name: 'Kitchen and dispatch control', description: 'Kitchen tickets, preparation stations, driver assignment, and dispatch updates.', executableInV1: false },
  ],
  dental: [
    { key: 'patients', name: 'Patients', description: 'Contact-linked patient membership and non-clinical identity.', executableInV1: true },
    { key: 'booking', name: 'Dental booking', description: 'Services, specialists, availability, appointment booking, rescheduling, and cancellation.', executableInV1: true },
    { key: 'treatment_plans', name: 'Treatment plans', description: 'Patient treatment plans, procedures, linked quotation/invoice status, and staff approval requests.', executableInV1: true },
    { key: 'billing', name: 'Quotations, invoices, and payments', description: 'Shared billing workflows linked to dental treatment plans.', executableInV1: true },
    { key: 'clinical', name: 'Clinical charting', description: 'Odontograms, clinical notes, documents, and medical details.', executableInV1: false },
    { key: 'administration', name: 'Clinic administration', description: 'Chairs, booking policy, specialties, integrations, and clinic settings.', executableInV1: false },
  ],
};

export function getErpCapabilityManifest(businessType: ErpBusinessType) {
  return {
    businessType,
    executableResources: ERP_EXECUTABLE_RESOURCES_BY_BUSINESS_TYPE[businessType].map((resource) => {
      const entry = ERP_RESOURCE_CAPABILITIES[resource];
      return businessType === 'restaurant' && resource === 'sales_order'
        ? { ...entry, fields: [...entry.fields, 'serviceType', 'tableId', 'reservationId', 'guestCount'] }
        : entry;
    }),
    modules: ERP_CAPABILITY_CATALOG[businessType],
    knowledgeCatalog: ERP_CAPABILITY_CATALOG,
    commonOutputs: ['erp.lastResponse', 'erp.error'],
  };
}
