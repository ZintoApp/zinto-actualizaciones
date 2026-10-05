import React, { useState, useEffect } from 'react';
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

interface TelegramEditFormData {
  accountName: string;
  botToken: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  connectionId: number;
}

function defaultTelegramWebhookUrl(): string {
  if (typeof window === 'undefined') return '/api/webhooks/telegram';
  return `${window.location.origin}/api/webhooks/telegram`;
}

export function EditTelegramConnectionForm({ isOpen, onClose, onSuccess, connectionId }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [loadingConnection, setLoadingConnection] = useState(false);
  const [formData, setFormData] = useState<TelegramEditFormData>({
    accountName: '',
    botToken: ''
  });
  const [webhookUrl, setWebhookUrl] = useState(defaultTelegramWebhookUrl);

  useEffect(() => {
    if (isOpen && connectionId) {
      loadConnectionData();
    }
  }, [isOpen, connectionId]);

  const loadConnectionData = async () => {
    setLoadingConnection(true);
    try {
      const response = await fetch(`/api/channel-connections/${connectionId}`);
      if (!response.ok) {
        throw new Error(t('settings.telegramConnectionForm.edit.toast.loadConnectionFailed'));
      }

      const connection = await response.json();

      const cd = connection.connectionData as { webhookUrl?: string } | null | undefined;
      const stored =
        cd && typeof cd.webhookUrl === 'string' && cd.webhookUrl.trim() ? cd.webhookUrl.trim() : '';
      setWebhookUrl(stored || defaultTelegramWebhookUrl());

      setFormData({
        accountName: connection.accountName || '',
        botToken: ''
      });
    } catch (error: any) {
      console.error('Error loading connection data:', error);
      toast({
        title: t('settings.telegramConnectionForm.edit.toast.loadErrorTitle'),
        description: t('settings.telegramConnectionForm.edit.toast.loadErrorDescription'),
        variant: 'destructive'
      });
    } finally {
      setLoadingConnection(false);
    }
  };

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

    if (!formData.accountName?.trim()) {
      toast({
        title: t('settings.telegramConnectionForm.toast.validationErrorTitle'),
        description: t('settings.telegramConnectionForm.toast.validationRequiredFields'),
        variant: 'destructive'
      });
      setLoading(false);
      return;
    }

    try {
      const payload: {
        accountName: string;
        connectionData: { webhookUrl: string; botToken?: string };
      } = {
        accountName: formData.accountName.trim(),
        connectionData: {
          webhookUrl: webhookUrl.trim() || defaultTelegramWebhookUrl()
        }
      };

      if (formData.botToken.trim()) {
        payload.connectionData.botToken = formData.botToken.trim();
      }

      const response = await fetch(`/api/channel-connections/${connectionId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || errorData.error || t('settings.telegramConnectionForm.edit.toast.updateFailedDescription')
        );
      }

      await response.json();

      toast({
        title: t('settings.telegramConnectionForm.edit.toast.updatedTitle'),
        description: t('settings.telegramConnectionForm.edit.toast.updatedDescription')
      });

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error updating Telegram connection:', error);
      toast({
        title: t('settings.telegramConnectionForm.edit.toast.updateFailedTitle'),
        description: error.message || t('settings.telegramConnectionForm.edit.toast.updateFailedDescription'),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading && !loadingConnection) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && handleClose()}>
      <DialogContent data-tour="components-settings-edittelegramconnectionform.dialogcontent.settings.telegramConnectionForm.edit.title" className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('settings.telegramConnectionForm.edit.title')}</DialogTitle>
          <DialogDescription>{t('settings.telegramConnectionForm.edit.description')}</DialogDescription>
        </DialogHeader>

        {loadingConnection ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="mr-2 h-6 w-6 animate-spin" />
            {t('settings.telegramConnectionForm.edit.loading')}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-telegram-accountName">
                {t('settings.telegramConnectionForm.label.accountNameRequired')}
              </Label>
              <Input data-tour="components-settings-edittelegramconnectionform.input.edit-telegram-accountName"
                id="edit-telegram-accountName"
                name="accountName"
                value={formData.accountName}
                onChange={handleInputChange}
                placeholder={t('settings.telegramConnectionForm.placeholder.accountName')}
                required
              />
              <p className="text-sm text-muted-foreground">{t('settings.telegramConnectionForm.hint.accountName')}</p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-telegram-botToken">{t('settings.telegramConnectionForm.label.botToken')}</Label>
              <Input data-tour="components-settings-edittelegramconnectionform.input.edit-telegram-botToken"
                id="edit-telegram-botToken"
                name="botToken"
                type="password"
                value={formData.botToken}
                onChange={handleInputChange}
                placeholder={t('settings.telegramConnectionForm.edit.placeholder.botToken')}
              />
              <p className="text-sm text-muted-foreground">{t('settings.telegramConnectionForm.edit.hint.botToken')}</p>
            </div>

            <div className="border-t border-border pt-4">
              <h4 className="font-medium mb-3 text-foreground">{t('settings.telegramConnectionForm.section.webhook')}</h4>
              <p className="text-sm text-muted-foreground mb-2">{t('settings.telegramConnectionForm.edit.webhookManaged')}</p>
              <Label htmlFor="edit-telegram-webhook-url">{t('settings.telegramConnectionForm.label.webhookUrl')}</Label>
              <div className="flex gap-2 flex-wrap items-center">
                <Input data-tour="components-settings-edittelegramconnectionform.input.edit-telegram-webhook-url"
                  id="edit-telegram-webhook-url"
                  name="webhookUrl"
                  value={webhookUrl}
                  onChange={e => setWebhookUrl(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={defaultTelegramWebhookUrl()}
                  className="min-w-[200px] flex-1"
                />
                <Button data-tour="components-settings-edittelegramconnectionform.button.settings.telegramConnectionForm.toast.copiedTitle"
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
                    <p className="mb-1 font-medium">{t('settings.telegramConnectionForm.edit.noteTitle')}</p>
                    <p className="text-xs text-blue-900/90 dark:text-blue-200/85">{t('settings.telegramConnectionForm.edit.noteBody')}</p>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button data-tour="components-settings-edittelegramconnectionform.button.settings.telegramConnectionForm.cancel" type="button" variant="outline" onClick={handleClose} disabled={loading || loadingConnection}>
                {t('settings.telegramConnectionForm.cancel')}
              </Button>
              <Button data-tour="components-settings-edittelegramconnectionform.button.settings.telegramConnectionForm.edit.updating" type="submit" variant="outline" className="btn-brand-primary" disabled={loading || loadingConnection}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('settings.telegramConnectionForm.edit.updating')}
                  </>
                ) : (
                  t('settings.telegramConnectionForm.edit.updateConnection')
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
