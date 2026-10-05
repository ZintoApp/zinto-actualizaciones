import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FACTUS_DEFAULT_SETTINGS, FACTUS_PAYMENT_METHODS, type FactusSettingsInput } from '@shared/factus';

type Settings = FactusSettingsInput & { configured?: boolean; verifiedAt?: string | null };
type NumberingRange = { id: number; document: string; prefix?: string; from?: number; to?: number; current?: number; isActive: boolean };

export default function ElectronicInvoicingSettingsPanel({ canManage }: { canManage: boolean; isDental: boolean }) {
  const { t, currentLanguage } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Settings>(FACTUS_DEFAULT_SETTINGS);
  const [ranges, setRanges] = useState<NumberingRange[]>([]);
  const queryKey = ['/api/erp/invoices/electronic-invoicing-settings'];
  const settingsQuery = useQuery<Settings>({
    queryKey,
    queryFn: async () => {
      const response = await apiRequest('GET', String(queryKey[0]));
      if (!response.ok) throw new Error(t('erp.electronicInvoicing.errors.loadSettings', 'Failed to load Factus settings'));
      const body = await response.json();
      return { ...FACTUS_DEFAULT_SETTINGS, ...body.data, defaults: { ...FACTUS_DEFAULT_SETTINGS.defaults, ...body.data?.defaults } };
    },
  });
  const rangesQuery = useQuery<NumberingRange[]>({
    queryKey: ['/api/erp/invoices/electronic-invoicing-numbering-ranges'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/erp/invoices/electronic-invoicing-numbering-ranges');
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || t('erp.electronicInvoicing.errors.loadRanges', 'Failed to load Factus numbering ranges'));
      return (body.data as NumberingRange[]).filter((range) => range.isActive && (!range.document || range.document === '01'));
    },
    enabled: settingsQuery.data?.configured === true,
    retry: false,
  });
  useEffect(() => { if (settingsQuery.data) setForm(settingsQuery.data); }, [settingsQuery.data]);
  useEffect(() => { if (rangesQuery.data) setRanges(rangesQuery.data); }, [rangesQuery.data]);
  const patch = (value: Partial<Settings>) => setForm((current) => ({ ...current, ...value }));
  const patchDefault = (key: keyof Settings['defaults'], value: string | boolean) => setForm((current) => ({ ...current, defaults: { ...current.defaults, [key]: value } }));

  const testMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/erp/invoices/electronic-invoicing-settings/test', form);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || t('erp.electronicInvoicing.errors.connectionFailed', 'Factus connection failed'));
      return body.data as { ranges: NumberingRange[]; verifiedAt: string };
    },
    onSuccess: ({ ranges: nextRanges, verifiedAt }) => {
      const active = nextRanges.filter((range) => range.isActive && (!range.document || range.document === '01'));
      setRanges(active);
      if (!form.numberingRangeId && active.length === 1) patch({ numberingRangeId: active[0].id });
      patch({ verifiedAt });
      toast({ title: t('erp.electronicInvoicing.factus.connected', 'Factus connection verified') });
    },
    onError: (error: Error) => toast({ title: error.message, variant: 'destructive' }),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('PUT', String(queryKey[0]), form);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || t('erp.electronicInvoicing.errors.saveSettings', 'Failed to save Factus settings'));
      return body.data as Settings;
    },
    onSuccess: (data) => {
      setForm(data);
      queryClient.setQueryData(queryKey, data);
      queryClient.invalidateQueries({ queryKey: ['/api/erp/invoices/electronic-invoicing-status'] });
      toast({ title: t('erp.electronicInvoicing.saved', 'Electronic invoicing settings saved') });
    },
    onError: (error: Error) => toast({ title: error.message, variant: 'destructive' }),
  });

  return <Card><CardContent className="pt-6 space-y-5">
    <div><h2 data-tour="components-erp-settings-electronicinvoicingsettingspanel.h2.erp.electronicInvoicing.factus.title" className="text-lg font-semibold">{t('erp.electronicInvoicing.factus.title', 'Factus electronic invoicing')}</h2><p className="text-sm text-muted-foreground">{t('erp.electronicInvoicing.factus.description', 'Validate Colombian standard sales invoices with Factus API v2.')}</p></div>
    {settingsQuery.isLoading ? <p className="text-sm text-muted-foreground">{t('erp.common.loading', 'Loading...')}</p> : <>
      <div className="flex items-center justify-between rounded-md border p-3"><Label htmlFor="factus-enabled">{t('erp.electronicInvoicing.factus.enabled', 'Enable Factus')}</Label><Switch id="factus-enabled" checked={form.enabled} onCheckedChange={(enabled) => patch({ enabled })} disabled={!canManage} /></div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2"><Label>{t('erp.electronicInvoicing.environment', 'Environment')}</Label><Select value={form.environment} onValueChange={(environment: 'sandbox' | 'production') => patch({ environment })} disabled={!canManage}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sandbox">{t('erp.electronicInvoicing.environment.sandbox', 'Sandbox')}</SelectItem><SelectItem value="production">{t('erp.electronicInvoicing.environment.production', 'Production')}</SelectItem></SelectContent></Select></div>
        <div className="space-y-2"><Label>{t('erp.electronicInvoicing.factus.accountEmail', 'Factus account email')}</Label><Input data-tour="components-erp-settings-electronicinvoicingsettingspanel.input.erp.electronicInvoicing.environment" type="email" value={form.username} onChange={(e) => patch({ username: e.target.value })} disabled={!canManage} /></div>
        <div className="space-y-2"><Label>{t('erp.electronicInvoicing.factus.password', 'Password')}</Label><Input data-tour="components-erp-settings-electronicinvoicingsettingspanel.input.erp.electronicInvoicing.environment" type="password" value={form.password} onChange={(e) => patch({ password: e.target.value })} disabled={!canManage} /></div>
        <div className="space-y-2"><Label>{t('erp.electronicInvoicing.factus.clientId', 'Client ID')}</Label><Input data-tour="components-erp-settings-electronicinvoicingsettingspanel.input.erp.electronicInvoicing.environment" value={form.clientId} onChange={(e) => patch({ clientId: e.target.value })} disabled={!canManage} /></div>
        <div className="space-y-2"><Label>{t('erp.electronicInvoicing.factus.clientSecret', 'Client secret')}</Label><Input data-tour="components-erp-settings-electronicinvoicingsettingspanel.input.erp.electronicInvoicing.environment" type="password" value={form.clientSecret} onChange={(e) => patch({ clientSecret: e.target.value })} disabled={!canManage} /></div>
        <div className="space-y-2"><Label>{t('erp.electronicInvoicing.factus.numberingRange', 'Numbering range')}</Label><Select value={form.numberingRangeId ? String(form.numberingRangeId) : ''} onValueChange={(value) => patch({ numberingRangeId: Number(value) })} disabled={!canManage || ranges.length === 0}><SelectTrigger data-tour="components-erp-settings-electronicinvoicingsettingspanel.selecttrigger.erp.electronicInvoicing.factus.loadingRanges"><SelectValue placeholder={rangesQuery.isLoading ? t('erp.electronicInvoicing.factus.loadingRanges', 'Loading ranges…') : t('erp.electronicInvoicing.factus.testToLoadRanges', 'Test the connection to load ranges')} /></SelectTrigger><SelectContent>{ranges.map((range) => <SelectItem key={range.id} value={String(range.id)}>{range.prefix || t('erp.electronicInvoicing.factus.range', 'Range {{id}}', { id: range.id })} ({range.current ?? range.from ?? '—'}–{range.to ?? '—'})</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>{t('erp.electronicInvoicing.factus.defaultUnitCode', 'Default unit code')}</Label><Input data-tour="components-erp-settings-electronicinvoicingsettingspanel.input.erp.electronicInvoicing.environment" value={form.defaults.unitMeasureCode} onChange={(e) => patchDefault('unitMeasureCode', e.target.value)} disabled={!canManage} /></div>
        <div className="space-y-2"><Label>{t('erp.electronicInvoicing.factus.defaultProductStandard', 'Default product standard')}</Label><Input data-tour="components-erp-settings-electronicinvoicingsettingspanel.input.erp.electronicInvoicing.environment" value={form.defaults.standardCode} onChange={(e) => patchDefault('standardCode', e.target.value)} disabled={!canManage} /></div>
        <div className="space-y-2"><Label>{t('erp.electronicInvoicing.factus.defaultTaxCode', 'Default tax code')}</Label><Input data-tour="components-erp-settings-electronicinvoicingsettingspanel.input.erp.electronicInvoicing.environment" value={form.defaults.taxCode} onChange={(e) => patchDefault('taxCode', e.target.value)} disabled={!canManage} /></div>
        <div className="space-y-2"><Label>{t('erp.electronicInvoicing.factus.defaultPaymentForm', 'Default payment form')}</Label><Select value={form.defaults.paymentForm} onValueChange={(value: '1' | '2') => patchDefault('paymentForm', value)} disabled={!canManage}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">{t('erp.electronicInvoicing.paymentForms.cash', 'Cash')}</SelectItem><SelectItem value="2">{t('erp.electronicInvoicing.paymentForms.credit', 'Credit')}</SelectItem></SelectContent></Select></div>
        <div className="space-y-2"><Label>{t('erp.electronicInvoicing.factus.defaultPaymentMethod', 'Default payment method')}</Label><Select value={form.defaults.paymentMethodCode} onValueChange={(value) => patchDefault('paymentMethodCode', value)} disabled={!canManage}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{FACTUS_PAYMENT_METHODS.map(([code, label]) => <SelectItem key={code} value={code}>{code} — {t(`erp.electronicInvoicing.paymentMethods.${code}`, label)}</SelectItem>)}</SelectContent></Select></div>
      </div>
      <p className="text-xs text-muted-foreground">{form.verifiedAt ? t('erp.electronicInvoicing.factus.lastVerified', 'Last verified: {{date}}', { date: new Date(form.verifiedAt).toLocaleString(currentLanguage?.code) }) : t('erp.electronicInvoicing.factus.notVerified', 'Connection not verified. Factus email delivery is always disabled.')}</p>
      {canManage && <div className="flex gap-2"><Button data-tour="components-erp-settings-electronicinvoicingsettingspanel.button.erp.electronicInvoicing.factus.testing" type="button" variant="outline" onClick={() => testMutation.mutate()} disabled={testMutation.isPending}>{testMutation.isPending ? t('erp.electronicInvoicing.factus.testing', 'Testing…') : t('erp.electronicInvoicing.factus.testConnection', 'Test connection')}</Button><Button data-tour="components-erp-settings-electronicinvoicingsettingspanel.button.erp.common.saving" type="button" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>{saveMutation.isPending ? t('erp.common.saving', 'Saving…') : t('erp.common.save', 'Save')}</Button></div>}
    </>}
  </CardContent></Card>;
}
