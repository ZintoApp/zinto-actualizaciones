/** Real Estate navigation and permission catalog shared by the API and client. */
export const REAL_ESTATE_SECTIONS = [
  { key: 'dashboard', label: 'Dashboard', icon: 'ri-dashboard-line' },
  { key: 'properties', label: 'Properties', icon: 'ri-home-4-line' },
  { key: 'schedule', label: 'Schedule', icon: 'ri-calendar-check-line' },
  { key: 'owners', label: 'Owners', icon: 'ri-user-star-line' },
  { key: 'tenants', label: 'Tenants', icon: 'ri-group-line' },
  { key: 'leases', label: 'Leases', icon: 'ri-file-list-3-line' },
  { key: 'rent_collection', label: 'Rent Collection', icon: 'ri-money-dollar-circle-line' },
  { key: 'maintenance', label: 'Maintenance', icon: 'ri-tools-line' },
  { key: 'inspections', label: 'Inspections', icon: 'ri-survey-line' },
  { key: 'expenses', label: 'Expenses', icon: 'ri-wallet-3-line' },
  { key: 'owner_settlements', label: 'Owner Settlements', icon: 'ri-bank-card-line' },
  { key: 'projects', label: 'Projects', icon: 'ri-building-line' },
  { key: 'units', label: 'Units', icon: 'ri-building-4-line' },
  { key: 'reservations', label: 'Reservations', icon: 'ri-bookmark-line' },
  { key: 'payment_plans', label: 'Payment Plans', icon: 'ri-file-chart-line' },
  { key: 'vendors', label: 'Vendors', icon: 'ri-truck-line' },
  { key: 'commissions', label: 'Commissions', icon: 'ri-percent-line' },
  { key: 'documents', label: 'Documents', icon: 'ri-file-text-line' },
  { key: 'reports', label: 'Reports', icon: 'ri-bar-chart-grouped-line' },
  { key: 'settings', label: 'Settings', icon: 'ri-settings-3-line' },
] as const;

export type RealEstateSection = (typeof REAL_ESTATE_SECTIONS)[number]['key'];
export type RealEstatePermission = `view_real_estate_${RealEstateSection}` | `manage_real_estate_${RealEstateSection}`
  | 'view_real_estate_financials' | 'record_real_estate_payments' | 'post_real_estate_settlements';

export const REAL_ESTATE_PERMISSION_KEYS: RealEstatePermission[] = [
  ...REAL_ESTATE_SECTIONS.flatMap(({ key }) => [`view_real_estate_${key}`, `manage_real_estate_${key}`] as RealEstatePermission[]),
  'view_real_estate_financials', 'record_real_estate_payments', 'post_real_estate_settlements',
];

export const REAL_ESTATE_PERMISSIONS = Object.fromEntries(
  REAL_ESTATE_PERMISSION_KEYS.map(key => [key.toUpperCase(), key]),
) as { [K in RealEstatePermission as Uppercase<K>]: K };

export const REAL_ESTATE_DEFAULT_ADMIN_PERMISSIONS = Object.fromEntries(
  REAL_ESTATE_PERMISSION_KEYS.map(key => [key, true]),
) as Record<RealEstatePermission, boolean>;
export const REAL_ESTATE_DEFAULT_AGENT_PERMISSIONS = Object.fromEntries(
  REAL_ESTATE_PERMISSION_KEYS.map(key => [key, false]),
) as Record<RealEstatePermission, boolean>;

export function realEstateReadPermissions(section: RealEstateSection): RealEstatePermission[] {
  return [`view_real_estate_${section}`, `manage_real_estate_${section}`];
}

export function realEstateSectionPath(section: RealEstateSection): string {
  return `/erp/real-estate/${section.replaceAll('_', '-')}`;
}
