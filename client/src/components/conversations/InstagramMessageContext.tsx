import { useState } from 'react';
import { useTranslation } from '@/hooks/use-translation';
import { instagramMessageContext } from '@shared/instagram-message-context';

function ContextPreview({ url, label, linked = false }: { url: string; label: string; linked?: boolean }) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  if (failed) return <p className="p-3 text-xs text-muted-foreground">{t('instagram.context.preview_unavailable', 'Preview unavailable')}</p>;
  if (/\.(mp4|webm)(?:\?|$)/i.test(url)) return <video controls={!linked} preload="none" className="max-h-64 w-full rounded" src={url} onError={() => setFailed(true)} aria-label={label} />;
  return <img src={url} alt={label} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="max-h-64 w-full rounded object-contain" />;
}

export default function InstagramMessageContext({ message }: { message: { metadata?: unknown; type?: string; mediaUrl?: string | null } }) {
  const { t } = useTranslation();
  const { ad, shares } = instagramMessageContext(message);
  if (!ad && !shares.length) return null;
  const openLabel = t('instagram.context.open', 'Open in Instagram');
  const AdCard = ad?.url ? 'a' : 'div';
  return <div className="mt-2 space-y-2" data-testid="instagram-message-context">
    {ad && <AdCard
      {...(ad.url ? { href: ad.url, target: '_blank', rel: 'noopener noreferrer',
        'aria-label': `${t('instagram.context.view_ad', 'View ad')}${ad.title ? `: ${ad.title}` : ''}` } : {})}
      className={`link-preview-card block overflow-hidden rounded-lg border border-border text-inherit no-underline${ad.url ? ' cursor-pointer hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary' : ''}`}
      data-testid="instagram-ad-context">
      {ad.image && <ContextPreview key={ad.image} url={ad.image} linked={!!ad.url} label={ad.title || t('instagram.context.ad', 'Instagram ad')} />}
      <div className="p-3 space-y-1">
        <p className="text-xs text-muted-foreground">{t('instagram.context.ad_reply', 'Replied to an Instagram ad')}</p>
        {ad.title && <p className="text-sm font-medium break-words">{ad.title}</p>}
        {ad.adId && <p className="text-xs text-muted-foreground">{t('instagram.context.ad_id', 'Ad ID: {{id}}', { id: ad.adId })}</p>}
        {ad.url && <span className="text-sm underline">{t('instagram.context.view_ad', 'View ad')}</span>}
      </div>
    </AdCard>}
    {shares.map((share, index) => {
      const label = /reel/.test(share.type) ? t('instagram.context.reel', 'Instagram reel')
        : /story/.test(share.type) ? t('instagram.context.story', 'Instagram story') : t('instagram.context.post', 'Instagram post');
      // Instagram permalinks are navigable content pages, not image files.
      const isPermalink = share.url && /^https?:\/\/(?:www\.)?instagram\.com\//i.test(share.url);
      return <div key={`${index}:${share.url}`} className="link-preview-card overflow-hidden rounded-lg border border-border">
        {share.url && !isPermalink && <ContextPreview url={share.url} label={share.title || label} />}
        <div className="p-3 space-y-1"><p className="text-sm font-medium">{share.title || label}</p>
          {share.url ? <a className="text-sm underline" href={share.url} target="_blank" rel="noopener noreferrer">{isPermalink ? openLabel : t('instagram.context.view_media', 'View shared media')}</a>
            : <p className="text-xs text-muted-foreground">{t('instagram.context.preview_unavailable', 'Preview unavailable')}</p>}
        </div>
      </div>;
    })}
  </div>;
}
