import { z } from 'zod';
import { QUICK_ACTION_ICON_NAMES } from './quick-action-icons';

export type QuickDestination = { id: string; kind: 'page' | 'action'; path: string; label: string; icon: string; group: 'main' | 'erp' | 'dental' | 'restaurant' | 'settings'; permissions: string[]; actionPermissions?: string[]; businessTypes?: string[] };
const pages: QuickDestination[] = [];
const page = (id: string, path: string, label: string, icon: string, permissions: string[] = [], group: QuickDestination['group'] = 'main') => {
  pages.push({ id, kind: 'page', path, label, icon, permissions, group, ...(group === 'dental' || group === 'restaurant' ? { businessTypes: [group] } : {}) });
};
page('inbox','/inbox','Inbox','inbox');
page('flows','/flows','Flow Builder','workflow',['view_flows','manage_flows']);
page('contacts','/contacts','Contacts','contact',['view_contacts','manage_contacts']);
page('pipeline','/pipeline','Pipeline','kanban',['view_pipeline','manage_pipeline']);
page('tasks','/tasks','Tasks','list-checks',['view_tasks','manage_tasks']);
page('calendar','/calendar','Calendar','calendar',['view_calendar','manage_calendar']);
page('my-calendar','/my-calendar','My calendar','calendar-days',['view_calendar','manage_calendar']);
page('campaigns','/campaigns','Campaigns','megaphone',['view_campaigns','create_campaigns','edit_campaigns','delete_campaigns','manage_templates','manage_segments','view_campaign_analytics','manage_whatsapp_accounts','configure_channels']);
page('call-logs','/call-logs','Call logs','phone',['view_call_logs','manage_call_logs']);
page('templates','/templates','Templates','files',['manage_templates']);
page('analytics','/analytics','Analytics','chart-no-axes-combined',['view_analytics','view_detailed_analytics']);
page('reports','/reports','Reports','chart-pie',['view_reports','view_agent_reports','view_response_time_reports']);
page('captured-data','/captured-data','Captured data','database',['view_captured_data','manage_captured_data']);
page('pages','/pages','Pages','panels-top-left',['view_pages','manage_pages']);
page('profile','/profile','Profile','user');
page('settings','/settings','Settings','settings',['view_settings','manage_settings']);
page('erp-dashboard','/erp/dashboard','ERP Dashboard','layout-dashboard',['view_erp_dashboard','view_products','view_sales_orders','view_invoices','view_accounting','view_inventory'],'erp');
for (const [id,label,icon,permission] of [
  ['products','Products','package','products'],['inventory','Inventory','warehouse','inventory'],['suppliers','Suppliers','truck','suppliers'],
  ['purchase-orders','Purchase orders','shopping-cart','purchase_orders'],['employees','Employees','users','hr'],['payroll','Payroll','wallet','payroll'],
]) page('erp-'+id,'/erp/'+id,label,icon,['view_'+permission,'manage_'+permission],'erp');
page('erp-sales-orders','/erp/sales-orders','Sales orders','clipboard-list',['view_sales_orders','manage_sales_orders','create_quotations'],'erp');
page('erp-invoices','/erp/invoices','Invoices','receipt',['view_invoices','manage_invoices','record_payments'],'erp');
page('erp-accounting','/erp/accounting','Accounting','calculator',['view_accounting','manage_accounting','post_journal_entries','close_fiscal_year'],'erp');
page('erp-hr','/erp/hr','Human resources','contact-round',['view_hr','manage_hr','approve_leave'],'erp');
page('erp-reports','/erp/reports','ERP Reports','chart-column',['view_erp_reports'],'erp');
page('erp-settings','/erp/settings','ERP Settings','settings-2',['view_erp_settings','manage_erp_settings'],'erp');
page('dental-patients','/erp/dental/patients','Patients','users-round',['view_dental_patients','manage_dental_patients'],'dental');
for (const [id,label,icon] of [['schedule','Schedule','calendar-days'],['queue','Digital Turn','tickets'],['booking-settings','Booking settings','calendar-cog']]) page('dental-'+id,'/erp/dental/'+id,label,icon,['view_dental_schedule','manage_dental_schedule'],'dental');
page('dental-chart','/erp/dental/chart','Odontogram','activity',['view_dental_chart','edit_dental_chart'],'dental');
page('dental-treatment-plans','/erp/dental/treatment-plans','Treatment plans','clipboard-plus',['view_dental_treatment_plans','manage_dental_treatment_plans','create_quotations','manage_sales_orders','view_sales_orders','manage_invoices','view_invoices'],'dental');
for (const [id,label,icon] of [['floor','Floor plan','layout-grid'],['kitchen','Kitchen','chef-hat'],['dispatch','Dispatch','truck'],['reservations','Reservations','calendar-check'],['delivery','Delivery','bike']]) page('restaurant-'+id,'/erp/restaurant/'+id,label,icon,['view_sales_orders','manage_sales_orders'],'restaurant');
page('restaurant-pos','/erp/restaurant/pos','POS / Cashier','store',['view_sales_orders','manage_sales_orders','manage_invoices','record_payments'],'restaurant');
page('restaurant-table-floors','/erp/restaurant/table-floors','Tables / Floors','layout-panel-top',['view_sales_orders','view_erp_settings','manage_erp_settings'],'restaurant');
for (const [id,label] of [['channels','Channels'],['inbox','Inbox settings'],['whatsapp-behavior','WhatsApp behavior'],['general','General'],['personalization','Personalization'],['pipeline','Pipeline settings'],['billing','Billing'],['api','API access'],['ai-credentials','AI credentials'],['ai-usage','AI usage']]) page('settings-'+id,'/settings?tab='+id,label,'settings',['view_settings','manage_settings'],'settings');
page('settings-team','/settings?tab=team','Team','users',['view_settings','manage_settings'],'settings');
pages[pages.length-1].actionPermissions = ['view_team','manage_team'];

const action = (id: string, parent: string, label: string, icon: string, permissions: string[]): QuickDestination => {
  const base = pages.find(p => p.id === parent)!;
  return { ...base, id, kind: 'action', label, icon, path: `${base.path}?quickAction=${id}`, actionPermissions: permissions };
};
export const QUICK_ACTION_CATALOG: readonly QuickDestination[] = [...pages,
  action('create-patient','dental-patients','Create patient','user-plus',['manage_dental_patients']),
  action('create-appointment','dental-schedule','New dental appointment','calendar-plus',['manage_dental_schedule']),
  action('check-in','dental-queue','Digital Turn check-in','ticket-plus',['manage_dental_schedule']),
  action('create-contact','contacts','Create contact','contact-round',['create_contacts']),
  action('create-task','tasks','Create task','list-plus',['manage_tasks']),
  action('create-deal','pipeline','Create deal','handshake',['manage_pipeline']),
  action('create-product','erp-products','Create product','package-plus',['manage_products']),
  action('create-invoice','erp-invoices','Create invoice','receipt-text',['manage_invoices']),
];
export const QUICK_ACTION_SETTING_KEY = 'headerQuickActions';
const iconNames = new Set(QUICK_ACTION_ICON_NAMES);
export function isSafeShortcutUrl(value: string): boolean {
  if (!value || /[\s\\\u0000-\u001f]/.test(value) || /%0[ad]/i.test(value)) return false;
  if (value.startsWith('/')) {
    if (value.startsWith('//')) return false;
    try { const path = decodeURIComponent(new URL(value,'https://internal.invalid').pathname); return !path.startsWith('//') && !/[\\\u0000-\u001f]/.test(path) && !/^\/(api|admin|auth|logout|login|register)(\/|$)/i.test(path); } catch { return false; }
  }
  try { const url = new URL(value); return ['https:','http:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}
const common = { id: z.string().min(1).max(80), label: z.string().trim().max(40).default(''), icon: z.string().refine(v => iconNames.has(v), 'invalid_icon'), opening: z.enum(['default','same-tab','new-tab']).default('default') };
export const quickShortcutSchema = z.discriminatedUnion('kind', [
  z.object({ ...common, kind: z.literal('page'), destinationId: z.string().refine(id => pages.some(p => p.id === id), 'invalid_destination') }).strict(),
  z.object({ ...common, kind: z.literal('action'), destinationId: z.string().refine(id => QUICK_ACTION_CATALOG.some(p => p.id === id && p.kind === 'action'), 'invalid_destination') }).strict(),
  z.object({ ...common, kind: z.literal('url'), url: z.string().trim().max(2000).refine(isSafeShortcutUrl,'invalid_url') }).strict(),
]);
export const personalizationSchema = z.object({ shortcuts: z.array(quickShortcutSchema).max(24).refine(v => new Set(v.map(s => s.id)).size === v.length,'duplicate_id') }).strict();
export type QuickShortcut = z.infer<typeof quickShortcutSchema>;
export type Personalization = z.infer<typeof personalizationSchema>;
export type QuickAccess = { permissions: Record<string, boolean>; businessType: string; superAdmin?: boolean };
export function destinationAvailable(destination: QuickDestination, context: QuickAccess) {
  const any = (keys: string[]) => !keys.length || context.superAdmin || keys.some(k => context.permissions[k] === true);
  return (!destination.businessTypes || destination.businessTypes.includes(context.businessType)) && any(destination.permissions) && any(destination.actionPermissions || []);
}
export function defaultPersonalization(): Personalization {
  return { shortcuts: ['erp-dashboard','inbox','contacts','calendar','tasks','settings'].map(id => ({ id: `default-${id}`, kind: 'page', destinationId: id, label: '', icon: pages.find(p => p.id === id)!.icon, opening: 'default' })) };
}
export function readPersonalization(value: unknown): Personalization {
  if (value == null) return defaultPersonalization();
  const parsed = personalizationSchema.safeParse(value);
  return parsed.success ? parsed.data : defaultPersonalization();
}
export function shortcutPath(shortcut: QuickShortcut) { return shortcut.kind === 'url' ? shortcut.url : QUICK_ACTION_CATALOG.find(p => p.id === shortcut.destinationId)?.path || ''; }
export function shortcutAvailable(shortcut: QuickShortcut, context: QuickAccess, origin?: string) {
  if (shortcut.kind !== 'url') { const entry = QUICK_ACTION_CATALOG.find(p => p.id === shortcut.destinationId); return !!entry && destinationAvailable(entry,context); }
  if (!isSafeShortcutUrl(shortcut.url)) return false;
  const url = new URL(shortcut.url, origin || 'https://internal.invalid');
  if (!shortcut.url.startsWith('/') && (!origin || url.origin !== new URL(origin).origin)) return true;
  if (!isSafeShortcutUrl(url.pathname)) return false;
  try { url.pathname = decodeURIComponent(url.pathname); } catch { return false; }
  const actionId = url.searchParams.get('quickAction');
  if (actionId) { const action = QUICK_ACTION_CATALOG.find(p => p.kind === 'action' && p.id === actionId && new URL(p.path,'https://internal.invalid').pathname === url.pathname); return !!action && destinationAvailable(action,context); }
  const tab = url.searchParams.get('tab');
  const candidates = pages.filter(p => { const route = new URL(p.path,'https://internal.invalid'); return (url.pathname === route.pathname || url.pathname.startsWith(route.pathname + '/')) && (!route.searchParams.has('tab') || route.searchParams.get('tab') === tab); }).sort((a,b) => b.path.length-a.path.length);
  return !candidates.length || destinationAvailable(candidates[0],context);
}
export function resolveShortcut(shortcut: QuickShortcut, origin: string) {
  const url = new URL(shortcutPath(shortcut),origin);
  const external = url.origin !== new URL(origin).origin;
  return { href: external ? url.href : url.pathname+url.search+url.hash, newTab: shortcut.opening === 'new-tab' || shortcut.opening === 'default' && external, external };
}
