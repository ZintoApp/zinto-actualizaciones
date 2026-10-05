import { useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  ImagePlus,
  Info,
  Loader2,
  Maximize2,
  Monitor,
  RotateCcw,
  Upload,
  X,
  LayoutGrid as TabIconLayoutGrid,
  Megaphone as TabIconMegaphone,
  Palette as TabIconPalette,
  Volume2 as TabIconVolume2,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { defaultQueueImageBackground, queueSettingsSchema, type QueueDisplaySnapshot, type QueueSettings as Settings } from '@shared/types/dental-queue';
import { QueueAnnouncementSettings } from './QueueAnnouncementSettings';
import { QueueBackgroundSettings } from './QueueBackgroundSettings';
import { QueueDisplay } from './QueueDisplay';
import { QueueSelect } from './QueueSelect';
import { queueRequest, QUEUE_API } from './queue-api';
import { useQueueText, type QueueTextKey } from './queue-text';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogDescription, DialogTrigger, dialogCloseButtonClassName } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { resolveMediaUrl } from '@/utils/mediaUrl';
import './queue-settings.css';

const CONTENT_TAB_ICONS = {
  branding: TabIconPalette,
  layout: TabIconLayoutGrid,
  announcements: TabIconMegaphone,
  audio: TabIconVolume2,
} as const;

type SettingsTab = 'branding' | 'layout' | 'announcements' | 'audio';
const settingsCloseClassName = cn(dialogCloseButtonClassName, 'static shrink-0 translate-x-0 translate-y-0 sm:translate-x-0 sm:translate-y-0');
const tabLabels: Record<SettingsTab, QueueTextKey> = { branding: 'settingsBranding', layout: 'settingsLayout', announcements: 'settingsAnnouncements', audio: 'settingsAudio' };
const fieldTab = (field: string): SettingsTab => ['logoUrl', 'logoBackgroundColor', 'welcomeMessage', 'displayClinicName'].includes(field) ? 'branding'
  : field === 'messages' ? 'announcements' : field.startsWith('background') || ['primaryColor', 'fallbackMinutes', 'autoClearPreviousDay', 'ticketFooter', 'paperWidth'].includes(field) ? 'layout' : 'audio';

export function QueueSettings({ display, onClose }: { display: QueueDisplaySnapshot; onClose: () => void }) {
  const { q } = useQueueText();
  const queryClient = useQueryClient();
  const [initial] = useState(() => ({ ...structuredClone(display), settings: queueSettingsSchema.parse(display.settings || {}) }));
  const opener = useRef(document.activeElement as HTMLElement | null);
  const [settings, setSettings] = useState<Settings>(initial.settings);
  const [tab, setTab] = useState<SettingsTab>('branding');
  const [expanded, setExpanded] = useState(false);
  const lastLogoColor = useRef(initial.settings.logoBackgroundColor === 'transparent' ? '#ffffff' : initial.settings.logoBackgroundColor);
  const [messages, setMessages] = useState(initial.settings.messages.join('\n'));
  const [uploading, setUploading] = useState(false);
  const [uploadingSound, setUploadingSound] = useState(false);
  const [uploadingBackground, setUploadingBackground] = useState(false);
  const [error, setError] = useState('');
  const [errorTab, setErrorTab] = useState<SettingsTab>('branding');
  const logoInput = useRef<HTMLInputElement>(null);
  const [failedLogo, setFailedLogo] = useState<string | null>(null);
  const logoUrl = settings.logoUrl || initial.logoUrl;
  const messageList = useMemo(() => messages.split('\n').map(s => s.trim()).filter(Boolean), [messages]);
  const draft = { ...settings, messages: messageList };
  const validation = queueSettingsSchema.safeParse(draft);
  const dirty = JSON.stringify(settings) !== JSON.stringify(initial.settings) || messages !== initial.settings.messages.join('\n');
  const change = (value: Settings) => { setSettings(value); setError(''); };
  const save = useMutation({
    mutationFn: async () => {
      const payload = queueSettingsSchema.parse(draft);
      const saved = await queueRequest<Settings>('/settings', 'PUT', payload);
      const backgroundKeys = ['backgroundType', 'backgroundColor', 'backgroundImageUrl', 'backgroundImageMode', 'backgroundImagePosition', 'backgroundImageTransparency', 'backgroundImageDimming'] as const;
      if (backgroundKeys.some(key => saved?.[key] !== payload[key])) throw new Error(q('backgroundSaveFailed'));
      if (saved?.displayClinicName !== payload.displayClinicName) throw new Error(q('clinicNameSaveFailed'));
      const persisted = await queueRequest<Settings>('/settings');
      if (backgroundKeys.some(key => persisted?.[key] !== payload[key])) throw new Error(q('backgroundSaveFailed'));
      if (persisted?.displayClinicName !== payload.displayClinicName) throw new Error(q('clinicNameSaveFailed'));
      return persisted;
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: [QUEUE_API] }); onClose(); },
    onError: e => { setError(e.message); setErrorTab(tab); },
  });
  const close = () => { if (!save.isPending) onClose(); };
  async function upload(file?: File) {
    if (!file) return;
    setUploading(true); setError('');
    try {
      const body = new FormData(); body.append('file', file);
      const result = await (await apiRequest('POST', '/api/upload', body)).json();
      setSettings(s => ({ ...s, logoUrl: result.url }));
    } catch (e) { setError((e as Error).message); setErrorTab('branding'); }
    finally { setUploading(false); }
  }
  // This projection is presentation-only: no patients, queue mutations or call events.
  const preview: QueueDisplaySnapshot = useMemo(() => {
    const rooms = [1, 2, 3].map(id => initial.rooms[id - 1] || { id: -id, name: q('sampleRoom', { number: id }) });
    const providers = initial.providers.length ? initial.providers.slice(0, 3) : [{ id: -1, name: q('sampleProfessional'), avatarUrl: null }];
    const room = rooms[Math.min(1, rooms.length - 1)], provider = providers[0];
    const current = { id: -1, number: 'A002', chairId: room.id, chairName: room.name, providerUserId: provider.id, providerName: provider.name, status: 'called' as const, estimate: { minutes: 0, delayed: false } };
    return { ...initial, logoUrl, settings: draft, rooms, providers,
      services: initial.services.length ? initial.services : [{ id: 'sample', label: q('sampleService') }],
      current: [current], upcoming: Array.from({ length: 5 }, (_, i) => {
        const destination = rooms[i % rooms.length], professional = providers[i % providers.length];
        return { ...current, id: -i - 2, number: `A00${i + 3}`, chairId: destination.id, chairName: destination.name, providerUserId: professional.id, providerName: professional.name, status: 'waiting' as const, estimate: { minutes: (i + 1) * 5, delayed: false } };
      }), events: [], cursor: 0,
    };
  }, [initial, settings, messageList, logoUrl, q('sampleProfessional'), q('sampleRoom', { number: 1 }), q('sampleService')]);
  const errorsFor = (value: SettingsTab) => {
    const fields = validation.success ? [] : [...new Set(validation.error.issues.filter(issue => fieldTab(String(issue.path[0])) === value).map(issue => String(issue.path[0])))];
    return fields.length > 0 || (!!error && errorTab === value);
  };
  const validationMessage = (value: SettingsTab) => errorsFor(value) && <p role="alert" className="queue-settings-error">{error && errorTab === value ? error : value === 'announcements' ? q('messagesHelp') : value === 'layout' && settings.backgroundType === 'image' && !settings.backgroundImageUrl ? q('backgroundImageRequired') : q('settingsInvalid')}</p>;
  const sectionTitle = (title: QueueTextKey, description?: QueueTextKey) => <div className="queue-settings-section-title"><h3>{q(title)}</h3>{description && <p>{q(description)}</p>}</div>;
  const colorField = (field: 'primaryColor' | 'backgroundColor' | 'logoBackgroundColor', title: QueueTextKey) => <div className="queue-settings-field">
    <Label htmlFor={`queue-${field === 'logoBackgroundColor' ? 'logo-background' : field}`}>{q(title)}</Label>
    <div className="queue-settings-color"><Input id={`queue-${field === 'logoBackgroundColor' ? 'logo-background' : field}`} type="color" value={settings[field] === 'transparent' ? lastLogoColor.current : settings[field]}
      disabled={field === 'logoBackgroundColor' && settings.logoBackgroundColor === 'transparent'} onChange={e => {
        if (field === 'logoBackgroundColor') lastLogoColor.current = e.target.value;
        change({ ...settings, [field]: e.target.value });
      }} /><span aria-hidden="true">{settings[field] === 'transparent' ? q('transparentBackground') : settings[field].toUpperCase()}</span></div>
  </div>;
  return <Dialog open onOpenChange={open => { if (!open) close(); }}>
    <DialogContent className="queue-settings-dialog" contentNoScroll showCloseButton={false} onEscapeKeyDown={event => { if (save.isPending) event.preventDefault(); }} onCloseAutoFocus={event => { event.preventDefault(); if (opener.current?.isConnected) opener.current.focus(); }}>
      <header className="queue-settings-header">
        <div className="queue-settings-heading"><span className="queue-settings-heading-icon"><Monitor aria-hidden="true" /></span><div><DialogTitle>{q('settings')}</DialogTitle><DialogDescription>{q('settingsDescription')}</DialogDescription></div></div>
        <div className="queue-settings-header-actions"><span className={`queue-settings-save-state ${!dirty && !error ? 'is-saved' : ''}`} role="status">
          {save.isPending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : !dirty && !error ? <CheckCircle2 /> : <Circle />}{save.isPending ? q('settingsSaving') : error ? q('settingsSaveFailed') : dirty ? q('settingsUnsaved') : q('settingsSaved')}
        </span><DialogClose className={settingsCloseClassName} disabled={save.isPending} aria-label={q('close')}><X aria-hidden="true" /></DialogClose></div>
      </header>
      <Tabs value={tab} onValueChange={value => setTab(value as SettingsTab)} className="queue-settings-tabs">
        <div className="queue-settings-tab-strip"><TabsList aria-label={q('settings')}>
          {(Object.keys(tabLabels) as SettingsTab[]).map(value => <TabsTrigger icon={CONTENT_TAB_ICONS[value]} key={value} value={value}>{q(tabLabels[value])}{errorsFor(value) && <span className="queue-settings-tab-error" aria-label={q('settingsInvalid')}>!</span>}</TabsTrigger>)}
        </TabsList></div>
        <div className="queue-settings-body">
          <div className="queue-settings-fields company-sidebar-scrollbar">
            <fieldset disabled={save.isPending} className="queue-settings-fieldset">
              <TabsContent data-tour="components-erp-dental-queuesettings.tabscontent.branding" value="branding" forceMount>
                {sectionTitle('clinicIdentity', 'clinicIdentityHelp')}
                <div role="group" aria-labelledby="queue-logo-label" aria-busy={uploading} className="queue-settings-logo-group">
                  <div className="queue-settings-logo-upload">
                    <div id="queue-logo-thumbnail" style={{ backgroundColor: settings.logoBackgroundColor }}>{logoUrl && failedLogo !== logoUrl ? <img src={resolveMediaUrl(logoUrl)} alt={q('logo')} onError={() => setFailedLogo(logoUrl)} /> : <ImagePlus aria-hidden="true" />}</div>
                    <div><Label id="queue-logo-label" htmlFor="queue-logo-upload">{q('logo')}</Label><p className="queue-settings-help">{q('logoHelp')}</p>
                      <input data-tour="components-erp-dental-queuesettings.input.queue-logo-upload" ref={logoInput} id="queue-logo-upload" className="hidden" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled={uploading || save.isPending} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; setFailedLogo(null); void upload(file); }} />
                      <div className="queue-settings-logo-actions"><Button type="button" variant="outline" disabled={uploading || save.isPending} onClick={() => logoInput.current?.click()}>
                        {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}{uploading ? q('uploadingLogo') : logoUrl ? q('replaceLogo') : q('uploadLogo')}</Button>
                        {settings.logoUrl !== initial.settings.logoUrl && <Button type="button" variant="ghost" disabled={uploading || save.isPending} onClick={() => { change({ ...settings, logoUrl: initial.settings.logoUrl }); setFailedLogo(null); }}><RotateCcw className="mr-2 h-4 w-4" />{q('resetLogo')}</Button>}</div>
                    </div>
                  </div>
                  <div className="queue-settings-logo-colors">{colorField('logoBackgroundColor', 'logoBackground')}<div className="queue-settings-switch"><Switch id="queue-logo-transparent" checked={settings.logoBackgroundColor === 'transparent'} onCheckedChange={checked => change({ ...settings, logoBackgroundColor: checked ? 'transparent' : lastLogoColor.current })} /><Label htmlFor="queue-logo-transparent">{q('transparentBackground')}</Label></div></div>
                </div>
                <div className="queue-settings-field"><Label htmlFor="queue-clinic-name">{q('clinicName')}</Label><Input data-tour="components-erp-dental-queuesettings.input.queue-clinic-name" id="queue-clinic-name" value={settings.displayClinicName} placeholder={initial.clinicName} maxLength={200} onChange={event => change({ ...settings, displayClinicName: event.target.value })} aria-describedby="queue-clinic-name-help" /><p id="queue-clinic-name-help" className="queue-settings-help">{q('clinicNameHelp')}</p></div>
                <div className="queue-settings-field"><Label htmlFor="queue-welcomeMessage">{q('welcomeMessage')}</Label><Input data-tour="components-erp-dental-queuesettings.input.queue-welcomeMessage" id="queue-welcomeMessage" maxLength={200} value={settings.welcomeMessage} onChange={e => change({ ...settings, welcomeMessage: e.target.value })} /><span className="queue-settings-counter">{settings.welcomeMessage.length} / 200</span></div>
                {validationMessage('branding')}
              </TabsContent>
              <TabsContent data-tour="components-erp-dental-queuesettings.tabscontent.layout" value="layout" forceMount>
                {sectionTitle('screenAppearance', 'screenAppearanceHelp')}
                <div className="queue-settings-pair">{colorField('primaryColor', 'primaryColor')}
                  <QueueSelect id="queue-background-type" label={q('backgroundType')} value={settings.backgroundType} disabled={save.isPending || uploadingBackground}
                    onValueChange={value => change({ ...settings, ...(value === 'image' && !settings.backgroundImageUrl ? defaultQueueImageBackground : {}), backgroundType: value as Settings['backgroundType'] })}
                    options={[{ value: 'color', label: q('backgroundTypeColor') }, { value: 'image', label: q('backgroundTypeImage') }]} />
                </div>
                {settings.backgroundType === 'color' && colorField('backgroundColor', 'backgroundColor')}
                {settings.backgroundType === 'image' && <>
                <div className="queue-settings-divider" />
                <QueueBackgroundSettings settings={settings} disabled={save.isPending} onUploading={setUploadingBackground}
                  onChange={value => { setSettings(current => ({ ...current, ...value })); setError(''); }}
                  onError={message => { setError(message); setErrorTab('layout'); }} />
                </>}
                <div className="queue-settings-divider" />
                <div className="queue-settings-field"><Label htmlFor="queue-fallback">{q('fallback')}</Label><Input data-tour="components-erp-dental-queuesettings.input.queue-fallback" id="queue-fallback" type="number" min={5} max={480} value={settings.fallbackMinutes} onChange={e => change({ ...settings, fallbackMinutes: Number(e.target.value) })} /></div>
                <div className="queue-settings-switch-block"><div className="queue-settings-switch"><Switch id="queue-auto-clear" checked={settings.autoClearPreviousDay} onCheckedChange={checked => change({ ...settings, autoClearPreviousDay: checked })} /><Label htmlFor="queue-auto-clear">{q('autoClearPreviousDay')}</Label></div><p className="queue-settings-help">{q('autoClearHelp', { timezone: initial.timezone })}</p></div>
                <div className="queue-settings-divider" />{sectionTitle('ticketSettings')}
                <QueueSelect id="queue-paper-width" label={q('paperWidth')} value={settings.paperWidth} onValueChange={value => change({ ...settings, paperWidth: value as '80' | '58' })} options={[{ value: '80', label: '80 mm' }, { value: '58', label: '58 mm' }]} />
                <div className="queue-settings-field"><Label htmlFor="queue-ticketFooter">{q('ticketFooter')}</Label><Input data-tour="components-erp-dental-queuesettings.input.queue-ticketFooter" id="queue-ticketFooter" maxLength={300} value={settings.ticketFooter} onChange={e => change({ ...settings, ticketFooter: e.target.value })} /></div>
                {validationMessage('layout')}
              </TabsContent>
              <TabsContent data-tour="components-erp-dental-queuesettings.tabscontent.announcements" value="announcements" forceMount>
                {sectionTitle('settingsAnnouncements', 'messagesHelp')}
                <div className="queue-settings-field"><Label htmlFor="queue-messages">{q('messages')}</Label><Textarea data-tour="components-erp-dental-queuesettings.textarea.queue-messages" id="queue-messages" rows={8} value={messages} onChange={e => { setMessages(e.target.value); setError(''); }} /><span className="queue-settings-counter">{messageList.length} / 10</span></div>
                {validationMessage('announcements')}
              </TabsContent>
              <TabsContent data-tour="components-erp-dental-queuesettings.tabscontent.audio" value="audio" forceMount>
                {sectionTitle('settingsAudio', 'audioSettingsHelp')}
                <QueueAnnouncementSettings settings={settings} onChange={change} onUploading={setUploadingSound} active={tab === 'audio' && !expanded} />
                {validationMessage('audio')}
              </TabsContent>
            </fieldset>
          </div>
          <aside className="queue-settings-preview company-sidebar-scrollbar" aria-label={q('preview')}>
            <div className="queue-settings-preview-heading"><div><h3><span />{q('preview')}</h3><p>{q('previewEditingHelp')}</p></div><span className="queue-settings-ratio">16:9</span></div>
            <div className="queue-settings-tv-frame"><QueueDisplay preview data={preview} /></div><div className="queue-settings-tv-stand" aria-hidden="true" />
            <div className="queue-settings-preview-caption"><Monitor aria-hidden="true" /><div><strong>{q('waitingRoomDisplay')}</strong><p>{q('sampleTicketsHelp')}</p></div>
              <Dialog open={expanded} onOpenChange={setExpanded}><DialogTrigger asChild><Button variant="ghost" size="sm"><Maximize2 className="mr-2 h-4 w-4" />{q('expandPreview')}</Button></DialogTrigger><DialogContent className="queue-settings-expanded" contentNoScroll showCloseButton={false}>
                <div className="queue-settings-expanded-header"><div><DialogTitle>{q('preview')}</DialogTitle><DialogDescription>{q('sampleTicketsHelp')}</DialogDescription></div><DialogClose className={settingsCloseClassName} aria-label={q('closePreview')}><X aria-hidden="true" /></DialogClose></div>
                <div className="queue-settings-expanded-screen"><QueueDisplay preview data={preview} /></div>
              </DialogContent></Dialog>
            </div>
            <div className="queue-settings-tip"><Info aria-hidden="true" /><div><strong>{q('keepReadable')}</strong><p>{q('keepReadableHelp')}</p></div></div>
          </aside>
        </div>
      </Tabs>
      <footer className="queue-settings-footer"><p>{q('applyAfterSaving')}</p><div><Button variant="outline" onClick={close} disabled={save.isPending}>{q('cancel')}</Button><Button onClick={() => save.mutate()} disabled={!dirty || save.isPending || uploading || uploadingSound || uploadingBackground || !validation.success}>{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{q('saveChanges')}</Button></div></footer>
    </DialogContent>
  </Dialog>;
}
