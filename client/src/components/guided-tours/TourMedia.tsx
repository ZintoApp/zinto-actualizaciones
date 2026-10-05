import { useTranslation } from '@/hooks/use-translation';
import { normalizeTourMediaUrl, resolveTourText, type TourMedia as Media } from '@shared/guided-tours';

export function TourMedia({ items, namespace }: { items: Media[]; namespace?:string }) {
  const { currentLanguage, t } = useTranslation();
  const language = currentLanguage?.code || 'en';
  const localized = items.filter(item => item.language === language || item.language === language.split(/[-_]/)[0]);
  const selected = [...items.filter(item => !item.language), ...(localized.length ? localized : items.filter(item => item.language === 'en'))];
  return <div className="space-y-3">{selected.map(item => {
    const url = normalizeTourMediaUrl(item.url,item.kind);
    if (!url) return null;
    const caption = namespace ? t(`${namespace}.media_${item.id}_caption`,resolveTourText(item.caption,language)) : resolveTourText(item.caption,language);
    const alt = namespace ? t(`${namespace}.media_${item.id}_alt`,resolveTourText(item.alt,language)) : resolveTourText(item.alt,language);
    return <figure key={item.id} className="space-y-1 text-start">
      {item.kind === 'image' && <img src={url} alt={alt} className="max-h-60 w-full rounded-md object-contain" loading="lazy" />}
      {item.kind === 'video' && <video src={url} controls preload="metadata" aria-label={caption} className="max-h-60 w-full rounded-md" />}
      {item.kind === 'youtube' && <iframe src={url} title={caption} className="aspect-video w-full rounded-md" loading="lazy" allow="fullscreen; picture-in-picture" sandbox="allow-scripts allow-same-origin allow-presentation" referrerPolicy="strict-origin-when-cross-origin" />}
      {item.kind === 'pdf' && <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary underline">{t('guided_tours.open_pdf','Open PDF')}: {caption}</a>}
      <figcaption className="text-xs text-muted-foreground">{caption}</figcaption>
    </figure>;
  })}</div>;
}
