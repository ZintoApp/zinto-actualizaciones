import { QUICK_ACTION_CATALOG } from './quick-actions';
import { matchTourRoute, type TourDefinition } from './guided-tours';

export interface TourFeature {
  id: string; route: string; label: string; category: string; permissions: string[]; businessTypes: string[];
  contextQuery?: string[];
}
export const TOUR_FEATURES: TourFeature[] = QUICK_ACTION_CATALOG.filter(item => item.kind === 'page').map(item => ({
  id: item.id, route: item.path, label: item.label, category: item.group,
  permissions: item.permissions, businessTypes: item.businessTypes || [],
}));
const chartFeature=TOUR_FEATURES.find(feature=>feature.id==='dental-chart');
if(chartFeature)chartFeature.contextQuery=['contactId'];
const add = (id: string, route: string, label: string, category: string, permissions: string[], businessTypes: string[] = []) =>
  TOUR_FEATURES.push({ id, route, label, category, permissions, businessTypes });
add('email', '/email/:channelId', 'Email', 'main', [], []);
for (const [tab, label] of Object.entries({ channels: 'Channels', inbox: 'Inbox settings', 'whatsapp-behavior': 'WhatsApp behavior', general: 'General settings', personalization: 'Personalization', pipeline: 'Pipeline settings', 'email-settings': 'Email settings', 'contact-custom-fields': 'Contact fields', billing: 'Billing', team: 'Team', api: 'API', 'ai-credentials': 'AI credentials', 'ai-usage': 'AI usage', 'custom-css': 'Custom CSS', 'custom-js': 'Custom JavaScript' })) {
  if (TOUR_FEATURES.some(item => item.route === `/settings?tab=${tab}`)) continue;
  add(`settings-${tab}`, `/settings?tab=${tab}`, label, 'settings', ['view_settings', 'manage_settings']);
}
for (const [tab, label] of Object.entries({ currencies: 'Currencies', tax: 'Taxes', paymentGateways: 'Payment gateways', catalog: 'Catalog settings', orderNotifications: 'Order notifications', invoiceTemplates: 'Invoice templates', customFields: 'Product fields', electronicInvoicing: 'Electronic invoicing', consentTemplates: 'Consent templates', progressNoteTemplates: 'Progress note templates', restaurant: 'Restaurant settings' })) {
  add(`erp-settings-${tab.toLowerCase()}`, `/erp/settings?tab=${tab}`, label, 'settings', ['view_erp_settings', 'manage_erp_settings'], ['consentTemplates', 'progressNoteTemplates'].includes(tab) ? ['dental'] : tab === 'restaurant' ? ['restaurant'] : []);
}
for (const [tab, label] of Object.entries({ profile: 'Patient profile', notes: 'Clinical notes', documents: 'Patient documents', history: 'Medical history' }))
  add(`dental-patient-${tab}`, `/erp/dental/patients/:contactId?tab=${tab}`, label, 'dental', ['view_dental_patients', 'manage_dental_patients'], ['dental']);

export function featureForRoute(route: string): TourFeature | undefined {
  return [...TOUR_FEATURES].sort((a,b) => b.route.length - a.route.length).find(feature => matchTourRoute(feature.route, route))
    || (route.startsWith('/flows/') ? TOUR_FEATURES.find(feature => feature.id === 'flows') : undefined);
}
export const TOUR_SIGNALS = [
  'flow-saved', 'flow-activated', 'flow-assigned', 'flow-channel-activated', 'flow-node-added', 'flow-node-configured', 'flow-connected',
  'contact-created', 'task-created', 'deal-created', 'patient-created', 'appointment-created', 'conversation-selected', 'email-sent',
  'product-created', 'invoice-created', 'supplier-created', 'purchase-order-created', 'sales-order-created',
  'employee-created', 'settings-saved', 'message-sent', 'campaign-saved', 'template-saved',
  'queue-updated', 'chart-saved', 'treatment-plan-saved', 'reservation-created', 'restaurant-order-saved',
  'stock-adjusted', 'account-created', 'leave-created', 'payroll-created', 'page-saved', 'clinical-note-saved', 'patient-updated', 'layout-saved', 'channel-created', 'document-uploaded',
] as const;
export type TourSignalName = typeof TOUR_SIGNALS[number];
export const TOUR_API_SIGNALS: { name: TourSignalName; method: string; route: string }[] = [
  { name: 'flow-saved', method: 'POST', route: '/api/flows' },
  { name: 'flow-saved', method: 'PATCH', route: '/api/flows/:id' },
  { name: 'contact-created', method: 'POST', route: '/api/contacts' },
  { name: 'task-created', method: 'POST', route: '/api/tasks' },
  { name: 'deal-created', method: 'POST', route: '/api/deals' },
  { name: 'patient-created', method: 'POST', route: '/api/erp/dental/patients' },
  { name: 'product-created', method: 'POST', route: '/api/erp/products' },
  { name: 'invoice-created', method: 'POST', route: '/api/erp/invoices' },
  { name: 'supplier-created', method: 'POST', route: '/api/erp/suppliers' },
  { name: 'purchase-order-created', method: 'POST', route: '/api/erp/purchase-orders' },
  { name: 'sales-order-created', method: 'POST', route: '/api/erp/sales-orders' },
  { name: 'employee-created', method: 'POST', route: '/api/erp/employees' },
  { name: 'stock-adjusted', method: 'POST', route: '/api/erp/inventory/stock-adjustments' },
  { name: 'account-created', method: 'POST', route: '/api/erp/accounting/accounts' },
  { name: 'leave-created', method: 'POST', route: '/api/erp/hr/leave-requests' },
  { name: 'payroll-created', method: 'POST', route: '/api/erp/payroll' },
  { name: 'appointment-created', method: 'POST', route: '/api/erp/dental/schedule' },
  { name: 'treatment-plan-saved', method: 'POST', route: '/api/erp/dental/treatment-plans' },
  { name: 'reservation-created', method: 'POST', route: '/api/erp/restaurant/reservations/reservations' },
  { name: 'template-saved', method: 'POST', route: '/api/whatsapp-templates' },
  { name: 'page-saved', method: 'POST', route: '/api/company-pages' },
  { name: 'clinical-note-saved', method: 'POST', route: '/api/erp/dental/patients/:id/clinical-notes' },
  { name: 'patient-updated', method: 'PATCH', route: '/api/erp/dental/patients/:id' },
  { name: 'patient-updated', method: 'POST', route: '/api/erp/dental/patients/:id/vitals' },
  { name: 'chart-saved', method: 'POST', route: '/api/erp/dental/patients/:id/chart/snapshots' },
  { name: 'settings-saved', method: 'PUT', route: '/api/agent/calendar/settings' },
  { name: 'settings-saved', method: 'PATCH', route: '/api/settings/inbox' },
  { name: 'settings-saved', method: 'POST', route: '/api/company/ai-credentials' },
  { name: 'settings-saved', method: 'POST', route: '/api/team/members' },
  { name: 'settings-saved', method: 'POST', route: '/api/company/custom-fields' },
  { name: 'settings-saved', method: 'POST', route: '/api/smtp-config' },
  { name: 'settings-saved', method: 'POST', route: '/api/ses-config' },
  { name: 'settings-saved', method: 'PATCH', route: '/api/erp/dental/booking/settings' },
  ...['default-timezone','auto-add-to-pipeline','stage-qualification-notification','deal-automation-rules','custom-css','custom-js'].map(key=>({name:'settings-saved' as const,method:'POST',route:`/api/company-settings/${key}`})),
  { name: 'settings-saved', method: 'PUT', route: '/api/company-settings/personalization' },
  ...['/api/erp/currencies','/api/erp/tax/rules','/api/erp/products/categories','/api/erp/products/brands','/api/erp/products/tags','/api/erp/products/units','/api/erp/product-custom-fields','/api/erp/dental/clinical-note-templates','/api/erp/dental/consent-templates','/api/erp/restaurant/layout/kitchen-stations'].map(route=>({name:'settings-saved' as const,method:'POST',route})),
  ...['/api/erp/sales-orders/status-notifications','/api/erp/invoices/template-settings','/api/erp/invoices/electronic-invoicing-settings'].map(route=>({name:'settings-saved' as const,method:'PUT',route})),
  { name: 'settings-saved', method: 'POST', route: '/api/erp/payment-gateways/:gateway' },
  { name: 'restaurant-order-saved', method: 'PUT', route: '/api/erp/restaurant/orders/sales-order/:id' },
  { name: 'restaurant-order-saved', method: 'PUT', route: '/api/erp/restaurant/kitchen/tickets/:id' },
  { name: 'restaurant-order-saved', method: 'POST', route: '/api/erp/restaurant/kitchen/tickets/:id/complete' },
  { name: 'restaurant-order-saved', method: 'PUT', route: '/api/erp/restaurant/delivery/sales-order/:id' },
  { name: 'layout-saved', method: 'POST', route: '/api/erp/restaurant/layout/tables/bulk' },
  { name: 'settings-saved', method: 'PATCH', route: '/api/users/me' },
  { name: 'document-uploaded', method: 'POST', route: '/api/contacts/:id/documents' },
  ...['google','zoho','calendly'].map(provider=>({name:'appointment-created' as const,method:'POST',route:`/api/${provider}/calendar/events`})),
];
export function isSupportedTourRoute(route: string): boolean {
  if (/^\/(?:api|admin|auth|register|logout)(?:\/|$)/.test(route)) return false;
  return TOUR_FEATURES.some(feature => {
    const base = feature.route.split('?')[0].replace(/:[^/]+/g, '[^/]+');
    return new RegExp(`^${base}(?:/[^?]*)?(?:\\?|$)`).test(route.replace(/\{\{[^}]+\}\}/g, '1'));
  });
}
export function canReadTour(definition: TourDefinition, permissions: Record<string, boolean>, businessType: string, superAdmin = false): boolean {
  const feature = TOUR_FEATURES.find(item => item.id === definition.feature);
  if (!feature) return false;
  const allowed = (keys: string[]) => !keys.length || superAdmin || keys.some(key => permissions[key] === true);
  return allowed(feature.permissions) && allowed(definition.permissions)
    && (!feature.businessTypes.length || feature.businessTypes.includes(businessType))
    && (!definition.businessTypes.length || definition.businessTypes.includes(businessType as any));
}
