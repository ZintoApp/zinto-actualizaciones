import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { Copy, AlertCircle, Loader2 } from 'lucide-react';

interface TelegramFormData {
  accountName: string;
  botToken: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/** Bot tokens use `<bot_user_id>:<secret>`; schema requires a non-empty accountId string. */
function accountIdFromTelegramBotToken(botToken: string): string {
  const trimmed = botToken.trim();
  const prefix = trimmed.split(':')[0]?.trim() ?? '';
  if (/^\d+$/.test(prefix)) {
    return prefix;
  }
  return `telegram-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function defaultTelegramWebhookUrl(): string {
  if (typeof window === 'undefined') return '/api/webhooks/telegram';
  return `${window.location.origin}/api/webhooks/telegram`;
}

export function TelegramConnectionForm({ isOpen, onClose, onSuccess }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<TelegramFormData>({
    accountName: '',
    botToken: ''
  });
  const [webhookUrl, setWebhookUrl] = useState(defaultTelegramWebhookUrl);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (!formData.accountName || !formData.botToken) {
      toast({
        title: t('settings.telegramConnectionForm.toast.validationErrorTitle'),
        description: t('settings.telegramConnectionForm.toast.validationRequiredFields'),
        variant: "destructive"
      });
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/channel-connections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          channelType: 'telegram',
          accountId: accountIdFromTelegramBotToken(formData.botToken),
          accountName: formData.accountName,
          connectionData: {
            botToken: formData.botToken.trim(),
            webhookUrl: webhookUrl.trim() || defaultTelegramWebhookUrl()
          }
        })
      });

      if (response.ok) {
        toast({
          title: t('settings.telegramConnectionForm.toast.createdTitle'),
          description: t('settings.telegramConnectionForm.toast.createdDescription'),
        });
        onSuccess();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || t('settings.telegramConnectionForm.toast.createFailedDescription'));
      }

      setFormData({
        accountName: '',
        botToken: ''
      });
      setWebhookUrl(defaultTelegramWebhookUrl());
    } catch (error: any) {
      toast({
        title: t('settings.telegramConnectionForm.toast.createFailedTitle'),
        description: error.message || t('settings.telegramConnectionForm.toast.createFailedDescription'),
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      accountName: '',
      botToken: ''
    });
    setWebhookUrl(defaultTelegramWebhookUrl());
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && handleClose()}>
      <DialogContent data-tour="components-settings-telegramconnectionform.dialogcontent.settings.telegramConnectionForm.title" className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('settings.telegramConnectionForm.title')}</DialogTitle>
          <DialogDescription>{t('settings.telegramConnectionForm.description')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="accountName">{t('settings.telegramConnectionForm.label.accountNameRequired')}</Label>
            <Input data-tour="components-settings-telegramconnectionform.input.accountName"
              id="accountName"
              name="accountName"
              value={formData.accountName}
              onChange={handleInputChange}
              placeholder={t('settings.telegramConnectionForm.placeholder.accountName')}
              required
            />
            <p className="text-sm text-muted-foreground">{t('settings.telegramConnectionForm.hint.accountName')}</p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="botToken">{t('settings.telegramConnectionForm.label.botTokenRequired')}</Label>
            <Input data-tour="components-settings-telegramconnectionform.input.botToken"
              id="botToken"
              name="botToken"
              type="password"
              value={formData.botToken}
              onChange={handleInputChange}
              placeholder={t('settings.telegramConnectionForm.placeholder.botToken')}
              required
            />
            <p className="text-sm text-muted-foreground">{t('settings.telegramConnectionForm.hint.botToken')}</p>
          </div>

          <div className="border-t border-border pt-4">
            <h4 className="font-medium mb-3 text-foreground">{t('settings.telegramConnectionForm.section.webhook')}</h4>
            <p className="text-sm text-muted-foreground mb-2">{t('settings.telegramConnectionForm.webhook.autoDescription')}</p>
            <Label htmlFor="telegram-webhook-url">{t('settings.telegramConnectionForm.label.webhookUrl')}</Label>
            <div className="flex gap-2 flex-wrap items-center">
              <Input data-tour="components-settings-telegramconnectionform.input.telegram-webhook-url"
                id="telegram-webhook-url"
                name="webhookUrl"
                value={webhookUrl}
                onChange={e => setWebhookUrl(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder={defaultTelegramWebhookUrl()}
                className="min-w-[200px] flex-1"
              />
              <Button data-tour="components-settings-telegramconnectionform.button.settings.telegramConnectionForm.toast.copiedTitle"
                type="button"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(webhookUrl.trim() || defaultTelegramWebhookUrl());
                  toast({
                    title: t('settings.telegramConnectionForm.toast.copiedTitle'),
                    description: t('settings.telegramConnectionForm.toast.copiedWebhookDescription')
                  });
                }}
              >
                <Copy className="h-4 w-4 mr-1" /> {t('settings.telegramConnectionForm.copy')}
              </Button>
            </div>

            <div className="mt-3 rounded-lg border border-blue-200/90 bg-blue-50/95 p-3 dark:border-blue-900/55 dark:bg-blue-950/40">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                <div className="text-sm text-blue-950 dark:text-blue-100">
                  <p className="mb-1 font-medium">{t('settings.telegramConnectionForm.webhook.setupTitle')}</p>
                  <ol className="list-inside list-decimal space-y-1 text-xs text-blue-900/90 dark:text-blue-200/85">
                    <li>{t('settings.telegramConnectionForm.webhook.step1')}</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button data-tour="components-settings-telegramconnectionform.button.settings.telegramConnectionForm.cancel" type="button" variant="outline" onClick={handleClose}>
              {t('settings.telegramConnectionForm.cancel')}
            </Button>
            <Button data-tour="components-settings-telegramconnectionform.button.settings.telegramConnectionForm.creating" type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('settings.telegramConnectionForm.creating')}
                </>
              ) : (
                t('settings.telegramConnectionForm.createConnection')
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
