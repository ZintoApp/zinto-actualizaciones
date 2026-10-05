/** Namespaces extending the existing ERP custom-field framework. */
export const ERP_CUSTOM_FIELD_ENTITIES = [
  'product', 'real_estate_property', 'real_estate_project', 'real_estate_unit',
  'real_estate_lease', 'real_estate_reservation', 'real_estate_maintenance',
  'real_estate_inspection', 'real_estate_sale_agreement', 'real_estate_payment_plan',
  'real_estate_expense',
] as const;
export type ErpCustomFieldEntity = (typeof ERP_CUSTOM_FIELD_ENTITIES)[number];

export function isErpCustomFieldEntity(value: unknown): value is ErpCustomFieldEntity {
  return typeof value === 'string' && (ERP_CUSTOM_FIELD_ENTITIES as readonly string[]).includes(value);
}

export const ERP_CUSTOM_FIELD_ENTITY_LABELS: Record<ErpCustomFieldEntity, string> = {
  product: 'Catalog products and services', real_estate_property: 'Properties',
  real_estate_project: 'Projects', real_estate_unit: 'Units', real_estate_lease: 'Leases',
  real_estate_reservation: 'Reservations', real_estate_maintenance: 'Maintenance',
  real_estate_inspection: 'Inspections', real_estate_sale_agreement: 'Sale agreements',
  real_estate_payment_plan: 'Payment plans', real_estate_expense: 'Expenses',
};

const features: Record<Exclude<ErpCustomFieldEntity, 'product'>, string> = {
  real_estate_property: 'properties', real_estate_project: 'projects', real_estate_unit: 'units',
  real_estate_lease: 'leases', real_estate_reservation: 'reservations',
  real_estate_maintenance: 'maintenance', real_estate_inspection: 'inspections',
  real_estate_sale_agreement: 'reservations', real_estate_payment_plan: 'payment_plans',
  real_estate_expense: 'expenses',
};

export function erpCustomFieldReadPermissions(entity: ErpCustomFieldEntity): string[] {
  if (entity === 'product') return [
    'view_products', 'manage_products', 'view_inventory', 'manage_inventory', 'view_suppliers', 'manage_suppliers',
  ];
  const feature = features[entity];
  return [`view_real_estate_${feature}`, `manage_real_estate_${feature}`];
}
