import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Copy } from 'lucide-react';
import { ERP_PAYMENT_SECRET_MASK } from '@shared/erp-payment-gateway';

type GatewayKey =
  | 'stripe'
  | 'paypal'
  | 'paystack'
  | 'mercadopago'
  | 'moyasar'
  | 'mpesa'
  | 'bank_transfer';

type ManualMethodKey = 'cash' | 'check' | 'credit_card' | 'debit_card' | 'other';

const GATEWAY_SLUG: Record<GatewayKey, string> = {
  stripe: 'stripe',
  paypal: 'paypal',
  paystack: 'paystack',
  mercadopago: 'mercadopago',
  moyasar: 'moyasar',
  mpesa: 'mpesa',
  bank_transfer: 'bank-transfer',
};

function GatewayCard({
  title,
  description,
  enabled,
  onEnabledChange,
  children,
  onSave,
  onTest,
  saving,
  testing,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  children: React.ReactNode;
  onSave: () => void;
  onTest?: () => void;
  saving: boolean;
  testing?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Switch checked={enabled} onCheckedChange={onEnabledChange} />
          <Label>Enabled</Label>
        </div>
        {children}
        <div className="flex flex-wrap gap-2">
          <Button onClick={onSave} disabled={saving || !enabled}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save
          </Button>
          {onTest ? (
            <Button variant="outline" onClick={onTest} disabled={testing || !enabled}>
              {testing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Test connection
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function WebhookUrlField({ url }: { url: string }) {
  const { toast } = useToast();
  return (
    <div className="space-y-2">
      <Label>Webhook URL</Label>
      <div className="flex gap-2">
        <Input data-tour="components-erp-settings-erppaymentgatewayspanel.input.url" value={url} readOnly className="font-mono text-xs" />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => {
            void navigator.clipboard.writeText(url);
            toast({ title: 'Copied webhook URL' });
          }}
        >
          <Copy className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default function ErpPaymentGatewaysPanel() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeGateway, setActiveGateway] = useState<GatewayKey | null>(null);
  const [forms, setForms] = useState<Record<string, Record<string, unknown>>>({});
  const [manualMethods, setManualMethods] = useState<Record<ManualMethodKey, { enabled: boolean }>>({
    cash: { enabled: true },
    check: { enabled: true },
    credit_card: { enabled: true },
    debit_card: { enabled: true },
    other: { enabled: true },
  });

  const { data, isLoading } = useQuery<Record<string, Record<string, unknown>>>({
    queryKey: ['/api/erp/payment-gateways'],
  });

  useEffect(() => {
    if (!data) return;
    const next: Record<string, Record<string, unknown>> = {};
    for (const key of Object.keys(GATEWAY_SLUG)) {
      if (data[key]) next[key] = { ...data[key] };
    }
    setForms(next);
    if (data.manualMethods) {
      setManualMethods(data.manualMethods as typeof manualMethods);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async ({ gateway, body }: { gateway: GatewayKey; body: Record<string, unknown> }) => {
      const res = await apiRequest('POST', `/api/erp/payment-gateways/${GATEWAY_SLUG[gateway]}`, body);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to save');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('erp.settings.paymentGateways.saved', 'Payment gateway saved') });
      void queryClient.invalidateQueries({ queryKey: ['/api/erp/payment-gateways'] });
      void queryClient.invalidateQueries({ queryKey: ['/api/erp/payment-methods'] });
      setActiveGateway(null);
    },
    onError: (e: Error) => {
      toast({ title: e.message, variant: 'destructive' });
      setActiveGateway(null);
    },
  });

  const testMutation = useMutation({
    mutationFn: async (gateway: GatewayKey) => {
      const res = await apiRequest('POST', `/api/erp/payment-gateways/${GATEWAY_SLUG[gateway]}/test`, {});
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.details || 'Test failed');
      }
      return res.json();
    },
    onSuccess: (result) => {
      toast({ title: result.message || 'Connection successful' });
      setActiveGateway(null);
    },
    onError: (e: Error) => {
      toast({ title: e.message, variant: 'destructive' });
      setActiveGateway(null);
    },
  });

  const manualMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/erp/payment-gateways/manual-methods', manualMethods);
      if (!res.ok) throw new Error('Failed to save manual methods');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('erp.settings.paymentGateways.manualSaved', 'Manual payment methods saved') });
      void queryClient.invalidateQueries({ queryKey: ['/api/erp/payment-methods'] });
    },
  });

  const patchForm = useCallback((gateway: GatewayKey, patch: Record<string, unknown>) => {
    setForms((prev) => ({ ...prev, [gateway]: { ...(prev[gateway] || {}), ...patch } }));
  }, []);

  const getForm = (gateway: GatewayKey) => forms[gateway] || {};

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const stripe = getForm('stripe');
  const paypal = getForm('paypal');
  const paystack = getForm('paystack');
  const mercadopago = getForm('mercadopago');
  const moyasar = getForm('moyasar');
  const mpesa = getForm('mpesa');
  const bank = getForm('bank_transfer');

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {t(
          'erp.settings.paymentGateways.intro',
          'Configure payment gateways for your ERP invoices. Customers can pay via direct gateway links on sent invoices.'
        )}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GatewayCard
          title="Stripe"
          description={t('erp.settings.paymentGateways.stripe', 'Accept card payments via Stripe')}
          enabled={!!stripe.enabled}
          onEnabledChange={(enabled) => patchForm('stripe', { enabled })}
          saving={activeGateway === 'stripe' && saveMutation.isPending}
          testing={activeGateway === 'stripe' && testMutation.isPending}
          onSave={() => {
            setActiveGateway('stripe');
            saveMutation.mutate({ gateway: 'stripe', body: stripe });
          }}
          onTest={() => {
            setActiveGateway('stripe');
            testMutation.mutate('stripe');
          }}
        >
          <div className="space-y-2">
            <Label>Publishable key</Label>
            <Input
              value={String(stripe.publishableKey || '')}
              onChange={(e) => patchForm('stripe', { publishableKey: e.target.value })}
              disabled={!stripe.enabled}
            />
          </div>
          <div className="space-y-2">
            <Label>Secret key</Label>
            <Input
              type="password"
              value={String(stripe.secretKey || '')}
              onChange={(e) => patchForm('stripe', { secretKey: e.target.value })}
              placeholder={ERP_PAYMENT_SECRET_MASK}
              disabled={!stripe.enabled}
            />
          </div>
          <div className="space-y-2">
            <Label>Webhook secret</Label>
            <Input
              value={String(stripe.webhookSecret || '')}
              onChange={(e) => patchForm('stripe', { webhookSecret: e.target.value })}
              disabled={!stripe.enabled}
            />
          </div>
          {stripe.webhookUrl ? <WebhookUrlField url={String(stripe.webhookUrl)} /> : null}
          <div className="flex items-center gap-2">
            <Switch
              checked={!!stripe.testMode}
              onCheckedChange={(testMode) => patchForm('stripe', { testMode })}
              disabled={!stripe.enabled}
            />
            <Label>Test mode</Label>
          </div>
        </GatewayCard>

        <GatewayCard
          title="PayPal"
          description="Accept PayPal payments"
          enabled={!!paypal.enabled}
          onEnabledChange={(enabled) => patchForm('paypal', { enabled })}
          saving={activeGateway === 'paypal' && saveMutation.isPending}
          testing={activeGateway === 'paypal' && testMutation.isPending}
          onSave={() => {
            setActiveGateway('paypal');
            saveMutation.mutate({ gateway: 'paypal', body: paypal });
          }}
          onTest={() => {
            setActiveGateway('paypal');
            testMutation.mutate('paypal');
          }}
        >
          <div className="space-y-2">
            <Label>Client ID</Label>
            <Input
              value={String(paypal.clientId || '')}
              onChange={(e) => patchForm('paypal', { clientId: e.target.value })}
              disabled={!paypal.enabled}
            />
          </div>
          <div className="space-y-2">
            <Label>Client secret</Label>
            <Input
              type="password"
              value={String(paypal.clientSecret || '')}
              onChange={(e) => patchForm('paypal', { clientSecret: e.target.value })}
              disabled={!paypal.enabled}
            />
          </div>
          {paypal.webhookUrl ? <WebhookUrlField url={String(paypal.webhookUrl)} /> : null}
        </GatewayCard>

        <GatewayCard
          title="Paystack"
          description="Accept Paystack payments"
          enabled={!!paystack.enabled}
          onEnabledChange={(enabled) => patchForm('paystack', { enabled })}
          saving={activeGateway === 'paystack' && saveMutation.isPending}
          testing={activeGateway === 'paystack' && testMutation.isPending}
          onSave={() => {
            setActiveGateway('paystack');
            saveMutation.mutate({ gateway: 'paystack', body: paystack });
          }}
          onTest={() => {
            setActiveGateway('paystack');
            testMutation.mutate('paystack');
          }}
        >
          <div className="space-y-2">
            <Label>Public key</Label>
            <Input
              value={String(paystack.publicKey || '')}
              onChange={(e) => patchForm('paystack', { publicKey: e.target.value })}
              disabled={!paystack.enabled}
            />
          </div>
          <div className="space-y-2">
            <Label>Secret key</Label>
            <Input
              type="password"
              value={String(paystack.secretKey || '')}
              onChange={(e) => patchForm('paystack', { secretKey: e.target.value })}
              disabled={!paystack.enabled}
            />
          </div>
          <div className="space-y-2">
            <Label>Merchant currency</Label>
            <Input
              value={String(paystack.merchantCurrency || '')}
              onChange={(e) => patchForm('paystack', { merchantCurrency: e.target.value })}
              disabled={!paystack.enabled}
            />
          </div>
          {paystack.webhookUrl ? <WebhookUrlField url={String(paystack.webhookUrl)} /> : null}
        </GatewayCard>

        <GatewayCard
          title="Mercado Pago"
          description="Accept Mercado Pago payments"
          enabled={!!mercadopago.enabled}
          onEnabledChange={(enabled) => patchForm('mercadopago', { enabled })}
          saving={activeGateway === 'mercadopago' && saveMutation.isPending}
          testing={activeGateway === 'mercadopago' && testMutation.isPending}
          onSave={() => {
            setActiveGateway('mercadopago');
            saveMutation.mutate({ gateway: 'mercadopago', body: mercadopago });
          }}
          onTest={() => {
            setActiveGateway('mercadopago');
            testMutation.mutate('mercadopago');
          }}
        >
          <div className="space-y-2">
            <Label>Access token</Label>
            <Input
              type="password"
              value={String(mercadopago.accessToken || '')}
              onChange={(e) => patchForm('mercadopago', { accessToken: e.target.value })}
              disabled={!mercadopago.enabled}
            />
          </div>
          {mercadopago.webhookUrl ? <WebhookUrlField url={String(mercadopago.webhookUrl)} /> : null}
        </GatewayCard>

        <GatewayCard
          title="Moyasar"
          description="Accept Moyasar payments (SAR)"
          enabled={!!moyasar.enabled}
          onEnabledChange={(enabled) => patchForm('moyasar', { enabled })}
          saving={activeGateway === 'moyasar' && saveMutation.isPending}
          testing={activeGateway === 'moyasar' && testMutation.isPending}
          onSave={() => {
            setActiveGateway('moyasar');
            saveMutation.mutate({ gateway: 'moyasar', body: moyasar });
          }}
          onTest={() => {
            setActiveGateway('moyasar');
            testMutation.mutate('moyasar');
          }}
        >
          <div className="space-y-2">
            <Label>Publishable key</Label>
            <Input
              value={String(moyasar.publishableKey || '')}
              onChange={(e) => patchForm('moyasar', { publishableKey: e.target.value })}
              disabled={!moyasar.enabled}
            />
          </div>
          <div className="space-y-2">
            <Label>Secret key</Label>
            <Input
              type="password"
              value={String(moyasar.secretKey || '')}
              onChange={(e) => patchForm('moyasar', { secretKey: e.target.value })}
              disabled={!moyasar.enabled}
            />
          </div>
          {moyasar.webhookUrl ? <WebhookUrlField url={String(moyasar.webhookUrl)} /> : null}
        </GatewayCard>

        <GatewayCard
          title="M-PESA"
          description="Accept M-PESA mobile money"
          enabled={!!mpesa.enabled}
          onEnabledChange={(enabled) => patchForm('mpesa', { enabled })}
          saving={activeGateway === 'mpesa' && saveMutation.isPending}
          testing={activeGateway === 'mpesa' && testMutation.isPending}
          onSave={() => {
            setActiveGateway('mpesa');
            saveMutation.mutate({ gateway: 'mpesa', body: mpesa });
          }}
          onTest={() => {
            setActiveGateway('mpesa');
            testMutation.mutate('mpesa');
          }}
        >
          <div className="space-y-2">
            <Label>Consumer key</Label>
            <Input
              value={String(mpesa.consumerKey || '')}
              onChange={(e) => patchForm('mpesa', { consumerKey: e.target.value })}
              disabled={!mpesa.enabled}
            />
          </div>
          <div className="space-y-2">
            <Label>Consumer secret</Label>
            <Input
              type="password"
              value={String(mpesa.consumerSecret || '')}
              onChange={(e) => patchForm('mpesa', { consumerSecret: e.target.value })}
              disabled={!mpesa.enabled}
            />
          </div>
          <div className="space-y-2">
            <Label>Business shortcode</Label>
            <Input
              value={String(mpesa.businessShortcode || '')}
              onChange={(e) => patchForm('mpesa', { businessShortcode: e.target.value })}
              disabled={!mpesa.enabled}
            />
          </div>
          <div className="space-y-2">
            <Label>Passkey</Label>
            <Input
              type="password"
              value={String(mpesa.passkey || '')}
              onChange={(e) => patchForm('mpesa', { passkey: e.target.value })}
              disabled={!mpesa.enabled}
            />
          </div>
          {mpesa.webhookUrl ? <WebhookUrlField url={String(mpesa.webhookUrl)} /> : null}
        </GatewayCard>

        <GatewayCard
          title="Bank transfer"
          description="Show bank details on invoices"
          enabled={!!bank.enabled}
          onEnabledChange={(enabled) => patchForm('bank_transfer', { enabled })}
          saving={activeGateway === 'bank_transfer' && saveMutation.isPending}
          onSave={() => {
            setActiveGateway('bank_transfer');
            saveMutation.mutate({ gateway: 'bank_transfer', body: bank });
          }}
        >
          <div className="space-y-2">
            <Label>Account name</Label>
            <Input
              value={String(bank.accountName || '')}
              onChange={(e) => patchForm('bank_transfer', { accountName: e.target.value })}
              disabled={!bank.enabled}
            />
          </div>
          <div className="space-y-2">
            <Label>Account number</Label>
            <Input
              value={String(bank.accountNumber || '')}
              onChange={(e) => patchForm('bank_transfer', { accountNumber: e.target.value })}
              disabled={!bank.enabled}
            />
          </div>
          <div className="space-y-2">
            <Label>Bank name</Label>
            <Input
              value={String(bank.bankName || '')}
              onChange={(e) => patchForm('bank_transfer', { bankName: e.target.value })}
              disabled={!bank.enabled}
            />
          </div>
          <div className="space-y-2">
            <Label>Instructions</Label>
            <Textarea
              value={String(bank.instructions || '')}
              onChange={(e) => patchForm('bank_transfer', { instructions: e.target.value })}
              disabled={!bank.enabled}
            />
          </div>
        </GatewayCard>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('erp.settings.paymentGateways.manualTitle', 'Manual / offline methods')}</CardTitle>
          <CardDescription>
            {t(
              'erp.settings.paymentGateways.manualDescription',
              'Choose which methods staff can select when recording payments manually.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(Object.keys(manualMethods) as ManualMethodKey[]).map((key) => (
            <div key={key} className="flex items-center gap-2">
              <Switch
                checked={manualMethods[key].enabled}
                onCheckedChange={(enabled) =>
                  setManualMethods((prev) => ({ ...prev, [key]: { enabled } }))
                }
              />
              <Label className="capitalize">{key.replace(/_/g, ' ')}</Label>
            </div>
          ))}
          <Button onClick={() => manualMutation.mutate()} disabled={manualMutation.isPending}>
            {manualMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save manual methods
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
