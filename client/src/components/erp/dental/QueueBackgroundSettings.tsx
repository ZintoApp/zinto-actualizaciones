import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2, Upload } from 'lucide-react';
import { defaultQueueImageBackground, type QueueSettings } from '@shared/types/dental-queue';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { apiRequest } from '@/lib/queryClient';
import { resolveMediaUrl } from '@/utils/mediaUrl';
import { QueueSelect } from './QueueSelect';
import { useQueueText } from './queue-text';
import { resolveQueueBackgroundUrl } from './queue-background';

function verifyImage(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const finish = (valid: boolean) => {
      clearTimeout(timeout); image.onload = null; image.onerror = null;
      valid ? resolve() : reject(new Error('Image unavailable'));
    };
    const timeout = window.setTimeout(() => finish(false), 30000);
    image.onload = () => finish(image.naturalWidth > 0 && image.naturalHeight > 0);
    image.onerror = () => finish(false);
    image.src = url;
  });
}

export function QueueBackgroundSettings({ settings, onChange, onUploading, onError, disabled }: {
  settings: QueueSettings; onChange: (value: Partial<QueueSettings>) => void;
  onUploading: (value: boolean) => void; onError: (message: string) => void; disabled: boolean;
}) {
  const { q } = useQueueText();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [failedThumbnail, setFailedThumbnail] = useState('');
  const noImage = !settings.backgroundImageUrl;
  const unavailable = disabled || uploading;
  async function upload(file?: File) {
    if (!file) return;
    onError('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 30 * 1024 * 1024) {
      onError(q('backgroundImageUploadHelp')); return;
    }
    setUploading(true); onUploading(true);
    const localUrl = URL.createObjectURL(file);
    try {
      await verifyImage(localUrl);
      const body = new FormData(); body.append('file', file);
      const result = await (await apiRequest('POST', '/api/upload', body)).json();
      if (typeof result.url !== 'string' || !result.url) throw new Error('Missing image URL');
      await verifyImage(resolveMediaUrl(result.url));
      onChange({ ...(noImage ? defaultQueueImageBackground : {}), backgroundImageUrl: result.url });
      setFailedThumbnail('');
    } catch { onError(q('backgroundImageUploadFailed')); }
    finally { URL.revokeObjectURL(localUrl); setUploading(false); onUploading(false); }
  }
  return <section className="queue-settings-background" aria-labelledby="queue-background-title" aria-busy={uploading}>
    <div className="queue-settings-section-title"><h3 id="queue-background-title">{q('backgroundImage')}</h3><p>{q('backgroundImageHelp')}</p></div>
    <div className="queue-settings-background-upload">
      <div className="queue-settings-background-thumbnail">
        {!noImage && failedThumbnail !== settings.backgroundImageUrl ? <img src={resolveQueueBackgroundUrl(settings.backgroundImageUrl)} alt={q('backgroundImage')} onError={() => setFailedThumbnail(settings.backgroundImageUrl)} /> : <ImagePlus aria-hidden="true" />}
      </div>
      <div><p className="queue-settings-help">{q('backgroundImageUploadHelp')}</p>
        <input data-tour="components-erp-dental-queuebackgroundsettings.input.queue-background-upload" ref={input} id="queue-background-upload" className="hidden" type="file" aria-label={q('uploadBackgroundImage')} accept="image/png,image/jpeg,image/webp" disabled={unavailable}
          onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; void upload(file); }} />
        <div className="queue-settings-logo-actions">
          <Button type="button" variant="outline" disabled={unavailable} onClick={() => input.current?.click()}>
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Upload className="mr-2 h-4 w-4" />}
            {uploading ? q('uploadingBackgroundImage') : noImage ? q('uploadBackgroundImage') : q('replaceBackgroundImage')}
          </Button>
          {!noImage && <Button type="button" variant="ghost" disabled={unavailable} onClick={() => { onChange({ backgroundImageUrl: '', backgroundType: 'color' }); onError(''); }}><Trash2 className="mr-2 h-4 w-4" />{q('removeBackgroundImage')}</Button>}
        </div>
      </div>
    </div>
    <div className="queue-settings-pair">
      <QueueSelect id="queue-background-mode" label={q('backgroundImageMode')} value={settings.backgroundImageMode} disabled={unavailable || noImage}
        onValueChange={value => onChange({ backgroundImageMode: value as QueueSettings['backgroundImageMode'] })}
        options={(['cover', 'fit', 'stretch', 'tile'] as const).map(value => ({ value, label: q(`backgroundMode_${value}`) }))} />
      <QueueSelect id="queue-background-position" label={q('backgroundImagePosition')} value={settings.backgroundImagePosition} disabled={unavailable || noImage || settings.backgroundImageMode === 'stretch'}
        onValueChange={value => onChange({ backgroundImagePosition: value as QueueSettings['backgroundImagePosition'] })}
        options={(['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'] as const).map(value => ({ value, label: q(`backgroundPosition_${value}`) }))} />
    </div>
    <p className="queue-settings-help">{q(`backgroundModeHelp_${settings.backgroundImageMode}`)}</p>
    {(['backgroundImageTransparency', 'backgroundImageDimming'] as const).map(field => <div className="queue-settings-field" key={field}>
      <Label htmlFor={`queue-${field}`}>{q(field)} <span className="text-muted-foreground">({settings[field]}%)</span></Label>
      <input id={`queue-${field}`} aria-describedby={`queue-${field}-help`} className="w-full accent-primary" type="range" min={0} max={100} step={1} value={settings[field]} disabled={unavailable || noImage} onChange={e => onChange({ [field]: Number(e.target.value) })} />
      <p id={`queue-${field}-help`} className="queue-settings-help">{q(field === 'backgroundImageTransparency' ? 'backgroundTransparencyHelp' : 'backgroundDimmingHelp')}</p>
    </div>)}
  </section>;
}
