import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { apiRequest } from '@/lib/queryClient';
import { Loader2 } from 'lucide-react';
import type { Language } from '@/hooks/use-translation';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  connectionId: number | null;
}

export function EditWebChatConnectionForm({ isOpen, onClose, onSuccess, connectionId }: Props) {
  const { t, languages: contextLanguages } = useTranslation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [loadingConn, setLoadingConn] = useState(false);

  const [accountName, setAccountName] = useState('');
  const [widgetColor, setWidgetColor] = useState('#6366f1');
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [position, setPosition] = useState<'bottom-right' | 'bottom-left' | 'bottom-center'>('bottom-right');
  const [theme, setTheme] = useState<'auto' | 'light' | 'dark'>('auto');
  const [showAvatar, setShowAvatar] = useState(true);
  const [allowFileUpload, setAllowFileUpload] = useState(false);
  const [collectEmail, setCollectEmail] = useState(false);
  const [collectName, setCollectName] = useState(false);
  const [widgetLanguage, setWidgetLanguage] = useState('en');
  const [widgetToken, setWidgetToken] = useState<string>('');

  const { data: fetchedLanguages = [] } = useQuery({
    queryKey: ['available-languages'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/languages');
      const result = await response.json();
      return (result || []) as Language[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const languages = fetchedLanguages.length > 0 ? fetchedLanguages : contextLanguages;
  const activeLanguages = useMemo(
    () => languages.filter((l) => l.isActive !== false),
    [languages]
  );

  useEffect(() => {
    const load = async () => {
      if (!isOpen || !connectionId) return;
      setLoadingConn(true);
      try {
        const res = await fetch(`/api/channel-connections/${connectionId}`);
        if (!res.ok) throw new Error(t('settings.webchatConnectionForm.edit.toast.loadFailed'));
        const c = await res.json();
        setAccountName(c.accountName || '');
        const data = c.connectionData || {};
        setWidgetColor(data.widgetColor || '#6366f1');
        setWelcomeMessage(data.welcomeMessage || '');
        setCompanyName(data.companyName || '');
        setPosition(data.position || 'bottom-right');
        setTheme(data.theme || 'auto');
        setShowAvatar(data.showAvatar !== false);
        setAllowFileUpload(!!data.allowFileUpload);
        setCollectEmail(!!data.collectEmail);
        setCollectName(data.collectName !== false);
        const lang = (data.widgetLanguage || 'en').split(/[-_]/)[0]?.toLowerCase() || 'en';
        setWidgetLanguage(lang);
        setWidgetToken(data.widgetToken || '');
      } catch (e: any) {
        toast({
          title: t('settings.webchatConnectionForm.edit.toast.loadErrorTitle'),
          description: e?.message || t('settings.webchatConnectionForm.edit.toast.loadFailed'),
          variant: 'destructive'
        });
        onClose();
      } finally {
        setLoadingConn(false);
      }
    };
    load();
  }, [isOpen, connectionId, t, toast, onClose]);

  const handleSave = async () => {
    if (!connectionId) return;
    if (!accountName.trim()) {
      toast({
        title: t('settings.webchatConnectionForm.toast.validationErrorTitle'),
        description: t('settings.webchatConnectionForm.toast.accountNameRequired'),
        variant: 'destructive'
      });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/channel-connections/${connectionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelType: 'webchat',
          accountName,
          connectionData: {
            widgetColor,
            welcomeMessage,
            companyName,
            position,
            theme,
            showAvatar,
            allowFileUpload,
            collectEmail,
            collectName,
            widgetLanguage,
            widgetToken
          }
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || t('settings.webchatConnectionForm.edit.toast.updateFailed'));
      }
      toast({
        title: t('settings.webchatConnectionForm.edit.toast.updatedTitle'),
        description: t('settings.webchatConnectionForm.edit.toast.updatedDescription')
      });
      onSuccess();
      onClose();
    } catch (e: any) {
      toast({
        title: t('settings.webchatConnectionForm.edit.toast.updateErrorTitle'),
        description: e?.message || t('settings.webchatConnectionForm.edit.toast.updateFailed'),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateToken = async () => {
    if (!connectionId) return;
    if (!confirm(t('settings.webchatConnectionForm.edit.confirmRegenerateToken'))) return;
    try {
      const res = await fetch(`/api/channel-connections/${connectionId}/regenerate-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || t('settings.webchatConnectionForm.edit.toast.regenerateFailed'));
      }
      const data = await res.json();
      const token = data?.connectionData?.widgetToken;
      if (token) setWidgetToken(token);
      toast({
        title: t('settings.webchatConnectionForm.edit.toast.regeneratedTitle'),
        description: t('settings.webchatConnectionForm.edit.toast.regeneratedDescription')
      });
    } catch (e: any) {
      toast({
        title: t('settings.webchatConnectionForm.edit.toast.regenerateErrorTitle'),
        description: e?.message || t('settings.webchatConnectionForm.edit.toast.regenerateFailed'),
        variant: 'destructive'
      });
    }
  };

  const embedCode = widgetToken
    ? `<script src="${window.location.origin}/api/webchat/widget.js?token=${widgetToken}" async></script>`
    : '';
  const iframeCode = widgetToken
    ? `<iframe src="${window.location.origin}/api/webchat/embed/${widgetToken}" style="width: 100%; height: 600px; border: 0; background: transparent;" sandbox="allow-scripts allow-same-origin" referrerpolicy="no-referrer" loading="lazy" title="WebChat"></iframe>`
    : '';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent data-tour="components-settings-editwebchatconnectionform.dialogcontent.settings.webchatConnectionForm.edit.title" className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{t('settings.webchatConnectionForm.edit.title')}</DialogTitle>
          <DialogDescription>{t('settings.webchatConnectionForm.edit.description')}</DialogDescription>
        </DialogHeader>
        {loadingConn ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            {t('settings.webchatConnectionForm.edit.loading')}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>{t('settings.webchatConnectionForm.label.accountName')}</Label>
              <Input data-tour="components-settings-editwebchatconnectionform.input.settings.webchatConnectionForm.label.accountName" value={accountName} onChange={(e) => setAccountName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>{t('settings.webchatConnectionForm.label.companyName')}</Label>
              <Input data-tour="components-settings-editwebchatconnectionform.input.settings.webchatConnectionForm.label.accountName" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-widgetLanguage">{t('settings.webchatConnectionForm.label.widgetLanguage')}</Label>
              <Select value={widgetLanguage} onValueChange={setWidgetLanguage}>
                <SelectTrigger data-tour="components-settings-editwebchatconnectionform.selecttrigger.edit-widgetLanguage" id="edit-widgetLanguage" className="w-full">
                  <SelectValue placeholder={t('settings.webchatConnectionForm.placeholder.widgetLanguage')} />
                </SelectTrigger>
                <SelectContent>
                  {activeLanguages.map((lang) => {
                    const code = lang.code.split(/[-_]/)[0]?.toLowerCase() || lang.code;
                    return (
                      <SelectItem key={lang.id} value={code}>
                        {lang.nativeName || lang.name} ({code})
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                {t('settings.webchatConnectionForm.hint.widgetLanguage')}
              </p>
            </div>
            <div className="grid gap-2">
              <Label>{t('settings.webchatConnectionForm.label.widgetColor')}</Label>
              <div className="flex items-center gap-3">
                <input data-tour="components-settings-editwebchatconnectionform.input.settings.webchatConnectionForm.label.widgetColor"
                  type="color"
                  value={widgetColor}
                  onChange={(e) => setWidgetColor(e.target.value)}
                  className="h-9 w-12 rounded border border-border bg-background cursor-pointer"
                />
                <Input data-tour="components-settings-editwebchatconnectionform.input.settings.webchatConnectionForm.label.widgetColor" value={widgetColor} onChange={(e) => setWidgetColor(e.target.value)} className="max-w-[140px]" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>{t('settings.webchatConnectionForm.label.welcomeMessage')}</Label>
              <Textarea data-tour="components-settings-editwebchatconnectionform.textarea.settings.webchatConnectionForm.label.accountName" value={welcomeMessage} onChange={(e) => setWelcomeMessage(e.target.value)} maxLength={500} />
            </div>
            <div className="grid gap-2">
              <Label>{t('settings.webchatConnectionForm.label.position')}</Label>
              <Select value={position} onValueChange={(v: 'bottom-right' | 'bottom-left' | 'bottom-center') => setPosition(v)}>
                <SelectTrigger data-tour="components-settings-editwebchatconnectionform.selecttrigger.settings.webchatConnectionForm.placeholder.position" className="w-full">
                  <SelectValue placeholder={t('settings.webchatConnectionForm.placeholder.position')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bottom-right">{t('settings.webchatConnectionForm.position.bottomRight')}</SelectItem>
                  <SelectItem value="bottom-left">{t('settings.webchatConnectionForm.position.bottomLeft')}</SelectItem>
                  <SelectItem value="bottom-center">{t('settings.webchatConnectionForm.position.bottomCenter')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>{t('settings.webchatConnectionForm.label.theme')}</Label>
              <Select value={theme} onValueChange={(v: 'auto' | 'light' | 'dark') => setTheme(v)}>
                <SelectTrigger data-tour="components-settings-editwebchatconnectionform.selecttrigger.settings.webchatConnectionForm.placeholder.theme" className="w-full">
                  <SelectValue placeholder={t('settings.webchatConnectionForm.placeholder.theme')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">{t('settings.webchatConnectionForm.theme.auto')}</SelectItem>
                  <SelectItem value="light">{t('settings.webchatConnectionForm.theme.light')}</SelectItem>
                  <SelectItem value="dark">{t('settings.webchatConnectionForm.theme.dark')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <input data-tour="components-settings-editwebchatconnectionform.input.showAvatar"
                  id="showAvatar"
                  type="checkbox"
                  checked={showAvatar}
                  onChange={(e) => setShowAvatar(e.target.checked)}
                  className="h-4 w-4 rounded border border-input bg-background accent-primary"
                />
                <Label htmlFor="showAvatar" className="text-foreground">
                  {t('settings.webchatConnectionForm.label.showAvatar')}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <input data-tour="components-settings-editwebchatconnectionform.input.allowFileUpload"
                  id="allowFileUpload"
                  type="checkbox"
                  checked={allowFileUpload}
                  onChange={(e) => setAllowFileUpload(e.target.checked)}
                  className="h-4 w-4 rounded border border-input bg-background accent-primary"
                />
                <Label htmlFor="allowFileUpload" className="text-foreground">
                  {t('settings.webchatConnectionForm.label.allowFileUpload')}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <input data-tour="components-settings-editwebchatconnectionform.input.collectEmail"
                  id="collectEmail"
                  type="checkbox"
                  checked={collectEmail}
                  onChange={(e) => setCollectEmail(e.target.checked)}
                  className="h-4 w-4 rounded border border-input bg-background accent-primary"
                />
                <Label htmlFor="collectEmail" className="text-foreground">
                  {t('settings.webchatConnectionForm.label.collectEmail')}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <input data-tour="components-settings-editwebchatconnectionform.input.collectName"
                  id="collectName"
                  type="checkbox"
                  checked={collectName}
                  onChange={(e) => setCollectName(e.target.checked)}
                  className="h-4 w-4 rounded border border-input bg-background accent-primary"
                />
                <Label htmlFor="collectName" className="text-foreground">
                  {t('settings.webchatConnectionForm.label.collectName')}
                </Label>
              </div>
            </div>

            <div className="border-t border-border pt-4 space-y-3">
              <h4 className="font-medium text-foreground">{t('settings.webchatConnectionForm.embed.sectionTitle')}</h4>
              <div>
                <Label className="text-xs text-foreground">{t('settings.webchatConnectionForm.embed.scriptTitle')}</Label>
                <p className="text-xs text-muted-foreground mb-2">{t('settings.webchatConnectionForm.embed.scriptHint')}</p>
                <div className="bg-muted p-3 rounded border border-border text-xs break-all select-text text-foreground">
                  {embedCode || t('settings.webchatConnectionForm.embed.tokenUnavailable')}
                </div>
                <div className="mt-2 flex gap-2">
                  <Button data-tour="components-settings-editwebchatconnectionform.button.settings.webchatConnectionForm.toast.copiedTitle"
                    variant="outline"
                    onClick={async () => {
                      if (embedCode) {
                        await navigator.clipboard.writeText(embedCode);
                        toast({
                          title: t('settings.webchatConnectionForm.toast.copiedTitle'),
                          description: t('settings.webchatConnectionForm.toast.copiedScript')
                        });
                      }
                    }}
                  >
                    {t('settings.webchatConnectionForm.embed.copyScript')}
                  </Button>
                  <Button data-tour="components-settings-editwebchatconnectionform.button.settings.webchatConnectionForm.embed.preview" variant="outline" onClick={() => window.open(`/api/webchat/preview/${widgetToken}`, '_blank')}>
                    {t('settings.webchatConnectionForm.embed.preview')}
                  </Button>
                </div>
              </div>
              {iframeCode ? (
                <div>
                  <Label className="text-xs text-foreground">{t('settings.webchatConnectionForm.embed.iframeTitle')}</Label>
                  <p className="text-xs text-muted-foreground mb-2">{t('settings.webchatConnectionForm.embed.iframeHint')}</p>
                  <div className="bg-muted p-3 rounded border border-border text-xs break-all select-text text-foreground">
                    {iframeCode}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Button data-tour="components-settings-editwebchatconnectionform.button.settings.webchatConnectionForm.toast.copiedTitle"
                      variant="outline"
                      onClick={async () => {
                        await navigator.clipboard.writeText(iframeCode);
                        toast({
                          title: t('settings.webchatConnectionForm.toast.copiedTitle'),
                          description: t('settings.webchatConnectionForm.toast.copiedIframe')
                        });
                      }}
                    >
                      {t('settings.webchatConnectionForm.embed.copyIframe')}
                    </Button>
                  </div>
                </div>
              ) : null}
              <div className="flex gap-2">
                <Button data-tour="components-settings-editwebchatconnectionform.button.settings.webchatConnectionForm.edit.regenerateToken" variant="destructive" onClick={handleRegenerateToken}>
                  {t('settings.webchatConnectionForm.edit.regenerateToken')}
                </Button>
              </div>
            </div>

            <DialogFooter>
              <Button data-tour="components-settings-editwebchatconnectionform.button.settings.webchatConnectionForm.cancel" type="button" variant="outline" onClick={onClose} disabled={loading}>
                {t('settings.webchatConnectionForm.cancel')}
              </Button>
              <Button data-tour="components-settings-editwebchatconnectionform.button.settings.webchatConnectionForm.edit.saving" type="button" onClick={handleSave} className="btn-brand-primary" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('settings.webchatConnectionForm.edit.saving')}
                  </>
                ) : (
                  t('settings.webchatConnectionForm.edit.save')
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
