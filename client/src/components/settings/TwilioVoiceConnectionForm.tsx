import React, { useMemo, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ValidationSummary } from './ValidationSummary';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { AlertTriangle, Copy, ExternalLink, Info, Loader2, TestTube } from 'lucide-react';
import { VOICE_PROVIDER_STACK_OPTIONS, supportsBrowserVoiceConnection, type VoiceProviderStack } from '@shared/types/call-types';
import {
  buildVoiceConnectionDataPayload,
  createDefaultVoiceConnectionFormData,
  getDefaultVoiceWebhookValues,
  getTwimlAppVoiceUrl,
  isLocalhostOrigin,
  validateVoiceConnectionForm,
} from './voiceConnectionFormUtils';
import { mapVoiceConnectionValidationSections, voiceConnectionProviderStackLabelKey } from './voiceConnectionFormI18n';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function TwilioVoiceConnectionForm({ isOpen, onClose, onSuccess }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const origin = window.location.origin;
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [validationReport, setValidationReport] = useState<any | null>(null);
  const [form, setForm] = useState(() => createDefaultVoiceConnectionFormData(origin));
  const telephonyDisplay = t(
    form.providerStack === 'telnyx-vapi' ? 'settings.voiceConnectionForm.telephony.telnyx' : 'settings.voiceConnectionForm.telephony.twilio'
  );
  const aiDisplay = t(
    form.providerStack === 'telnyx-vapi' ? 'settings.voiceConnectionForm.ai.vapi' : 'settings.voiceConnectionForm.ai.elevenlabs'
  );
  const supportsBrowserDirect = supportsBrowserVoiceConnection(form.providerStack);
  const validationSections = useMemo(() => mapVoiceConnectionValidationSections(validationReport, t), [validationReport, t]);
  const twimlAppVoiceUrl = getTwimlAppVoiceUrl(origin);
  const isLocalhost = isLocalhostOrigin(origin);
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: t('settings.voiceConnectionForm.toast.copiedTitle'),
      description: t('settings.voiceConnectionForm.toast.copiedDescription'),
    });
  };
  const updateForm = (patch: Partial<typeof form>) => setForm(prev => ({ ...prev, ...patch }));
  const updateField = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    updateForm({ [event.target.name]: event.target.value } as Partial<typeof form>);
  const handleProviderChange = (providerStack: VoiceProviderStack) => {
    const defaults = getDefaultVoiceWebhookValues(origin, providerStack);
    updateForm({
      providerStack,
      webhookUrl: defaults.webhookUrl,
      statusCallbackUrl: defaults.statusCallbackUrl,
      elevenLabsPostCallWebhookUrl: defaults.elevenLabsPostCallWebhookUrl,
    });
    setValidationReport(null);
  };

  const runValidation = async () => {
    try {
      const response = await fetch('/api/channel-connections/validate-twilio-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ connectionData: buildVoiceConnectionDataPayload(form) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 429) {
        toast({
          title: t('settings.voiceConnectionForm.toast.validationRequestFailedTitle'),
          description: data.error || data.message || t('settings.voiceConnectionForm.toast.serverReturned', undefined, { status: response.status }),
          variant: 'destructive',
        });
        return null;
      }
      if (response.status === 429) {
        toast({
          title: t('settings.voiceConnectionForm.toast.rateLimitedTitle'),
          description: data.error || t('settings.voiceConnectionForm.toast.rateLimitedDescription'),
          variant: 'destructive',
        });
        return null;
      }
      return data;
    } catch {
      toast({
        title: t('settings.voiceConnectionForm.toast.validationRequestFailedTitle'),
        description: t('settings.voiceConnectionForm.toast.validationNetworkError'),
        variant: 'destructive',
      });
      return null;
    }
  };

  const handleValidate = async () => {
    const error = validateVoiceConnectionForm(form);
    if (error) {
      return toast({
        title: t('settings.voiceConnectionForm.toast.validationErrorTitle'),
        description: t(error),
        variant: 'destructive',
      });
    }
    setValidating(true);
    try {
      const report = await runValidation();
      if (report === null) return;
      setValidationReport(report);
      toast({
        title: report?.success
          ? t('settings.voiceConnectionForm.toast.validationCompleteTitle')
          : t('settings.voiceConnectionForm.toast.validationFailedTitle'),
        description:
          report?.recommendations?.[0] ||
          (report?.success
            ? t('settings.voiceConnectionForm.toast.validationPassedDescription')
            : t('settings.voiceConnectionForm.toast.validationReviewDescription')),
        variant: report?.success ? 'default' : 'destructive',
      });
    } finally {
      setValidating(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const error = validateVoiceConnectionForm(form);
    if (error) {
      return toast({
        title: t('settings.voiceConnectionForm.toast.validationErrorTitle'),
        description: t(error),
        variant: 'destructive',
      });
    }
    setLoading(true);
    try {
      const report = await runValidation();
      if (report === null) return;
      setValidationReport(report);
      if (!report.success) {
        return toast({
          title: t('settings.voiceConnectionForm.toast.preflightFailedTitle'),
          description: report.recommendations?.[0] || t('settings.voiceConnectionForm.toast.preflightFailedDescription'),
          variant: 'destructive',
        });
      }
      const response = await fetch('/api/channel-connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          channelType: 'twilio_voice',
          accountId: form.fromNumber,
          accountName: form.accountName,
          connectionData: buildVoiceConnectionDataPayload(form),
          status: 'active',
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || t('settings.voiceConnectionForm.toast.createVoiceConnectionFailed'));
      }
      toast({
        title: t('settings.voiceConnectionForm.toast.connectedTitle'),
        description: t('settings.voiceConnectionForm.toast.connectedDescription', undefined, {
          stack: t(voiceConnectionProviderStackLabelKey(form.providerStack)),
        }),
      });
      onSuccess();
      onClose();
    } catch (error: any) {
      toast({
        title: t('settings.voiceConnectionForm.toast.connectionFailedTitle'),
        description: error.message || t('settings.voiceConnectionForm.toast.connectionFailedDescription'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const telnyxWebhookLabel = t('settings.voiceConnectionForm.label.telnyxVoiceEventWebhook');

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent data-tour="components-settings-twiliovoiceconnectionform.dialogcontent.settings.voiceConnectionForm.title" className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('settings.voiceConnectionForm.title')}</DialogTitle>
          <DialogDescription>{t('settings.voiceConnectionForm.description')}</DialogDescription>
        </DialogHeader>
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="accountName">{t('settings.voiceConnectionForm.label.voiceChannelName')}</Label>
              <Input data-tour="components-settings-twiliovoiceconnectionform.input.accountName"
                id="accountName"
                name="accountName"
                value={form.accountName}
                onChange={updateField}
                placeholder={t('settings.voiceConnectionForm.placeholder.voiceChannelName')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="providerStack">{t('settings.voiceConnectionForm.label.providerStack')}</Label>
              <select data-tour="components-settings-twiliovoiceconnectionform.select.providerStack"
                id="providerStack"
                name="providerStack"
                value={form.providerStack}
                onChange={e => handleProviderChange(e.target.value as VoiceProviderStack)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {VOICE_PROVIDER_STACK_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {t(voiceConnectionProviderStackLabelKey(option.value))}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fromNumber">{t('settings.voiceConnectionForm.label.fromNumber')}</Label>
              <Input data-tour="components-settings-twiliovoiceconnectionform.input.fromNumber" id="fromNumber" name="fromNumber" value={form.fromNumber} onChange={updateField} placeholder="+15551234567" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="callMode">{t('settings.voiceConnectionForm.label.defaultOutboundMode')}</Label>
              <select data-tour="components-settings-twiliovoiceconnectionform.select.callMode"
                id="callMode"
                name="callMode"
                value={form.callMode}
                onChange={updateField}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="basic">{t('settings.voiceConnectionForm.callMode.basic')}</option>
                <option value="ai-powered">{t('settings.voiceConnectionForm.callMode.aiPowered')}</option>
              </select>
            </div>
          </div>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              {supportsBrowserDirect
                ? t('settings.voiceConnectionForm.browserInfo.twilioElevenlabs')
                : t('settings.voiceConnectionForm.browserInfo.telnyxVapi')}
            </AlertDescription>
          </Alert>
          <section className="space-y-4 rounded-lg border p-4">
            <div>
              <h3 className="font-medium">
                {t('settings.voiceConnectionForm.credentialsTitle', undefined, { provider: telephonyDisplay })}
              </h3>
              <p className="text-sm text-muted-foreground">{t('settings.voiceConnectionForm.credentialsHelp')}</p>
            </div>
            {form.providerStack === 'twilio-elevenlabs' ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="accountSid">{t('settings.voiceConnectionForm.label.twilioAccountSid')}</Label>
                  <Input data-tour="components-settings-twiliovoiceconnectionform.input.accountSid" id="accountSid" name="accountSid" value={form.accountSid} onChange={updateField} />
                  <p className="text-xs text-muted-foreground">{t('settings.voiceConnectionForm.hint.accountSid')}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="authToken">{t('settings.voiceConnectionForm.label.twilioAuthToken')}</Label>
                  <Input data-tour="components-settings-twiliovoiceconnectionform.input.authToken" id="authToken" name="authToken" type="password" value={form.authToken} onChange={updateField} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="apiKey">{t('settings.voiceConnectionForm.label.twilioApiKey')}</Label>
                  <Input data-tour="components-settings-twiliovoiceconnectionform.input.apiKey" id="apiKey" name="apiKey" value={form.apiKey} onChange={updateField} />
                  <p className="text-xs text-muted-foreground">{t('settings.voiceConnectionForm.hint.apiKey')}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="apiSecret">{t('settings.voiceConnectionForm.label.twilioApiSecret')}</Label>
                  <Input data-tour="components-settings-twiliovoiceconnectionform.input.apiSecret" id="apiSecret" name="apiSecret" type="password" value={form.apiSecret} onChange={updateField} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="twimlAppSid">{t('settings.voiceConnectionForm.label.twilioTwimlAppSid')}</Label>
                  <Input data-tour="components-settings-twiliovoiceconnectionform.input.twimlAppSid" id="twimlAppSid" name="twimlAppSid" value={form.twimlAppSid} onChange={updateField} />
                  <p className="text-xs text-muted-foreground">{t('settings.voiceConnectionForm.hint.twimlAppSid')}</p>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="telnyxApiKey">{t('settings.voiceConnectionForm.label.telnyxApiKey')}</Label>
                  <Input data-tour="components-settings-twiliovoiceconnectionform.input.telnyxApiKey" id="telnyxApiKey" name="telnyxApiKey" type="password" value={form.telnyxApiKey} onChange={updateField} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="telnyxConnectionId">
                    {t('settings.voiceConnectionForm.label.telnyxConnectionId')}{' '}
                    <span className="text-muted-foreground">({t('settings.voiceConnectionForm.optional')})</span>
                  </Label>
                  <Input data-tour="components-settings-twiliovoiceconnectionform.input.telnyxConnectionId" id="telnyxConnectionId" name="telnyxConnectionId" value={form.telnyxConnectionId} onChange={updateField} />
                </div>
              </div>
            )}
          </section>
          {form.providerStack === 'twilio-elevenlabs' && (
            <Alert>
              <AlertDescription className="space-y-2">
                <p className="font-medium">{t('settings.voiceConnectionForm.twimlAppVoiceUrlTitle')}</p>
                <div className="flex gap-2 items-center">
                  <Input data-tour="components-settings-twiliovoiceconnectionform.input.twimlAppVoiceUrl" value={twimlAppVoiceUrl} readOnly className="font-mono text-xs" />
                  <Button type="button" variant="outline" size="icon" onClick={() => copyToClipboard(twimlAppVoiceUrl)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{t('settings.voiceConnectionForm.twimlAppVoiceUrlHint')}</p>
              </AlertDescription>
            </Alert>
          )}
          {isLocalhost && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{t('settings.voiceConnectionForm.localhostWarning')}</AlertDescription>
            </Alert>
          )}
          <section className="space-y-4 rounded-lg border p-4">
            <div>
              <h3 className="font-medium">{t('settings.voiceConnectionForm.webhookSectionTitle')}</h3>
              <p className="text-sm text-muted-foreground">
                {form.providerStack === 'telnyx-vapi'
                  ? t('settings.voiceConnectionForm.webhookIntro.telnyx')
                  : t('settings.voiceConnectionForm.webhookIntro.general')}
              </p>
            </div>
            {form.providerStack === 'twilio-elevenlabs' ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="webhookUrl">{t('settings.voiceConnectionForm.label.webhookUrl')}</Label>
                  <Input data-tour="components-settings-twiliovoiceconnectionform.input.webhookUrl" id="webhookUrl" name="webhookUrl" value={form.webhookUrl} onChange={updateField} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="statusCallbackUrl">{t('settings.voiceConnectionForm.label.statusCallbackUrl')}</Label>
                  <Input data-tour="components-settings-twiliovoiceconnectionform.input.statusCallbackUrl" id="statusCallbackUrl" name="statusCallbackUrl" value={form.statusCallbackUrl} onChange={updateField} />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="webhookUrl">{telnyxWebhookLabel}</Label>
                  <Input data-tour="components-settings-twiliovoiceconnectionform.input.webhookUrl" id="webhookUrl" name="webhookUrl" value={form.webhookUrl} onChange={updateField} className="font-mono text-xs" />
                  <p className="text-xs text-muted-foreground">{t('settings.voiceConnectionForm.telnyxWebhookHelp')}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="telnyxWebhookVerificationKey">{t('settings.voiceConnectionForm.label.telnyxWebhookVerificationKey')}</Label>
                  <Input data-tour="components-settings-twiliovoiceconnectionform.input.telnyxWebhookVerificationKey"
                    id="telnyxWebhookVerificationKey"
                    name="telnyxWebhookVerificationKey"
                    value={form.telnyxWebhookVerificationKey}
                    onChange={updateField}
                    className="font-mono text-xs"
                    placeholder={t('settings.voiceConnectionForm.placeholder.telnyxWebhookVerificationKey')}
                  />
                  <p className="text-xs text-muted-foreground">{t('settings.voiceConnectionForm.telnyxWebhookVerificationHelp')}</p>
                </div>
              </div>
            )}
          </section>
          {form.callMode === 'ai-powered' && (
            <section className="space-y-4 rounded-lg border p-4">
              <div>
                <h3 className="font-medium">
                  {t('settings.voiceConnectionForm.aiConfigTitle', undefined, { provider: aiDisplay })}
                </h3>
                <p className="text-sm text-muted-foreground">{t('settings.voiceConnectionForm.aiConfigHelp')}</p>
              </div>
              {form.providerStack === 'twilio-elevenlabs' ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="elevenLabsApiKey">{t('settings.voiceConnectionForm.label.elevenLabsApiKey')}</Label>
                    <Input data-tour="components-settings-twiliovoiceconnectionform.input.elevenLabsApiKey" id="elevenLabsApiKey" name="elevenLabsApiKey" type="password" value={form.elevenLabsApiKey} onChange={updateField} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="elevenLabsAgentId">{t('settings.voiceConnectionForm.label.elevenLabsAgentId')}</Label>
                    <Input data-tour="components-settings-twiliovoiceconnectionform.input.elevenLabsAgentId" id="elevenLabsAgentId" name="elevenLabsAgentId" value={form.elevenLabsAgentId} onChange={updateField} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="elevenLabsAgentPhoneNumberId">{t('settings.voiceConnectionForm.label.elevenLabsAgentPhoneNumberId')}</Label>
                    <Input data-tour="components-settings-twiliovoiceconnectionform.input.elevenLabsAgentPhoneNumberId"
                      id="elevenLabsAgentPhoneNumberId"
                      name="elevenLabsAgentPhoneNumberId"
                      value={form.elevenLabsAgentPhoneNumberId}
                      onChange={updateField}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="voiceId">
                      {t('settings.voiceConnectionForm.label.voiceId')}{' '}
                      <span className="text-muted-foreground">({t('settings.voiceConnectionForm.optional')})</span>
                    </Label>
                    <Input data-tour="components-settings-twiliovoiceconnectionform.input.voiceId" id="voiceId" name="voiceId" value={form.voiceId} onChange={updateField} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="elevenLabsPrompt">
                      {t('settings.voiceConnectionForm.label.elevenLabsPrompt')}{' '}
                      <span className="text-muted-foreground">({t('settings.voiceConnectionForm.optionalIfAgentId')})</span>
                    </Label>
                    <Textarea data-tour="components-settings-twiliovoiceconnectionform.textarea.elevenLabsPrompt" id="elevenLabsPrompt" name="elevenLabsPrompt" value={form.elevenLabsPrompt} onChange={updateField} rows={4} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="elevenLabsPostCallWebhookUrl">{t('settings.voiceConnectionForm.label.elevenLabsPostCallWebhookUrl')}</Label>
                    <Input data-tour="components-settings-twiliovoiceconnectionform.input.elevenLabsPostCallWebhookUrl"
                      id="elevenLabsPostCallWebhookUrl"
                      name="elevenLabsPostCallWebhookUrl"
                      value={form.elevenLabsPostCallWebhookUrl}
                      onChange={updateField}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="elevenLabsWebhookSecret">{t('settings.voiceConnectionForm.label.elevenLabsWebhookSecret')}</Label>
                    <Input data-tour="components-settings-twiliovoiceconnectionform.input.elevenLabsWebhookSecret"
                      id="elevenLabsWebhookSecret"
                      name="elevenLabsWebhookSecret"
                      type="password"
                      value={form.elevenLabsWebhookSecret}
                      onChange={updateField}
                    />
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="vapiApiKey">{t('settings.voiceConnectionForm.label.vapiApiKey')}</Label>
                    <Input data-tour="components-settings-twiliovoiceconnectionform.input.vapiApiKey" id="vapiApiKey" name="vapiApiKey" type="password" value={form.vapiApiKey} onChange={updateField} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vapiAssistantId">{t('settings.voiceConnectionForm.label.vapiAssistantId')}</Label>
                    <Input data-tour="components-settings-twiliovoiceconnectionform.input.vapiAssistantId" id="vapiAssistantId" name="vapiAssistantId" value={form.vapiAssistantId} onChange={updateField} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="vapiPhoneNumberId">{t('settings.voiceConnectionForm.label.vapiPhoneNumberId')}</Label>
                    <Input data-tour="components-settings-twiliovoiceconnectionform.input.vapiPhoneNumberId" id="vapiPhoneNumberId" name="vapiPhoneNumberId" value={form.vapiPhoneNumberId} onChange={updateField} />
                  </div>
                </div>
              )}
            </section>
          )}
          {validationSections.length > 0 && (
            <ValidationSummary sections={validationSections} onCopyDiagnostics={() => JSON.stringify(validationReport, null, 2)} />
          )}
          <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 p-4">
            <Button data-tour="components-settings-twiliovoiceconnectionform.button.settings.voiceConnectionForm.setupInstructions" type="button" variant="outline" onClick={() => setShowDocs(true)}>
              <ExternalLink className="mr-2 h-4 w-4" />
              {t('settings.voiceConnectionForm.setupInstructions')}
            </Button>
            <Button data-tour="components-settings-twiliovoiceconnectionform.button.settings.voiceConnectionForm.validateConfiguration" type="button" variant="secondary" onClick={handleValidate} disabled={validating || loading}>
              {validating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TestTube className="mr-2 h-4 w-4" />}
              {t('settings.voiceConnectionForm.validateConfiguration')}
            </Button>
          </div>
          <DialogFooter>
            <Button data-tour="components-settings-twiliovoiceconnectionform.button.settings.voiceConnectionForm.cancel" type="button" variant="outline" onClick={onClose} disabled={loading}>
              {t('settings.voiceConnectionForm.cancel')}
            </Button>
            <Button data-tour="components-settings-twiliovoiceconnectionform.button.settings.voiceConnectionForm.saveVoiceChannel" type="submit" disabled={loading || validating}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('settings.voiceConnectionForm.saveVoiceChannel')}
            </Button>
          </DialogFooter>
        </form>
        <Dialog open={showDocs} onOpenChange={setShowDocs}>
          <DialogContent data-tour="components-settings-twiliovoiceconnectionform.dialogcontent.settings.voiceConnectionForm.docs.title" className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {t('settings.voiceConnectionForm.docs.title', undefined, { stack: t(voiceConnectionProviderStackLabelKey(form.providerStack)) })}
              </DialogTitle>
              <DialogDescription>{t('settings.voiceConnectionForm.docs.description')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              {form.providerStack === 'twilio-elevenlabs' ? (
                <>
                  <p>{t('settings.voiceConnectionForm.docs.twilio.p1')}</p>
                  <p>{t('settings.voiceConnectionForm.docs.twilio.p2')}</p>
                  <p>{t('settings.voiceConnectionForm.docs.twilio.p3')}</p>
                </>
              ) : (
                <>
                  <p>{t('settings.voiceConnectionForm.docs.telnyx.p1')}</p>
                  <p>{t('settings.voiceConnectionForm.docs.telnyx.p2')}</p>
                  <p>{t('settings.voiceConnectionForm.docs.telnyx.p3')}</p>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
