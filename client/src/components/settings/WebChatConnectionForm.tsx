import { emitTourSignal } from '@/components/guided-tours/signals';
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
}

function defaultWidgetLanguageCode(languages: Language[], currentCode?: string | null): string {
  const active = languages.filter((l) => l.isActive !== false);
  const fromDefault = active.find((l) => l.isDefault)?.code;
  const raw = fromDefault || currentCode || 'en';
  return raw.split(/[-_]/)[0]?.toLowerCase() || 'en';
}

export function WebChatConnectionForm({ isOpen, onClose, onSuccess }: Props) {
  const { t, currentLanguage, languages: contextLanguages } = useTranslation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showEmbed, setShowEmbed] = useState(false);
  const [embedCode, setEmbedCode] = useState<string>('');
  const [iframeCode, setIframeCode] = useState<string>('');

  const [accountName, setAccountName] = useState('');
  const [widgetColor, setWidgetColor] = useState('#6366f1');
  const [welcomeMessage, setWelcomeMessage] = useState('Hi! How can we help?');
  const [companyName, setCompanyName] = useState('Support');
  const [position, setPosition] = useState<'bottom-right' | 'bottom-left' | 'bottom-center'>('bottom-right');
  const [theme, setTheme] = useState<'auto' | 'light' | 'dark'>('auto');
  const [showAvatar, setShowAvatar] = useState(true);
  const [allowFileUpload, setAllowFileUpload] = useState(false);
  const [collectEmail, setCollectEmail] = useState(false);
  const [collectName, setCollectName] = useState(false);
  const [widgetLanguage, setWidgetLanguage] = useState('en');

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
    if (isOpen) {
      setWidgetLanguage(defaultWidgetLanguageCode(languages, currentLanguage?.code));
    }
  }, [isOpen, languages, currentLanguage?.code]);

  const reset = () => {
    setAccountName('');
    setWidgetColor('#6366f1');
    setWelcomeMessage('Hi! How can we help?');
    setCompanyName('Support');
    setPosition('bottom-right');
    setTheme('auto');
    setShowAvatar(true);
    setAllowFileUpload(false);
    setCollectEmail(false);
    setCollectName(false);
    setWidgetLanguage(defaultWidgetLanguageCode(languages, currentLanguage?.code));
    setEmbedCode('');
    setIframeCode('');
    setShowEmbed(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountName.trim()) {
      toast({
        title: t('settings.webchatConnectionForm.toast.validationErrorTitle'),
        description: t('settings.webchatConnectionForm.toast.accountNameRequired'),
        variant: 'destructive'
      });
      return;
    }
    if (!/^#[0-9A-Fa-f]{6}$/.test(widgetColor)) {
      toast({
        title: t('settings.webchatConnectionForm.toast.validationErrorTitle'),
        description: t('settings.webchatConnectionForm.toast.invalidColor'),
        variant: 'destructive'
      });
      return;
    }
    if (welcomeMessage.length > 500) {
      toast({
        title: t('settings.webchatConnectionForm.toast.validationErrorTitle'),
        description: t('settings.webchatConnectionForm.toast.welcomeMessageTooLong'),
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/channel-connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelType: 'webchat',
          accountId: `webchat-${Date.now()}`,
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
            widgetLanguage
          }
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || t('settings.webchatConnectionForm.toast.createFailedDescription'));
      }
      const data = await res.json();
      const token = data?.connectionData?.widgetToken;
      const embed =
        data?.embedScript ||
        (token
          ? `<script src="${window.location.origin}/api/webchat/widget.js?token=${token}" async></script>`
          : '');
      const iframe = token
        ? `<iframe src="${window.location.origin}/api/webchat/embed/${token}" style="width: 100%; height: 600px; border: 0; background: transparent;" sandbox="allow-scripts allow-same-origin" referrerpolicy="no-referrer" loading="lazy" title="WebChat"></iframe>`
        : '';
      if (embed) {
        setEmbedCode(embed);
        setIframeCode(iframe);
        setShowEmbed(true);
      }
      toast({
        title: t('settings.webchatConnectionForm.toast.createdTitle'),
        description: t('settings.webchatConnectionForm.toast.createdDescription')
      });
      emitTourSignal('channel-created');
      onSuccess();
    } catch (e: any) {
      toast({
        title: t('settings.webchatConnectionForm.toast.createFailedTitle'),
        description: e?.message || t('settings.webchatConnectionForm.toast.createFailedDescription'),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent data-tour="components-settings-webchatconnectionform.dialogcontent.settings.webchatConnectionForm.title" className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{t('settings.webchatConnectionForm.title')}</DialogTitle>
            <DialogDescription>{t('settings.webchatConnectionForm.description')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="accountName">{t('settings.webchatConnectionForm.label.accountNameRequired')}</Label>
                <Input data-tour="components-settings-webchatconnectionform.input.accountName"
                  id="accountName"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder={t('settings.webchatConnectionForm.placeholder.accountName')}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="companyName">{t('settings.webchatConnectionForm.label.companyName')}</Label>
                <Input data-tour="components-settings-webchatconnectionform.input.companyName"
                  id="companyName"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder={t('settings.webchatConnectionForm.placeholder.companyName')}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="widgetLanguage">{t('settings.webchatConnectionForm.label.widgetLanguage')}</Label>
                <Select value={widgetLanguage} onValueChange={setWidgetLanguage}>
                  <SelectTrigger data-tour="components-settings-webchatconnectionform.selecttrigger.widgetLanguage" id="widgetLanguage" className="w-full">
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
                  <input data-tour="components-settings-webchatconnectionform.input.settings.webchatConnectionForm.label.widgetColor"
                    type="color"
                    value={widgetColor}
                    onChange={(e) => setWidgetColor(e.target.value)}
                    className="h-9 w-12 rounded border border-border bg-background cursor-pointer"
                  />
                  <Input data-tour="components-settings-webchatconnectionform.input.settings.webchatConnectionForm.label.widgetColor" value={widgetColor} onChange={(e) => setWidgetColor(e.target.value)} className="max-w-[140px]" />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="welcome">{t('settings.webchatConnectionForm.label.welcomeMessage')}</Label>
                <Textarea data-tour="components-settings-webchatconnectionform.textarea.welcome" id="welcome" value={welcomeMessage} onChange={(e) => setWelcomeMessage(e.target.value)} maxLength={500} />
              </div>
              <div className="grid gap-2">
                <Label>{t('settings.webchatConnectionForm.label.position')}</Label>
                <Select value={position} onValueChange={(v: 'bottom-right' | 'bottom-left' | 'bottom-center') => setPosition(v)}>
                  <SelectTrigger data-tour="components-settings-webchatconnectionform.selecttrigger.settings.webchatConnectionForm.placeholder.position" className="w-full">
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
                  <SelectTrigger data-tour="components-settings-webchatconnectionform.selecttrigger.settings.webchatConnectionForm.placeholder.theme" className="w-full">
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
                  <input data-tour="components-settings-webchatconnectionform.input.showAvatar"
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
                  <input data-tour="components-settings-webchatconnectionform.input.allowFileUpload"
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
                  <input data-tour="components-settings-webchatconnectionform.input.collectEmail"
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
                  <input data-tour="components-settings-webchatconnectionform.input.collectName"
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
            </div>
            <DialogFooter>
              <Button data-tour="components-settings-webchatconnectionform.button.settings.webchatConnectionForm.cancel"
                type="button"
                variant="outline"
                onClick={() => {
                  reset();
                  onClose();
                }}
              >
                {t('settings.webchatConnectionForm.cancel')}
              </Button>
              <Button data-tour="components-settings-webchatconnectionform.button.settings.webchatConnectionForm.creating" type="submit" variant="outline" className="btn-brand-primary" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('settings.webchatConnectionForm.creating')}
                  </>
                ) : (
                  t('settings.webchatConnectionForm.create')
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showEmbed}
        onOpenChange={(open) => {
          setShowEmbed(open);
          if (!open) {
            reset();
            onClose();
          }
        }}
      >
        <DialogContent data-tour="components-settings-webchatconnectionform.dialogcontent.settings.webchatConnectionForm.embed.title" className="sm:max-w-[620px]">
          <DialogHeader>
            <DialogTitle>{t('settings.webchatConnectionForm.embed.title')}</DialogTitle>
            <DialogDescription>{t('settings.webchatConnectionForm.embed.description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2 text-foreground">{t('settings.webchatConnectionForm.embed.scriptTitle')}</h4>
              <p className="text-xs text-muted-foreground mb-2">{t('settings.webchatConnectionForm.embed.scriptHint')}</p>
              <div className="bg-muted p-3 rounded border border-border text-xs break-all select-text text-foreground">
                {embedCode}
              </div>
              <div className="mt-2 flex gap-2">
                <Button data-tour="components-settings-webchatconnectionform.button.settings.webchatConnectionForm.toast.copiedTitle"
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(embedCode);
                    toast({
                      title: t('settings.webchatConnectionForm.toast.copiedTitle'),
                      description: t('settings.webchatConnectionForm.toast.copiedScript')
                    });
                  }}
                >
                  {t('settings.webchatConnectionForm.embed.copyScript')}
                </Button>
              </div>
            </div>
            {iframeCode ? (
              <div>
                <h4 className="font-medium mb-2 text-foreground">{t('settings.webchatConnectionForm.embed.iframeTitle')}</h4>
                <p className="text-xs text-muted-foreground mb-2">{t('settings.webchatConnectionForm.embed.iframeHint')}</p>
                <div className="bg-muted p-3 rounded border border-border text-xs break-all select-text text-foreground">
                  {iframeCode}
                </div>
                <div className="mt-2 flex gap-2">
                  <Button data-tour="components-settings-webchatconnectionform.button.settings.webchatConnectionForm.toast.copiedTitle"
                    type="button"
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
          </div>
          <DialogFooter>
            <Button data-tour="components-settings-webchatconnectionform.button.settings.webchatConnectionForm.embed.preview"
              type="button"
              onClick={() => {
                const m = iframeCode.match(/embed\/(wc_[a-z0-9]+)/i);
                const token = m?.[1];
                window.open(token ? `/api/webchat/preview/${token}` : '/api/webchat/widget.html', '_blank');
              }}
            >
              {t('settings.webchatConnectionForm.embed.preview')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
