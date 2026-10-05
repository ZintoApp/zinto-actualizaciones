import { useEffect, useState, type ReactNode } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { APPSUMO_ORIGIN, APPSUMO_TIER_NAMES, isAppSumoOrigin } from '@shared/appsumo';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { useAuthBackgroundStyles } from '@/hooks/use-branding-styles';
import { BrandingLogo } from '@/components/auth/BrandingLogo';
import { LanguageSwitcher } from '@/components/ui/language-switcher';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { Copy, ExternalLink, KeyRound, Loader2, RefreshCw } from 'lucide-react';

const available = () => isAppSumoOrigin(window.location.origin);
const purchases = 'https://appsumo.com/account/products/';
class AppSumoRequestError extends Error {
  constructor(public code: string) { super(code); }
}
async function request(path: string, method = 'GET', data?: unknown) {
  const response = await fetch('/api/appsumo/' + path, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new AppSumoRequestError(result?.code || 'REQUEST_FAILED');
  return result;
}
function ErrorMessage({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  if (!error) return null;
  const messages: Record<string, string> = {
    ACTIVATION_EXPIRED: t('appsumo.error_expired', 'Activation expired. Start again from your AppSumo purchases.'),
    LICENSE_INACTIVE: t('appsumo.error_inactive', 'This license is inactive. Activate your current license through AppSumo.'),
    ACCOUNT_RESTRICTED: t('appsumo.error_account', 'Your account is awaiting approval or is suspended. Contact support.'),
    COMPANY_CONFLICT: t('appsumo.error_company', 'This license or company is already linked. Sign in to the linked company or manage its license through AppSumo.'),
    INVALID_CONFIGURATION: t('appsumo.error_config', 'Enter an API key and select a different active paid plan for each tier.'),
    BILLING_CANCELLATION_FAILED: t('appsumo.error_billing', 'Previous billing could not be stopped. Contact support, then retry activation.'),
    ADMIN_REQUIRED: t('appsumo.error_admin', 'Sign in with the administrator account required for this action.'),
    INVALID_ORIGIN: t('appsumo.error_origin', 'AppSumo activation is available only at https://app.talkzen.io.'),
    CONFIRMATION_REQUIRED: t('appsumo.error_confirmation', 'Confirm the account or billing change before continuing.'),
    RATE_LIMITED: t('appsumo.error_rate', 'AppSumo is busy. Wait a moment and try again.'),
  };
  return <Alert variant="destructive"><AlertDescription className="space-y-3 text-foreground"><p>{messages[error instanceof AppSumoRequestError ? error.code : ''] || t('appsumo.error_generic', 'Unable to complete the request. Please try again.')}</p>{onRetry && <Button data-tour="components-settings-appsumo.button.appsumo.try_again" type="button" variant="outline" size="sm" onClick={onRetry}>{t('appsumo.try_again', 'Try again')}</Button>}</AlertDescription></Alert>;
}
function Loading({ children }: { children: ReactNode }) {
  return <div role="status" className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin shrink-0" />{children}</div>;
}
function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  const background = useAuthBackgroundStyles('user');
  const { resolvedTheme } = useTheme();
  return <main className="relative min-h-screen flex items-center justify-center bg-background p-4 text-foreground" style={background}>
    {resolvedTheme === 'dark' && <div aria-hidden="true" className="absolute inset-0 bg-black/40" />}
    <Card className="relative w-full max-w-xl rounded-2xl bg-card/95 shadow-xl backdrop-blur-sm"><CardHeader className="space-y-4"><div className="flex items-center justify-between gap-4"><BrandingLogo /><LanguageSwitcher variant="compact" /></div><h1 className="text-2xl font-semibold tracking-tight">{title}</h1></CardHeader><CardContent className="space-y-5">{children}</CardContent></Card>
  </main>;
}
export function AppSumoActivationPage() {
  const { t } = useTranslation();
  const activation = useQuery({ queryKey: ['appsumo', 'activation'], queryFn: () => request('activation'), enabled: available(), retry: false });
  const action = useMutation({ mutationFn: (kind: string) => request(kind, 'POST', { confirm: true }), onSuccess: () => window.location.assign('/settings?tab=billing') });
  const user = useQuery({ queryKey: ['appsumo', 'user'], queryFn: async () => { const r = await fetch('/api/user'); if (r.status === 401) return null; if (!r.ok) throw new Error(); return r.json(); }, enabled: available(), retry: false });
  if (!available()) return <main className="p-8 text-foreground">{t('appsumo.not_found', 'Page not found.')}</main>;
  const data = activation.data;
  const canLink = user.data?.role === 'admin' && !user.data?.isSuperAdmin && user.data?.active !== false;
  return <AuthShell title={t('appsumo.activate_title', 'Activate Talkzen with AppSumo')}>
    <ErrorMessage error={activation.error || action.error || user.error} />
    {(activation.isLoading || user.isLoading) && <Loading>{t('appsumo.checking_license', 'Checking your license…')}</Loading>}
    {data && !user.isLoading && !user.error && <>
      <Badge variant="outline">{t('appsumo.tier', 'Tier {{tier}}', { tier: data.tier })} · {data.plan}</Badge>
      <p>{t('appsumo.lifetime_description', 'Your license includes {{plan}} for life. No card or Talkzen renewal payment is required.', { plan: data.plan })}</p>
      <Alert><AlertDescription>{t('appsumo.ai_notice', 'Use your own AI provider keys under Settings → AI Credentials. Platform AI credits are not included.')}</AlertDescription></Alert>
      {data.canContinue ? <Button data-tour="components-settings-appsumo.button.appsumo.continue" className="h-auto min-h-10 w-full whitespace-normal" disabled={action.isPending} onClick={() => action.mutate('continue')}>{action.isPending && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin shrink-0 me-2" />}{t('appsumo.continue', 'Continue to the linked account')}</Button> : user.data?.companyId ? <div className="space-y-4">
        <p>{t('appsumo.link_identity', 'Link to {{company}} as {{user}}.', { company: data.currentCompanyName || t('appsumo.current_company', 'your signed-in company'), user: user.data.fullName || user.data.username })}</p>
        <Alert><AlertDescription>{t('appsumo.billing_confirmation', 'This replaces its paid plan and stops future recurring charges. No prorated refund is issued.')}</AlertDescription></Alert>
        <Button data-tour="components-settings-appsumo.button.appsumo.confirm_activate" className="h-auto min-h-10 w-full whitespace-normal" disabled={action.isPending || !canLink} onClick={() => action.mutate('link')}>{action.isPending && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin shrink-0 me-2" />}{t('appsumo.confirm_activate', 'Confirm and activate lifetime plan')}</Button>
        {!canLink && <p className="text-sm text-muted-foreground">{t('appsumo.error_admin', 'Sign in with the administrator account required for this action.')}</p>}
      </div> : <div className="grid gap-3"><Button data-tour="components-settings-appsumo.button.appsumo.create_account" asChild className="h-auto min-h-10 whitespace-normal"><a href="/register?appsumo=1">{t('appsumo.create_account', 'Create a Talkzen account')}</a></Button><Button data-tour="components-settings-appsumo.button.appsumo.sign_in" asChild variant="outline" className="h-auto min-h-10 whitespace-normal"><a href="/auth?returnTo=%2Fappsumo%2Factivate">{t('appsumo.sign_in', 'Sign in to an existing account')}</a></Button></div>}
    </>}
    <Button data-tour="components-settings-appsumo.button.appsumo.restart" asChild variant="outline" className="h-auto min-h-10 w-full whitespace-normal"><a href={purchases}><ExternalLink aria-hidden="true" className="h-4 w-4 shrink-0 me-2" />{t('appsumo.restart', 'Open your AppSumo purchases')}</a></Button>
    <p className="text-sm text-muted-foreground">{t('appsumo.restart_help', 'Start or restart activation from your AppSumo purchases.')}</p>
  </AuthShell>;
}
export function AppSumoBilling({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();
  const status = useQuery({ queryKey: ['appsumo', 'status'], queryFn: () => request('status'), enabled: available(), retry: false });
  if (!available()) return <>{children}</>;
  if (status.isPending) return <Loading>{t('appsumo.checking_billing', 'Checking billing status…')}</Loading>;
  if (status.isError) return <ErrorMessage error={status.error} onRetry={() => void status.refetch()} />;
  if (!status.data) return <>{children}</>;
  const data = status.data;
  return <Card><CardHeader><CardTitle role="heading" aria-level={2}>{t('appsumo.billing_title', '{{plan}} (AppSumo)', { plan: data.plan })}</CardTitle><CardDescription>{t('appsumo.tier', 'Tier {{tier}}', { tier: data.tier })}</CardDescription></CardHeader><CardContent className="space-y-4">
    <AppSumoStatus status={data.status} />
    <p>{data.status === 'active' ? t('appsumo.lifetime_status', 'Lifetime access · No renewal charges') : t('appsumo.suspended_status', 'Access suspended · Reactivate your license on AppSumo')}</p>
    <p className="text-sm text-muted-foreground">{t('appsumo.ai_notice', 'Use your own AI provider keys under Settings → AI Credentials. Platform AI credits are not included.')}</p>
    <div className="flex flex-wrap gap-3"><Button data-tour="components-settings-appsumo.button.appsumo.manage" asChild className="h-auto min-h-10 whitespace-normal"><a href={data.management_url || purchases}>{t('appsumo.manage', 'Manage your license on AppSumo')}<ExternalLink aria-hidden="true" className="h-4 w-4 shrink-0 ms-2" /></a></Button><Button data-tour="components-settings-appsumo.button.appsumo.setup_ai" asChild variant="outline"><a href="/settings?tab=ai-credentials"><KeyRound aria-hidden="true" className="h-4 w-4 me-2" />{t('appsumo.setup_ai', 'Set up AI credentials')}</a></Button></div>
  </CardContent></Card>;
}
export function AppSumoPaidPlans({ children }: { children: ReactNode }) {
  const status = useQuery({ queryKey: ['appsumo', 'status'], queryFn: () => request('status'), enabled: available(), retry: false });
  return available() && (status.isPending || status.isError || status.data) ? null : <>{children}</>;
}
export function AppSumoAccessGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [logoutError, setLogoutError] = useState<unknown>();
  const [signingOut, setSigningOut] = useState(false);
  const access = useQuery({ queryKey: ['company-access-status'], queryFn: async () => { const r = await fetch('/api/company/access-status'); if (!r.ok) throw new Error(); return r.json(); }, refetchInterval: 30_000, retry: false });
  const recovery = /^\/(appsumo|auth|register|signup|admin|forgot-password|reset-password)(\/|$)/.test(window.location.pathname);
  if (access.data?.suspended && !recovery) return <AuthShell title={t('appsumo.suspended_title', 'Company access is suspended')}>
    <Alert><AlertDescription>{t('appsumo.data_preserved', 'Your data is preserved. Reactivate your license to restore access.')}</AlertDescription></Alert>
    {available() && <Button data-tour="components-settings-appsumo.button.appsumo.manage" asChild className="h-auto min-h-10 w-full whitespace-normal"><a href={purchases}>{t('appsumo.manage', 'Manage your license on AppSumo')}</a></Button>}
    <ErrorMessage error={logoutError} />
    <Button data-tour="components-settings-appsumo.button.appsumo.sign_out" variant="outline" disabled={signingOut} onClick={async () => { setSigningOut(true); try { const r = await fetch('/api/logout', { method: 'POST' }); if (!r.ok) throw new Error(); window.location.assign('/auth'); } catch (error) { setLogoutError(error); setSigningOut(false); } }}>{t('appsumo.sign_out', 'Sign out')}</Button>
  </AuthShell>;
  return <>{children}</>;
}
export function AppSumoRegistrationNotice() {
  const { t } = useTranslation();
  return <Alert><AlertDescription>{t('appsumo.registration_notice', 'Your verified AppSumo tier will be activated for life. No card required. Use your own AI provider keys.')}</AlertDescription></Alert>;
}
export function AppSumoCompanyLicense({ licenseKey }: { licenseKey: string }) {
  const { t } = useTranslation();
  return <Card className="mb-4"><CardHeader><CardTitle role="heading" aria-level={3} className="text-base">{t('appsumo.company_license', 'AppSumo lifetime license')}</CardTitle></CardHeader><CardContent className="space-y-3"><p dir="ltr" className="break-all font-mono text-sm">{licenseKey}</p><Button data-tour="components-settings-appsumo.button.appsumo.open_support" asChild variant="outline" className="h-auto whitespace-normal"><a href="/admin/settings?tab=appsumo">{t('appsumo.open_support', 'Open AppSumo license support')}</a></Button></CardContent></Card>;
}
function AppSumoStatus({ status }: { status: string }) {
  const { t } = useTranslation();
  const labels: Record<string, string> = { active: t('appsumo.active', 'Active'), inactive: t('appsumo.inactive', 'Inactive'), deactivated: t('appsumo.deactivated', 'Deactivated') };
  return <Badge variant={status === 'active' ? 'outline' : 'destructive'}>{labels[status] || t('appsumo.unknown', 'Unknown')}</Badge>;
}
function TechnicalDetails({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return <details className="text-sm"><summary className="cursor-pointer text-muted-foreground focus-visible:outline focus-visible:outline-ring">{t('appsumo.technical_details', 'Technical details')}</summary><div dir="auto" className="mt-2 break-words whitespace-pre-wrap rounded-md bg-muted p-3 text-muted-foreground">{children}</div></details>;
}
function Endpoint({ label, path }: { label: string; path: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const url = APPSUMO_ORIGIN + path;
  const id = path.includes('webhook') ? 'appsumo-webhook-url' : 'appsumo-callback-url';
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><div className="flex gap-2"><Input data-tour="components-settings-appsumo.input.appsumo.copy_url" id={id} dir="ltr" value={url} readOnly className="min-w-0 font-mono text-xs" /><Button data-tour="components-settings-appsumo.button.appsumo.copy_url" type="button" variant="outline" size="icon" className="shrink-0" aria-label={t('appsumo.copy_url', 'Copy {{label}}', { label })} onClick={async () => { try { await navigator.clipboard.writeText(url); toast({ title: t('appsumo.copied', 'URL copied') }); } catch { toast({ variant: 'destructive', title: t('appsumo.copy_failed', 'Could not copy. Select and copy the URL manually.') }); } }}><Copy aria-hidden="true" className="h-4 w-4" /></Button></div></div>;
}
export function AppSumoAdminPanel() {
  const { t, currentLanguage } = useTranslation();
  const { toast } = useToast();
  const config = useQuery({ queryKey: ['appsumo', 'config'], queryFn: () => request('admin/config'), enabled: available(), retry: false, refetchOnWindowFocus: false });
  const [search, setSearch] = useState('');
  const support = useQuery({ queryKey: ['appsumo', 'licenses', search], queryFn: () => request('admin/licenses?search=' + encodeURIComponent(search)), enabled: available(), retry: false });
  const [form, setForm] = useState({ enabled: false, clientId: '', apiKey: '', clientSecret: '', tiers: { '1': 0, '2': 0, '3': 0 } as Record<string, number> });
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (config.data && !dirty) setForm(f => ({ ...f, enabled: config.data.enabled, clientId: config.data.clientId, tiers: Object.fromEntries(config.data.tiers.map((tier: any) => [String(tier.tier), tier.plan_id])) })); }, [config.data, dirty]);
  const edit = (changes: Partial<typeof form>) => { setDirty(true); setForm(f => ({ ...f, ...changes })); };
  const save = useMutation({ mutationFn: () => request('admin/config', 'PUT', form), onSuccess: async () => { setForm(f => ({ ...f, apiKey: '', clientSecret: '' })); await config.refetch(); setDirty(false); toast({ title: t('appsumo.saved', 'Settings saved.') }); } });
  const retry = useMutation({ mutationFn: (id: number) => request('admin/events/' + id + '/retry', 'POST', {}), onSuccess: () => toast({ title: t('appsumo.reconciled', 'Reconciliation completed.') }), onSettled: () => { void support.refetch(); } });
  if (!available()) return null;
  const validTiers = [1, 2, 3].every(tier => config.data?.plans.some((p: any) => p.id === form.tiers[tier])) && new Set(Object.values(form.tiers)).size === 3;
  const validKey = !form.enabled || Boolean(form.apiKey.trim() || config.data?.hasApiKey);
  const eventLabels: Record<string, string> = { purchase: t('appsumo.purchase', 'Purchase'), activate: t('appsumo.activate', 'Activation'), upgrade: t('appsumo.upgrade', 'Upgrade'), downgrade: t('appsumo.downgrade', 'Downgrade'), deactivate: t('appsumo.deactivate', 'Deactivation') };
  return <section className="space-y-6 min-w-0 text-foreground">
    <div><h2 data-tour="components-settings-appsumo.h2.appsumo.admin_title" className="text-xl font-semibold">{t('appsumo.admin_title', 'AppSumo licensing')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('appsumo.admin_description', 'Available only at {{origin}}. AppSumo controls purchases, tier changes, and refunds.', { origin: APPSUMO_ORIGIN })}</p></div>
    {config.isPending && <Loading>{t('appsumo.loading_settings', 'Loading settings…')}</Loading>}
    <ErrorMessage error={config.error} onRetry={() => void config.refetch()} />
    {config.data && <form className="space-y-6" onSubmit={e => { e.preventDefault(); if (validTiers && validKey && !save.isPending) save.mutate(); }}>
      <fieldset disabled={save.isPending || config.isError} className="min-w-0 space-y-6">
        <Card><CardHeader><CardTitle role="heading" aria-level={3} className="text-lg">{t('appsumo.configuration', 'Configuration')}</CardTitle><CardDescription>{t('appsumo.configuration_help', 'Save your API key and enable AppSumo before validating the URLs. Add OAuth credentials after validation.')}</CardDescription></CardHeader><CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-4 rounded-lg border p-4"><Label htmlFor="appsumo-enabled">{t('appsumo.enable', 'Enable AppSumo')}</Label><Switch id="appsumo-enabled" checked={form.enabled} onCheckedChange={enabled => edit({ enabled })} /></div>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="appsumo-api-key">{t('appsumo.api_key', 'API key')}</Label>{config.data.hasApiKey && <Badge variant="outline" className="ms-2">{t('appsumo.stored', 'Saved')}</Badge>}<Input data-tour="components-settings-appsumo.input.appsumo-api-key" id="appsumo-api-key" dir="ltr" type="password" autoComplete="new-password" value={form.apiKey} onChange={e => edit({ apiKey: e.target.value })} aria-describedby="appsumo-secret-help" /></div>
            <div className="space-y-2"><Label htmlFor="appsumo-client-id">{t('appsumo.client_id', 'OAuth client ID')}</Label><Input data-tour="components-settings-appsumo.input.appsumo-client-id" id="appsumo-client-id" dir="ltr" value={form.clientId} onChange={e => edit({ clientId: e.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor="appsumo-client-secret">{t('appsumo.client_secret', 'OAuth client secret')}</Label>{config.data.hasClientSecret && <Badge variant="outline" className="ms-2">{t('appsumo.stored', 'Saved')}</Badge>}<Input data-tour="components-settings-appsumo.input.appsumo-client-secret" id="appsumo-client-secret" dir="ltr" type="password" autoComplete="new-password" value={form.clientSecret} onChange={e => edit({ clientSecret: e.target.value })} aria-describedby="appsumo-secret-help" /></div>
          </div><p id="appsumo-secret-help" className="text-sm text-muted-foreground">{t('appsumo.secret_help', 'Leave secret fields blank to keep the saved values.')}</p>
        </CardContent></Card>
        <Card><CardHeader><CardTitle role="heading" aria-level={3} className="text-lg">{t('appsumo.mappings', 'Tier mappings')}</CardTitle><CardDescription>{t('appsumo.mappings_help', 'Map each AppSumo tier to a different existing paid plan.')}</CardDescription></CardHeader><CardContent className="grid gap-5 lg:grid-cols-3">
          {([1, 2, 3] as const).map(tier => <div className="min-w-0 space-y-2" key={tier}><Label htmlFor={'appsumo-tier-' + tier}>{t('appsumo.tier', 'Tier {{tier}}', { tier })} — {APPSUMO_TIER_NAMES[tier]}</Label><Select dir={currentLanguage?.direction === 'rtl' ? 'rtl' : 'ltr'} value={form.tiers[tier] ? String(form.tiers[tier]) : ''} onValueChange={value => edit({ tiers: { ...form.tiers, [tier]: Number(value) } })}><SelectTrigger data-tour="components-settings-appsumo.selecttrigger.appsumo.select_plan" id={'appsumo-tier-' + tier} className="min-w-0"><SelectValue placeholder={t('appsumo.select_plan', 'Select existing plan')} /></SelectTrigger><SelectContent>{config.data.plans.map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent></Select></div>)}
        </CardContent></Card>
      </fieldset>
      {(!validTiers || !validKey) && <Alert><AlertDescription>{t('appsumo.error_config', 'Enter an API key and select a different active paid plan for each tier.')}</AlertDescription></Alert>}
      <ErrorMessage error={save.error} />
      <Button data-tour="components-settings-appsumo.button.appsumo.saving" type="submit" disabled={save.isPending || config.isError || !validTiers || !validKey} className="h-auto min-h-10 whitespace-normal">{save.isPending && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin me-2" />}{save.isPending ? t('appsumo.saving', 'Saving…') : t('appsumo.save', 'Save AppSumo settings')}</Button>
    </form>}
    <Card><CardHeader><CardTitle role="heading" aria-level={3} className="text-lg">{t('appsumo.endpoints', 'AppSumo endpoints')}</CardTitle><CardDescription>{t('appsumo.endpoints_help', 'Copy these URLs into your AppSumo product configuration.')}</CardDescription></CardHeader><CardContent className="grid gap-5 xl:grid-cols-2"><Endpoint label={t('appsumo.webhook_url', 'Webhook URL')} path="/api/appsumo/webhook" /><Endpoint label={t('appsumo.oauth_url', 'OAuth redirect URL')} path="/api/appsumo/oauth/callback" /></CardContent></Card>
    <Card className="min-w-0"><CardHeader><CardTitle role="heading" aria-level={3} className="text-lg">{t('appsumo.support', 'License support')}</CardTitle><CardDescription>{t('appsumo.support_help', 'Find a company using its current or historical license key.')}</CardDescription></CardHeader><CardContent className="space-y-4 min-w-0">
      <Label htmlFor="appsumo-search">{t('appsumo.search', 'Search license keys or company names')}</Label><Input data-tour="components-settings-appsumo.input.appsumo.search_placeholder" id="appsumo-search" placeholder={t('appsumo.search_placeholder', 'License key or company name')} value={search} onChange={e => setSearch(e.target.value)} />
      <ErrorMessage error={support.error} onRetry={() => void support.refetch()} />
      {support.isPending ? <Loading>{t('appsumo.loading_licenses', 'Loading licenses…')}</Loading> : support.data && <>
        <Table data-tour="components-settings-appsumo.table.appsumo.license" erpSortable={false} className="min-w-[640px]"><TableHeader><TableRow>{[t('appsumo.license', 'License'), t('appsumo.company', 'Company'), t('appsumo.tier_label', 'Tier'), t('appsumo.status', 'Status')].map(label => <TableHead key={label} className="text-start">{label}</TableHead>)}</TableRow></TableHeader><TableBody>
          {support.data.licenses.length === 0 && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">{t('appsumo.no_licenses', 'No licenses found.')}</TableCell></TableRow>}
          {support.data.licenses.map((l: any) => <TableRow key={l.license_key}><TableCell><span dir="ltr" className="inline-block break-all font-mono text-xs max-w-64">{l.license_key}</span>{l.replacement_key && <div className="mt-1 text-muted-foreground text-xs">{t('appsumo.replaced_by', 'Replaced by')}<br /><span dir="ltr" className="inline-block break-all max-w-64">{l.replacement_key}</span></div>}</TableCell><TableCell>{l.company_id ? <a className="text-primary underline underline-offset-4" href={'/admin/companies/' + l.company_id}>{l.company_name}</a> : t('appsumo.unclaimed', 'Unclaimed')}</TableCell><TableCell>{l.tier}</TableCell><TableCell><AppSumoStatus status={l.status} /></TableCell></TableRow>)}
        </TableBody></Table>
        <h3 className="pt-4 font-semibold">{t('appsumo.events_attention', 'Events requiring attention')}</h3><ErrorMessage error={retry.error} />
        {support.data.events.length === 0 && <p className="text-sm text-muted-foreground">{t('appsumo.no_events', 'No events require attention.')}</p>}
        {support.data.events.map((event: any) => <div key={event.id} className="rounded-lg border p-4 space-y-3"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{eventLabels[event.event] || t('appsumo.unknown', 'Unknown')}</Badge><span dir="ltr" className="break-all font-mono text-xs">{event.license_key}</span></div><p className="text-sm text-muted-foreground">{t('appsumo.event_pending', 'This event needs reconciliation. Review its details and retry.')}</p>{event.error && <TechnicalDetails>{event.error}</TechnicalDetails>}<Button data-tour="components-settings-appsumo.button.appsumo.retry_reconciliation" type="button" variant="outline" disabled={retry.isPending} onClick={() => retry.mutate(event.id)} className="h-auto min-h-10 whitespace-normal"><RefreshCw aria-hidden="true" className={'h-4 w-4 shrink-0 me-2 ' + (retry.isPending && retry.variables === event.id ? 'animate-spin' : '')} />{t('appsumo.retry_reconciliation', 'Retry reconciliation')}</Button></div>)}
        {support.data.billing.length > 0 && <h3 className="pt-4 font-semibold">{t('appsumo.billing_attention', 'Billing changes requiring attention')}</h3>}
        {support.data.billing.map((b: any, i: number) => <Alert key={i} variant="destructive"><AlertDescription className="space-y-2 text-foreground"><p>{t('appsumo.billing_company_error', 'Billing cancellation for company {{company}} needs attention.', { company: b.target_company_id })}</p><TechnicalDetails>{b.billing_error}</TechnicalDetails></AlertDescription></Alert>)}
      </>}
    </CardContent></Card>
  </section>;
}
