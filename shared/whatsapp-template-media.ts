export type WhatsAppTemplateMediaType = 'image' | 'video' | 'document';

export interface WhatsAppTemplateMediaSource {
  type: WhatsAppTemplateMediaType;
  url?: string;
  mediaId?: string;
}

export interface WhatsAppTemplateWithMedia {
  whatsappTemplateComponents?: unknown;
  mediaUrls?: unknown;
  mediaHandle?: unknown;
}

/**
 * Resolve a media header without confusing Meta's resumable template-creation
 * handle with a message media object ID. Creation handles commonly start with
 * `4::`; sendable media IDs are numeric Graph object IDs.
 */
export function getWhatsAppTemplateMediaSource(
  template: WhatsAppTemplateWithMedia,
  overrideUrls: string[] = [],
): WhatsAppTemplateMediaSource | undefined {
  const components = Array.isArray(template.whatsappTemplateComponents)
    ? template.whatsappTemplateComponents as any[]
    : [];
  const header = components.find(component =>
    String(component?.type).toUpperCase() === 'HEADER'
    && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(String(component?.format).toUpperCase()));
  if (!header) return undefined;

  const type = String(header.format).toLowerCase() as WhatsAppTemplateMediaType;
  const storedUrls = Array.isArray(template.mediaUrls)
    ? template.mediaUrls.filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
    : [];
  const handle = typeof template.mediaHandle === 'string' ? template.mediaHandle.trim() : '';
  const handleUrl = /^https?:\/\//i.test(handle) ? handle : undefined;
  const url = [...overrideUrls, ...storedUrls, ...(handleUrl ? [handleUrl] : [])]
    .find(value => typeof value === 'string' && Boolean(value.trim()))?.trim();
  const mediaId = /^\d+$/.test(handle) ? handle : undefined;
  return { type, ...(url ? { url } : {}), ...(mediaId ? { mediaId } : {}) };
}

export function buildWhatsAppTemplateMediaHeader(
  source: WhatsAppTemplateMediaSource,
  resolvedMediaId?: string,
): any {
  const media = resolvedMediaId || source.mediaId
    ? { id: resolvedMediaId || source.mediaId }
    : source.url
      ? { link: source.url }
      : undefined;
  if (!media) {
    throw new Error(`WhatsApp template ${source.type} header requires a sendable media URL or media object ID`);
  }
  return {
    type: 'header',
    parameters: [{ type: source.type, [source.type]: media }],
  };
}
