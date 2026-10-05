import type { InsertContact } from '@shared/schema';

export type ScrapingSource = 'whatsapp' | 'googlemaps';

export interface ScrapedContactInput {
  phoneNumber: string;
  profilePicture?: string | null;
  name?: string | null;
  email?: string | null;
}

const SCRAPED_CONTACT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getValidScrapedContactEmail(email?: string | null): string | undefined {
  const normalized = email?.trim();
  if (!normalized || !SCRAPED_CONTACT_EMAIL_PATTERN.test(normalized)) {
    return undefined;
  }

  return normalized;
}

export type ScrapedContactCustomFieldValues = Record<string, unknown>;

export const SCRAPING_TAG_SUGGESTIONS = ['lead', 'customer', 'prospect', 'vip', 'partner'] as const;

export function parseScrapedContactTags(tagsValue: string): string[] {
  const seen = new Set<string>();

  return tagsValue
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag) => {
      if (seen.has(tag)) {
        return false;
      }

      seen.add(tag);
      return true;
    });
}

export function addScrapedContactTag(tagsValue: string, tag: string): string {
  const normalizedTag = tag.trim();
  if (!normalizedTag) {
    return tagsValue;
  }

  const currentTags = parseScrapedContactTags(tagsValue);
  if (currentTags.includes(normalizedTag)) {
    return currentTags.join(', ');
  }

  return [...currentTags, normalizedTag].join(', ');
}

export function toggleScrapedContactTag(tagsValue: string, tag: string): string {
  const normalizedTag = tag.trim();
  if (!normalizedTag) {
    return tagsValue;
  }

  const currentTags = parseScrapedContactTags(tagsValue);
  if (currentTags.includes(normalizedTag)) {
    return currentTags.filter((currentTag) => currentTag !== normalizedTag).join(', ');
  }

  return [...currentTags, normalizedTag].join(', ');
}

function getScrapedContactDefaults(scrapingSource: ScrapingSource) {
  if (scrapingSource === 'googlemaps') {
    return {
      identifierType: 'whatsapp' as const,
      source: 'google_maps_scraping'
    };
  }

  return {
    identifierType: 'whatsapp' as const,
    source: 'whatsapp_scraping'
  };
}

export function sanitizeScrapedContactCustomFields(
  customFields: ScrapedContactCustomFieldValues | null | undefined
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(customFields ?? {}).filter(
      ([, value]) => value !== undefined && value !== null && value !== '' && (Array.isArray(value) ? value.length > 0 : true)
    )
  );
}

export function buildScrapedContactPayload(
  contact: ScrapedContactInput,
  scrapingSource: ScrapingSource,
  selectedTagsValue: string,
  selectedCustomFields?: ScrapedContactCustomFieldValues | null
): Pick<InsertContact, 'name' | 'phone' | 'identifier' | 'identifierType' | 'source' | 'tags' | 'avatarUrl'> &
  Partial<Pick<InsertContact, 'customFields' | 'email'>> {
  const defaults = getScrapedContactDefaults(scrapingSource);
  const selectedTags = parseScrapedContactTags(selectedTagsValue);
  const customFields = sanitizeScrapedContactCustomFields(selectedCustomFields);
  const validEmail = getValidScrapedContactEmail(contact.email);

  return {
    name: contact.name || contact.phoneNumber,
    phone: contact.phoneNumber,
    identifier: contact.phoneNumber,
    identifierType: defaults.identifierType,
    source: defaults.source,
    tags: selectedTags,
    avatarUrl: contact.profilePicture || null,
    ...(validEmail ? { email: validEmail } : {}),
    ...(Object.keys(customFields).length > 0 ? { customFields } : {})
  };
}