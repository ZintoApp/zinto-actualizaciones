import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, AlertTriangle, ExternalLink, Send } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { useChannelConnections } from '@/hooks/useChannelConnections';
import { useAuth } from '@/hooks/use-auth';
import type { Contact, ChannelType } from '@shared/schema';
import type { QuotationSendErrorCode } from '@shared/erp-quotation-send-errors';
import { QUOTATION_SEND_ERROR_CODES } from '@shared/erp-quotation-send-errors';

// Mirror server/services/erp-channel-notification-utils.ts ORDER_NOTIFICATION_DM_CHANNEL_TYPES
const OMNICHANNEL_SEND_TYPES = new Set([
  'whatsapp_official',
  'whatsapp_unofficial',
  'whatsapp',
  'telegram',
  'twilio_sms',
  'messenger',
  'instagram',
  'tiktok',
  'webchat',
  'email',
]);

const CONNECTION_PRIORITY = [
  'whatsapp_official',
  'whatsapp_unofficial',
  'whatsapp',
  'email',
  'messenger',
  'instagram',
  'telegram',
  'twilio_sms',
  'webchat',
  'tiktok',
];

function applyTemplate(tpl: string, vars: Record<string, string>): string {
  let out = tpl;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(v);
  }
  return out;
}

const WHATSAPP_SMS_IDENTIFIER_TYPES = new Set(['whatsapp', 'phone']);

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

function resolveRecipient(
  contact: Contact | null | undefined,
  channelType: ChannelType | string | null,
): string | null {
  if (!contact || !channelType) return null;

  if (channelType === 'email') {
    const email = trimOrNull(contact.email);
    if (email) return email;
    if (contact.identifierType === 'email') {
      return trimOrNull(contact.identifier);
    }
    return null;
  }

  if (
    channelType.startsWith('whatsapp') ||
    channelType === 'twilio_sms'
  ) {
    const phone = trimOrNull(contact.phone);
    if (phone) return phone;
    if (
      contact.identifierType &&
      WHATSAPP_SMS_IDENTIFIER_TYPES.has(contact.identifierType)
    ) {
      return trimOrNull(contact.identifier);
    }
    return null;
  }

  if (channelType === 'telegram') {
    return contact.identifier || contact.phone;
  }

  if (
    channelType === 'messenger' ||
    channelType === 'instagram' ||
    channelType === 'tiktok' ||
    channelType === 'webchat'
  ) {
    return contact.identifier;
  }

  return null;
}

function isQuotationSendErrorCode(v: unknown): v is QuotationSendErrorCode {
  return typeof v === 'string' && (QUOTATION_SEND_ERROR_CODES as readonly string[]).includes(v);
}

type SendQuotationResponse = {
  success?: boolean;
  errorCode?: string;
  errorParams?: Record<string, string>;
  /** @deprecated Server uses errorCode; not shown in UI */
  error?: string;
  message?: string;
  channelType?: string;
  recipient?: string;
  data?: {
    channelType?: string;
    recipient?: string;
    pdfUrl?: string;
  };
};

function sendQuotationErrorToastMessage(
  json: SendQuotationResponse,
  t: (key: string, defaultValue: string, vars?: Record<string, string>) => string,
  channelLabel: (channelType: string) => string,
): string {
  const params = json.errorParams ?? {};
  if (isQuotationSendErrorCode(json.errorCode)) {
    switch (json.errorCode) {
      case 'contact_no_channel_identifier':
        return t(
          'erp.salesOrders.sendQuotation.errors.contactNoChannelIdentifier',
          'Contact has no {{channel}} identifier on file.',
          { channel: channelLabel(params.channelType ?? '') },
        );
      case 'sales_order_not_found':
        return t(
          'erp.salesOrders.sendQuotation.errors.salesOrderNotFound',
          'Sales order not found',
        );
      case 'quotation_cancelled':
        return t(
          'erp.salesOrders.sendQuotation.errors.quotationCancelled',
          'Cannot send a cancelled quotation',
        );
      case 'sales_order_no_contact':
        return t(
          'erp.salesOrders.sendQuotation.errors.salesOrderNoContact',
          'Sales order has no contact',
        );
      case 'contact_not_found':
        return t(
          'erp.salesOrders.sendQuotation.errors.contactNotFound',
          'Contact not found',
        );
      case 'channel_connection_not_found':
        return t(
          'erp.salesOrders.sendQuotation.errors.channelConnectionNotFound',
          'Channel connection not found',
        );
      case 'channel_connection_unavailable':
        return t(
          'erp.salesOrders.sendQuotation.errors.channelConnectionUnavailable',
          'Channel connection is not available',
        );
      case 'channel_type_mismatch':
        return t(
          'erp.salesOrders.sendQuotation.errors.channelTypeMismatch',
          'Channel type does not match connection',
        );
      case 'no_usable_channel_connection':
        return t(
          'erp.salesOrders.sendQuotation.errors.noUsableChannelConnection',
          'No usable channel connection found for this contact',
        );
      case 'contact_no_email':
        return t(
          'erp.salesOrders.sendQuotation.errors.contactNoEmail',
          'Contact has no email on file',
        );
      case 'contact_no_whatsapp_phone':
        return t(
          'erp.salesOrders.sendQuotation.errors.contactNoWhatsappPhone',
          'Contact has no WhatsApp number on file',
        );
      case 'channel_send_failed':
        return t(
          'erp.salesOrders.sendQuotation.errors.channelSendFailed',
          'Failed to send message through the channel',
        );
      case 'unexpected_error':
        return t(
          'erp.salesOrders.sendQuotation.errors.unexpectedError',
          'An unexpected error occurred while sending the quotation',
        );
    }
  }
  return t('erp.salesOrders.sendQuotation.sendFailed', 'Failed to send quotation');
}

function normalizeSendQuotationResult(json: SendQuotationResponse): {
  channelType?: string;
  recipient?: string;
} {
  if (
    json.data &&
    (json.data.channelType != null || json.data.recipient != null)
  ) {
    return {
      channelType: json.data.channelType,
      recipient: json.data.recipient,
    };
  }
  return {
    channelType: json.channelType,
    recipient: json.recipient,
  };
}

export type SendQuotationOrder = {
  id: number;
  orderNumber: string;
  contactId: number | null;
  status: string;
  currency: string | null;
  totalAmount: string;
  validUntil: string | null;
};

type SendQuotationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: SendQuotationOrder | null;
};

export function SendQuotationDialog({
  open,
  onOpenChange,
  order,
}: SendQuotationDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { company } = useAuth();
  const companyId = company?.id;

  const { data: connections = [], isLoading: connectionsLoading } =
    useChannelConnections();

  const { data: contact, isLoading: contactLoading } = useQuery({
    queryKey: ['/api/contacts', order?.contactId, 'send-quotation'],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/contacts/${order!.contactId}`);
      const json = await res.json();
      if (json && typeof json === 'object' && 'contact' in json && json.contact) {
        return json.contact as Contact;
      }
      return json as Contact;
    },
    enabled: open && order?.contactId != null,
  });

  const eligibleConnections = useMemo(
    () =>
      connections.filter(
        (c) =>
          OMNICHANNEL_SEND_TYPES.has(c.channelType) &&
          (c.status === 'active' || c.status === 'connected'),
      ),
    [connections],
  );

  const [selectedConnectionId, setSelectedConnectionId] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [templatesReady, setTemplatesReady] = useState(false);

  const friendlyChannelLabel = (channelType: ChannelType | string): string => {
    if (channelType.startsWith('whatsapp')) {
      return t(
        'erp.salesOrders.sendQuotation.channelLabel.whatsapp',
        'WhatsApp',
      );
    }
    switch (channelType) {
      case 'email':
        return t('erp.salesOrders.sendQuotation.channelLabel.email', 'Email');
      case 'telegram':
        return t(
          'erp.salesOrders.sendQuotation.channelLabel.telegram',
          'Telegram',
        );
      case 'messenger':
        return t(
          'erp.salesOrders.sendQuotation.channelLabel.messenger',
          'Messenger',
        );
      case 'instagram':
        return t(
          'erp.salesOrders.sendQuotation.channelLabel.instagram',
          'Instagram',
        );
      case 'tiktok':
        return t('erp.salesOrders.sendQuotation.channelLabel.tiktok', 'TikTok');
      case 'webchat':
        return t(
          'erp.salesOrders.sendQuotation.channelLabel.webchat',
          'Webchat',
        );
      case 'twilio_sms':
        return t('erp.salesOrders.sendQuotation.channelLabel.sms', 'SMS');
      default:
        return channelType;
    }
  };

  useEffect(() => {
    if (!open || !order) return;
    setSelectedConnectionId('');
    setMessageBody('');
    setEmailSubject('');
    setTemplatesReady(false);
  }, [open, order?.id]);

  useEffect(() => {
    if (!open || !order || connectionsLoading) return;
    if (eligibleConnections.length === 0) return;

    setSelectedConnectionId((prev) => {
      if (prev && eligibleConnections.some((c) => String(c.id) === prev)) {
        return prev;
      }
      for (const type of CONNECTION_PRIORITY) {
        const found = eligibleConnections.find((c) => c.channelType === type);
        if (found) return String(found.id);
      }
      return String(eligibleConnections[0].id);
    });
  }, [open, order?.id, eligibleConnections, connectionsLoading]);

  const {
    data: quotationNotifSettings,
    isLoading: quotationNotifSettingsLoading,
    isSuccess: quotationNotifSettingsSuccess,
    isError: quotationNotifSettingsError,
  } = useQuery({
    queryKey: ['/api/erp/quotation-notifications', companyId],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/quotation-notifications');
      if (!res.ok) throw new Error('Failed to load quotation notification settings');
      const json = await res.json();
      return json.data as { enabled: boolean; messageBody: string; emailSubject: string };
    },
    enabled: open && companyId != null,
  });

  useEffect(() => {
    if (!open || !order || contactLoading || quotationNotifSettingsLoading) return;

    if (quotationNotifSettingsError) {
      setTemplatesReady(true);
      return;
    }

    if (!quotationNotifSettingsSuccess || !quotationNotifSettings) return;

    const vars: Record<string, string> = {
      contactName: contact?.name?.trim() || 'there',
      orderNumber: order.orderNumber,
      currency: order.currency ?? 'USD',
      totalAmount: String(order.totalAmount ?? '0'),
      validUntil: order.validUntil
        ? new Date(order.validUntil).toLocaleDateString()
        : '',
      companyName: company?.name?.trim() || '',
    };

    setMessageBody((prev) =>
      prev === '' ? applyTemplate(quotationNotifSettings.messageBody, vars) : prev,
    );
    setEmailSubject((prev) =>
      prev === '' ? applyTemplate(quotationNotifSettings.emailSubject, vars) : prev,
    );
    setTemplatesReady(true);
  }, [
    open,
    order,
    contact,
    contactLoading,
    quotationNotifSettings,
    quotationNotifSettingsLoading,
    quotationNotifSettingsSuccess,
    quotationNotifSettingsError,
    company?.name,
  ]);

  const selectedConnection =
    eligibleConnections.find((c) => String(c.id) === selectedConnectionId) ??
    null;
  const selectedChannelType = selectedConnection?.channelType ?? null;
  const isEmailChannel = selectedChannelType === 'email';
  const recipient = resolveRecipient(contact, selectedChannelType);
  const recipientMissing = !!selectedChannelType && !recipient;

  const pdfHref = order
    ? `/api/erp/sales-orders/${order.id}/quotation-pdf?templateType=a4`
    : '';

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!order || !selectedConnection) {
        throw new Error('Missing order or channel');
      }
      const body: {
        connectionId: number;
        channelType: string;
        messageBody?: string;
        emailSubject?: string;
      } = {
        connectionId: selectedConnection.id,
        channelType: selectedConnection.channelType,
      };
      if (quotationNotifSettingsSuccess) {
        const trimmedBody = messageBody.trim();
        if (trimmedBody) body.messageBody = trimmedBody;
        if (isEmailChannel) {
          const trimmedSubject = emailSubject.trim();
          if (trimmedSubject) body.emailSubject = trimmedSubject;
        }
      }
      const res = await apiRequest(
        'POST',
        `/api/erp/sales-orders/${order.id}/send-quotation`,
        body,
      );
      return res.json() as Promise<SendQuotationResponse>;
    },
    onSuccess: (json) => {
      if (!json.success) {
        toast({
          variant: 'destructive',
          title: t('ui.common.error', 'Error'),
          description: sendQuotationErrorToastMessage(json, t, friendlyChannelLabel),
        });
        return;
      }

      const { channelType: confirmedChannel, recipient: confirmedRecipient } =
        normalizeSendQuotationResult(json);
      const channel = friendlyChannelLabel(
        confirmedChannel ?? selectedChannelType ?? '',
      );
      const recipientLabel = confirmedRecipient ?? recipient ?? '—';
      toast({
        title: t(
          'erp.salesOrders.sendQuotation.successToast',
          'Quotation sent via {{channel}} to {{recipient}}',
          { channel, recipient: recipientLabel },
        ),
      });
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ['/api/erp/sales-orders'] });
      if (companyId != null && order) {
        queryClient.invalidateQueries({
          queryKey: ['/api/erp/sales-orders', companyId, order.id],
        });
      }
    },
    onError: (error: unknown) => {
      const err = error as {
        message?: string;
        errorCode?: string;
        errorParams?: Record<string, string>;
      };
      const description = err.errorCode
        ? sendQuotationErrorToastMessage(
            { errorCode: err.errorCode, errorParams: err.errorParams },
            t,
            friendlyChannelLabel,
          )
        : err.message ??
          t('erp.salesOrders.sendQuotation.sendFailed', 'Failed to send quotation');
      toast({
        variant: 'destructive',
        title: t('ui.common.error', 'Error'),
        description,
      });
    },
  });

  if (!order) return null;

  const sendDisabled =
    sendMutation.isPending ||
    !selectedConnection ||
    recipientMissing ||
    contactLoading ||
    connectionsLoading ||
    quotationNotifSettingsLoading ||
    (!templatesReady && !quotationNotifSettingsError) ||
    eligibleConnections.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-tour="components-erp-sendquotationdialog.dialogcontent.erp.salesOrders.sendQuotation.title" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t(
              'erp.salesOrders.sendQuotation.title',
              'Send quotation {{orderNumber}}',
              { orderNumber: order.orderNumber },
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
            <span className="font-medium truncate">
              {t(
                'erp.salesOrders.sendQuotation.pdfFileLabel',
                'Quotation {{orderNumber}}.pdf',
                { orderNumber: order.orderNumber },
              )}
            </span>
            <Button data-tour="components-erp-sendquotationdialog.button.erp.salesOrders.sendQuotation.openPdf" asChild variant="outline" size="sm">
              <a href={pdfHref} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4 mr-1" />
                {t('erp.salesOrders.sendQuotation.openPdf', 'Open PDF')}
              </a>
            </Button>
          </div>

          {order.status === 'draft' && (
            <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              {t(
                'erp.salesOrders.sendQuotation.draftAdvisory',
                'This order is still a draft. You can promote it to a quotation from the lifecycle controls.',
              )}
            </p>
          )}

          <div className="space-y-2">
            <Label>
              {t('erp.salesOrders.sendQuotation.channel', 'Channel')}
            </Label>
            {connectionsLoading ? (
              <Button data-tour="components-erp-sendquotationdialog.button.ui.common.loading" variant="outline" className="w-full justify-start" disabled>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('ui.common.loading', 'Loading…')}
              </Button>
            ) : eligibleConnections.length === 0 ? (
              <p className="text-sm text-destructive">
                {t(
                  'erp.salesOrders.sendQuotation.noConnections',
                  'No connected channels available. Connect WhatsApp, Email or another channel first.',
                )}
              </p>
            ) : (
              <Select
                value={selectedConnectionId}
                onValueChange={setSelectedConnectionId}
              >
                <SelectTrigger data-tour="components-erp-sendquotationdialog.selecttrigger.erp.salesOrders.sendQuotation.channel">
                  <SelectValue
                    placeholder={t(
                      'erp.salesOrders.sendQuotation.channel',
                      'Channel',
                    )}
                  >
                    {selectedConnection
                      ? `${selectedConnection.accountName} · ${friendlyChannelLabel(selectedConnection.channelType)}`
                      : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent searchable>
                  {eligibleConnections.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.accountName} — {friendlyChannelLabel(c.channelType)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {recipientMissing ? (
            <div className="flex items-start gap-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                {t(
                  'erp.salesOrders.sendQuotation.missingRecipient',
                  'Contact has no {{channel}} address — pick another channel or update the contact.',
                  {
                    channel: friendlyChannelLabel(selectedChannelType!),
                  },
                )}
              </span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t(
                'erp.salesOrders.sendQuotation.recipient',
                'Recipient: {{value}}',
                { value: recipient ?? '—' },
              )}
            </p>
          )}

          {isEmailChannel && (
            <div className="space-y-2">
              <Label htmlFor="send-quotation-subject">
                {t('erp.salesOrders.sendQuotation.subject', 'Subject')}
              </Label>
              <Input data-tour="components-erp-sendquotationdialog.input.send-quotation-subject"
                id="send-quotation-subject"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="send-quotation-message">
              {t('erp.salesOrders.sendQuotation.message', 'Message')}
            </Label>
            <Textarea data-tour="components-erp-sendquotationdialog.textarea.send-quotation-message"
              id="send-quotation-message"
              rows={5}
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t(
                'erp.salesOrders.sendQuotation.placeholdersHint',
                'Placeholders pre-filled from this quotation.',
              )}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button data-tour="components-erp-sendquotationdialog.button.ui.common.cancel"
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t('ui.common.cancel', 'Cancel')}
          </Button>
          <Button data-tour="components-erp-sendquotationdialog.button.erp.salesOrders.sendQuotation.send"
            type="button"
            disabled={sendDisabled}
            onClick={() => sendMutation.mutate()}
          >
            {sendMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-1" />
            )}
            {t('erp.salesOrders.sendQuotation.send', 'Send')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
